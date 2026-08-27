const { onCall, HttpsError } = require("firebase-functions/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const auth = getAuth();

function validRoomCode(value) {
  return /^[A-Za-z0-9_-]{1,40}$/.test(String(value || ""));
}

async function assertAdmin(callerUid, roomCode) {
  if (!callerUid) throw new HttpsError("unauthenticated", "Bạn cần đăng nhập.");
  if (!validRoomCode(roomCode)) throw new HttpsError("invalid-argument", "Mã phòng không hợp lệ.");
  const [configSnap, accessSnap] = await Promise.all([
    db.doc(`rooms/${roomCode}/security/config`).get(),
    db.doc(`rooms/${roomCode}/access/${callerUid}`).get()
  ]);
  const primary = configSnap.exists && configSnap.data()?.adminUid === callerUid;
  const delegated = accessSnap.exists && accessSnap.data()?.active === true && accessSnap.data()?.role === "admin";
  if (!primary && !delegated) throw new HttpsError("permission-denied", "Chỉ trưởng phòng được thực hiện thao tác này.");
  return { config: configSnap.exists ? configSnap.data() : null };
}

async function deleteQueryInBatches(queryRef, batchSize = 350) {
  let deleted = 0;
  for (;;) {
    const snap = await queryRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < batchSize) break;
  }
  return deleted;
}

async function redactAuditIdentity(roomCode, targetUid, targetEmail) {
  const email = String(targetEmail || "").trim();
  const emailLower = email.toLowerCase();
  const auditSnapshot = await db.collection(`rooms/${roomCode}/auditLogs`).get();
  const updates = [];
  for (const docSnap of auditSnapshot.docs) {
    const data = docSnap.data() || {};
    const actorEmail = String(data.actorEmail || "");
    const summary = String(data.summary || "");
    const actorMatches = data.actorUid === targetUid || (emailLower && actorEmail.toLowerCase() === emailLower);
    const summaryMatches = Boolean(emailLower && summary.toLowerCase().includes(emailLower));
    if (!actorMatches && !summaryMatches) continue;
    const patch = {};
    if (actorMatches) patch.actorEmail = "";
    if (actorMatches && String(data.actorName || "").toLowerCase() === emailLower) patch.actorName = "Tài khoản đã xóa";
    if (summaryMatches) patch.summary = summary.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[email đã xóa]");
    if (Object.keys(patch).length) updates.push({ ref: docSnap.ref, patch });
  }
  let updated = 0;
  for (let i = 0; i < updates.length; i += 350) {
    const batch = db.batch();
    const part = updates.slice(i, i + 350);
    part.forEach(item => batch.set(item.ref, item.patch, { merge: true }));
    await batch.commit();
    updated += part.length;
  }
  return updated;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function materializeMemberData(payload, memberData) {
  const output = clone(payload) || {};
  const memberId = memberData?.memberId;
  if (!memberId) return output;
  output.presence ||= {};
  output.billingMonths ||= {};
  if (typeof memberData.presence === "boolean") output.presence[memberId] = memberData.presence;
  for (const [month, monthData] of Object.entries(memberData.billingMonths || {})) {
    const people = output.billingMonths?.[month]?.people;
    if (!people || typeof people !== "object") continue;
    const entry = Object.entries(people).find(([, person]) => person?.memberId === memberId);
    if (!entry) continue;
    people[entry[0]].days = clone(monthData?.days || {});
  }
  return output;
}

exports.deleteP708Account = onCall({ region: "us-central1", timeoutSeconds: 60 }, async request => {
  const callerUid = request.auth?.uid;
  const roomCode = String(request.data?.roomCode || "").trim();
  const targetUid = String(request.data?.targetUid || "").trim();
  const { config } = await assertAdmin(callerUid, roomCode);
  if (!targetUid) throw new HttpsError("invalid-argument", "Thiếu UID tài khoản cần xóa.");
  if (targetUid === callerUid) throw new HttpsError("failed-precondition", "Không thể tự xóa tài khoản đang đăng nhập.");
  if (config?.adminUid === targetUid) throw new HttpsError("failed-precondition", "Không thể xóa tài khoản trưởng phòng chính.");

  const accessRef = db.doc(`rooms/${roomCode}/access/${targetUid}`);
  const requestRef = db.doc(`rooms/${roomCode}/accessRequests/${targetUid}`);
  const memberDataRef = db.doc(`rooms/${roomCode}/memberData/${targetUid}`);
  const roomRef = db.doc(`rooms/${roomCode}`);

  const target = await db.runTransaction(async tx => {
    const [accessSnap, memberSnap, roomSnap] = await Promise.all([
      tx.get(accessRef), tx.get(memberDataRef), tx.get(roomRef)
    ]);
    const accessData = accessSnap.exists ? accessSnap.data() : {};
    if (roomSnap.exists && memberSnap.exists) {
      const payload = materializeMemberData(roomSnap.data()?.payload || {}, memberSnap.data());
      tx.set(roomRef, {
        schemaVersion: 5,
        roomCode,
        revision: FieldValue.increment(1),
        payload,
        lastAdminUid: callerUid,
        lastDeviceId: "cloud-function",
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    tx.delete(accessRef);
    tx.delete(requestRef);
    tx.delete(memberDataRef);
    return accessData || {};
  });

  const targetEmail = String(target?.email || "");
  const taskDeleted = await deleteQueryInBatches(
    db.collection(`rooms/${roomCode}/taskSubmissions`).where("actorUid", "==", targetUid)
  );
  const auditRedacted = await redactAuditIdentity(roomCode, targetUid, targetEmail);

  let authDeleted = true;
  try {
    await auth.deleteUser(targetUid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") authDeleted = false;
    else throw new HttpsError("internal", "Dữ liệu phòng đã được gỡ nhưng chưa xóa được Firebase Authentication. Có thể gọi lại thao tác với cùng UID.");
  }

  await db.collection(`rooms/${roomCode}/auditLogs`).add({
    roomCode,
    actorUid: callerUid,
    actorName: request.auth?.token?.name || request.auth?.token?.email || "Trưởng phòng",
    actorEmail: request.auth?.token?.email || "",
    role: "admin",
    action: "DELETE_ACCOUNT",
    summary: `Xóa hoàn toàn tài khoản ${target?.displayName || target?.memberId || "đã chọn"}`,
    targetMemberId: target?.memberId || null,
    deviceId: "cloud-function",
    createdAt: Timestamp.now()
  });

  return { deleted: true, authDeleted, taskDeleted, auditRedacted, targetMemberId: target?.memberId || null };
});

exports.cleanupP708AuditLogs = onCall({ region: "us-central1", timeoutSeconds: 60 }, async request => {
  const callerUid = request.auth?.uid;
  const roomCode = String(request.data?.roomCode || "").trim();
  await assertAdmin(callerUid, roomCode);
  const requestedDays = Number(request.data?.retentionDays || 30);
  const retentionDays = Math.max(30, Math.min(365, Number.isFinite(requestedDays) ? Math.round(requestedDays) : 30));
  const cutoff = Timestamp.fromMillis(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deletedCount = await deleteQueryInBatches(
    db.collection(`rooms/${roomCode}/auditLogs`).where("createdAt", "<", cutoff).orderBy("createdAt", "asc")
  );
  await db.collection(`rooms/${roomCode}/auditLogs`).add({
    roomCode,
    actorUid: callerUid,
    actorName: request.auth?.token?.name || request.auth?.token?.email || "Trưởng phòng",
    actorEmail: request.auth?.token?.email || "",
    role: "admin",
    action: "CLEANUP_AUDIT",
    summary: `Dọn ${deletedCount} nhật ký cũ hơn ${retentionDays} ngày`,
    targetMemberId: null,
    deviceId: "cloud-function",
    createdAt: Timestamp.now()
  });
  return { deletedCount, retentionDays, cutoff: cutoff.toDate().toISOString() };
});

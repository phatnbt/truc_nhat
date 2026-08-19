const { onCall, HttpsError } = require("firebase-functions/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

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

exports.deleteP708Account = onCall({ region: "us-central1", timeoutSeconds: 60 }, async request => {
  const callerUid = request.auth?.uid;
  const roomCode = String(request.data?.roomCode || "").trim();
  const targetUid = String(request.data?.targetUid || "").trim();
  const { config } = await assertAdmin(callerUid, roomCode);
  if (!targetUid) throw new HttpsError("invalid-argument", "Thiếu UID tài khoản cần xóa.");
  if (targetUid === callerUid) throw new HttpsError("failed-precondition", "Không thể tự xóa tài khoản đang đăng nhập.");
  if (config?.adminUid === targetUid) throw new HttpsError("failed-precondition", "Không thể xóa tài khoản trưởng phòng chính.");

  const accessRef = db.doc(`rooms/${roomCode}/access/${targetUid}`);
  const accessSnap = await accessRef.get();
  const target = accessSnap.exists ? accessSnap.data() : {};
  const targetEmail = target?.email || "";

  await Promise.all([
    accessRef.delete().catch(() => {}),
    db.doc(`rooms/${roomCode}/accessRequests/${targetUid}`).delete().catch(() => {}),
    db.doc(`rooms/${roomCode}/memberData/${targetUid}`).delete().catch(() => {})
  ]);

  const taskDeleted = await deleteQueryInBatches(
    db.collection(`rooms/${roomCode}/taskSubmissions`).where("actorUid", "==", targetUid)
  );

  // Remove every audit document that can still expose the deleted account's email/identity.
  // The room has 30-day retention, so a full scan stays intentionally bounded in practice.
  const auditSnapshot = await db.collection(`rooms/${roomCode}/auditLogs`).get();
  const auditRefs = auditSnapshot.docs.filter(docSnap => {
    const data = docSnap.data() || {};
    const summary = String(data.summary || "").toLowerCase();
    const actorEmail = String(data.actorEmail || "").toLowerCase();
    const email = String(targetEmail || "").toLowerCase();
    return data.actorUid === targetUid
      || (target?.memberId && data.targetMemberId === target.memberId)
      || (email && actorEmail === email)
      || (email && summary.includes(email));
  }).map(docSnap => docSnap.ref);
  let auditDeleted = 0;
  for (let i = 0; i < auditRefs.length; i += 400) {
    const batch = db.batch();
    auditRefs.slice(i, i + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
    auditDeleted += Math.min(400, auditRefs.length - i);
  }

  let authDeleted = true;
  try {
    await auth.deleteUser(targetUid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") authDeleted = false;
    else throw new HttpsError("internal", "Không thể xóa Firebase Authentication của tài khoản.");
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

  return { deleted: true, authDeleted, taskDeleted, auditDeleted, targetMemberId: target?.memberId || null };
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

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc,
  getDoc,
  getDocFromServer
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffJson(before, after, path = [], output = []) {
  if (jsonEqual(before, after)) return output;
  if (after === undefined) {
    output.push({ type: "remove", path: [...path] });
    return output;
  }
  if (before === undefined || Array.isArray(before) || Array.isArray(after) || !isObject(before) || !isObject(after)) {
    output.push({ type: "set", path: [...path], value: clone(after) });
    return output;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) diffJson(before[key], after[key], [...path, key], output);
  return output;
}

function memberPersonEntry(shape, memberId, month) {
  const people = shape?.billingMonths?.[month]?.people || {};
  return Object.entries(people).find(([, person]) => person?.memberId === memberId) || null;
}

function extractMemberData(shape, memberId, previous = {}) {
  const billingMonths = {};
  for (const month of Object.keys(shape?.billingMonths || {})) {
    const entry = memberPersonEntry(shape, memberId, month);
    if (entry) {
      const [, person] = entry;
      billingMonths[month] = { days: clone(person?.days || {}) };
    } else if (previous?.billingMonths?.[month]) {
      billingMonths[month] = clone(previous.billingMonths[month]);
    }
  }
  return {
    memberId,
    presence: shape?.presence?.[memberId] !== false,
    billingMonths
  };
}

function overlayMemberData(adminShape, memberDataByUid) {
  const output = clone(adminShape) || {};
  output.members ||= {};
  output.presence ||= {};
  output.billingMonths ||= {};

  for (const data of memberDataByUid.values()) {
    const memberId = data?.memberId;
    if (!memberId || !output.members?.[memberId]) continue;
    if (typeof data.presence === "boolean") output.presence[memberId] = data.presence;
    for (const [month, monthData] of Object.entries(data.billingMonths || {})) {
      const entry = memberPersonEntry(output, memberId, month);
      if (!entry) continue;
      const [personKey] = entry;
      output.billingMonths[month].people[personKey].days = clone(monthData?.days || {});
    }
  }
  return output;
}

function memberAllowedOperation(operation, memberId, currentShape, nextShape) {
  const path = operation.path || [];
  if (path[0] === "presence" && path.length === 2 && path[1] === memberId) return true;

  if (path[0] !== "billingMonths" || path.length < 3) return false;
  const month = path[1];
  if (path[2] === "updatedAt" && path.length === 3) return true;
  if (path[2] !== "people" || path.length < 5) return false;
  const personKey = path[3];
  const person = nextShape?.billingMonths?.[month]?.people?.[personKey]
    || currentShape?.billingMonths?.[month]?.people?.[personKey];
  if (person?.memberId !== memberId) return false;
  return ["days", "updatedAt", "dayUpdatedAt"].includes(path[4]);
}

function makeLogId(uid) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${Date.now()}-${uid}-${random}`;
}

export function createP708SecureEngine({
  firebaseConfig,
  roomCode,
  deviceId,
  initialShape,
  onShape,
  onStatus,
  onSession,
  onAdminData
}) {
  if (!firebaseConfig?.apiKey || String(firebaseConfig.apiKey).startsWith("REPLACE_")) {
    throw new Error("Chưa cấu hình FIREBASE_CONFIG trong file HTML.");
  }

  const appName = "p708-secure-realtime-app";
  const app = getApps().some(item => item.name === appName) ? getApp(appName) : initializeApp(firebaseConfig, appName);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch {
    db = getFirestore(app);
  }

  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const roomRef = doc(db, "rooms", roomCode);
  const configRef = doc(db, "rooms", roomCode, "security", "config");
  const accessCollection = collection(db, "rooms", roomCode, "access");
  const requestCollection = collection(db, "rooms", roomCode, "accessRequests");
  const memberDataCollection = collection(db, "rooms", roomCode, "memberData");
  const auditCollection = collection(db, "rooms", roomCode, "auditLogs");

  let user = null;
  let access = null;
  let ownRequest = null;
  let adminExists = false;
  let remoteAdminShape = clone(initialShape) || {};
  let optimisticShape = clone(initialShape) || {};
  let memberDataByUid = new Map();
  let accessByUid = new Map();
  let pendingAdminShape = null;
  let pendingAdminAudits = [];
  let adminFlushRunning = false;
  let started = false;
  let firstRoomSnapshot = true;

  let authUnsub = null;
  let configUnsub = null;
  let accessUnsub = null;
  let requestUnsub = null;
  let roomUnsub = null;
  let memberDataUnsub = null;
  let adminAccessUnsub = null;
  let adminRequestsUnsub = null;
  let auditUnsub = null;

  const pendingKey = () => `P708_SECURE_ADMIN_PENDING_${roomCode}_${user?.uid || "none"}`;
  const pendingAuditKey = () => `P708_SECURE_ADMIN_AUDIT_${roomCode}_${user?.uid || "none"}`;

  const emitStatus = (mode, text, extra = {}) => {
    onStatus?.({ mode, text, online: navigator.onLine, pending: pendingAdminShape ? 1 : 0, ...extra });
  };

  const emitSession = (extra = {}) => {
    onSession?.({
      user: user ? {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || ""
      } : null,
      access: clone(access),
      request: clone(ownRequest),
      adminExists,
      status: !user ? "signedOut" : access?.active ? "active" : ownRequest ? "pending" : "needsAccess",
      ...extra
    });
  };

  const emitAdminData = (requests = null, accesses = null, logs = null) => {
    onAdminData?.({
      requests: requests ?? undefined,
      accesses: accesses ?? undefined,
      logs: logs ?? undefined
    });
  };

  const isAdmin = () => access?.active && access?.role === "admin";
  const hasAccess = () => Boolean(access?.active);

  const rebuildOptimistic = () => {
    const base = pendingAdminShape || remoteAdminShape || {};
    optimisticShape = overlayMemberData(base, memberDataByUid);
    onShape?.(clone(optimisticShape), {
      pending: pendingAdminShape ? 1 : 0,
      role: access?.role || null,
      memberId: access?.memberId || null
    });
  };

  const stopDataListeners = () => {
    roomUnsub?.(); roomUnsub = null;
    memberDataUnsub?.(); memberDataUnsub = null;
    adminAccessUnsub?.(); adminAccessUnsub = null;
    adminRequestsUnsub?.(); adminRequestsUnsub = null;
    auditUnsub?.(); auditUnsub = null;
    memberDataByUid = new Map();
    accessByUid = new Map();
  };

  const writeAudit = async (audit = {}) => {
    if (!user || !hasAccess()) return;
    const payload = {
      roomCode,
      actorUid: user.uid,
      actorName: access?.displayName || user.displayName || user.email || "Người dùng",
      actorEmail: user.email || "",
      role: access?.role || "member",
      action: audit.action || "UPDATE_DATA",
      summary: audit.summary || "Cập nhật dữ liệu",
      targetMemberId: audit.targetMemberId || null,
      deviceId,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(auditCollection, makeLogId(user.uid)), payload);
  };

  const loadPendingAdmin = () => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(pendingKey());
      pendingAdminShape = raw ? JSON.parse(raw) : null;
      const auditRaw = localStorage.getItem(pendingAuditKey());
      pendingAdminAudits = auditRaw ? JSON.parse(auditRaw) : [];
    } catch {
      pendingAdminShape = null;
      pendingAdminAudits = [];
    }
  };

  const savePendingAdmin = () => {
    if (!user) return;
    try {
      if (pendingAdminShape) localStorage.setItem(pendingKey(), JSON.stringify(pendingAdminShape));
      else localStorage.removeItem(pendingKey());
      if (pendingAdminAudits.length) localStorage.setItem(pendingAuditKey(), JSON.stringify(pendingAdminAudits));
      else localStorage.removeItem(pendingAuditKey());
    } catch {}
  };

  const syncMappedMemberOverrides = async (nextShape, previousShape) => {
    if (!isAdmin()) return;
    const writes = [];
    for (const [uid, item] of accessByUid.entries()) {
      if (!item?.active || !item?.memberId) continue;
      const before = extractMemberData(previousShape || {}, item.memberId, memberDataByUid.get(uid));
      const after = extractMemberData(nextShape || {}, item.memberId, memberDataByUid.get(uid));
      if (!jsonEqual(before, after)) {
        const value = {
          ...after,
          updatedBy: user.uid,
          updatedAt: serverTimestamp()
        };
        memberDataByUid.set(uid, clone(after));
        writes.push(setDoc(doc(memberDataCollection, uid), value));
      }
    }
    if (writes.length) await Promise.all(writes);
  };

  const flushAdmin = async () => {
    if (!isAdmin() || !pendingAdminShape || !navigator.onLine || adminFlushRunning) return false;
    adminFlushRunning = true;
    emitStatus("syncing", "Đang lưu thay đổi quản trị…");
    const desired = clone(pendingAdminShape);
    try {
      const committed = await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(roomRef);
        const current = snapshot.exists() ? snapshot.data() : {};
        const revision = Number(current.revision || 0) + 1;
        transaction.set(roomRef, {
          schemaVersion: 4,
          roomCode,
          revision,
          payload: desired,
          lastDeviceId: deviceId,
          lastAdminUid: user.uid,
          updatedAt: serverTimestamp()
        });
        return { revision };
      });
      remoteAdminShape = desired;
      if (jsonEqual(pendingAdminShape, desired)) pendingAdminShape = null;
      const audits = [...pendingAdminAudits];
      pendingAdminAudits = [];
      savePendingAdmin();
      rebuildOptimistic();
      for (const audit of audits) {
        try { await writeAudit(audit); } catch {}
      }
      emitStatus("online", "Đã đồng bộ", { revision: committed.revision });
      return true;
    } catch (error) {
      savePendingAdmin();
      emitStatus(navigator.onLine ? "offline" : "offline", navigator.onLine ? "Lỗi đồng bộ — sẽ thử lại" : "Mất kết nối", { error });
      return false;
    } finally {
      adminFlushRunning = false;
    }
  };

  const startAdminListeners = () => {
    adminAccessUnsub?.();
    adminRequestsUnsub?.();
    auditUnsub?.();
    adminAccessUnsub = onSnapshot(accessCollection, snapshot => {
      accessByUid = new Map(snapshot.docs.map(item => [item.id, { uid: item.id, ...item.data() }]));
      emitAdminData(null, [...accessByUid.values()], null);
    }, error => emitStatus("offline", "Không thể tải danh sách quyền", { error }));

    adminRequestsUnsub = onSnapshot(requestCollection, snapshot => {
      emitAdminData(snapshot.docs.map(item => ({ uid: item.id, ...item.data() })), null, null);
    }, error => emitStatus("offline", "Không thể tải yêu cầu tham gia", { error }));

    auditUnsub = onSnapshot(query(auditCollection, orderBy("createdAt", "desc"), limit(60)), snapshot => {
      emitAdminData(null, null, snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, error => emitStatus("offline", "Không thể tải nhật ký", { error }));
  };

  const startRoomListeners = () => {
    stopDataListeners();
    firstRoomSnapshot = true;
    roomUnsub = onSnapshot(roomRef, { includeMetadataChanges: true }, snapshot => {
      const exists = snapshot.exists();
      const data = exists ? snapshot.data() : {};
      remoteAdminShape = clone(data.payload) || {};
      if (firstRoomSnapshot) {
        firstRoomSnapshot = false;
        const meaningfulInitial = Boolean(
          Object.keys(initialShape?.members || {}).length
          || Object.keys(initialShape?.schedules || {}).length
          || Object.keys(initialShape?.billingMonths || {}).length
        );
        if (!exists && isAdmin() && meaningfulInitial && !pendingAdminShape) {
          pendingAdminShape = clone(initialShape);
          pendingAdminAudits.push({ action: "BOOTSTRAP_ROOM", summary: "Khởi tạo dữ liệu phòng từ thiết bị quản trị" });
          savePendingAdmin();
        }
      }
      rebuildOptimistic();
      const pendingWrites = snapshot.metadata.hasPendingWrites || Boolean(pendingAdminShape);
      emitStatus(
        pendingWrites ? "syncing" : (navigator.onLine ? "online" : "offline"),
        pendingWrites ? "Đang đồng bộ…" : (snapshot.metadata.fromCache && !navigator.onLine ? "Đang dùng dữ liệu ngoại tuyến" : "Đã đồng bộ")
      );
      if (pendingAdminShape) void flushAdmin();
    }, error => emitStatus("offline", "Không thể đọc dữ liệu phòng", { error }));

    memberDataUnsub = onSnapshot(memberDataCollection, { includeMetadataChanges: true }, snapshot => {
      memberDataByUid = new Map(snapshot.docs.map(item => [item.id, { uid: item.id, ...item.data() }]));
      rebuildOptimistic();
    }, error => emitStatus("offline", "Không thể đọc dữ liệu thành viên", { error }));

    if (isAdmin()) startAdminListeners();
  };

  const handleAccessChange = nextAccess => {
    const previousRole = access?.role;
    access = nextAccess?.active ? nextAccess : null;
    if (access && user) accessByUid.set(user.uid, { uid:user.uid, ...access });
    emitSession();
    if (!access) {
      stopDataListeners();
      return;
    }
    if (access.role === "admin") loadPendingAdmin();
    if (!roomUnsub || previousRole !== access.role) startRoomListeners();
    rebuildOptimistic();
    if (access.role === "admin" && pendingAdminShape) void flushAdmin();
  };

  const attachUserListeners = () => {
    configUnsub?.(); accessUnsub?.(); requestUnsub?.();
    const ownAccessRef = doc(accessCollection, user.uid);
    const ownRequestRef = doc(requestCollection, user.uid);

    configUnsub = onSnapshot(configRef, snapshot => {
      adminExists = snapshot.exists() && Boolean(snapshot.data()?.adminUid);
      emitSession();
    }, error => emitSession({ error }));

    accessUnsub = onSnapshot(ownAccessRef, snapshot => {
      handleAccessChange(snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null);
    }, error => emitSession({ error }));

    requestUnsub = onSnapshot(ownRequestRef, snapshot => {
      ownRequest = snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null;
      emitSession();
    }, error => emitSession({ error }));
  };

  const clearUserListeners = () => {
    configUnsub?.(); configUnsub = null;
    accessUnsub?.(); accessUnsub = null;
    requestUnsub?.(); requestUnsub = null;
    stopDataListeners();
    access = null;
    ownRequest = null;
    adminExists = false;
  };

  const start = async () => {
    if (started) return;
    started = true;
    emitStatus("syncing", "Đang khởi động bảo mật…");
    await setPersistence(auth, browserLocalPersistence);
    try { await getRedirectResult(auth); } catch {}
    authUnsub = onAuthStateChanged(auth, nextUser => {
      clearUserListeners();
      user = nextUser;
      if (!user) {
        emitSession();
        emitStatus("offline", "Chưa đăng nhập");
        return;
      }
      emitSession({ status: "checking" });
      attachUserListeners();
      emitStatus("syncing", "Đang kiểm tra quyền truy cập…");
    });
    window.addEventListener("online", () => {
      emitStatus("syncing", "Đang kết nối lại…");
      if (isAdmin()) void flushAdmin();
    });
    window.addEventListener("offline", () => emitStatus("offline", "Mất kết nối — dữ liệu được giữ trên thiết bị"));
  };

  const signInGoogle = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (["auth/popup-blocked", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(error?.code)) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const claimAdmin = async displayName => {
    if (!user) throw new Error("Bạn cần đăng nhập trước.");
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(configRef);
      if (snapshot.exists() && snapshot.data()?.adminUid) throw new Error("Phòng đã có trưởng phòng.");
      transaction.set(configRef, {
        roomCode,
        adminUid: user.uid,
        adminEmail: user.email || "",
        createdAt: serverTimestamp()
      });
    });
    await setDoc(doc(accessCollection, user.uid), {
      email: user.email || "",
      displayName: String(displayName || user.displayName || "Trưởng phòng").trim(),
      role: "admin",
      memberId: null,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await writeAudit({ action: "CLAIM_ADMIN", summary: "Thiết lập tài khoản trưởng phòng" });
  };

  const requestAccess = async displayName => {
    if (!user) throw new Error("Bạn cần đăng nhập trước.");
    const name = String(displayName || user.displayName || "").trim();
    if (!name) throw new Error("Vui lòng nhập tên dùng trong phòng.");
    await setDoc(doc(requestCollection, user.uid), {
      uid: user.uid,
      email: user.email || "",
      displayName: name,
      photoURL: user.photoURL || "",
      status: "pending",
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  const cancelAccessRequest = async () => {
    if (!user) return;
    await deleteDoc(doc(requestCollection, user.uid));
  };

  const approveRequest = async ({ uid, memberId, role = "member", displayName = "" }) => {
    if (!isAdmin()) throw new Error("Chỉ trưởng phòng được duyệt thành viên.");
    const requestSnapshot = await getDoc(doc(requestCollection, uid));
    const requestData = requestSnapshot.exists() ? requestSnapshot.data() : {};
    await setDoc(doc(accessCollection, uid), {
      email: requestData.email || "",
      displayName: displayName || requestData.displayName || "Thành viên",
      role: role === "admin" ? "admin" : "member",
      memberId: memberId || null,
      active: true,
      approvedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await deleteDoc(doc(requestCollection, uid));
    await writeAudit({ action: "APPROVE_ACCESS", summary: `Duyệt quyền cho ${displayName || requestData.displayName || requestData.email || uid}`, targetMemberId: memberId || null });
  };

  const updateAccess = async ({ uid, memberId, role, displayName, active = true }) => {
    if (!isAdmin()) throw new Error("Chỉ trưởng phòng được sửa quyền.");
    const ref = doc(accessCollection, uid);
    const old = await getDoc(ref);
    if (!old.exists()) throw new Error("Không tìm thấy tài khoản.");
    await setDoc(ref, {
      ...old.data(),
      memberId: memberId || null,
      role: role === "admin" ? "admin" : "member",
      displayName: displayName || old.data().displayName || "Thành viên",
      active: Boolean(active),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });
    await writeAudit({ action: "UPDATE_ACCESS", summary: `Cập nhật quyền ${displayName || old.data().displayName || old.data().email || uid}`, targetMemberId: memberId || null });
  };

  const revokeAccess = async uid => {
    if (!isAdmin()) throw new Error("Chỉ trưởng phòng được thu hồi quyền.");
    if (uid === user.uid) throw new Error("Không thể tự thu hồi quyền trưởng phòng đang đăng nhập.");
    const ref = doc(accessCollection, uid);
    const old = await getDoc(ref);
    if (!old.exists()) return;
    await setDoc(ref, { ...old.data(), active: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
    await writeAudit({ action: "REVOKE_ACCESS", summary: `Thu hồi quyền ${old.data().displayName || old.data().email || uid}`, targetMemberId: old.data().memberId || null });
  };

  const recordShape = async (nextShape, audit = {}) => {
    if (!user || !hasAccess()) throw new Error("Tài khoản chưa được cấp quyền.");
    const desired = clone(nextShape) || {};

    if (isAdmin()) {
      const previous = clone(optimisticShape) || {};
      await syncMappedMemberOverrides(desired, previous);
      pendingAdminShape = desired;
      if (audit?.summary || audit?.action) pendingAdminAudits.push(clone(audit));
      savePendingAdmin();
      rebuildOptimistic();
      if (navigator.onLine) void flushAdmin();
      else emitStatus("offline", "Đã lưu thay đổi quản trị trên máy");
      return true;
    }

    const memberId = access.memberId;
    if (!memberId) throw new Error("Tài khoản chưa được liên kết với thành viên trong phòng.");
    const operations = diffJson(optimisticShape, desired);
    const forbidden = operations.find(operation => !memberAllowedOperation(operation, memberId, optimisticShape, desired));
    if (forbidden) throw new Error("Bạn chỉ được chỉnh trạng thái và ngày ở của chính mình.");

    const ownData = extractMemberData(desired, memberId, memberDataByUid.get(user.uid));
    memberDataByUid.set(user.uid, clone(ownData));
    rebuildOptimistic();
    await setDoc(doc(memberDataCollection, user.uid), {
      ...ownData,
      updatedBy: user.uid,
      updatedAt: serverTimestamp()
    });
    if (audit?.summary || audit?.action) await writeAudit(audit);
    emitStatus(navigator.onLine ? "online" : "offline", navigator.onLine ? "Đã đồng bộ" : "Đã lưu ngoại tuyến");
    return true;
  };

  const forceSync = async () => {
    if (!user || !hasAccess()) return false;
    if (isAdmin() && pendingAdminShape) await flushAdmin();
    if (!navigator.onLine) return false;
    try {
      const snapshot = await getDocFromServer(roomRef);
      if (snapshot.exists()) remoteAdminShape = clone(snapshot.data()?.payload) || {};
      rebuildOptimistic();
      emitStatus(pendingAdminShape ? "syncing" : "online", pendingAdminShape ? "Còn thay đổi đang chờ" : "Đã đồng bộ");
      return !pendingAdminShape;
    } catch (error) {
      emitStatus("offline", "Không thể lấy dữ liệu mới nhất", { error });
      return false;
    }
  };

  const stop = () => {
    authUnsub?.(); authUnsub = null;
    clearUserListeners();
    started = false;
  };

  return {
    start,
    stop,
    signInGoogle,
    signOut,
    claimAdmin,
    requestAccess,
    cancelAccessRequest,
    approveRequest,
    updateAccess,
    revokeAccess,
    recordShape,
    flush: flushAdmin,
    forceSync,
    getSession: () => ({ user: clone(user), access: clone(access), request: clone(ownRequest), adminExists }),
    getOptimisticShape: () => clone(optimisticShape)
  };
}

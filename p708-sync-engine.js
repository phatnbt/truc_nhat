import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  getDocFromServer
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const DB_NAME = "p708-sync-outbox-v1";
const STORE_NAME = "operations";
let localSequence = 0;

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

function setAtPath(target, path, value) {
  if (path.length === 0) return clone(value);
  const root = isObject(target) ? clone(target) : {};
  let cursor = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = clone(value);
  return root;
}

function removeAtPath(target, path) {
  if (path.length === 0) return {};
  const root = isObject(target) ? clone(target) : {};
  let cursor = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!isObject(cursor[key])) return root;
    cursor = cursor[key];
  }
  delete cursor[path[path.length - 1]];
  return root;
}

function applyOperations(base, operations) {
  let next = clone(base) || {};
  for (const operation of operations) {
    next = operation.type === "remove"
      ? removeAtPath(next, operation.path)
      : setAtPath(next, operation.path, operation.value);
  }
  return next;
}

function openOutbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function outboxGetAll(roomCode) {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result || []).filter(item => item.roomCode === roomCode).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function outboxPut(record) {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function outboxDelete(id) {
  const db = await openOutbox();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function makeId(deviceId) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${deviceId}-${Date.now()}-${random}`;
}

export function createP708SyncEngine({
  firebaseConfig,
  roomCode,
  deviceId,
  initialShape,
  restoreUnsynced = false,
  hasMeaningfulLocalData = false,
  onShape,
  onStatus
}) {
  if (!firebaseConfig?.apiKey || String(firebaseConfig.apiKey).startsWith("REPLACE_")) {
    throw new Error("Chưa cấu hình FIREBASE_CONFIG trong file HTML.");
  }

  const appName = "p708-realtime-app";
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
  const roomRef = doc(db, "rooms", roomCode);
  let unsubscribe = null;
  let pending = [];
  let remoteShape = {};
  let optimisticShape = clone(initialShape) || {};
  let started = false;
  let flushing = false;
  let firstSnapshot = true;
  let lastRevision = 0;

  const emitStatus = (mode, text, extra = {}) => {
    onStatus?.({ mode, text, pending: pending.length, online: navigator.onLine, ...extra });
  };

  const rebuildOptimistic = () => {
    let next = clone(remoteShape) || {};
    for (const record of pending) next = applyOperations(next, record.operations);
    optimisticShape = next;
    onShape?.(clone(optimisticShape), { pending: pending.length, revision: lastRevision });
  };

  const enqueue = async (operations) => {
    if (!operations.length) return null;
    const record = {
      id: makeId(deviceId),
      roomCode,
      deviceId,
      createdAt: Date.now(),
      order: Date.now() * 1000 + (localSequence++ % 1000),
      operations
    };
    pending.push(record);
    await outboxPut(record);
    rebuildOptimistic();
    emitStatus(navigator.onLine ? "syncing" : "offline", navigator.onLine ? "Đang đồng bộ…" : "Đang lưu ngoại tuyến");
    void flush();
    return record.id;
  };

  const recordShape = async (nextShape) => {
    const operations = diffJson(optimisticShape, nextShape);
    optimisticShape = clone(nextShape) || {};
    if (!operations.length) return false;
    await enqueue(operations);
    return true;
  };

  const flush = async () => {
    if (!started || flushing || !navigator.onLine || pending.length === 0) return false;
    flushing = true;
    emitStatus("syncing", `Đang gửi ${pending.length} thay đổi…`);

    try {
      while (pending.length && navigator.onLine) {
        const record = pending[0];
        const committed = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(roomRef);
          const current = snapshot.exists() ? snapshot.data() : {};
          const currentPayload = current.payload || {};
          const nextPayload = applyOperations(currentPayload, record.operations);
          const nextRevision = Number(current.revision || 0) + 1;
          transaction.set(roomRef, {
            schemaVersion: 3,
            roomCode,
            revision: nextRevision,
            payload: nextPayload,
            lastOperationId: record.id,
            lastDeviceId: deviceId,
            updatedAt: serverTimestamp()
          });
          return { payload: nextPayload, revision: nextRevision };
        });

        remoteShape = clone(committed.payload) || {};
        lastRevision = committed.revision;
        pending.shift();
        await outboxDelete(record.id);
        rebuildOptimistic();
      }

      emitStatus(pending.length ? "syncing" : "online", pending.length ? "Còn thay đổi đang chờ" : "Đã đồng bộ");
      return pending.length === 0;
    } catch (error) {
      emitStatus(navigator.onLine ? "offline" : "offline", navigator.onLine ? "Lỗi đồng bộ — sẽ thử lại" : "Mất kết nối", { error });
      return false;
    } finally {
      flushing = false;
    }
  };

  const forceSync = async () => {
    await flush();
    if (!navigator.onLine) return false;
    try {
      const snapshot = await getDocFromServer(roomRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        remoteShape = clone(data.payload) || {};
        lastRevision = Number(data.revision || 0);
        rebuildOptimistic();
      }
      emitStatus(pending.length ? "syncing" : "online", pending.length ? "Còn thay đổi đang chờ" : "Đã đồng bộ");
      return true;
    } catch (error) {
      emitStatus("offline", "Không thể lấy dữ liệu máy chủ", { error });
      return false;
    }
  };

  const start = async () => {
    if (started) return;
    started = true;
    emitStatus("syncing", "Đang kết nối Firestore…");
    await signInAnonymously(auth);
    pending = await outboxGetAll(roomCode);

    unsubscribe = onSnapshot(roomRef, { includeMetadataChanges: true }, async (snapshot) => {
      const exists = snapshot.exists();
      const data = exists ? snapshot.data() : {};
      remoteShape = clone(data.payload) || {};
      lastRevision = Number(data.revision || 0);

      if (firstSnapshot) {
        firstSnapshot = false;
        if (pending.length === 0 && ((restoreUnsynced && hasMeaningfulLocalData) || (!exists && hasMeaningfulLocalData))) {
          const bootstrapOps = diffJson(remoteShape, initialShape);
          if (bootstrapOps.length) await enqueue(bootstrapOps);
        }
      }

      rebuildOptimistic();
      const fromCache = snapshot.metadata.fromCache;
      const hasPendingWrites = snapshot.metadata.hasPendingWrites;
      emitStatus(
        pending.length || hasPendingWrites ? "syncing" : (navigator.onLine ? "online" : "offline"),
        pending.length || hasPendingWrites ? "Đang đồng bộ…" : (fromCache && !navigator.onLine ? "Đang dùng dữ liệu ngoại tuyến" : "Đã đồng bộ"),
        { fromCache, hasPendingWrites }
      );
      void flush();
    }, (error) => {
      emitStatus("offline", "Không thể nghe dữ liệu real-time", { error });
    });

    window.addEventListener("online", flush);
    window.addEventListener("offline", () => emitStatus("offline", "Mất kết nối — thay đổi sẽ được giữ lại"));
  };

  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
    started = false;
  };

  return {
    start,
    stop,
    recordShape,
    flush,
    forceSync,
    getPendingCount: () => pending.length,
    getOptimisticShape: () => clone(optimisticShape)
  };
}

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAILY_XP = 20;
const PET_STAGES = Object.freeze([
  Object.freeze({ level: 0, threshold: 0, name: "Mầm Mây", asset: "./icons/pets/cloud-sprout.svg" }),
  Object.freeze({ level: 1, threshold: 100, name: "Mèo Mây", asset: "./icons/pets/cloud-cat.svg" }),
  Object.freeze({ level: 2, threshold: 300, name: "Linh Thú Mây", asset: "./icons/pets/cloud-guardian.svg" }),
  Object.freeze({ level: 3, threshold: 700, name: "Thần Thú P708", asset: "./icons/pets/cloud-celestial.svg" })
]);

class PetCheckInError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PetCheckInError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new PetCheckInError(code, message);
}

function validRoomCode(value) {
  return /^[A-Za-z0-9_-]{1,40}$/.test(String(value || ""));
}

function validDocumentId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 300 && !value.includes("/");
}

function dateKeyInTimeZone(value = new Date(), timeZone = TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid date");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function petStageForXp(xp = 0) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let stage = PET_STAGES[0];
  for (const candidate of PET_STAGES) if (safeXp >= candidate.threshold) stage = candidate;
  const next = PET_STAGES[stage.level + 1] || null;
  return { ...stage, next: next ? { ...next } : null };
}

function unlockedStagesForXp(xp = 0) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  return PET_STAGES.filter(stage => safeXp >= stage.threshold).map(stage => stage.level);
}

function effectiveStreak(profile = {}, todayKey) {
  const last = String(profile.lastCheckInDate || "");
  if (last === todayKey || last === previousDateKey(todayKey)) return Math.max(0, Math.floor(Number(profile.currentStreak) || 0));
  return 0;
}

function publicProfile(profile = {}, todayKey) {
  const xp = Math.max(0, Math.floor(Number(profile.xp) || 0));
  return {
    xp,
    currentStreak: effectiveStreak(profile, todayKey),
    bestStreak: Math.max(0, Math.floor(Number(profile.bestStreak) || 0)),
    lastCheckInDate: String(profile.lastCheckInDate || ""),
    unlockedStages: unlockedStagesForXp(xp),
    stage: petStageForXp(xp)
  };
}

function timestampDate(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value && typeof value.toMillis === "function") return new Date(value.toMillis());
  return value instanceof Date ? value : new Date(NaN);
}

function validActivity({ activity, access, roomPayload, uid, todayKey }) {
  if (!activity || activity.actorUid !== uid || activity.memberId !== access.memberId) return false;
  if (!["submitted", "approved"].includes(activity.status)) return false;
  const submittedDate = timestampDate(activity.submittedAt);
  if (!Number.isFinite(submittedDate.getTime()) || dateKeyInTimeZone(submittedDate) !== todayKey) return false;
  const schedule = roomPayload?.schedules?.[activity.weekStart];
  if (!schedule || schedule.id !== activity.scheduleId) return false;
  return (schedule.assignments || []).some(assignment =>
    assignment && !assignment.cut && assignment.taskId === activity.taskId && assignment.personId === access.memberId
  );
}

function profileAfterCheckIn(profile = {}, todayKey) {
  const oldXp = Math.max(0, Math.floor(Number(profile.xp) || 0));
  const oldStage = petStageForXp(oldXp);
  const last = String(profile.lastCheckInDate || "");
  const previous = previousDateKey(todayKey);
  const currentStreak = last === previous ? Math.max(0, Math.floor(Number(profile.currentStreak) || 0)) + 1 : 1;
  const xp = oldXp + DAILY_XP;
  const stage = petStageForXp(xp);
  return {
    xp,
    currentStreak,
    bestStreak: Math.max(currentStreak, Math.max(0, Math.floor(Number(profile.bestStreak) || 0))),
    lastCheckInDate: todayKey,
    unlockedStages: unlockedStagesForXp(xp),
    stage,
    leveledUp: stage.level > oldStage.level
  };
}

async function checkInPetTransaction({ db, FieldValue, uid, roomCode, activityId, now = new Date() }) {
  if (!uid) fail("unauthenticated", "Bạn cần đăng nhập.");
  if (!validRoomCode(roomCode)) fail("invalid-argument", "Mã phòng không hợp lệ.");
  if (!validDocumentId(activityId)) fail("invalid-argument", "Hoạt động điểm danh không hợp lệ.");
  const todayKey = dateKeyInTimeZone(now);
  const accessRef = db.doc(`rooms/${roomCode}/access/${uid}`);
  const roomRef = db.doc(`rooms/${roomCode}`);
  const activityRef = db.doc(`rooms/${roomCode}/taskSubmissions/${activityId}`);
  const profileRef = db.doc(`rooms/${roomCode}/petProfiles/${uid}`);
  const checkInRef = db.doc(`rooms/${roomCode}/petCheckins/${uid}_${todayKey}`);

  return db.runTransaction(async transaction => {
    const [accessSnap, roomSnap, activitySnap, profileSnap, checkInSnap] = await Promise.all([
      transaction.get(accessRef),
      transaction.get(roomRef),
      transaction.get(activityRef),
      transaction.get(profileRef),
      transaction.get(checkInRef)
    ]);
    const access = accessSnap.exists ? accessSnap.data() : null;
    if (!access || access.active !== true || !access.memberId) fail("permission-denied", "Tài khoản chưa được liên kết với thành viên.");
    const roomPayload = roomSnap.exists ? roomSnap.data()?.payload || {} : {};
    const activity = activitySnap.exists ? activitySnap.data() : null;
    if (!validActivity({ activity, access, roomPayload, uid, todayKey })) {
      fail("failed-precondition", "Cần báo hoàn thành một việc trực hợp lệ trong hôm nay.");
    }
    const existingProfile = profileSnap.exists ? profileSnap.data() || {} : {};
    if (checkInSnap.exists) {
      return { awarded: false, alreadyCheckedIn: true, serverDate: todayKey, profile: publicProfile(existingProfile, todayKey) };
    }
    const next = profileAfterCheckIn(existingProfile, todayKey);
    transaction.set(profileRef, {
      uid,
      roomCode,
      memberId: access.memberId,
      xp: next.xp,
      currentStreak: next.currentStreak,
      bestStreak: next.bestStreak,
      lastCheckInDate: todayKey,
      unlockedStages: next.unlockedStages,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.create(checkInRef, {
      uid,
      roomCode,
      memberId: access.memberId,
      dateKey: todayKey,
      xpAwarded: DAILY_XP,
      activityId,
      createdAt: FieldValue.serverTimestamp()
    });
    return {
      awarded: true,
      alreadyCheckedIn: false,
      xpAwarded: DAILY_XP,
      leveledUp: next.leveledUp,
      serverDate: todayKey,
      profile: publicProfile(next, todayKey)
    };
  });
}

async function getPetStatus({ db, uid, roomCode, now = new Date() }) {
  if (!uid) fail("unauthenticated", "Bạn cần đăng nhập.");
  if (!validRoomCode(roomCode)) fail("invalid-argument", "Mã phòng không hợp lệ.");
  const todayKey = dateKeyInTimeZone(now);
  const [accessSnap, roomSnap, profileSnap, checkInSnap, activitySnap] = await Promise.all([
    db.doc(`rooms/${roomCode}/access/${uid}`).get(),
    db.doc(`rooms/${roomCode}`).get(),
    db.doc(`rooms/${roomCode}/petProfiles/${uid}`).get(),
    db.doc(`rooms/${roomCode}/petCheckins/${uid}_${todayKey}`).get(),
    db.collection(`rooms/${roomCode}/taskSubmissions`).where("actorUid", "==", uid).limit(200).get()
  ]);
  const access = accessSnap.exists ? accessSnap.data() : null;
  if (!access || access.active !== true || !access.memberId) fail("permission-denied", "Tài khoản chưa được liên kết với thành viên.");
  const roomPayload = roomSnap.exists ? roomSnap.data()?.payload || {} : {};
  const eligible = activitySnap.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(activity => validActivity({ activity, access, roomPayload, uid, todayKey }))
    .sort((a, b) => timestampDate(b.submittedAt).getTime() - timestampDate(a.submittedAt).getTime())[0] || null;
  const checkedInToday = checkInSnap.exists;
  return {
    serverDate: todayKey,
    checkedInToday,
    canCheckIn: !checkedInToday && !!eligible,
    eligibleActivityId: !checkedInToday ? eligible?.id || null : null,
    profile: publicProfile(profileSnap.exists ? profileSnap.data() || {} : {}, todayKey)
  };
}

module.exports = {
  TIME_ZONE,
  DAILY_XP,
  PET_STAGES,
  PetCheckInError,
  dateKeyInTimeZone,
  previousDateKey,
  petStageForXp,
  unlockedStagesForXp,
  effectiveStreak,
  profileAfterCheckIn,
  checkInPetTransaction,
  getPetStatus
};

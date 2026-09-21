export const BILLING_CYCLE_CUTOVER_MONTH = "2026-09";
export const BILLING_CYCLE_START_DAY = 30;
export const BILLING_CYCLE_END_DAY = 29;
export const MAX_CUSTOM_PERIOD_DAYS = 62;

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
const pad = value => String(value).padStart(2, "0");

export function shiftMonth(month, offset = 0) {
  if (!validMonth(month)) return String(month || "");
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + Number(offset || 0), 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function daysInMonthKey(month) {
  if (!validMonth(month)) return 0;
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function isCycleMonth(month) {
  return validMonth(month) && month >= BILLING_CYCLE_CUTOVER_MONTH;
}

export function cycleBounds(month) {
  if (!validMonth(month)) return null;

  const previous = shiftMonth(month, -1);
  const previousLastDay = daysInMonthKey(previous);
  const currentLastDay = daysInMonthKey(month);
  const next = shiftMonth(month, 1);

  // Quy ước chuẩn: ngày 29 chốt sổ, ngày 30 bắt đầu kỳ mới.
  // Riêng tháng 2 không có ngày 30 (và có thể không có ngày 29), nên kỳ kế
  // tiếp bắt đầu ngày 01 của tháng sau. Cách này bảo đảm không trùng/thiếu ngày.
  const start = previousLastDay >= BILLING_CYCLE_START_DAY
    ? `${previous}-${pad(BILLING_CYCLE_START_DAY)}`
    : `${month}-01`;

  const endDay = Math.min(BILLING_CYCLE_END_DAY, currentLastDay);
  const end = `${month}-${pad(endDay)}`;
  const endExclusive = endDay < currentLastDay
    ? `${month}-${pad(endDay + 1)}`
    : `${next}-01`;

  return { month, start, end, endExclusive };
}

export function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

export function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addUtcDays(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Number(amount || 0));
  return next;
}

export function dateRangeKeys(startValue, endValue, maxDays = MAX_CUSTOM_PERIOD_DAYS) {
  const start = parseDateKey(startValue), end = parseDateKey(endValue);
  const limit = Math.max(1, Math.floor(Number(maxDays) || MAX_CUSTOM_PERIOD_DAYS));
  if (!start || !end || start > end) return [];
  const result = [];
  for (let cursor = start; cursor <= end && result.length <= limit; cursor = addUtcDays(cursor, 1)) result.push(dateKey(cursor));
  if (result.length > limit) return [];
  return result;
}

export function resolveCycleBounds(month, customStart = "", customEnd = "") {
  const fallback = cycleBounds(month);
  if (!fallback) return null;
  const dates = dateRangeKeys(customStart, customEnd);
  if (!dates.length) return fallback;
  const endDate = parseDateKey(customEnd);
  return { month, start: customStart, end: customEnd, endExclusive: dateKey(addUtcDays(endDate, 1)) };
}

export function periodDateKeys(month, customBounds = null) {
  const bounds = resolveCycleBounds(month, customBounds?.start, customBounds?.end);
  return bounds ? dateRangeKeys(bounds.start, bounds.end) : [];
}

export function containsDate(month, value, customBounds = null) {
  const bounds = resolveCycleBounds(month, customBounds?.start, customBounds?.end), date = parseDateKey(value);
  if (!bounds || !date) return false;
  const start = parseDateKey(bounds.start), end = parseDateKey(bounds.end);
  return date >= start && date <= end;
}

export function rangesOverlap(startA, endA, startB, endB) {
  const aStart = parseDateKey(startA), aEnd = parseDateKey(endA), bStart = parseDateKey(startB), bEnd = parseDateKey(endB);
  if (!aStart || !aEnd || !bStart || !bEnd || aStart > aEnd || bStart > bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export function currentPeriodMonth(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
  const base = `${year}-${pad(month)}`;
  return day >= BILLING_CYCLE_START_DAY ? shiftMonth(base, 1) : base;
}

export function formatDateRange(start, end, locale = "vi-VN") {
  if (!dateRangeKeys(start, end).length) return "";
  const format = key => {
    const date = parseDateKey(key);
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
  };
  return `${format(start)} – ${format(end)}`;
}

export function formatPeriodRange(month, locale = "vi-VN", customBounds = null) {
  const bounds = resolveCycleBounds(month, customBounds?.start, customBounds?.end);
  return bounds ? formatDateRange(bounds.start, bounds.end, locale) : "";
}

// Enforced again inside the Firestore transaction so two managers cannot create
// overlapping periods or silently overwrite each other's period edit.
export function assertBillingPeriodUpdate(serverShape, nextShape, audit = {}) {
  if (audit.action !== "UPDATE_BILLING_PERIOD") return true;
  const month = String(audit.periodMonth || "");
  const current = serverShape?.billingMonths?.[month] || null;
  const next = nextShape?.billingMonths?.[month] || null;
  if (!validMonth(month) || !next || next.cycleMode !== "28-27") throw new Error("Kỳ điện nước không hợp lệ.");
  if (Boolean(current) !== Boolean(audit.expectedPeriodExists)) throw new Error("Kỳ điện nước vừa được thay đổi trên thiết bị khác. Hãy tải lại rồi thử lại.");
  if (current) {
    const currentBounds = resolveCycleBounds(month, current.cycleStart, current.cycleEnd);
    if (currentBounds?.start !== audit.expectedPeriodStart || currentBounds?.end !== audit.expectedPeriodEnd) throw new Error("Kỳ điện nước vừa được chỉnh trên thiết bị khác. Hãy tải lại rồi thử lại.");
    if (current.closed) throw new Error("Kỳ đã được chốt trên thiết bị khác. Hãy tải lại trước khi chỉnh.");
    if (Object.values(current.people || {}).some(person => person?.paid === true || (Number(person?.paidAmount) || 0) > 0 || person?.paidAt)) throw new Error("Kỳ đã có thanh toán. Hãy hủy thanh toán trước khi chỉnh.");
  }
  const dates = dateRangeKeys(next.cycleStart, next.cycleEnd);
  if (!dates.length) throw new Error(`Kỳ điện nước phải hợp lệ và không dài quá ${MAX_CUSTOM_PERIOD_DAYS} ngày.`);
  for (const [otherMonth, other] of Object.entries(nextShape?.billingMonths || {})) {
    if (otherMonth === month || other?.cycleMode !== "28-27") continue;
    const otherBounds = resolveCycleBounds(otherMonth, other.cycleStart, other.cycleEnd);
    if (otherBounds && rangesOverlap(next.cycleStart, next.cycleEnd, otherBounds.start, otherBounds.end)) throw new Error(`Kỳ điện nước bị trùng với kỳ ${otherMonth}.`);
  }
  return true;
}

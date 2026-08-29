export const BILLING_CYCLE_CUTOVER_MONTH = "2026-09";
export const BILLING_CYCLE_START_DAY = 30;
export const BILLING_CYCLE_END_DAY = 29;

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

export function periodDateKeys(month) {
  const bounds = cycleBounds(month);
  if (!bounds) return [];
  const start = parseDateKey(bounds.start), end = parseDateKey(bounds.end);
  const result = [];
  for (let cursor = start; cursor && end && cursor <= end; cursor = addUtcDays(cursor, 1)) result.push(dateKey(cursor));
  return result;
}

export function containsDate(month, value) {
  const bounds = cycleBounds(month), date = parseDateKey(value);
  if (!bounds || !date) return false;
  const start = parseDateKey(bounds.start), end = parseDateKey(bounds.end);
  return date >= start && date <= end;
}

export function currentPeriodMonth(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
  const base = `${year}-${pad(month)}`;
  return day >= BILLING_CYCLE_START_DAY ? shiftMonth(base, 1) : base;
}

export function formatPeriodRange(month, locale = "vi-VN") {
  const bounds = cycleBounds(month);
  if (!bounds) return "";
  const format = key => {
    const date = parseDateKey(key);
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
  };
  return `${format(bounds.start)} – ${format(bounds.end)}`;
}

export const BILLING_CYCLE_CUTOVER_MONTH = "2026-09";

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
const pad = value => String(value).padStart(2, "0");

export function shiftMonth(month, offset = 0) {
  if (!validMonth(month)) return String(month || "");
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + Number(offset || 0), 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function isCycleMonth(month) {
  return validMonth(month) && month >= BILLING_CYCLE_CUTOVER_MONTH;
}

export function cycleBounds(month) {
  if (!validMonth(month)) return null;
  const previous = shiftMonth(month, -1);
  const [startYear, startMonth] = previous.split("-").map(Number);
  const [endYear, endMonth] = month.split("-").map(Number);
  return {
    month,
    start: `${startYear}-${pad(startMonth)}-28`,
    end: `${endYear}-${pad(endMonth)}-27`,
    endExclusive: `${endYear}-${pad(endMonth)}-28`
  };
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
  return day >= 28 ? shiftMonth(base, 1) : base;
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

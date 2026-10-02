// Every timestamp is stored in UTC and shown in Central time (Austin).
export const CENTRAL_TZ = "America/Chicago";

const dtf = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TZ, ...opts });

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "Friday" */
export function weekdayLong(value: string | Date): string {
  return dtf({ weekday: "long" }).format(toDate(value));
}

/** "Fri" */
export function weekdayShort(value: string | Date): string {
  return dtf({ weekday: "short" }).format(toDate(value));
}

/** "Oct 2" */
export function monthDay(value: string | Date): string {
  return dtf({ month: "short", day: "numeric" }).format(toDate(value));
}

/** "October 2" */
export function monthDayLong(value: string | Date): string {
  return dtf({ month: "long", day: "numeric" }).format(toDate(value));
}

/** "6:00pm" */
export function clock(value: string | Date): string {
  return dtf({ hour: "numeric", minute: "2-digit" })
    .format(toDate(value))
    .replace(" ", "")
    .toLowerCase();
}

/** "6:00–11:00pm" (drops the first meridiem when both halves share it) */
export function timeRange(start: string | Date, end: string | Date): string {
  const a = clock(start);
  const b = clock(end);
  const aMer = a.slice(-2);
  const bMer = b.slice(-2);
  if (aMer === bMer) return `${a.slice(0, -2)}–${b}`;
  return `${a}–${b}`;
}

/** "Friday, Oct 2 · 6:00–11:00pm" */
export function eveningLabel(start: string | Date, end: string | Date): string {
  return `${weekdayLong(start)}, ${monthDay(start)} · ${timeRange(start, end)}`;
}

/** "Fri Oct 2" */
export function eveningShort(start: string | Date): string {
  return `${weekdayShort(start)} ${monthDay(start)}`;
}

/** "Sep 27, 2:14pm" */
export function dateTime(value: string | Date): string {
  return `${monthDay(value)}, ${clock(value)}`;
}

/** "YYYY-MM-DD" for the Central calendar date of an instant */
export function centralDateKey(value: string | Date): string {
  const parts = dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    toDate(value),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0 = Sunday … 6 = Saturday, in Central time */
export function centralDow(value: string | Date): number {
  const wd = dtf({ weekday: "short" }).format(toDate(value));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/** Friday date key ("YYYY-MM-DD") of the weekend an evening belongs to. Sun→previous Fri. */
export function weekendKeyFor(value: string | Date): string {
  const d = toDate(value);
  const dow = centralDow(d);
  // Fri=5, Sat=6, Sun=0 → previous Friday; Mon–Thu → upcoming Friday
  const delta = dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
  const shifted = new Date(d.getTime() + delta * 86_400_000);
  return centralDateKey(shifted);
}

/** "fri" | "sat" | "sun" | ... */
export function nightKey(value: string | Date): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][centralDow(value)] ?? "sun";
}

/** Convert a Central wall-clock time ("YYYY-MM-DD", "HH:mm") to a UTC Date. */
export function centralWallTimeToUtc(dateKey: string, hhmm: string): Date {
  const [y = 1970, m = 1, d = 1] = dateKey.split("-").map(Number);
  const [hh = 0, mm = 0] = hhmm.split(":").map(Number);
  // First guess: treat the wall time as if it were UTC, then correct by the zone offset.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offsetMinutes = centralOffsetMinutes(guess);
  const corrected = new Date(guess.getTime() - offsetMinutes * 60_000);
  // Re-check in case the correction crossed a DST boundary.
  const offset2 = centralOffsetMinutes(corrected);
  return offset2 === offsetMinutes ? corrected : new Date(guess.getTime() - offset2 * 60_000);
}

/** Minutes that Central is ahead of UTC at the instant (negative, e.g. -300 CDT / -360 CST). */
export function centralOffsetMinutes(at: Date): number {
  const parts = dtf({
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function hoursBetween(start: string | Date, end: string | Date): number {
  return (toDate(end).getTime() - toDate(start).getTime()) / 3_600_000;
}

export function isWithinHours(target: string | Date, hours: number, from: Date = new Date()): boolean {
  return toDate(target).getTime() - from.getTime() < hours * 3_600_000;
}

/** Human "in 3 days" / "2 hours ago" */
export function relativeTime(value: string | Date, from: Date = new Date()): string {
  const diffMs = toDate(value).getTime() - from.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
  return rtf.format(Math.round(diffMs / 86_400_000), "day");
}

/** Friendly weekend heading like "This weekend" / "Next weekend" / "Weekend of Oct 16" */
export function weekendHeading(fridayKey: string, now: Date = new Date()): string {
  const thisWeekend = weekendKeyFor(now);
  const [y = 1970, m = 1, d = 1] = fridayKey.split("-").map(Number);
  const [ty = 1970, tm = 1, td = 1] = thisWeekend.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (days === 0) return "This weekend";
  if (days === 7) return "Next weekend";
  return `Weekend of ${monthDayLong(centralWallTimeToUtc(fridayKey, "12:00"))}`;
}

/** "Fri Oct 9 – Sat Oct 10" for a weekend key */
export function weekendSpan(fridayKey: string): string {
  const fri = centralWallTimeToUtc(fridayKey, "12:00");
  const sat = new Date(fri.getTime() + 86_400_000);
  return `${eveningShort(fri)} – ${eveningShort(sat)}`;
}

/** Friday keys for the next `count` weekends starting with the current/upcoming one. */
export function upcomingWeekendKeys(count = 3, now: Date = new Date()): string[] {
  const keys: string[] = [];
  let cursor = now;
  for (let i = 0; i < count; i++) {
    const key = weekendKeyFor(cursor);
    keys.push(key);
    cursor = new Date(centralWallTimeToUtc(key, "12:00").getTime() + 7 * 86_400_000);
  }
  return keys;
}

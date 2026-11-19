/** Wall-clock helpers in the election timezone (Africa/Lagos by default). */

function parts(d: Date, tz: string): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

/** Minutes since local midnight. */
export function localMinutes(d: Date, tz: string): number {
  const p = parts(d, tz);
  return (p.hour ?? 0) * 60 + (p.minute ?? 0);
}

/** "HH:MM" → minutes. */
export function hhmmToMinutes(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`invalid time ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The UTC instant of local midnight for the day containing `d`. */
export function startOfLocalDay(d: Date, tz: string): Date {
  const p = parts(d, tz);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  const offsetMs = asUtc - Math.floor(d.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year!, p.month! - 1, p.day!) - offsetMs);
}

/** True if local time is within [start, end) where the window may wrap midnight (e.g. 21:00–07:00). */
export function inWindow(d: Date, tz: string, start: string, end: string): boolean {
  const now = localMinutes(d, tz);
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  return s <= e ? now >= s && now < e : now >= s || now < e;
}

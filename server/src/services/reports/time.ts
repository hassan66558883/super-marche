/**
 * Business days are local days in the company time zone (Africa/Ndjamena by default),
 * while timestamps are stored in UTC. These helpers convert between the two.
 */

/** Minutes to add to UTC to get local time in `tz` at instant `at` */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, number>>((a, p) => (p.type === 'literal' ? a : { ...a, [p.type]: Number(p.value) }), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant of local midnight starting `day` (YYYY-MM-DD) in `tz` */
export function localMidnightUtc(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMinutes(tz, guess) * 60000);
}

/** Today's date (YYYY-MM-DD) in `tz` */
export function localToday(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDaysIso(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [gte, lt) UTC bounds for the inclusive local-day range from..to */
export function localRange(from: string, to: string, tz: string) {
  return { gte: localMidnightUtc(from, tz), lt: localMidnightUtc(addDaysIso(to, 1), tz) };
}

/** Every local day in the inclusive range */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 1000; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

export function eachMonth(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end || out.length > 240) break;
    out.push(key);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

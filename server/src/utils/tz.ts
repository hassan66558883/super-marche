/**
 * The business time zone (company setting `locale.timezone`, Africa/Ndjamena by default).
 * Timestamps are stored in UTC; "a day" in filters and reports is a local business day,
 * whatever time zone the server itself runs in.
 */
let current = process.env.BUSINESS_TIMEZONE || 'Africa/Ndjamena';

export const businessTz = () => current;

export function setBusinessTz(tz: string | undefined | null) {
  if (!tz) return;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    current = tz;
  } catch {
    // Unknown zone name: keep the previous one
  }
}

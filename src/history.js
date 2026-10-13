// -----------------------------------------------------------------------------
// Month-to-date consumption, for the dashboard widget.
//
// OCEA gives an index per fluid, not the consumption of the month. The
// container keeps, per dwelling and fluid, the index it saw at the start of
// the current month (the last reading of the previous month, or the first
// reading it ever made) and the date of that reading: the widget shows
// "since <date>", so a partial first month is never presented as a full one.
// -----------------------------------------------------------------------------

/** "2026-10" in the Gladys timezone (the supervisor injects TZ). */
export function monthKey(date, timeZone = process.env.TZ || undefined) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}`;
}

/**
 * Record a reading. Pure: returns the new entry.
 * @param {object|undefined} entry { month, baseline, baselineAt, last, lastAt }
 * @param {number} value the index just read
 * @param {Date} at when it was read
 */
export function recordReading(entry, value, at, timeZone) {
  const month = monthKey(at, timeZone);
  const atIso = at.toISOString();
  if (!entry || !Number.isFinite(entry.baseline)) {
    return { month, baseline: value, baselineAt: atIso, last: value, lastAt: atIso };
  }
  let next = { ...entry };
  if (entry.month !== month) {
    // A new month starts from the last index of the previous one.
    next = { ...next, month, baseline: entry.last, baselineAt: entry.lastAt };
  }
  if (value < next.baseline) {
    // The index went down: a replaced meter, or a value OCEA resets each
    // period. Count from zero rather than show a negative consumption.
    next = { ...next, baseline: 0, baselineAt: next.lastAt };
  }
  return { ...next, last: value, lastAt: atIso };
}

/** Consumption since the baseline, or null when unknown. */
export function consumptionOf(entry) {
  if (!entry || !Number.isFinite(entry.baseline) || !Number.isFinite(entry.last)) {
    return null;
  }
  return Math.max(0, Math.round((entry.last - entry.baseline) * 1000) / 1000);
}

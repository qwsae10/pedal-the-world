// Unit conversion and number formatting for the display. Pure functions.
const MPS_TO_KMH = 3.6;
const MPS_TO_MPH = 2.2369362920544;
const M_PER_MILE = 1609.344;

const isMiles = (units) => units === 'mi';

export const speedUnitLabel = (units) => (isMiles(units) ? 'mph' : 'km/h');
export const distanceUnitLabel = (units) => (isMiles(units) ? 'mi' : 'km');

/** Metres/second to km/h or mph. */
export function speedFromMps(mps, units) {
  return mps * (isMiles(units) ? MPS_TO_MPH : MPS_TO_KMH);
}

/** km/h or mph to metres/second. */
export function mpsFromSpeed(value, units) {
  return value / (isMiles(units) ? MPS_TO_MPH : MPS_TO_KMH);
}

/** Whole-number speed text, e.g. "19". */
export function formatSpeed(mps, units) {
  return String(Math.round(speedFromMps(Math.max(0, mps), units)));
}

/** Metres to km or miles as a number. */
export function distanceFromM(m, units) {
  return m / (isMiles(units) ? M_PER_MILE : 1000);
}

/** Distance text with two decimals under 10, else one: "0.42", "12.3". */
export function formatDistance(m, units) {
  const v = distanceFromM(Math.max(0, m), units);
  return v < 10 ? v.toFixed(2) : v.toFixed(1);
}

/** m:ss, or h:mm:ss from one hour. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

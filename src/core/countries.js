// Country lookup, random points and answer options. Pure: the data array is injected.
import { pointInGeometry } from './geo.js';

/** @typedef {import('../contracts.js').Country} Country */
/** @typedef {import('../contracts.js').LatLng} LatLng */

/**
 * Countries with substantial official Google Street View coverage, from general
 * knowledge (not verifiable offline; coverage changes over time).
 */
export const PLAYABLE_CODES = [
  // Europe
  'AL', 'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'RS', 'SK',
  'SI', 'ES', 'SE', 'CH', 'UA', 'GB',
  // Americas
  'US', 'CA', 'MX', 'CR', 'PA', 'BR', 'AR', 'CL', 'CO', 'PE', 'BO', 'EC', 'UY', 'PY',
  // Asia and Middle East
  'JP', 'KR', 'TW', 'TH', 'ID', 'MY', 'PH', 'IN', 'IL', 'JO', 'AE', 'TR', 'MN', 'KG', 'LK',
  'BD', 'KH', 'QA', 'BT',
  // Africa
  'ZA', 'KE', 'GH', 'SN', 'BW', 'NG', 'UG', 'TN', 'MG', 'RW', 'LS', 'SZ',
  // Oceania
  'AU', 'NZ',
];

/** Seeded deterministic rng in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RAD = Math.PI / 180;

function ringArea(ring) {
  // shoelace in degrees, scaled by cos(mid latitude): rough relative area
  let s = 0, minY = 90, maxY = -90;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    if (ring[i][1] < minY) minY = ring[i][1];
    if (ring[i][1] > maxY) maxY = ring[i][1];
  }
  return Math.abs(s / 2) * Math.cos(((minY + maxY) / 2) * RAD);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/**
 * @param {Array<{code:string,name:string,continent:string,bbox:number[],geometry:any}>} data
 */
export function createCountryIndex(data) {
  const byCode = new Map();
  const entries = data.map((d) => {
    const polys = d.geometry.type === 'Polygon' ? [d.geometry.coordinates] : d.geometry.coordinates;
    const parts = polys.map((coords) => {
      const ring = coords[0];
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const p of ring) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      return { geometry: { type: 'Polygon', coordinates: coords }, bbox: [minX, minY, maxX, maxY], area: ringArea(ring) };
    });
    const e = { country: { code: d.code, name: d.name, continent: d.continent }, bbox: d.bbox, geometry: d.geometry, parts };
    byCode.set(d.code, e);
    return e;
  });

  const playableCodes = PLAYABLE_CODES.filter((c) => byCode.has(c));
  const playableSet = new Set(playableCodes);

  /** @returns {Country|null} */
  function countryAt(p) {
    for (const e of entries) {
      const b = e.bbox;
      if (p.lng < b[0] || p.lng > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (pointInGeometry(p, e.geometry)) return e.country;
    }
    return null;
  }

  /** @returns {Country|null} */
  function getCountry(code) {
    const e = byCode.get(code);
    return e ? e.country : null;
  }

  /** @returns {LatLng} */
  function randomPointIn(code, rng, maxAttempts = 200) {
    const e = byCode.get(code);
    if (!e) throw new Error('Unknown country code: ' + code);
    let total = 0;
    for (const p of e.parts) total += p.area;
    let r = rng() * total;
    let part = e.parts[e.parts.length - 1];
    for (const p of e.parts) {
      if (r < p.area) { part = p; break; }
      r -= p.area;
    }
    const [minX, minY, maxX, maxY] = part.bbox;
    const s0 = Math.sin(minY * RAD), s1 = Math.sin(maxY * RAD);
    let pt = null;
    for (let i = 0; i < maxAttempts; i++) {
      const lat = Math.asin(s0 + rng() * (s1 - s0)) / RAD;
      const lng = minX + rng() * (maxX - minX);
      pt = { lat, lng };
      if (pointInGeometry(pt, part.geometry)) return pt;
    }
    return pt;
  }

  /** @returns {Country[]} the answer plus count-1 distractors, shuffled */
  function pickOptions(answer, count, rng) {
    const code = typeof answer === 'string' ? answer : answer.code;
    const ans = getCountry(code);
    if (!ans) throw new Error('Unknown country code: ' + code);
    const pool = playableCodes.filter((c) => c !== code);
    const same = pool.filter((c) => byCode.get(c).country.continent === ans.continent);
    const chosen = new Set();
    const want = count - 1;
    const takeSame = Math.min(Math.ceil(want / 2), same.length);
    for (const c of shuffle(same.slice(), rng)) {
      if (chosen.size >= takeSame) break;
      chosen.add(c);
    }
    for (const c of shuffle(pool.slice(), rng)) {
      if (chosen.size >= want) break;
      chosen.add(c);
    }
    const options = [ans, ...[...chosen].map((c) => byCode.get(c).country)];
    return shuffle(options, rng);
  }

  return {
    countryAt,
    getCountry,
    randomPointIn,
    pickOptions,
    playableCodes,
    isPlayable: (code) => playableSet.has(code),
  };
}

// Pure geometry helpers. Architect-owned.
/** @typedef {import('../contracts.js').LatLng} LatLng */

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees 0-360 clockwise from north. */
export function bearingDeg(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return normalizeDeg(deg(Math.atan2(y, x)));
}

export function normalizeDeg(d) {
  return ((d % 360) + 360) % 360;
}

/** Signed smallest difference to - from, in -180..180. Negative means left. */
export function angleDiff(from, to) {
  return ((to - from + 540) % 360) - 180;
}

/** Ray casting on one linear ring of [lng, lat] pairs. */
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Point in a GeoJSON Polygon or MultiPolygon geometry (coordinates are [lng, lat]).
 * @param {LatLng} p
 * @param {{type: string, coordinates: any}} geometry
 */
export function pointInGeometry(p, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    if (!inRing(p.lng, p.lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(p.lng, p.lat, poly[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

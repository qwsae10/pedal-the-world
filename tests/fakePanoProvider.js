// In-memory PanoProvider for tests.
//
//   createFakeProvider(panos, { failIds = [], rejectIds = [] } = {})
//     -> PanoProvider plus { calls: string[] } (ids passed to getPano).
//     getPano(id)  resolves the pano, or null if unknown or in failIds;
//                  rejects if id is in rejectIds.
//     findNear(point, radiusM) resolves the nearest pano within radius, or null.
//
//   straightRoad(n, spacingM, headingDeg, start = {lat: 0, lng: 0}, prefix = 'p')
//     -> Pano[] of n panos 'p0'..'p{n-1}', spacingM apart along headingDeg,
//        each linked forward (headingDeg) and back (headingDeg + 180).
//
//   addBranch(panos, index, headingDeg, count = 3, spacingM = 10, prefix = `b${index}_`)
//     Mutates panos: grows a side chain of `count` panos from panos[index]
//     along absolute heading headingDeg, linked both ways. Returns the new
//     branch panos (also appended to panos). Ids are `${prefix}0`, `${prefix}1`...
import { haversineM } from '../src/core/geo.js';

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const norm = (d) => ((d % 360) + 360) % 360;

/** Point reached from `from` going distM along headingDeg. */
export function destination(from, headingDeg, distM) {
  const d = distM / R;
  const h = rad(headingDeg);
  const lat1 = rad(from.lat);
  const lng1 = rad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(h));
  const lng2 = lng1 + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: deg(lng2) };
}

export function createFakeProvider(panos, { failIds = [], rejectIds = [] } = {}) {
  const byId = new Map(panos.map((p) => [p.id, p]));
  const fail = new Set(failIds);
  const reject = new Set(rejectIds);
  const calls = [];
  return {
    calls,
    async getPano(id) {
      calls.push(id);
      if (reject.has(id)) throw new Error('getPano rejected: ' + id);
      if (fail.has(id)) return null;
      return byId.get(id) || null;
    },
    async findNear(point, radiusM) {
      let best = null;
      let bestD = Infinity;
      for (const p of panos) {
        const d = haversineM(point, p);
        if (d < bestD) { best = p; bestD = d; }
      }
      return best && bestD <= radiusM ? best : null;
    },
  };
}

export function straightRoad(n, spacingM, headingDeg, start = { lat: 0, lng: 0 }, prefix = 'p') {
  const panos = [];
  for (let i = 0; i < n; i++) {
    const pt = destination(start, headingDeg, i * spacingM);
    const links = [];
    if (i < n - 1) links.push({ id: `${prefix}${i + 1}`, heading: norm(headingDeg) });
    if (i > 0) links.push({ id: `${prefix}${i - 1}`, heading: norm(headingDeg + 180) });
    panos.push({ id: `${prefix}${i}`, lat: pt.lat, lng: pt.lng, links });
  }
  return panos;
}

export function addBranch(panos, index, headingDeg, count = 3, spacingM = 10, prefix = `b${index}_`) {
  const root = panos[index];
  const branch = [];
  let prev = root;
  for (let k = 0; k < count; k++) {
    const pt = destination(prev, headingDeg, spacingM);
    const p = { id: `${prefix}${k}`, lat: pt.lat, lng: pt.lng, links: [{ id: prev.id, heading: norm(headingDeg + 180) }] };
    prev.links.push({ id: p.id, heading: norm(headingDeg) });
    branch.push(p);
    prev = p;
  }
  panos.push(...branch);
  return branch;
}

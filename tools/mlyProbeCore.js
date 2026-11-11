// Pure logic for the Mapillary test page: random places, turning the images of
// a Mapillary coverage tile into ride tracks, and stepping along a track.
import { haversineM, bearingDeg, angleDiff } from '../src/core/geo.js';

/**
 * Cities with dense Mapillary coverage. A ride starts at a random city, a few
 * km from its centre in a random direction.
 */
export const CITIES = [
  ['Amsterdam', 52.370, 4.895], ['Utrecht', 52.091, 5.121], ['Rotterdam', 51.922, 4.479],
  ['Copenhagen', 55.676, 12.568], ['Berlin', 52.520, 13.405], ['Munich', 48.137, 11.575],
  ['Hamburg', 53.551, 9.994], ['Vienna', 48.208, 16.373], ['Zurich', 47.377, 8.541],
  ['Paris', 48.857, 2.352], ['Lyon', 45.764, 4.836], ['London', 51.507, -0.128],
  ['Brussels', 50.850, 4.352], ['Madrid', 40.417, -3.704], ['Barcelona', 41.389, 2.159],
  ['Lisbon', 38.722, -9.139], ['Milan', 45.464, 9.190], ['Rome', 41.903, 12.496],
  ['Prague', 50.076, 14.438], ['Warsaw', 52.230, 21.012], ['Stockholm', 59.329, 18.069],
  ['Oslo', 59.914, 10.752], ['Helsinki', 60.170, 24.938], ['New York', 40.730, -73.990],
  ['San Francisco', 37.775, -122.419], ['Seattle', 47.606, -122.332], ['Portland', 45.515, -122.679],
  ['Chicago', 41.878, -87.630], ['Washington', 38.907, -77.037], ['Boston', 42.360, -71.059],
  ['Toronto', 43.653, -79.383], ['Vancouver', 49.283, -123.121], ['Montreal', 45.502, -73.567],
  ['Mexico City', 19.433, -99.133], ['São Paulo', -23.551, -46.633], ['Buenos Aires', -34.604, -58.382],
  ['Tokyo', 35.676, 139.650], ['Seoul', 37.567, 126.978], ['Taipei', 25.033, 121.565],
  ['Singapore', 1.352, 103.820], ['Sydney', -33.869, 151.209], ['Melbourne', -37.814, 144.963],
  ['Auckland', -36.848, 174.763], ['Cape Town', -33.925, 18.424], ['Bangkok', 13.756, 100.502],
].map(([name, lat, lng]) => ({ name, lat, lng }));

/** A random start point: random city, up to maxOffsetKm from its centre. */
export function randomPlace(rng, maxOffsetKm = 3) {
  const c = CITIES[Math.floor(rng() * CITIES.length)];
  const r = maxOffsetKm * Math.sqrt(rng());
  const a = rng() * 2 * Math.PI;
  const lat = c.lat + (r * Math.cos(a)) / 111.32;
  const lng = c.lng + (r * Math.sin(a)) / (111.32 * Math.cos((c.lat * Math.PI) / 180));
  return { name: c.name, lat, lng };
}

/** What counts as a rideable sequence. Any road counts, car routes too. */
export const RIDE_RULES = {
  minLengthM: 500,         // shorter sequences end too soon
  maxMedianSpacingM: 10,   // denser capture means smoother transitions
  minForwardShare: 0.7,    // flat images: share whose camera looks along the direction of travel
  forwardConeDeg: 40,
  maxGapM: 40,             // a jump bigger than this splits the sequence
  dedupeM: 0.8,            // drop images closer than this to the previous one (stopped at lights)
};

const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Coverage-tile image feature → point, or null. */
export function featureToPoint(f) {
  const g = f && f.geometry && f.geometry[0] && f.geometry[0][0];
  if (!g || !f.props || f.props.id == null || !f.props.sequence_id) return null;
  return {
    id: String(f.props.id),
    seq: String(f.props.sequence_id),
    lng: g[0],
    lat: g[1],
    t: +f.props.captured_at || 0,
    pano: !!f.props.is_pano,
    compass: typeof f.props.compass_angle === 'number' ? f.props.compass_angle : null,
    quality: typeof f.props.quality_score === 'number' ? f.props.quality_score : null,
  };
}

/**
 * Puts one sequence's points in capture order. Timestamps in tiles are often
 * whole seconds, so points sharing a timestamp are chained nearest-first.
 */
export function orderSequence(points) {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].t === sorted[i].t) j++;
    const group = sorted.slice(i, j);
    while (group.length) {
      const last = out[out.length - 1];
      let k = 0;
      if (last) {
        let best = Infinity;
        group.forEach((p, idx) => { const d = haversineM(last, p); if (d < best) { best = d; k = idx; } });
      }
      out.push(group.splice(k, 1)[0]);
    }
    i = j;
  }
  return out;
}

/** Splits ordered points at big jumps and drops near-duplicates. */
function runs(points, rules) {
  const out = [];
  let run = [];
  for (const p of points) {
    const prev = run[run.length - 1];
    if (prev) {
      const d = haversineM(prev, p);
      if (d < rules.dedupeM) continue;
      if (d > rules.maxGapM) { out.push(run); run = []; }
    }
    run.push(p);
  }
  out.push(run);
  return out.filter((r) => r.length >= 2);
}

/** Builds a track (cumulative distances and stats) from ordered points. */
export function buildTrack(points, rules = RIDE_RULES) {
  if (points.length < 2) return null;
  const cum = [0];
  const spacings = [], speeds = [];
  let flat = 0, forward = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = haversineM(a, b);
    cum.push(cum[i - 1] + d);
    spacings.push(d);
    const dt = (b.t - a.t) / 1000;
    if (dt >= 1 && dt < 30) speeds.push((d / dt) * 3.6);
    if (!a.pano && a.compass != null) {
      flat++;
      if (Math.abs(angleDiff(bearingDeg(a, b), a.compass)) <= rules.forwardConeDeg) forward++;
    }
  }
  const q = points.map((p) => p.quality).filter((v) => v != null);
  const stats = {
    images: points.length,
    lengthM: cum[cum.length - 1],
    medianSpacingM: median(spacings),
    medianSpeedKmh: median(speeds),
    panoShare: points.filter((p) => p.pano).length / points.length,
    forwardShare: flat ? forward / flat : 1,
    quality: q.length ? median(q) : NaN,
    capturedAt: points[0].t,
  };
  return { points, cum, stats, rideable: isRideable(stats, rules) };
}

export function isRideable(s, rules = RIDE_RULES) {
  return s.lengthM >= rules.minLengthM
    && s.medianSpacingM <= rules.maxMedianSpacingM
    && s.forwardShare >= rules.minForwardShare;
}

/** Every track in a set of points from coverage tiles, best first. */
export function tracksFromPoints(points, rules = RIDE_RULES) {
  const bySeq = new Map();
  for (const p of points) {
    if (!p) continue;
    if (!bySeq.has(p.seq)) bySeq.set(p.seq, new Map());
    bySeq.get(p.seq).set(p.id, p); // tiles can overlap; keep one per id
  }
  const tracks = [];
  for (const [seq, m] of bySeq) {
    for (const run of runs(orderSequence([...m.values()]), rules)) {
      const t = buildTrack(run, rules);
      if (t) tracks.push({ seq, ...t });
    }
  }
  return tracks.sort((a, b) => score(b) - score(a));
}

/** Higher is better: rideable first, then long and good quality. */
export function score(t) {
  const q = isFinite(t.stats.quality) ? t.stats.quality : 0.5;
  return (t.rideable ? 1e6 : 0) + Math.min(t.stats.lengthM, 3000) * (0.5 + q);
}

/**
 * Which image to move to next. Moves to the furthest image already passed,
 * but only once it is at least stepM beyond the current one (or the last image).
 * @returns {number} index to move to, or -1 to stay
 */
export function nextIndex(cum, current, travelM, stepM) {
  const last = cum.length - 1;
  if (current >= last) return -1;
  let i = current;
  while (i < last && cum[i + 1] <= travelM) i++;
  if (i === current) return -1;
  if (i === last || cum[i] - cum[current] >= stepM) return i;
  return -1;
}

/**
 * Where to carry on when a track ends: the closest point of another rideable
 * track within maxM of the end, heading roughly the same way. Returns
 * {track, index} or null.
 */
export function findContinuation(tracks, ended, maxM = 35, coneDeg = 60) {
  const pts = ended.points;
  const end = pts[pts.length - 1];
  const heading = bearingDeg(pts[Math.max(0, pts.length - 4)], end);
  let best = null;
  for (const t of tracks) {
    if (t === ended || !t.rideable) continue;
    for (let i = 0; i < t.points.length - 10; i++) {
      const d = haversineM(end, t.points[i]);
      if (d > maxM) continue;
      const h = bearingDeg(t.points[i], t.points[Math.min(t.points.length - 1, i + 3)]);
      if (Math.abs(angleDiff(heading, h)) > coneDeg) continue;
      const remaining = t.cum[t.cum.length - 1] - t.cum[i];
      if (remaining < 200) continue;
      if (!best || d < best.d) best = { track: t, index: i, d };
    }
  }
  return best && { track: best.track, index: best.index };
}

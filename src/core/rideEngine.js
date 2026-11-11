// Ride engine: turns speed samples into movement along Street View panoramas.
// Pure logic: no timers, no DOM. Time arrives through tick(speedMps, nowMs).
//
// When listeners are called (onState):
//   - once on begin()
//   - once on every move to a new pano (moved: true)
//   - once on chooseTurn() with a valid option
//   - at most once per accepted tick otherwise (moved: false), so a HUD can
//     update speed, distance and time. A tick that moves emits only the
//     move snapshot(s). Ticks while paused emit nothing.
// A tick that arrives while an earlier tick is still awaiting a pano adds its
// distance and emits a plain snapshot, but does not start a second move loop.
import * as defaults from '../config.js';
import { haversineM, bearingDeg, angleDiff, normalizeDeg } from './geo.js';

/** @typedef {import('../contracts.js').Pano} Pano */
/** @typedef {import('../contracts.js').PanoLink} PanoLink */
/** @typedef {import('../contracts.js').TurnOption} TurnOption */
/** @typedef {import('../contracts.js').RideState} RideState */
/** @typedef {import('../contracts.js').RideEngine} RideEngine */

const MAX_MOVES_PER_TICK = 5;

/**
 * @param {{provider: import('../contracts.js').PanoProvider, config?: object}} opts
 * @returns {RideEngine}
 */
export function createRideEngine({ provider, config = {} }) {
  const cfg = {
    MAX_PLAUSIBLE_SPEED_MPS: defaults.MAX_PLAUSIBLE_SPEED_MPS,
    MAX_TICK_GAP_MS: defaults.MAX_TICK_GAP_MS,
    FORWARD_CONE_DEG: defaults.FORWARD_CONE_DEG,
    TURN_OPTION_MIN_SEPARATION_DEG: defaults.TURN_OPTION_MIN_SEPARATION_DEG,
    ...config,
  };

  const listeners = new Set();
  /** @type {Map<string, Promise<Pano|null>>} */
  let loads = new Map();

  let began = false;
  let gen = 0;
  let paused = false;
  let busy = false;
  /** @type {Pano|null} */ let pano = null;
  let heading = 0;
  let prevId = null;
  let speedMps = 0;
  let distanceM = 0;
  let elapsedMs = 0;
  let pending = 0;
  let lastTickMs = null;
  let chosenTurnId = null;
  /** @type {Set<string>} links of the current pano whose target failed to load */
  let failed = new Set();
  /** @type {RideState|null} */
  let latest = null;

  function loadPano(id) {
    let p = loads.get(id);
    if (!p) {
      p = Promise.resolve()
        .then(() => provider.getPano(id))
        .then((r) => r || null, () => null);
      loads.set(id, p);
      p.then((r) => { if (!r && loads.get(id) === p) loads.delete(id); });
    }
    return p;
  }

  /** Works out the options and the link to take at the current pano. */
  function plan() {
    const links = (pano.links || []).filter((l) => !failed.has(l.id));
    const nonBack = links.filter((l) => l.id !== prevId);
    const back = links.find((l) => l.id === prevId) || null;
    const withRel = (l) => ({ link: l, relative: angleDiff(heading, l.heading) });

    const forward = nonBack
      .map(withRel)
      .filter((c) => Math.abs(c.relative) <= cfg.FORWARD_CONE_DEG)
      .sort((a, b) => Math.abs(a.relative) - Math.abs(b.relative));

    const kept = [];
    for (const c of forward) {
      if (kept.every((k) => Math.abs(angleDiff(k.link.heading, c.link.heading)) >= cfg.TURN_OPTION_MIN_SEPARATION_DEG)) {
        kept.push(c);
      }
    }
    kept.sort((a, b) => a.relative - b.relative);
    const turnOptions = kept.map((c) => ({
      id: c.link.id,
      heading: normalizeDeg(c.link.heading),
      relative: c.relative,
    }));

    let pick = null;
    if (forward.length) {
      const chosen = chosenTurnId && kept.find((c) => c.link.id === chosenTurnId);
      pick = (chosen || forward[0]).link;
    } else if (nonBack.length) {
      pick = nonBack.map(withRel).sort((a, b) => Math.abs(a.relative) - Math.abs(b.relative))[0].link;
    } else if (back) {
      pick = back;
    }
    return { turnOptions, pick };
  }

  function prefetch() {
    if (!pano) return;
    const { pick } = plan();
    if (pick) loadPano(pick.id);
  }

  function snapshot(moved) {
    const { turnOptions } = plan();
    return {
      pano,
      heading,
      speedMps,
      distanceM,
      elapsedMs,
      turnOptions,
      chosenTurnId: turnOptions.some((o) => o.id === chosenTurnId) ? chosenTurnId : null,
      moved,
    };
  }

  function emit(moved) {
    latest = snapshot(moved);
    for (const l of Array.from(listeners)) {
      try { l(latest); } catch (e) { /* a bad listener must not break the ride */ }
    }
  }

  async function moveLoop(myGen) {
    let moves = 0;
    while (pending > 0 && moves < MAX_MOVES_PER_TICK) {
      const { pick } = plan();
      if (!pick) { pending = 0; break; }
      const target = await loadPano(pick.id);
      if (myGen !== gen) return moves;
      if (!target) { failed.add(pick.id); continue; }
      const step = haversineM(pano, target);
      if (pending + 1e-6 < step) break; // epsilon absorbs float noise at exact multiples
      pending = Math.max(0, pending - step);
      const newHeading = step > 0.01 ? bearingDeg(pano, target) : normalizeDeg(pick.heading);
      prevId = pano.id;
      pano = target;
      heading = newHeading;
      chosenTurnId = null;
      failed = new Set();
      moves++;
      emit(true);
      prefetch();
    }
    if (moves >= MAX_MOVES_PER_TICK) pending = 0;
    return moves;
  }

  return {
    begin(start, initialHeading) {
      gen++;
      began = true;
      paused = false;
      busy = false;
      pano = start;
      heading = typeof initialHeading === 'number' && isFinite(initialHeading)
        ? normalizeDeg(initialHeading)
        : (start.links && start.links.length ? normalizeDeg(start.links[0].heading) : 0);
      prevId = null;
      speedMps = 0;
      distanceM = 0;
      elapsedMs = 0;
      pending = 0;
      lastTickMs = null;
      chosenTurnId = null;
      failed = new Set();
      loads = new Map();
      emit(false);
      prefetch();
    },

    async tick(speed, nowMs) {
      if (!began || paused) return;
      let v = Number(speed);
      if (!(v > 0)) v = 0;
      if (v > cfg.MAX_PLAUSIBLE_SPEED_MPS) v = cfg.MAX_PLAUSIBLE_SPEED_MPS;
      let dt = 0;
      if (lastTickMs !== null) {
        const gap = nowMs - lastTickMs;
        dt = gap > 0 && gap <= cfg.MAX_TICK_GAP_MS ? gap : 0;
      }
      lastTickMs = nowMs;
      speedMps = v;
      const d = (v * dt) / 1000;
      distanceM += d;
      elapsedMs += dt;
      pending += d;

      if (busy) { emit(false); return; }
      busy = true;
      const myGen = gen;
      let moves = 0;
      try {
        moves = await moveLoop(myGen);
      } finally {
        if (myGen === gen) busy = false;
      }
      if (myGen === gen && moves === 0) emit(false);
    },

    chooseTurn(panoId) {
      if (!began) return;
      const { turnOptions } = plan();
      if (!turnOptions.some((o) => o.id === panoId)) return;
      chosenTurnId = panoId;
      emit(false);
      prefetch();
    },

    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getState() {
      return latest;
    },

    pause() {
      paused = true;
    },

    resume() {
      if (!paused) return;
      paused = false;
      lastTickMs = null;
    },
  };
}

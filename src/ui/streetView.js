// The Street View view: two stacked panoramas (front and back). The back one
// preloads the next panorama while the front is shown; a move crossfades to it.
// The camera follows the direction of travel, the rider can look around for a
// while, and a slow zoom-in during each step suggests forward motion.
import * as config from '../config.js';

const EASE_MS = 500;           // roughly how long a turn of the camera takes
const SETTLE_DEG = 0.25;
const ZOOM_SMOOTH_MS = 140;    // time constant of the zoom follower
const ZOOM_EPS = 0.004;        // do not touch the panorama for smaller zoom changes
const FADE_SLACK_MS = 60;
const MIN_LOAD_MS = 320;       // a panorama needs at least this long before it is shown
const MAX_WAIT_MS = 2500;      // show it anyway after this long

/** Signed shortest angle from a to b, -180..180. */
export function shortestDelta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

const norm360 = (h) => ((h % 360) + 360) % 360;
const smoothstep = (p) => p * p * (3 - 2 * p);

/**
 * @param {typeof google.maps} maps
 * @param {HTMLElement} container
 */
export function createStreetView(maps, container) {
  const OPTIONS = {
    disableDefaultUI: true,
    showRoadLabels: false,
    clickToGo: false,
    linksControl: false,
    addressControl: false,
    panControl: false,
    zoomControl: false,
    fullscreenControl: false,
    motionTracking: false,
    motionTrackingControl: false,
    scrollwheel: false,
    keyboardShortcuts: false,
    enableCloseButton: false,
  };
  const LOOK_RECENTER_MS = config.LOOK_RECENTER_MS;
  const CROSSFADE_MS = config.CROSSFADE_MS ?? 280;
  const ZOOM_MAX = config.MOTION_ZOOM_MAX ?? 0;
  const ZOOM_CONE = config.MOTION_ZOOM_CONE_DEG ?? 35;

  function makeBuffer(isFront) {
    const layer = document.createElement('div');
    layer.className = 'pano-layer';
    layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
    layer.style.opacity = isFront ? '1' : '0';
    layer.style.zIndex = isFront ? '2' : '1';
    layer.style.pointerEvents = isFront ? 'auto' : 'none';
    container.appendChild(layer);
    const buf = { layer, pano: new maps.StreetViewPanorama(layer, OPTIONS), id: null, zoom: 0, heading: 0, setAt: 0, ok: false, committed: false };
    maps.event.addListener(buf.pano, 'status_changed', () => {
      if (buf.pano.getStatus() === 'OK') buf.ok = true;
    });
    return buf;
  }
  let front = makeBuffer(true);
  let back = makeBuffer(false);

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => !!(reduceMotion && reduceMotion.matches);

  let targetHeading = 0;
  let touching = false;
  let lastTouchAt = -Infinity;
  let raf = 0;
  let lastFrame = 0;
  let destroyed = false;
  let paused = false;
  let moveCounter = 0;          // bumped on every swap; stale fade callbacks compare against it
  let fading = false;
  let fadeTimer = 0;
  /** @type {import('../contracts.js').RideState|null} */
  let lastState = null;
  let lastStateAt = 0;
  /** The panorama the ride is at: {id, heading, snap}. */
  let desired = null;
  const counts = { fade: 0, instant: 0 };
  let zoomNow = 0;              // smoothed zoom applied to the front

  const noteTouch = () => { lastTouchAt = performance.now(); };
  const down = () => { touching = true; noteTouch(); };
  const move = () => { if (touching) noteTouch(); };
  const up = () => { touching = false; noteTouch(); };
  // The container sees events from both panoramas; only the front receives any
  // because the back layer has pointer-events: none.
  container.addEventListener('pointerdown', down, true);
  container.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);

  // Arrow keys belong to the test-pedals panel: the panorama must never see them.
  const blockKeys = (e) => {
    if (e.target && container.contains(e.target) && (e.key.startsWith('Arrow') || e.key === ' ' || e.key === '+' || e.key === '-')) {
      e.stopPropagation();
    }
  };
  container.addEventListener('keydown', blockKeys, true);
  container.addEventListener('keyup', blockKeys, true);

  const lookingAround = (now) => touching || now - lastTouchAt < LOOK_RECENTER_MS;

  function setBufferZoom(buf, z) {
    buf.zoom = z;
    if (typeof buf.pano.setZoom === 'function') buf.pano.setZoom(z);
  }

  /** How far the rider's view is turned away from the road, in degrees. */
  function lookOffset() {
    const pov = front.pano.getPov();
    return pov ? shortestDelta(targetHeading, pov.heading) : 0;
  }

  /** Starts loading a panorama into a buffer. `committed` = it will be shown, not just a guess. */
  function load(buf, id, heading, committed) {
    buf.pano.setPano(id);
    buf.id = id;
    buf.heading = heading;
    buf.setAt = performance.now();
    buf.ok = false;
    buf.committed = committed;
    const pov = front.pano.getPov() || { pitch: 0 };
    buf.pano.setPov({ heading: norm360(heading + (buf === front ? 0 : lookOffset())), pitch: pov.pitch || 0 });
    setBufferZoom(buf, 0);
  }

  /** Has the buffer had time to draw its panorama? There is no "tiles loaded" event. */
  function ready(buf, now) {
    const age = now - buf.setAt;
    return (buf.ok && age >= MIN_LOAD_MS) || age >= MAX_WAIT_MS;
  }

  function finishFade(id) {
    if (id !== moveCounter || destroyed) return;
    fading = false;
    fadeTimer = 0;
    back.layer.style.transition = 'none';
    back.layer.style.opacity = '0';
    back.layer.style.zIndex = '1';
    pump(performance.now());
  }

  /** Makes the back buffer the front, fading it in over the old one unless `fade` is false. */
  function swap(fade, snap) {
    counts[fade ? 'fade' : 'instant']++;
    // At speed, steps come quicker than a full crossfade: shorten it so the
    // back buffer is free to load the next pano in time.
    let fadeMs = CROSSFADE_MS;
    const st = lastState;
    const rate = st ? (st.speedMps || 0) * (st.multiplier || 1) : 0;
    if (st && st.stepLengthM && rate > 0) fadeMs = Math.max(80, Math.min(CROSSFADE_MS, (st.stepLengthM / rate) * 500));
    const offset = snap ? 0 : lookOffset();
    const oldPov = front.pano.getPov() || { pitch: 0 };
    const id = ++moveCounter;
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = 0; }
    const nf = back;
    const of = front;
    targetHeading = nf.heading;
    nf.pano.setPov({ heading: norm360(nf.heading + offset), pitch: snap ? 0 : (oldPov.pitch || 0) });
    if (snap) lastTouchAt = -Infinity;
    setBufferZoom(nf, 0);
    zoomNow = 0;
    nf.committed = false;
    nf.layer.style.pointerEvents = 'auto';
    of.layer.style.pointerEvents = 'none';
    nf.layer.style.zIndex = '2';
    if (fade) {
      of.layer.style.zIndex = '1';
      nf.layer.style.transition = 'none';
      nf.layer.style.opacity = '0';
      void nf.layer.offsetWidth; // flush so the transition starts from 0
      nf.layer.style.transition = `opacity ${fadeMs}ms linear`;
      nf.layer.style.opacity = '1';
      fading = true;
      fadeTimer = setTimeout(() => finishFade(id), fadeMs + FADE_SLACK_MS);
    } else {
      nf.layer.style.transition = 'none';
      nf.layer.style.opacity = '1';
      of.layer.style.transition = 'none';
      of.layer.style.opacity = '0';
      of.layer.style.zIndex = '1';
      fading = false;
    }
    front = nf;
    back = of;
  }

  /**
   * Moves the display toward the panorama the ride is at. The front image
   * always stays up until the back one has had time to draw, so a slow
   * connection or a fast rider skips panoramas instead of showing black.
   */
  function pump(now) {
    if (destroyed || fading || !desired) return;
    if (front.id === desired.id) {
      // Up to date: use the idle buffer to get the next panorama ready.
      const st = lastState;
      if (st && st.nextPanoId && back.id !== st.nextPanoId) {
        load(back, st.nextPanoId, typeof st.nextHeading === 'number' ? st.nextHeading : targetHeading, false);
      }
      return;
    }
    if (back.id === desired.id) { back.committed = true; back.heading = desired.heading; }
    if (!back.committed) load(back, desired.id, desired.heading, true);
    // First image of a ride: nothing to keep on screen, so show it at once.
    const first = front.id === null;
    if (first || ready(back, now)) {
      const snap = desired.snap && back.id === desired.id;
      swap(!first && !snap && !reduced(), snap);
      if (snap) desired.snap = false;
    }
  }

  function updateZoom(now, dt, pov) {
    if (paused || !lastState) return;
    let target = 0;
    const len = lastState.stepLengthM;
    if (ZOOM_MAX > 0 && len && !reduced() && !fading
        && Math.abs(shortestDelta(targetHeading, pov.heading)) <= ZOOM_CONE) {
      const rate = (lastState.speedMps * (lastState.multiplier || 1)) / len;
      const p = Math.min(1, Math.max(0, lastState.stepProgress + (rate * (now - lastStateAt)) / 1000));
      target = ZOOM_MAX * smoothstep(p);
    }
    const k = 1 - Math.exp(-dt / ZOOM_SMOOTH_MS);
    zoomNow += (target - zoomNow) * k;
    if (Math.abs(zoomNow) < ZOOM_EPS && target === 0) zoomNow = 0;
    if (Math.abs(zoomNow - front.zoom) > ZOOM_EPS || (zoomNow === 0 && front.zoom !== 0)) {
      setBufferZoom(front, zoomNow);
    }
  }

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(100, now - (lastFrame || now));
    lastFrame = now;
    const pov = front.pano.getPov();
    if (pov) {
      if (!lookingAround(performance.now())) {
        const delta = shortestDelta(pov.heading, targetHeading);
        if (Math.abs(delta) > SETTLE_DEG || Math.abs(pov.pitch) > SETTLE_DEG) {
          // Exponential approach: ~95% of the way in EASE_MS.
          const k = 1 - Math.exp((-3 * dt) / EASE_MS);
          const h = Math.abs(delta) <= SETTLE_DEG ? targetHeading : pov.heading + delta * k;
          front.pano.setPov({ heading: norm360(h), pitch: pov.pitch * (1 - k) });
        }
      }
      updateZoom(now, dt, pov);
    }
    pump(performance.now());
    schedule();
  }
  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }
  schedule();

  const resize = () => {
    maps.event.trigger(front.pano, 'resize');
    maps.event.trigger(back.pano, 'resize');
  };
  let observer = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(resize);
    observer.observe(container);
  }
  const resizeTimer = setTimeout(resize, 0);

  return {
    /** Swap counters, for debugging. */
    counts,
    /** The panorama currently in front. */
    get panorama() { return front.pano; },
    /** Follows a ride state: preloads the next pano, swaps on moves, camera follows the heading. */
    show(state, { snap = false } = {}) {
      if (destroyed) return;
      lastState = state;
      lastStateAt = performance.now();
      desired = { id: state.pano.id, heading: state.heading, snap: snap || (desired ? desired.snap && front.id !== desired.id : false) };
      if (snap && back.id !== state.pano.id) back.committed = false; // a new place replaces whatever was loading
      if (front.id === state.pano.id) targetHeading = state.heading;
      pump(lastStateAt);
      if (reduced() && !snap && front.id === state.pano.id) front.pano.setPov({ heading: state.heading, pitch: 0 });
    },
    /** Freezes the motion zoom (ride paused, guess overlay up). */
    setPaused(p) { paused = !!p; },
    resize,
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (fadeTimer) clearTimeout(fadeTimer);
      clearTimeout(resizeTimer);
      if (observer) observer.disconnect();
      container.removeEventListener('pointerdown', down, true);
      container.removeEventListener('pointermove', move, true);
      container.removeEventListener('keydown', blockKeys, true);
      container.removeEventListener('keyup', blockKeys, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      maps.event.clearInstanceListeners(front.pano);
      maps.event.clearInstanceListeners(back.pano);
    },
  };
}

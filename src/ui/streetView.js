// The Street View panorama: follows ride engine states, keeps the camera facing
// the direction of travel, and lets the rider look around for a while.
import { LOOK_RECENTER_MS } from '../config.js';

const EASE_MS = 500;           // roughly how long a turn of the camera takes
const SETTLE_DEG = 0.25;

/** Signed shortest angle from a to b, -180..180. */
export function shortestDelta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * @param {typeof google.maps} maps
 * @param {HTMLElement} container
 */
export function createStreetView(maps, container) {
  const panorama = new maps.StreetViewPanorama(container, {
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
  });

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  let targetHeading = 0;
  let touching = false;
  let lastTouchAt = -Infinity;
  let raf = 0;
  let lastFrame = 0;
  let destroyed = false;

  const noteTouch = () => { lastTouchAt = performance.now(); };
  const down = () => { touching = true; noteTouch(); };
  const up = () => { touching = false; noteTouch(); };
  container.addEventListener('pointerdown', down, true);
  container.addEventListener('pointermove', () => { if (touching) noteTouch(); }, true);
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

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(100, now - (lastFrame || now));
    lastFrame = now;
    const lookingAround = touching || now - lastTouchAt < LOOK_RECENTER_MS;
    if (!lookingAround) {
      const pov = panorama.getPov();
      const delta = shortestDelta(pov.heading, targetHeading);
      if (Math.abs(delta) > SETTLE_DEG || Math.abs(pov.pitch) > SETTLE_DEG) {
        // Exponential approach: ~95% of the way in EASE_MS.
        const k = 1 - Math.exp((-3 * dt) / EASE_MS);
        const h = Math.abs(delta) <= SETTLE_DEG ? targetHeading : pov.heading + delta * k;
        panorama.setPov({ heading: (h + 360) % 360, pitch: pov.pitch * (1 - k) });
      }
    }
    schedule();
  }
  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }
  schedule();

  const resize = () => maps.event.trigger(panorama, 'resize');
  let observer = null;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(resize);
    observer.observe(container);
  }
  setTimeout(resize, 0);

  return {
    panorama,
    /** Follows a ride state: new pano on moves, camera follows the heading. */
    show(state, { snap = false } = {}) {
      if (state.moved || snap) panorama.setPano(state.pano.id);
      targetHeading = state.heading;
      if (snap || (reduceMotion && reduceMotion.matches)) {
        panorama.setPov({ heading: state.heading, pitch: 0 });
        if (snap) lastTouchAt = -Infinity;
      }
    },
    resize,
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      container.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      maps.event.clearInstanceListeners(panorama);
    },
  };
}

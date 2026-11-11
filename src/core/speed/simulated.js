// Simulated speed source: eases the emitted speed toward a target so it feels
// like a bike. Timer functions are injected so it is testable without timers.
import { SIM_MAX_SPEED_MPS, SIM_DEFAULT_SPEED_MPS } from '../../config.js';

const ACCEL_MPS2 = 1.5;
const DECEL_MPS2 = 2.5;

const clampTarget = (v) => (v > 0 ? Math.min(v, SIM_MAX_SPEED_MPS) : 0);

/**
 * If initialSpeedMps is given, both the current and target speed start there.
 * Otherwise the target is SIM_DEFAULT_SPEED_MPS and the bike starts from 0.
 * start() emits the current speed immediately, then every intervalMs.
 * @returns {import('../../contracts.js').SpeedSource & {setTargetSpeed(mps:number):void, getTargetSpeed():number}}
 */
export function createSimulatedSpeedSource({
  setIntervalFn = globalThis.setInterval && globalThis.setInterval.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval && globalThis.clearInterval.bind(globalThis),
  intervalMs = 250,
  initialSpeedMps,
} = {}) {
  const hasInitial = typeof initialSpeedMps === 'number' && isFinite(initialSpeedMps);
  let target = clampTarget(hasInitial ? initialSpeedMps : SIM_DEFAULT_SPEED_MPS);
  let current = hasInitial ? target : 0;
  let timer = null;
  let started = false;
  const listeners = new Set();

  const emit = (v) => { for (const l of Array.from(listeners)) l(v); };

  function step() {
    const dt = intervalMs / 1000;
    if (current < target) current = Math.min(target, current + ACCEL_MPS2 * dt);
    else if (current > target) current = Math.max(target, current - DECEL_MPS2 * dt);
    emit(current);
  }

  return {
    start() {
      if (started) return;
      if (!setIntervalFn) throw new Error('no setInterval available');
      started = true;
      emit(current);
      timer = setIntervalFn(step, intervalMs);
    },
    stop() {
      if (!started) return;
      started = false;
      if (clearIntervalFn) clearIntervalFn(timer);
      timer = null;
      current = 0;
      emit(0);
    },
    onSpeed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTargetSpeed(mps) {
      target = clampTarget(Number(mps));
    },
    getTargetSpeed() {
      return target;
    },
  };
}

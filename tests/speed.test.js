import { test, assert, assertEqual, assertClose } from './harness.js';
import { createSimulatedSpeedSource } from '../src/core/speed/simulated.js';
import { SIM_MAX_SPEED_MPS, SIM_DEFAULT_SPEED_MPS } from '../src/config.js';

function fakeTimers() {
  const t = { fn: null, cleared: 0, ms: null };
  t.setIntervalFn = (fn, ms) => { t.fn = fn; t.ms = ms; return 7; };
  t.clearIntervalFn = (id) => { if (id === 7) { t.fn = null; t.cleared++; } };
  return t;
}

function make(opts = {}) {
  const t = fakeTimers();
  const src = createSimulatedSpeedSource({ setIntervalFn: t.setIntervalFn, clearIntervalFn: t.clearIntervalFn, intervalMs: 250, ...opts });
  const got = [];
  src.onSpeed((v) => got.push(v));
  return { t, src, got };
}

test('start installs a timer and emits the current speed', () => {
  const { t, src, got } = make({ initialSpeedMps: 3 });
  src.start();
  assertEqual(t.ms, 250);
  assertEqual(got, [3]);
  t.fn();
  assertEqual(got, [3, 3]);
});

test('default target is SIM_DEFAULT_SPEED_MPS, starting from 0', () => {
  const { src } = make();
  assertEqual(src.getTargetSpeed(), SIM_DEFAULT_SPEED_MPS);
});

test('accelerates at about 1.5 m/s^2 toward the target', () => {
  const { t, src, got } = make({ initialSpeedMps: 0 });
  src.start();
  src.setTargetSpeed(6);
  t.fn(); t.fn(); t.fn(); t.fn(); // 1 s
  assertClose(got[got.length - 1], 1.5, 1e-9);
  for (let i = 0; i < 20; i++) t.fn();
  assertEqual(got[got.length - 1], 6);
});

test('decelerates at about 2.5 m/s^2 and does not undershoot', () => {
  const { t, src, got } = make({ initialSpeedMps: 5 });
  src.start();
  src.setTargetSpeed(0);
  t.fn(); t.fn(); t.fn(); t.fn(); // 1 s
  assertClose(got[got.length - 1], 2.5, 1e-9);
  t.fn(); t.fn(); t.fn(); t.fn();
  assertEqual(got[got.length - 1], 0);
});

test('target is clamped to 0..SIM_MAX_SPEED_MPS', () => {
  const { src } = make();
  src.setTargetSpeed(1000);
  assertEqual(src.getTargetSpeed(), SIM_MAX_SPEED_MPS);
  src.setTargetSpeed(-4);
  assertEqual(src.getTargetSpeed(), 0);
  src.setTargetSpeed(NaN);
  assertEqual(src.getTargetSpeed(), 0);
});

test('stop clears the timer and emits one final 0', () => {
  const { t, src, got } = make({ initialSpeedMps: 4 });
  src.start();
  src.stop();
  assertEqual(t.cleared, 1);
  assertEqual(t.fn, null);
  assertEqual(got[got.length - 1], 0);
  const n = got.length;
  src.stop(); // second stop is a no-op
  assertEqual(got.length, n);
});

test('unsubscribe stops delivery and start twice does not double the timer', () => {
  const { t, src } = make({ initialSpeedMps: 1 });
  const extra = [];
  const off = src.onSpeed((v) => extra.push(v));
  src.start();
  src.start();
  assertEqual(extra.length, 1);
  off();
  t.fn();
  assertEqual(extra.length, 1);
});

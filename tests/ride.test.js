import { test, assert, assertEqual, assertClose } from './harness.js';
import { createRideEngine } from '../src/core/rideEngine.js';
import { createFakeProvider, straightRoad, addBranch } from './fakePanoProvider.js';

function setup(panos, opts = {}, config = {}) {
  const provider = createFakeProvider(panos, opts);
  const engine = createRideEngine({ provider, config });
  const states = [];
  engine.onState((s) => states.push(s));
  return { provider, engine, states, byId: (id) => panos.find((p) => p.id === id) };
}

/** Starts a ride and does the zero-distance first tick at t=0. */
async function startRide(ctx, startId = 'p0', heading) {
  ctx.engine.begin(ctx.byId(startId), heading);
  await ctx.engine.tick(0, 0);
}

test('begin emits a snapshot and getState is null before begin', () => {
  const road = straightRoad(3, 10, 0);
  const c = setup(road);
  assertEqual(c.engine.getState(), null);
  c.engine.begin(road[0]);
  assertEqual(c.states.length, 1);
  assertEqual(c.engine.getState().pano.id, 'p0');
  assertEqual(c.engine.getState().moved, false);
  assertEqual(c.engine.getState().heading, 0);
});

test('begin heading defaults to first link, or 0 with no links', () => {
  const road = straightRoad(3, 10, 90);
  const c = setup(road);
  c.engine.begin(road[0]);
  assertEqual(c.engine.getState().heading, 90);
  c.engine.begin({ id: 'x', lat: 0, lng: 0, links: [] });
  assertEqual(c.engine.getState().heading, 0);
  c.engine.begin(road[0], 270);
  assertEqual(c.engine.getState().heading, 270);
});

test('first tick adds no distance; later ticks integrate speed x dt', async () => {
  const c = setup(straightRoad(10, 100, 0));
  await startRide(c);
  assertEqual(c.engine.getState().distanceM, 0);
  await c.engine.tick(5, 1000);
  assertClose(c.engine.getState().distanceM, 5, 1e-9);
  await c.engine.tick(5, 3000);
  assertClose(c.engine.getState().distanceM, 15, 1e-9);
  assertEqual(c.engine.getState().elapsedMs, 3000);
  assertEqual(c.engine.getState().speedMps, 5);
});

test('gap longer than MAX_TICK_GAP_MS counts as zero dt', async () => {
  const c = setup(straightRoad(10, 100, 0), {}, { MAX_TICK_GAP_MS: 3000 });
  await startRide(c);
  await c.engine.tick(5, 1000);
  await c.engine.tick(5, 10000); // 9 s gap: dropped
  assertClose(c.engine.getState().distanceM, 5, 1e-9);
  assertEqual(c.engine.getState().elapsedMs, 1000);
  await c.engine.tick(5, 11000);
  assertClose(c.engine.getState().distanceM, 10, 1e-9);
  assertEqual(c.engine.getState().elapsedMs, 2000);
});

test('speed is clamped: negative, NaN and above the max', async () => {
  const c = setup(straightRoad(10, 1000, 0), {}, { MAX_PLAUSIBLE_SPEED_MPS: 20 });
  await startRide(c);
  await c.engine.tick(-5, 1000);
  assertEqual(c.engine.getState().distanceM, 0);
  await c.engine.tick(NaN, 2000);
  assertEqual(c.engine.getState().distanceM, 0);
  await c.engine.tick(100, 3000);
  assertClose(c.engine.getState().distanceM, 20, 1e-9);
  assertEqual(c.engine.getState().speedMps, 20);
});

test('moves along a straight road after the expected metres', async () => {
  const c = setup(straightRoad(10, 10, 0));
  await startRide(c);
  await c.engine.tick(9, 1000); // 9 m: not yet
  assertEqual(c.engine.getState().pano.id, 'p0');
  await c.engine.tick(2, 1500); // +1 m = 10 m total
  assertEqual(c.engine.getState().pano.id, 'p1');
  assertEqual(c.engine.getState().moved, true);
  assertClose(c.engine.getState().heading, 0, 0.01);
  await c.engine.tick(10, 2500); // +10 m
  assertEqual(c.engine.getState().pano.id, 'p2');
});

test('heading follows the bearing actually travelled', async () => {
  const c = setup(straightRoad(5, 10, 90));
  await startRide(c);
  await c.engine.tick(10, 1000);
  assertEqual(c.engine.getState().pano.id, 'p1');
  assertClose(c.engine.getState().heading, 90, 0.01);
});

test('never reverses on a straight road', async () => {
  const c = setup(straightRoad(6, 10, 45));
  await startRide(c, 'p1', 45);
  let t = 0;
  const seen = [];
  for (let i = 0; i < 4; i++) {
    t += 1000;
    await c.engine.tick(10, t);
    seen.push(c.engine.getState().pano.id);
  }
  assertEqual(seen, ['p2', 'p3', 'p4', 'p5']);
});

test('turns around at a dead end', async () => {
  const c = setup(straightRoad(3, 10, 0));
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000); // p2, the end
  assertEqual(c.engine.getState().pano.id, 'p2');
  await c.engine.tick(10, 2000); // must come back to p1
  assertEqual(c.engine.getState().pano.id, 'p1');
  assertClose(c.engine.getState().heading, 180, 0.01);
  await c.engine.tick(10, 3000);
  assertEqual(c.engine.getState().pano.id, 'p0');
});

test('stuck at a pano with no links: distance accrues, nothing moves', async () => {
  const lone = [{ id: 'p0', lat: 0, lng: 0, links: [] }];
  const c = setup(lone);
  await startRide(c);
  await c.engine.tick(5, 1000);
  await c.engine.tick(5, 2000);
  assertEqual(c.engine.getState().pano.id, 'p0');
  assertClose(c.engine.getState().distanceM, 10, 1e-9);
});

function fork() {
  const road = straightRoad(6, 10, 0);
  addBranch(road, 2, 60, 3, 10, 'r');   // right-ish
  addBranch(road, 2, 300, 3, 10, 'l');  // left-ish (-60)
  return road;
}

test('at a fork the default is the straightest', async () => {
  const c = setup(fork());
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000); // p2
  assertEqual(c.engine.getState().pano.id, 'p2');
  await c.engine.tick(10, 2000);
  assertEqual(c.engine.getState().pano.id, 'p3');
});

test('turnOptions are sorted left to right and exclude the back link', async () => {
  const c = setup(fork());
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000);
  const opts = c.engine.getState().turnOptions;
  assertEqual(opts.map((o) => o.id), ['l0', 'p3', 'r0']);
  assert(opts[0].relative < 0 && opts[2].relative > 0, 'left negative, right positive');
  assertClose(opts[0].relative, -60, 0.5);
  assertClose(opts[2].relative, 60, 0.5);
  assert(!opts.some((o) => o.id === 'p1'), 'back link excluded');
});

test('turnOptions drops near-duplicate directions, keeping the straighter', () => {
  const road = straightRoad(4, 10, 0);
  addBranch(road, 1, 10, 2, 10, 'near'); // only 10 deg off the road
  const c = setup(road);
  c.engine.begin(road[1], 0);
  c.engine.begin(road[0], 0); // reset to p0 for a clean look
  const c2 = setup(road);
  c2.engine.begin(road[1], 0);
  assertEqual(c2.engine.getState().turnOptions.map((o) => o.id).sort(), ['p2']);
});

test('single remaining option is returned alone', () => {
  const road = straightRoad(4, 10, 0);
  const c = setup(road);
  c.engine.begin(road[1], 0);
  assertEqual(c.engine.getState().turnOptions.length, 1);
});

test('chooseTurn is honoured once then cleared', async () => {
  const c = setup(fork());
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000); // at p2 with options
  const before = c.states.length;
  c.engine.chooseTurn('r0');
  assertEqual(c.states.length, before + 1);
  assertEqual(c.engine.getState().chosenTurnId, 'r0');
  await c.engine.tick(10, 2000);
  assertEqual(c.engine.getState().pano.id, 'r0');
  assertEqual(c.engine.getState().chosenTurnId, null);
  assertClose(c.engine.getState().heading, 60, 0.5);
  await c.engine.tick(10, 3000);
  assertEqual(c.engine.getState().pano.id, 'r1'); // continues straight on the branch
});

test('chooseTurn ignores unknown ids and the back link', async () => {
  const c = setup(fork());
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000);
  const before = c.states.length;
  c.engine.chooseTurn('nope');
  c.engine.chooseTurn('p1');
  assertEqual(c.states.length, before);
  assertEqual(c.engine.getState().chosenTurnId, null);
});

test('failed target pano falls back to the next best link', async () => {
  const c = setup(fork(), { failIds: ['p3'] });
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000); // p2
  await c.engine.tick(10, 2000); // p3 fails -> next straightest (a +/-60 branch)
  const id = c.engine.getState().pano.id;
  assert(id === 'r0' || id === 'l0', 'fell back to a branch, got ' + id);
});

test('rejected getPano is treated like a failure', async () => {
  const c = setup(fork(), { rejectIds: ['p3'] });
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000);
  await c.engine.tick(10, 2000);
  const id = c.engine.getState().pano.id;
  assert(id === 'r0' || id === 'l0', 'fell back, got ' + id);
});

test('all targets failing: stays put, distance still counts, pending held at 0', async () => {
  const c = setup(straightRoad(4, 10, 0), { failIds: ['p1'] });
  await startRide(c, 'p0', 0);
  await c.engine.tick(10, 1000);
  await c.engine.tick(10, 2000);
  assertEqual(c.engine.getState().pano.id, 'p0');
  assertClose(c.engine.getState().distanceM, 20, 1e-9);
});

test('several panos can be crossed in one tick', async () => {
  const c = setup(straightRoad(10, 10, 0));
  await startRide(c);
  await c.engine.tick(20, 2500); // 50 m -> 5 panos
  assertEqual(c.engine.getState().pano.id, 'p5');
  const moves = c.states.filter((s) => s.moved);
  assertEqual(moves.map((s) => s.pano.id), ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('at most 5 moves per tick; leftover pending is discarded', async () => {
  const c = setup(straightRoad(20, 10, 0));
  await startRide(c);
  await c.engine.tick(20, 2900); // 58 m
  assertEqual(c.engine.getState().pano.id, 'p5');
  await c.engine.tick(0, 3000); // nothing carried over
  assertEqual(c.engine.getState().pano.id, 'p5');
  assertClose(c.engine.getState().distanceM, 58, 1e-9);
});

test('pending carries over between ticks', async () => {
  const c = setup(straightRoad(5, 10, 0));
  await startRide(c);
  await c.engine.tick(6, 1000);
  await c.engine.tick(6, 2000); // 12 m total: one move, 2 m pending
  assertEqual(c.engine.getState().pano.id, 'p1');
  await c.engine.tick(8, 3000); // 20 m total
  assertEqual(c.engine.getState().pano.id, 'p2');
});

test('pause ignores ticks; resume does not count the paused gap', async () => {
  const c = setup(straightRoad(10, 100, 0));
  await startRide(c);
  await c.engine.tick(5, 1000);
  c.engine.pause();
  const n = c.states.length;
  await c.engine.tick(5, 2000);
  await c.engine.tick(5, 2500);
  assertEqual(c.states.length, n);
  assertClose(c.engine.getState().distanceM, 5, 1e-9);
  c.engine.resume();
  await c.engine.tick(5, 3000); // first after resume: no distance
  assertClose(c.engine.getState().distanceM, 5, 1e-9);
  await c.engine.tick(5, 4000);
  assertClose(c.engine.getState().distanceM, 10, 1e-9);
  assertEqual(c.engine.getState().elapsedMs, 2000);
});

test('emits at most one non-move state per tick and unsubscribe works', async () => {
  const c = setup(straightRoad(10, 100, 0));
  c.engine.begin(c.byId('p0'));
  const base = c.states.length;
  await c.engine.tick(5, 0);
  await c.engine.tick(5, 1000);
  assertEqual(c.states.length - base, 2);
  const extra = [];
  const off = c.engine.onState((s) => extra.push(s));
  await c.engine.tick(5, 2000);
  off();
  await c.engine.tick(5, 3000);
  assertEqual(extra.length, 1);
});

test('overlapping ticks add distance but start one move loop', async () => {
  const c = setup(straightRoad(10, 10, 0));
  await startRide(c);
  const a = c.engine.tick(10, 1000);
  const b = c.engine.tick(10, 2000); // issued before a settles
  await Promise.all([a, b]);
  assertClose(c.engine.getState().distanceM, 20, 1e-9);
  await c.engine.tick(0, 2100);
  assertEqual(c.engine.getState().pano.id, 'p2');
});

test('begin resets everything', async () => {
  const c = setup(straightRoad(10, 10, 0));
  await startRide(c);
  await c.engine.tick(10, 1000);
  c.engine.begin(c.byId('p0'), 0);
  const s = c.engine.getState();
  assertEqual([s.pano.id, s.distanceM, s.elapsedMs, s.speedMps], ['p0', 0, 0, 0]);
  await c.engine.tick(10, 5000); // first tick after begin: no distance
  assertEqual(c.engine.getState().distanceM, 0);
});

// ---- travel multiplier and step info ----

async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('multiplier: default 1 without config, config default honoured, clamped', () => {
  const road = straightRoad(5, 10, 0);
  const c = setup(road);
  c.engine.begin(road[0]);
  assertEqual(c.engine.getState().multiplier, 1);
  const d = setup(road, {}, { DEFAULT_TRAVEL_MULTIPLIER: 3 });
  d.engine.begin(road[0]);
  assertEqual(d.engine.getState().multiplier, 3);
  c.engine.setMultiplier(0);
  assertEqual(c.engine.getState().multiplier, 0.1);
  c.engine.setMultiplier(NaN);
  assertEqual(c.engine.getState().multiplier, 1);
  c.engine.setMultiplier(4);
  assertEqual(c.engine.getState().multiplier, 4);
});

test('multiplier scales travelM and movement but not distanceM or elapsedMs', async () => {
  const c = setup(straightRoad(10, 10, 0));
  c.engine.setMultiplier(3);
  await startRide(c);
  await c.engine.tick(5, 2000); // 10 m real, 30 m travelled -> 3 panos
  const s = c.engine.getState();
  assertClose(s.distanceM, 10, 1e-9);
  assertClose(s.travelM, 30, 1e-9);
  assertEqual(s.elapsedMs, 2000);
  assertEqual(s.speedMps, 5);
  assertEqual(s.pano.id, 'p3');
  assertEqual(s.multiplier, 3);
});

test('changing the multiplier mid-ride does not rescale the past; begin keeps it', async () => {
  const c = setup(straightRoad(30, 10, 0));
  await startRide(c);
  await c.engine.tick(5, 2000); // 10 m at x1
  c.engine.setMultiplier(2);
  await c.engine.tick(5, 4000); // 10 m real, 20 m travel
  const s = c.engine.getState();
  assertClose(s.distanceM, 20, 1e-9);
  assertClose(s.travelM, 30, 1e-9);
  assertEqual(s.pano.id, 'p3');
  c.engine.begin(c.byId('p0'), 0);
  assertEqual(c.engine.getState().multiplier, 2);
  assertEqual(c.engine.getState().travelM, 0);
});

test('nextPanoId/nextHeading: at begin, after a move, at a dead end', async () => {
  const road = straightRoad(3, 10, 90);
  const c = setup(road);
  c.engine.begin(road[0], 90);
  assertEqual(c.engine.getState().nextPanoId, 'p1');
  assertEqual(c.engine.getState().nextHeading, 90);
  await c.engine.tick(0, 0);
  await c.engine.tick(10, 1000);
  assertEqual(c.engine.getState().pano.id, 'p1');
  assertEqual(c.engine.getState().nextPanoId, 'p2');
  await c.engine.tick(10, 2000);
  // p2 is a dead end: the only way is back
  assertEqual(c.engine.getState().pano.id, 'p2');
  assertEqual(c.engine.getState().nextPanoId, 'p1');
  const lone = { id: 'x', lat: 0, lng: 0, links: [] };
  const d = setup([lone]);
  d.engine.begin(lone);
  assertEqual(d.engine.getState().nextPanoId, null);
  assertEqual(d.engine.getState().nextHeading, null);
  assertEqual(d.engine.getState().stepLengthM, null);
});

test('nextPanoId follows chooseTurn and a failed link re-pick', async () => {
  const c = setup(fork());
  await startRide(c, 'p1', 0);
  await c.engine.tick(10, 1000); // p2, fork ahead
  const opts = c.engine.getState().turnOptions;
  const other = opts.find((o) => o.id !== c.engine.getState().nextPanoId);
  assert(!!other, 'fork has an alternative');
  c.engine.chooseTurn(other.id);
  assertEqual(c.engine.getState().nextPanoId, other.id);
  const f = setup(fork(), { failIds: ['p3'] });
  await startRide(f, 'p1', 0);
  await f.engine.tick(10, 1000);
  assertEqual(f.engine.getState().nextPanoId, 'p3');
  await f.engine.tick(10, 2000); // p3 fails -> re-pick
  const id = f.engine.getState().nextPanoId;
  assert(id !== 'p3', 'no longer targets the failed pano');
});

test('stepLengthM and stepProgress', async () => {
  const c = setup(straightRoad(10, 20, 0));
  c.engine.begin(c.byId('p0'), 0);
  assertEqual(c.engine.getState().stepLengthM, null);
  assertEqual(c.engine.getState().stepProgress, 0);
  const seen = c.states.length;
  await settle();
  assert(c.states.length > seen, 'a state is emitted when the prefetch resolves');
  assertClose(c.engine.getState().stepLengthM, 20, 0.1);
  await c.engine.tick(0, 0);
  await c.engine.tick(5, 1000); // 5 m of a 20 m step
  assertClose(c.engine.getState().stepProgress, 0.25, 0.01);
  await settle();
  await c.engine.tick(5, 2000);
  assertClose(c.engine.getState().stepProgress, 0.5, 0.01);
  const m = setup(straightRoad(10, 20, 0));
  m.engine.setMultiplier(2);
  m.engine.begin(m.byId('p0'), 0);
  await settle();
  await m.engine.tick(0, 0);
  await m.engine.tick(5, 1000); // 10 m travelled
  assertClose(m.engine.getState().stepProgress, 0.5, 0.01);
});

test('high multiplier crosses several panos in one tick, bounded per tick', async () => {
  const c = setup(straightRoad(40, 10, 0));
  c.engine.setMultiplier(5);
  await startRide(c);
  await c.engine.tick(10, 2000); // 20 m real -> 100 m travelled -> 10 panos, capped at 8
  assertEqual(c.engine.getState().pano.id, 'p8');
  assertClose(c.engine.getState().travelM, 100, 1e-9);
  assertClose(c.engine.getState().distanceM, 20, 1e-9);
  assertEqual(c.states.filter((s) => s.moved).length, 8);
  c.engine.setMultiplier(2);
  await c.engine.tick(0, 2100);
  assertEqual(c.engine.getState().pano.id, 'p8');
});

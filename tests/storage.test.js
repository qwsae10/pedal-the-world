import { test, assert, assertEqual } from './harness.js';
import { createStats, STATS_KEY } from '../src/core/storage.js';

function memStore(initial) {
  const m = new Map(initial ? [[STATS_KEY, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m };
}

test('stats: defaults on missing data', () => {
  assertEqual(createStats(memStore()).get(),
    { highScore: 0, totalDistanceM: 0, ridesCompleted: 0, countriesVisited: [] });
});

test('stats: corrupt JSON and wrong shapes fall back safely', () => {
  assertEqual(createStats(memStore('{not json')).get().highScore, 0);
  assertEqual(createStats(memStore('null')).get().ridesCompleted, 0);
  const s = createStats(memStore('{"highScore":"x","totalDistanceM":-5,"countriesVisited":[1,"FR","FR"]}')).get();
  assertEqual(s, { highScore: 0, totalDistanceM: 0, ridesCompleted: 0, countriesVisited: ['FR'] });
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const st = createStats(throwing);
  assertEqual(st.get().highScore, 0);
  assertEqual(st.recordGuessGame({ score: 5, distanceM: 1, countryCodes: [] }).stats.highScore, 5);
});

test('stats: recordGuessGame tracks high score and visits', () => {
  const store = memStore();
  const st = createStats(store);
  let r = st.recordGuessGame({ score: 300, distanceM: 5000, countryCodes: ['FR', 'JP'] });
  assert(r.isNewHighScore);
  r = st.recordGuessGame({ score: 200, distanceM: 5000, countryCodes: ['JP', 'BR'] });
  assert(!r.isNewHighScore);
  r = st.recordGuessGame({ score: 300, distanceM: 1000, countryCodes: [] });
  assert(!r.isNewHighScore, 'equal score is not a new high');
  const s = st.get();
  assertEqual(s.highScore, 300);
  assertEqual(s.totalDistanceM, 11000);
  assertEqual(s.ridesCompleted, 3);
  assertEqual(s.countriesVisited, ['FR', 'JP', 'BR']);
  assert(store.m.has('bikeapp.stats.v1'));
});

test('stats: recordExplorerRide and reset', () => {
  const st = createStats(memStore());
  st.recordGuessGame({ score: 100, distanceM: 1000, countryCodes: ['US'] });
  const s = st.recordExplorerRide({ distanceM: 2500, countryCodes: ['US', 'CA'] });
  assertEqual(s.totalDistanceM, 3500);
  assertEqual(s.ridesCompleted, 2);
  assertEqual(s.highScore, 100);
  assertEqual(s.countriesVisited, ['US', 'CA']);
  st.reset();
  assertEqual(st.get().ridesCompleted, 0);
});

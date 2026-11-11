import { test, assert, assertEqual } from './harness.js';
import data from '../src/data/countries.js';
import { createCountryIndex, mulberry32 } from '../src/core/countries.js';
import { createDropper } from '../src/core/dropper.js';
import { createGuessGame, simpleScoreRule } from '../src/core/guessGame.js';

const countries = createCountryIndex(data);
const config = {
  GUESS_ROUND_COUNT: 5, GUESS_ROUND_DISTANCE_M: 1000, GUESS_OPTION_COUNT: 4,
  DROP_SEARCH_RADIUS_M: 50000, DROP_MAX_ATTEMPTS: 12,
};
const provider = {
  async getPano() { return null; },
  async findNear(p) { return { id: 'x', lat: p.lat, lng: p.lng, links: [{ id: 'y', heading: 0 }] }; },
};

function make(seed = 1, scoreRule) {
  const rng = mulberry32(seed);
  const dropper = createDropper({ provider, countries, rng, config });
  return createGuessGame({ dropper, countries, rng, config, scoreRule });
}

async function playRound(g, pickCorrect) {
  const drop = await g.startRound();
  assertEqual(g.getState().phase, 'riding');
  assertEqual(g.getState().answer, null);
  g.addDistance(1000);
  const st = g.getState();
  assertEqual(st.phase, 'guessing');
  assertEqual(st.answer, null);
  assertEqual(st.options.length, 4);
  assert(st.options.some((o) => o.code === drop.country.code));
  const pick = pickCorrect ? drop.country.code : st.options.find((o) => o.code !== drop.country.code).code;
  assert(g.submitGuess(pick));
  return drop;
}

test('game: full 5-round game with scoring, streak and no repeats', async () => {
  const g = make(1);
  const seen = [];
  const correctPattern = [true, true, false, true, true];
  const streaks = [];
  for (let i = 0; i < 5; i++) {
    const drop = await playRound(g, correctPattern[i]);
    seen.push(drop.country.code);
    const st = g.getState();
    assertEqual(st.phase, 'reveal');
    assertEqual(st.answer.code, drop.country.code);
    assertEqual(st.roundIndex, i);
    streaks.push(st.streak);
    assert(g.next());
  }
  assertEqual(streaks, [1, 2, 0, 1, 2]);
  const st = g.getState();
  assertEqual(st.phase, 'finished');
  assertEqual(st.score, 400);
  assertEqual(st.results.length, 5);
  assertEqual(st.results.map((r) => r.correct), correctPattern);
  assertEqual(new Set(seen).size, 5, 'no repeated countries');
});

test('game: answer hidden while riding/guessing, exposed in reveal', async () => {
  const g = make(2);
  const states = [];
  g.onState((s) => states.push(s));
  const drop = await g.startRound();
  g.addDistance(400);
  g.guessNow();
  g.submitGuess(drop.country.code);
  for (const s of states) {
    if (s.phase === 'riding' || s.phase === 'guessing') assertEqual(s.answer, null);
  }
  assertEqual(states[states.length - 1].phase, 'reveal');
  assertEqual(states[states.length - 1].answer.code, drop.country.code);
});

test('game: guessNow moves to guessing early; progress clamps', async () => {
  const g = make(3);
  await g.startRound();
  g.addDistance(250);
  assertEqual(g.getState().roundProgressM, 250);
  assert(g.guessNow());
  assertEqual(g.getState().phase, 'guessing');
  assertEqual(g.getState().options.length, 4);
  assert(!g.guessNow());
  assert(!g.addDistance(900));
});

test('game: invalid transitions are ignored', async () => {
  const g = make(4);
  assert(!g.submitGuess('FR'), 'submit before start');
  assert(!g.next(), 'next before start');
  assert(!g.guessNow(), 'guessNow before start');
  assert(!g.addDistance(10), 'addDistance before start');
  const drop = await g.startRound();
  assert(!g.submitGuess(drop.country.code), 'submit while riding');
  assert(!g.next(), 'next while riding');
  let threw = false;
  try { await g.startRound(); } catch (e) { threw = true; }
  assert(threw, 'startRound twice');
  g.addDistance(1000);
  assert(!g.submitGuess('ZZ'), 'guess not in options');
  assert(!g.next(), 'next while guessing');
  assert(g.submitGuess(g.getState().options[0].code));
  assert(!g.submitGuess(g.getState().options[0].code), 'double submit');
  assert(!g.addDistance(5), 'distance during reveal');
});

test('game: custom scoreRule is used, with streak', async () => {
  const g = make(5, ({ correct, streak }) => (correct ? 10 * streak : 0));
  await playRound(g, true); g.next();
  await playRound(g, true); g.next();
  assertEqual(g.getState().score, 10 + 20);
  assertEqual(simpleScoreRule({ correct: true }), 100);
  assertEqual(simpleScoreRule({ correct: false }), 0);
});

test('game: listeners can unsubscribe; getState is a copy', async () => {
  const g = make(6);
  let n = 0;
  const off = g.onState(() => n++);
  await g.startRound();
  off();
  g.addDistance(100);
  assertEqual(n, 1);
  const s = g.getState();
  s.score = 999; s.options.push({});
  assertEqual(g.getState().score, 0);
});

// Guess the World state machine. Pure logic; the UI drives the ride engine.
import * as defaultConfig from '../config.js';

/** @typedef {import('../contracts.js').GuessGameState} GuessGameState */

/** Default scoring: flat points for a correct answer. `streak` is the streak including this guess. */
export function simpleScoreRule({ correct }) {
  return correct ? defaultConfig.POINTS_PER_CORRECT : 0;
}

/**
 * @param {Object} deps
 * @param {{drop: (o: {excludeCodes?: string[]}) => Promise<import('../contracts.js').Drop>}} deps.dropper
 * @param {ReturnType<import('./countries.js').createCountryIndex>} deps.countries
 * @param {() => number} deps.rng
 * @param {Object} [deps.config] GUESS_ROUND_COUNT, GUESS_ROUND_DISTANCE_M, GUESS_OPTION_COUNT
 * @param {import('../contracts.js').ScoreRule} [deps.scoreRule]
 */
export function createGuessGame({ dropper, countries, rng, config = defaultConfig, scoreRule = simpleScoreRule }) {
  const roundCount = config.GUESS_ROUND_COUNT ?? defaultConfig.GUESS_ROUND_COUNT;
  const roundDistanceM = config.GUESS_ROUND_DISTANCE_M ?? defaultConfig.GUESS_ROUND_DISTANCE_M;
  const optionCount = config.GUESS_OPTION_COUNT ?? defaultConfig.GUESS_OPTION_COUNT;

  const listeners = new Set();
  const used = [];
  let drop = null;        // current round's drop, never exposed through state until reveal
  let starting = false;
  let s = {
    phase: 'riding', roundIndex: 0, roundCount, roundDistanceM, roundProgressM: 0,
    options: [], answer: null, guess: null, score: 0, streak: 0, results: [],
  };

  const snapshot = () => ({ ...s, options: s.options.slice(), results: s.results.slice() });
  const emit = () => { const st = snapshot(); for (const l of [...listeners]) l(st); };
  const beginGuessing = () => {
    s.phase = 'guessing';
    s.options = countries.pickOptions(drop.country, optionCount, rng);
  };

  return {
    getState: snapshot,

    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** @returns {Promise<import('../contracts.js').Drop>} */
    async startRound() {
      if (s.phase !== 'riding' || drop || starting) throw new Error('Cannot start a round now');
      starting = true;
      try {
        const d = await dropper.drop({ excludeCodes: used });
        drop = d;
        used.push(d.country.code);
        s.roundProgressM = 0;
        emit();
        return d;
      } finally {
        starting = false;
      }
    },

    addDistance(totalRoundMetres) {
      if (s.phase !== 'riding' || !drop) return false;
      const v = Math.min(Math.max(totalRoundMetres, 0), roundDistanceM);
      if (v === s.roundProgressM) return false;
      s.roundProgressM = v;
      if (v >= roundDistanceM) beginGuessing();
      emit();
      return true;
    },

    guessNow() {
      if (s.phase !== 'riding' || !drop) return false;
      beginGuessing();
      emit();
      return true;
    },

    submitGuess(code) {
      if (s.phase !== 'guessing') return false;
      const guess = s.options.find((o) => o.code === code);
      if (!guess) return false;
      const answer = drop.country;
      const correct = guess.code === answer.code;
      const streak = correct ? s.streak + 1 : 0;
      const points = scoreRule({ correct, streak, answer, guess });
      s.streak = streak;
      s.score += points;
      s.guess = guess;
      s.answer = answer;
      s.results.push({ answer, guess, correct, points });
      s.phase = 'reveal';
      emit();
      return true;
    },

    next() {
      if (s.phase !== 'reveal') return false;
      if (s.roundIndex + 1 >= roundCount) {
        s.phase = 'finished';
      } else {
        s.roundIndex++;
        s.phase = 'riding';
        s.roundProgressM = 0;
        s.options = [];
        s.answer = null;
        s.guess = null;
        drop = null;
      }
      emit();
      return true;
    },
  };
}

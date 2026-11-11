// Full-screen layer for the guessing, reveal and results phases of Guess the World.
import { el, button, clear } from './dom.js';
import { formatDistance, distanceUnitLabel } from './format.js';

/**
 * @param {Object} o
 * @param {string} o.units
 * @param {number} o.maxScore
 * @param {(code: string) => void} o.onPick
 * @param {() => void} o.onNext
 * @param {() => void} o.onHome
 * @param {() => void} o.onPlayAgain
 */
export function createGuessOverlay({ units, maxScore, onPick, onNext, onHome, onPlayAgain }) {
  const panel = el('div', { class: 'panel guess-panel' });
  const root = el('div', { class: 'overlay overlay-dim', hidden: true }, panel);

  function optionGrid(state, revealed) {
    const grid = el('div', { class: 'options', role: 'group', 'aria-label': 'Answers' });
    for (const c of state.options) {
      let mark = '';
      let cls = 'option';
      let suffix = '';
      if (revealed) {
        if (c.code === state.answer.code) { cls += ' is-correct'; mark = '✓ '; suffix = ' (correct)'; }
        else if (state.guess && c.code === state.guess.code) { cls += ' is-wrong'; mark = '✗ '; suffix = ' (your answer, not correct)'; }
        else cls += ' is-other';
      }
      const b = el('button', {
        type: 'button', class: `btn ${cls}`, disabled: revealed,
        'aria-label': revealed ? `${c.name}${suffix}` : c.name,
        onclick: revealed ? null : () => onPick(c.code),
      }, mark + c.name);
      grid.append(b);
    }
    return grid;
  }

  return {
    root,
    hide() { root.hidden = true; },

    showGuessing(state) {
      clear(panel);
      panel.append(
        el('h2', { class: 'guess-title' }, 'Which country is this?'),
        optionGrid(state, false),
      );
      root.hidden = false;
    },

    showReveal(state) {
      const correct = !!(state.guess && state.guess.code === state.answer.code);
      const last = state.roundIndex + 1 >= state.roundCount;
      const next = button(last ? 'See results' : 'Next ride', onNext, { cls: 'primary' });
      clear(panel);
      panel.append(
        el('h2', { class: `guess-title ${correct ? 'is-correct' : 'is-wrong'}`, role: 'status' },
          correct ? '✓ Correct!' : '✗ Not this time'),
        el('p', { class: 'reveal-line' }, `It was ${state.answer.name}`),
        optionGrid(state, true),
        el('div', { class: 'reveal-foot' }, el('span', { class: 'score-line' }, `Score ${state.score}`), next),
      );
      root.hidden = false;
      next.focus({ preventScroll: true });
    },

    /** @param {{state: object, isNewHighScore: boolean, distanceM: number}} r */
    showResults({ state, isNewHighScore, distanceM }) {
      const rows = state.results.map((r, i) => el('li', { class: `result-row ${r.correct ? 'is-correct' : 'is-wrong'}` },
        el('span', { class: 'result-mark', 'aria-hidden': 'true' }, r.correct ? '✓' : '✗'),
        el('span', { class: 'result-name' }, `Ride ${i + 1}: ${r.answer.name}`),
        el('span', { class: 'result-note' }, r.correct ? 'Right' : `Wrong${r.guess ? ` (you said ${r.guess.name})` : ''}`),
      ));
      const again = button('Play again', onPlayAgain, { cls: 'primary' });
      clear(panel);
      panel.append(
        el('h2', { class: 'guess-title' }, 'Your results'),
        isNewHighScore && el('p', { class: 'badge', role: 'status' }, '★ New high score!'),
        el('p', { class: 'big-score' }, el('span', { class: 'num' }, String(state.score)), ` out of ${maxScore}`),
        el('ul', { class: 'result-list' }, rows),
        el('p', { class: 'muted-line' }, `You rode ${formatDistance(distanceM, units)} ${distanceUnitLabel(units)}`),
        el('div', { class: 'btn-row' }, again, button('Home', onHome)),
      );
      root.hidden = false;
      again.focus({ preventScroll: true });
    },
  };
}

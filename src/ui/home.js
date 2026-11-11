// Home screen: two big buttons and her stats.
import { el } from './dom.js';
import { formatDistance, distanceUnitLabel } from './format.js';

export function createHomeScreen(ctx, nav) {
  const { stats, config } = ctx;
  const s = stats.get();
  const stat = (label, value, unit) => el('div', { class: 'stat' },
    el('span', { class: 'stat-value' }, value, unit && el('span', { class: 'stat-unit' }, ` ${unit}`)),
    el('span', { class: 'stat-label' }, label));

  const mode = (title, text, onclick, cls) => el('button', { type: 'button', class: `btn mode-btn ${cls}`, onclick },
    el('span', { class: 'mode-title' }, title), el('span', { class: 'mode-text' }, text));

  const explore = mode('Explore', 'Ride anywhere in the world, as long as you like', nav.explore, 'primary');
  const root = el('div', { class: 'screen home' },
    el('div', { class: 'home-inner' },
      el('h1', { class: 'app-name' }, config.APP_NAME),
      el('div', { class: 'modes' },
        explore,
        mode('Guess the World', `${config.GUESS_ROUND_COUNT} rides of ${Number(formatDistance(config.GUESS_ROUND_DISTANCE_M, config.UNITS))} ${distanceUnitLabel(config.UNITS)}: guess the country`, nav.guess, '')),
      el('div', { class: 'panel stats', role: 'group', 'aria-label': 'Your stats' },
        stat('High score', String(s.highScore)),
        stat('Total distance', formatDistance(s.totalDistanceM, config.UNITS), distanceUnitLabel(config.UNITS)),
        stat('Countries visited', String(s.countriesVisited.length)))));
  return { el: root, destroy() {}, focus() { explore.focus({ preventScroll: true }); } };
}

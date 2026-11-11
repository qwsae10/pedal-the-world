// Speed, distance and time, always visible during a ride.
import { el } from './dom.js';
import { formatSpeed, formatDistance, formatDuration, speedUnitLabel, distanceUnitLabel } from './format.js';

export function createHud(units) {
  const tile = (label, unit) => {
    const value = el('span', { class: 'hud-value' }, '0');
    const unitEl = el('span', { class: 'hud-unit' }, unit);
    return { root: el('div', { class: 'hud-tile' }, el('span', { class: 'hud-label' }, label), el('div', { class: 'hud-row' }, value, unitEl)), value };
  };
  const speed = tile('Speed', speedUnitLabel(units));
  const distance = tile('Distance', distanceUnitLabel(units));
  const time = tile('Time', '');
  time.value.textContent = '0:00';
  const root = el('div', { class: 'panel hud', role: 'group', 'aria-label': 'Ride numbers' }, speed.root, distance.root, time.root);

  return {
    root,
    /** Speed in m/s, distance in metres, time in ms (session totals). */
    update({ speedMps, distanceM, elapsedMs }) {
      speed.value.textContent = formatSpeed(speedMps, units);
      distance.value.textContent = formatDistance(distanceM, units);
      time.value.textContent = formatDuration(elapsedMs);
    },
  };
}

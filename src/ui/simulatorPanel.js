// "Test pedals": stands in for a bike sensor. Only mounted when the speed source is simulated.
import { SIM_MAX_SPEED_MPS, SIM_DEFAULT_SPEED_MPS } from '../config.js';
import { el } from './dom.js';
import { speedFromMps, mpsFromSpeed, formatSpeed, speedUnitLabel } from './format.js';

export function createSimulatorPanel(source, units) {
  const maxDisplay = Math.ceil(speedFromMps(SIM_MAX_SPEED_MPS, units));
  let lastSpeedMps = SIM_DEFAULT_SPEED_MPS;

  const readout = el('span', { class: 'sim-readout' });
  const slider = el('input', {
    type: 'range', min: 0, max: maxDisplay, step: 1, value: 0, class: 'sim-slider',
    'aria-label': `Test speed in ${speedUnitLabel(units)}`,
  });

  function setSpeedMps(mps) {
    const clamped = Math.min(SIM_MAX_SPEED_MPS, Math.max(0, mps));
    if (clamped > 0) lastSpeedMps = clamped;
    source.setTargetSpeed(clamped);
    refresh();
  }
  function stepDisplay(delta) {
    const current = Math.round(speedFromMps(source.getTargetSpeed(), units));
    setSpeedMps(mpsFromSpeed(Math.min(maxDisplay, Math.max(0, current + delta)), units));
  }
  function refresh() {
    const t = source.getTargetSpeed();
    readout.textContent = `${formatSpeed(t, units)} ${speedUnitLabel(units)}`;
    slider.value = String(Math.round(speedFromMps(t, units)));
  }

  slider.addEventListener('input', () => setSpeedMps(mpsFromSpeed(Number(slider.value), units)));

  const minus = el('button', { type: 'button', class: 'btn sim-btn', 'aria-label': 'Slower', onclick: () => stepDisplay(-1) }, '−');
  const plus = el('button', { type: 'button', class: 'btn sim-btn', 'aria-label': 'Faster', onclick: () => stepDisplay(1) }, '+');
  const stop = el('button', { type: 'button', class: 'btn sim-stop', onclick: () => setSpeedMps(0) }, 'Stop');

  const root = el('div', { class: 'panel sim', role: 'group', 'aria-label': 'Test pedals' },
    el('div', { class: 'sim-head' }, el('span', { class: 'sim-title' }, 'Test pedals'), readout),
    el('div', { class: 'sim-controls' }, minus, slider, plus),
    stop);

  // Capture phase so the panorama and focused buttons never act on these keys.
  const onKeyDown = (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); stepDisplay(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); stepDisplay(-1); }
    else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) setSpeedMps(source.getTargetSpeed() > 0 ? 0 : lastSpeedMps);
    }
  };
  // Stops a focused button from being "clicked" by the space key release.
  const onKeyUp = (e) => { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  refresh();

  return {
    root,
    destroy() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    },
  };
}

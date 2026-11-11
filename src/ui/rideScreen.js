// The ride view shared by Explore and Guess the World.
import { createRideEngine } from '../core/rideEngine.js';
import { createDropper } from '../core/dropper.js';
import { createGuessGame } from '../core/guessGame.js';
import { el, button, clear } from './dom.js';
import { createStreetView } from './streetView.js';
import { createHud } from './hud.js';
import { createSpeedSource } from './speed.js';
import { createSimulatorPanel } from './simulatorPanel.js';
import { createGuessOverlay } from './guessOverlay.js';
import { createWakeLock } from './wakeLock.js';
import { formatDistance, formatDuration, distanceUnitLabel } from './format.js';

const COUNTRY_RECHECK_MOVES = 25;
const IDLE_HINT_MS = 3000;

const ARROW_SVG = '<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" focusable="false"><path d="M12 3 L20 13 H14.5 V21 H9.5 V13 H4 Z" fill="currentColor"/></svg>';

function turnLabel(rel) {
  const a = Math.abs(rel);
  if (a < 25) return 'Straight on';
  const side = rel < 0 ? 'left' : 'right';
  return a < 60 ? `Bear ${side}` : `Turn ${side}`;
}

/** A full-screen layer that can be shown with content and hidden again. */
function layer(extraClass = '') {
  const panel = el('div', { class: 'panel overlay-panel' });
  const root = el('div', { class: `overlay ${extraClass}`.trim(), hidden: true }, panel);
  return {
    root,
    show(...children) { clear(panel); panel.append(...children); root.hidden = false; },
    hide() { root.hidden = true; },
    get visible() { return !root.hidden; },
  };
}

/**
 * @param {Object} ctx  {maps, provider, countries, stats, config}
 * @param {'explore'|'guess'} mode
 * @param {{home: () => void, explore: () => void, guess: () => void}} nav
 */
export function createRideScreen(ctx, mode, nav) {
  const { maps, provider, countries, stats, config } = ctx;
  const units = config.UNITS;
  const isGuess = mode === 'guess';

  const engine = createRideEngine({ provider });
  const dropper = createDropper({ provider, countries, rng: Math.random, config });
  const game = isGuess ? createGuessGame({ dropper, countries, rng: Math.random, config }) : null;
  const speed = createSpeedSource();
  const wake = createWakeLock();

  // ---- DOM ----
  const panoEl = el('div', { class: 'pano' });
  const hud = createHud(units);
  const streetView = createStreetView(maps, panoEl);

  const pauseBtn = button('⏸ Pause', () => pause(), { cls: 'pause-btn', aria: 'Pause ride' });
  const infoPanel = el('div', { class: 'panel info' });
  const turnsEl = el('div', { class: 'turns', role: 'group', 'aria-label': 'Choose a way to go' });
  const hintEl = el('div', { class: 'panel hint', hidden: true, role: 'status' }, 'Start pedalling');
  const actionBtn = isGuess
    ? button('I know it!', () => { if (canAct()) game.guessNow(); }, { cls: 'action-btn primary' })
    : button('New place', () => dropExplorer(), { cls: 'action-btn' });
  const simPanel = speed.isSimulated ? createSimulatorPanel(speed.source, units) : null;

  const busyLayer = layer('overlay-soft');
  const pauseLayer = layer('overlay-dim');
  const summaryLayer = layer('overlay-dim');
  const guessOverlay = isGuess
    ? createGuessOverlay({
      units,
      maxScore: config.GUESS_ROUND_COUNT * config.POINTS_PER_CORRECT,
      onPick: (code) => game.submitGuess(code),
      onNext: () => game.next(),
      onHome: () => nav.home(),
      onPlayAgain: () => nav.guess(),
    })
    : null;

  const root = el('div', { class: `screen ride ride-${mode}` },
    panoEl,
    el('div', { class: 'ride-ui' },
      el('div', { class: 'topleft' }, hud.root, infoPanel), pauseBtn, turnsEl, hintEl, actionBtn, simPanel && simPanel.root),
    guessOverlay && guessOverlay.root,
    pauseLayer.root, summaryLayer.root, busyLayer.root);

  // ---- state ----
  let destroyed = false;
  let phase = 'loading';       // loading | riding | guessing | reveal | finished | ended
  let busy = false;
  let paused = false;
  let lastState = null;
  let snapNext = true;
  let roundBase = 0;
  let banked = { m: 0, ms: 0 };
  let moves = 0;
  let currentCountry = null;
  const visited = new Set();
  let zeroSince = null;
  let turnsKey = '';
  let lastGamePhase = 'riding';
  let recorded = false;
  let startedSpeed = false;

  const totals = () => ({
    m: banked.m + (lastState ? lastState.distanceM : 0),
    ms: banked.ms + (lastState ? lastState.elapsedMs : 0),
  });
  const canAct = () => phase === 'riding' && !busy && !paused;

  // ---- hint ----
  function updateHint(now = performance.now()) {
    const idle = zeroSince !== null && now - zeroSince > IDLE_HINT_MS;
    hintEl.hidden = !(idle && canAct());
  }

  // ---- turn arrows ----
  function updateTurns(state) {
    const opts = state.turnOptions.length > 1 ? state.turnOptions : [];
    const key = opts.map((o) => o.id).join('|');
    if (key !== turnsKey) {
      turnsKey = key;
      clear(turnsEl);
      for (const o of opts) {
        const arrow = el('span', { class: 'turn-arrow' });
        arrow.innerHTML = ARROW_SVG;
        turnsEl.append(el('button', {
          type: 'button', class: 'btn turn', 'data-id': o.id,
          onclick: () => engine.chooseTurn(o.id),
        }, arrow, el('span', { class: 'turn-label' })));
      }
    }
    for (const b of turnsEl.children) {
      const o = opts.find((x) => x.id === b.dataset.id);
      if (!o) continue;
      const chosen = state.chosenTurnId === o.id;
      const label = turnLabel(o.relative);
      b.classList.toggle('is-chosen', chosen);
      b.setAttribute('aria-pressed', String(chosen));
      b.setAttribute('aria-label', label);
      b.firstChild.style.transform = `rotate(${Math.round(o.relative)}deg)`;
      b.lastChild.textContent = (chosen ? '✓ ' : '') + label;
    }
  }

  // ---- mode extras ----
  let countryLabel = null;
  let roundLabel = null, scoreLabel = null, barFill = null, barText = null, bar = null;
  if (isGuess) {
    roundLabel = el('span', { class: 'info-round' });
    scoreLabel = el('span', { class: 'info-score' });
    barFill = el('div', { class: 'bar-fill' });
    bar = el('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progress to the next guess', 'aria-valuemin': 0, 'aria-valuemax': 100 }, barFill);
    barText = el('span', { class: 'bar-text' });
    infoPanel.append(el('div', { class: 'info-row' }, roundLabel, scoreLabel), bar, barText);
  } else {
    countryLabel = el('span', { class: 'info-country' }, '');
    infoPanel.append(countryLabel);
    infoPanel.hidden = true;
  }

  function updateGuessInfo(st) {
    roundLabel.textContent = `Round ${Math.min(st.roundIndex + 1, st.roundCount)} of ${st.roundCount}`;
    scoreLabel.textContent = `Score ${st.score}`;
    const frac = st.roundDistanceM > 0 ? Math.min(1, st.roundProgressM / st.roundDistanceM) : 0;
    barFill.style.width = `${(frac * 100).toFixed(1)}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    const left = Math.max(0, st.roundDistanceM - st.roundProgressM);
    barText.textContent = `${formatDistance(left, units)} ${distanceUnitLabel(units)} to go`;
  }

  function updateCountry(pano) {
    const c = countries.countryAt(pano);
    if (!c) return;
    currentCountry = c;
    visited.add(c.code);
    countryLabel.textContent = c.name;
    infoPanel.hidden = false;
  }

  // ---- engine ----
  const offEngine = engine.onState((state) => {
    lastState = state;
    const snap = snapNext;
    snapNext = false;
    streetView.show(state, { snap });
    const t = totals();
    hud.update({ speedMps: state.speedMps, distanceM: t.m, elapsedMs: t.ms });
    updateTurns(state);
    if (!isGuess) {
      if (snap) { moves = 0; updateCountry(state.pano); }
      else if (state.moved && ++moves % COUNTRY_RECHECK_MOVES === 0) updateCountry(state.pano);
    } else if (phase === 'riding') {
      game.addDistance(state.distanceM - roundBase);
    }
  });

  /** Starts (or restarts) the engine at a pano, banking the previous segment's totals. */
  function startAt(pano) {
    if (lastState) { banked.m += lastState.distanceM; banked.ms += lastState.elapsedMs; }
    snapNext = true;
    engine.begin(pano);
    roundBase = engine.getState() ? engine.getState().distanceM : 0;
    paused = false;
  }

  // ---- busy / error layers ----
  function showBusy(text) {
    busyLayer.show(el('p', { class: 'busy-text', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), text));
  }
  function showError(retry, secondary) {
    busyLayer.show(
      el('h2', {}, "Couldn't find a road"),
      el('p', {}, 'Please try again.'),
      el('div', { class: 'btn-row' }, button('Try again', retry, { cls: 'primary' }), secondary),
    );
  }

  // ---- explorer ----
  async function dropExplorer() {
    if (busy || destroyed || (phase !== 'riding' && phase !== 'loading')) return;
    const firstDrop = !lastState;
    busy = true;
    const prevPhase = phase;
    phase = 'loading';
    engine.pause();
    showBusy(firstDrop ? 'Finding a road…' : 'Finding a new place…');
    updateHint();
    try {
      const drop = await dropper.drop({ excludeCodes: currentCountry ? [currentCountry.code] : [] });
      if (destroyed) return;
      startAt(drop.pano);
      busyLayer.hide();
      phase = 'riding';
    } catch (e) {
      if (destroyed) return;
      phase = prevPhase;
      const back = firstDrop
        ? button('Home', () => nav.home())
        : button('Keep riding', () => { busyLayer.hide(); phase = 'riding'; engine.resume(); updateHint(); });
      showError(() => { busy = false; dropExplorer(); }, back);
    } finally {
      busy = false;
      updateHint();
    }
  }

  // ---- guess game ----
  async function beginRound() {
    if (busy || destroyed) return;
    busy = true;
    phase = 'loading';
    guessOverlay.hide();
    engine.pause();
    showBusy('Finding a road…');
    updateHint();
    try {
      const drop = await game.startRound();
      if (destroyed) return;
      startAt(drop.pano);
      busyLayer.hide();
      phase = 'riding';
    } catch (e) {
      if (destroyed) return;
      showError(() => { busy = false; beginRound(); }, button('Home', () => nav.home()));
    } finally {
      busy = false;
      updateHint();
    }
  }

  function finishGame(st) {
    phase = 'finished';
    speed.source.stop();
    wake.stop();
    const t = totals();
    let isNewHighScore = false;
    if (!recorded) {
      recorded = true;
      isNewHighScore = stats.recordGuessGame({
        score: st.score, distanceM: t.m, countryCodes: st.results.map((r) => r.answer.code),
      }).isNewHighScore;
    }
    if (simPanel) simPanel.root.hidden = true;
    guessOverlay.showResults({ state: st, isNewHighScore, distanceM: t.m });
    updateHint();
  }

  function onGameState(st) {
    updateGuessInfo(st);
    if (st.phase === lastGamePhase) return;
    const prev = lastGamePhase;
    lastGamePhase = st.phase;
    if (st.phase === 'guessing') {
      phase = 'guessing';
      engine.pause();
      guessOverlay.showGuessing(st);
    } else if (st.phase === 'reveal') {
      phase = 'reveal';
      guessOverlay.showReveal(st);
    } else if (st.phase === 'finished') {
      finishGame(st);
    } else if (st.phase === 'riding' && prev === 'reveal') {
      beginRound();
    }
    updateHint();
  }
  const offGame = game ? game.onState(onGameState) : () => {};

  // ---- pause / end ----
  function pause() {
    if (!canAct()) return;
    paused = true;
    engine.pause();
    updateHint();
    const resumeBtn = button('Resume', resume, { cls: 'primary' });
    pauseLayer.show(
      el('h2', {}, 'Paused'),
      el('div', { class: 'btn-row' }, resumeBtn, button('End ride', endRide)),
    );
    resumeBtn.focus({ preventScroll: true });
  }
  function resume() {
    paused = false;
    pauseLayer.hide();
    engine.resume();
    updateHint();
  }
  function endRide() {
    pauseLayer.hide();
    phase = 'ended';
    paused = false;
    engine.pause();
    speed.source.stop();
    wake.stop();
    if (simPanel) simPanel.root.hidden = true;
    const t = totals();
    let codes;
    const lines = [];
    if (isGuess) {
      const st = game.getState();
      codes = st.results.map((r) => r.answer.code);
      lines.push(`Score ${st.score}`, `${st.results.length} of ${st.roundCount} rides guessed`);
    } else {
      codes = [...visited];
      const names = codes.map((c) => countries.getCountry(c)).filter(Boolean).map((c) => c.name);
      lines.push(names.length === 1 ? `Visited ${names[0]}` : `Visited ${names.length} countries`);
      if (names.length > 1) lines.push(names.join(', '));
    }
    if (!recorded) {
      recorded = true;
      stats.recordExplorerRide({ distanceM: t.m, countryCodes: codes });
    }
    const again = button(isGuess ? 'Play again' : 'Ride again', isGuess ? nav.guess : nav.explore, { cls: 'primary' });
    summaryLayer.show(
      el('h2', {}, 'Ride summary'),
      el('p', { class: 'big-score' }, el('span', { class: 'num' }, formatDistance(t.m, units)), ` ${distanceUnitLabel(units)}`),
      el('p', { class: 'muted-line' }, `Time ${formatDuration(t.ms)}`),
      ...lines.map((l) => el('p', { class: 'muted-line' }, l)),
      el('div', { class: 'btn-row' }, again, button('Home', () => nav.home())),
    );
    again.focus({ preventScroll: true });
    updateHint();
  }

  // ---- speed ----
  const offSpeed = speed.source.onSpeed((v) => {
    const now = performance.now();
    if (v > 0.05) zeroSince = null;
    else if (zeroSince === null) zeroSince = now;
    updateHint(now);
    if (phase === 'ended' || phase === 'finished') return;
    engine.tick(v, now).catch(() => {});
  });

  // ---- start ----
  function start() {
    wake.start();
    if (!startedSpeed) { startedSpeed = true; speed.source.start(); }
    if (isGuess) { updateGuessInfo(game.getState()); beginRound(); } else dropExplorer();
  }
  // Wait a tick so the element is in the document before the panorama measures it.
  const startTimer = setTimeout(start, 0);

  return {
    el: root,
    destroy() {
      destroyed = true;
      clearTimeout(startTimer);
      offSpeed();
      offEngine();
      offGame();
      speed.source.stop();
      if (simPanel) simPanel.destroy();
      wake.stop();
      streetView.destroy();
    },
  };
}

// Screen router: one screen at a time, each with el and destroy().
import { el, button } from './dom.js';
import { createHomeScreen } from './home.js';
import { createRideScreen } from './rideScreen.js';

/** Loading screen with an optional error and Retry button. */
export function createLoadingScreen(appName) {
  const status = el('p', { class: 'busy-text', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading…');
  const box = el('div', { class: 'loading-inner' }, el('h1', { class: 'app-name' }, appName), status);
  return {
    el: el('div', { class: 'screen loading' }, box),
    destroy() {},
    showError(message, onRetry) {
      box.replaceChildren(
        el('h1', { class: 'app-name' }, appName),
        el('div', { class: 'panel overlay-panel' },
          el('h2', {}, 'Something went wrong'), el('p', {}, message),
          el('div', { class: 'btn-row' }, button('Retry', onRetry, { cls: 'primary' }))));
    },
    showLoading() { box.replaceChildren(el('h1', { class: 'app-name' }, appName), status); },
  };
}

export function createApp(root) {
  let current = null;
  let ctx = null;

  function show(screen) {
    if (current) current.destroy();
    current = screen;
    root.replaceChildren(screen.el);
    if (screen.focus) screen.focus();
  }
  const nav = {
    home: () => show(createHomeScreen(ctx, nav)),
    explore: () => show(createRideScreen(ctx, 'explore', nav)),
    guess: () => show(createRideScreen(ctx, 'guess', nav)),
  };
  return {
    show,
    nav,
    /** Called once everything is loaded. */
    ready(context) { ctx = context; nav.home(); },
  };
}

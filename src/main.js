// Startup: load Google Maps and the country data behind the loading screen, then Home.
import * as config from './config.js';
import { loadGoogleMaps, createGooglePanoProvider } from './maps/googlePano.js';
import { createCountryIndex } from './core/countries.js';
import { createStats } from './core/storage.js';
import { createApp, createLoadingScreen } from './ui/app.js';

function makeStore() {
  try {
    const s = window.localStorage;
    const probe = '__bikeapp_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    const mem = new Map();
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
  }
}

async function loadCountries() {
  const res = await fetch('src/data/countries.json');
  if (!res.ok) throw new Error(`Could not load the country data (${res.status}).`);
  return createCountryIndex(await res.json());
}

const app = createApp(document.getElementById('app'));
const loading = createLoadingScreen(config.APP_NAME);
app.show(loading);

async function boot() {
  loading.showLoading();
  try {
    const [maps, countries] = await Promise.all([loadGoogleMaps(config.GOOGLE_MAPS_API_KEY), loadCountries()]);
    app.ready({
      maps,
      countries,
      provider: createGooglePanoProvider(maps),
      stats: createStats(makeStore()),
      config,
    });
  } catch (e) {
    loading.showError((e && e.message) || 'Please check the internet connection.', boot);
  }
}
boot();

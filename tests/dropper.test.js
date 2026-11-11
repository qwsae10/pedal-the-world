import { test, assert, assertEqual } from './harness.js';
import data from '../src/data/countries.js';
import { createCountryIndex, mulberry32 } from '../src/core/countries.js';
import { createDropper } from '../src/core/dropper.js';

const countries = createCountryIndex(data);
const config = { DROP_SEARCH_RADIUS_M: 50000, DROP_MAX_ATTEMPTS: 12 };

/** Local fake: returns a pano at the query point when covered(point) is true. */
function fakeProvider(covered, links = [{ id: 'n', heading: 0 }]) {
  const calls = [];
  return {
    calls,
    async getPano() { return null; },
    async findNear(point, radius) {
      calls.push({ point, radius });
      if (!covered(point)) return null;
      return { id: 'p' + calls.length, lat: point.lat, lng: point.lng, links };
    },
  };
}

test('dropper: returns a pano whose country is the truth', async () => {
  const provider = fakeProvider(() => true);
  const d = createDropper({ provider, countries, rng: mulberry32(11), config });
  for (let i = 0; i < 20; i++) {
    const drop = await d.drop({});
    const c = countries.countryAt(drop.pano);
    assertEqual(c.code, drop.country.code);
    assert(countries.isPlayable(c.code));
  }
  assertEqual(provider.calls[0].radius, 50000);
});

test('dropper: respects excludeCodes', async () => {
  const provider = fakeProvider(() => true);
  const d = createDropper({ provider, countries, rng: mulberry32(2), config });
  const exclude = countries.playableCodes.filter((c) => c !== 'NZ' && c !== 'JP');
  for (let i = 0; i < 15; i++) {
    const drop = await d.drop({ excludeCodes: exclude });
    assert(drop.country.code === 'NZ' || drop.country.code === 'JP', drop.country.code);
  }
});

test('dropper: retries until coverage found', async () => {
  let n = 0;
  const provider = fakeProvider(() => ++n >= 5);
  const d = createDropper({ provider, countries, rng: mulberry32(3), config });
  await d.drop({});
  assertEqual(provider.calls.length, 5);
});

test('dropper: throws after max attempts', async () => {
  const provider = fakeProvider(() => false);
  const d = createDropper({ provider, countries, rng: mulberry32(4), config });
  let msg = null;
  try { await d.drop({}); } catch (e) { msg = e.message; }
  assert(msg && msg.includes('12'), 'message: ' + msg);
  assertEqual(provider.calls.length, 12);
});

test('dropper: rejects panos with no links', async () => {
  const provider = fakeProvider(() => true, []);
  const d = createDropper({ provider, countries, rng: mulberry32(5), config });
  let threw = false;
  try { await d.drop({}); } catch (e) { threw = true; }
  assert(threw);
});

test('dropper: rejects panos that resolve to non-playable countries', async () => {
  // only "covered" in China (not playable) -> must fail
  const provider = fakeProvider((p) => countries.countryAt(p)?.code === 'CN');
  const d = createDropper({ provider, countries, rng: mulberry32(6), config });
  let threw = false;
  try { await d.drop({}); } catch (e) { threw = true; }
  assert(threw);
});

test('dropper: uses 3 points per country before switching', async () => {
  const provider = fakeProvider(() => false);
  const d = createDropper({ provider, countries, rng: mulberry32(8), config });
  try { await d.drop({}); } catch (e) { /* expected */ }
  const codes = provider.calls.map((c) => countries.countryAt(c.point)?.code);
  // each triple targets one country (resolved country may differ near borders, so just check count)
  assertEqual(provider.calls.length, 12);
  assert(new Set(codes.slice(0, 3)).size <= 2);
});

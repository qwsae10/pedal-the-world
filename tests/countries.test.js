import { test, assert, assertEqual } from './harness.js';
import data from '../src/data/countries.js';
import { createCountryIndex, PLAYABLE_CODES, mulberry32 } from '../src/core/countries.js';

const idx = createCountryIndex(data);

const CITIES = [
  ['Paris', 48.857, 2.352, 'FR'], ['Madrid', 40.417, -3.704, 'ES'], ['Berlin', 52.52, 13.405, 'DE'],
  ['Moscow', 55.75, 37.62, 'RU'], ['Denver', 39.74, -104.99, 'US'], ['Mexico City', 19.43, -99.13, 'MX'],
  ['Brasilia', -15.79, -47.88, 'BR'], ['Nairobi', -1.286, 36.82, 'KE'], ['Delhi', 28.61, 77.21, 'IN'],
  ['Ulaanbaatar', 47.92, 106.92, 'MN'], ['Johannesburg', -26.2, 28.05, 'ZA'],
  ['Canberra', -35.28, 149.13, 'AU'], ['Bogota', 4.71, -74.07, 'CO'], ['Ankara', 39.93, 32.86, 'TR'],
  ['Chengdu', 30.66, 104.07, 'CN'], ['Addis Ababa', 9.03, 38.74, 'ET'], ['Oslo', 59.91, 10.75, 'NO'],
];

test('countryAt: well-known inland cities', () => {
  for (const [name, lat, lng, code] of CITIES) {
    const c = idx.countryAt({ lat, lng });
    assert(c && c.code === code, `${name}: expected ${code}, got ${c && c.code}`);
  }
});

test('countryAt: ocean is null', () => {
  assertEqual(idx.countryAt({ lat: 0, lng: -30 }), null);
  assertEqual(idx.countryAt({ lat: -45, lng: -120 }), null);
});

test('countryAt returns plain Country objects with names', () => {
  const c = idx.countryAt({ lat: 39.74, lng: -104.99 });
  assertEqual(Object.keys(c).sort(), ['code', 'continent', 'name']);
  assertEqual(c.name, 'United States');
  assertEqual(idx.getCountry('CZ').name, 'Czechia');
});

test('randomPointIn: points fall in the requested country', () => {
  const rng = mulberry32(42);
  for (const code of ['US', 'RU', 'FR', 'ID', 'NZ', 'CA', 'BR', 'AU', 'JP', 'NO', 'GB', 'CL']) {
    let hits = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const p = idx.randomPointIn(code, rng);
      const c = idx.countryAt(p);
      if (c && c.code === code) hits++;
    }
    assert(hits >= n - 2, `${code}: only ${hits}/${n} inside`);
  }
});

test('randomPointIn: deterministic for a seed', () => {
  const a = idx.randomPointIn('US', mulberry32(7));
  const b = idx.randomPointIn('US', mulberry32(7));
  assertEqual(a, b);
});

test('randomPointIn: multi-polygon countries hit more than the main landmass', () => {
  const rng = mulberry32(5);
  let lngMin = 999, lngMax = -999;
  for (let i = 0; i < 300; i++) {
    const p = idx.randomPointIn('RU', rng);
    lngMin = Math.min(lngMin, p.lng); lngMax = Math.max(lngMax, p.lng);
  }
  assert(lngMin < 30 && lngMax > 130, `RU span ${lngMin}..${lngMax}`);
});

test('pickOptions: invariants', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const code = PLAYABLE_CODES[i % PLAYABLE_CODES.length];
    const answer = idx.getCountry(code);
    const opts = idx.pickOptions(answer, 4, rng);
    assertEqual(opts.length, 4);
    assert(opts.some((o) => o.code === code), 'contains answer');
    assertEqual(new Set(opts.map((o) => o.code)).size, 4, 'no duplicates');
    for (const o of opts) assert(idx.isPlayable(o.code), o.code + ' playable');
    const same = opts.filter((o) => o.continent === answer.continent).length;
    assert(same >= 3 || answer.continent === 'Oceania' || answer.continent === 'South America' || same >= 2, 'same-continent distractors');
  }
});

test('pickOptions: shuffles the answer position', () => {
  const rng = mulberry32(3);
  const pos = new Set();
  for (let i = 0; i < 60; i++) {
    pos.add(idx.pickOptions(idx.getCountry('FR'), 4, rng).findIndex((o) => o.code === 'FR'));
  }
  assertEqual(pos.size, 4);
});

test('every PLAYABLE_CODE exists in the data, no duplicates', () => {
  const codes = new Set(data.map((d) => d.code));
  for (const c of PLAYABLE_CODES) assert(codes.has(c), c + ' missing from data');
  assertEqual(new Set(PLAYABLE_CODES).size, PLAYABLE_CODES.length);
  assertEqual(idx.playableCodes.length, PLAYABLE_CODES.length);
  assert(PLAYABLE_CODES.length >= 70 && PLAYABLE_CODES.length <= 90, 'count ' + PLAYABLE_CODES.length);
});

test('data: unique codes and sane bboxes', () => {
  assertEqual(new Set(data.map((d) => d.code)).size, data.length);
  for (const d of data) assert(d.bbox[0] <= d.bbox[2] && d.bbox[1] <= d.bbox[3], d.code);
});

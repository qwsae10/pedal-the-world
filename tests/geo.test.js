import { test, assert, assertClose } from './harness.js';
import { haversineM, bearingDeg, angleDiff, normalizeDeg, pointInGeometry } from '../src/core/geo.js';

test('haversine: one degree of latitude is ~111.2 km', () => {
  assertClose(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 111195, 200);
  assertClose(haversineM({ lat: 10, lng: 20 }, { lat: 10, lng: 20 }), 0, 1e-9);
});

test('haversine: London to Paris is ~344 km', () => {
  assertClose(haversineM({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 }), 343600, 2000);
});

test('bearing: cardinal directions', () => {
  const o = { lat: 0, lng: 0 };
  assertClose(bearingDeg(o, { lat: 1, lng: 0 }), 0, 1e-6);
  assertClose(bearingDeg(o, { lat: 0, lng: 1 }), 90, 1e-6);
  assertClose(bearingDeg(o, { lat: -1, lng: 0 }), 180, 1e-6);
  assertClose(bearingDeg(o, { lat: 0, lng: -1 }), 270, 1e-6);
});

test('normalizeDeg and angleDiff wrap correctly', () => {
  assertClose(normalizeDeg(-10), 350, 1e-9);
  assertClose(normalizeDeg(370), 10, 1e-9);
  assertClose(angleDiff(350, 10), 20, 1e-9);
  assertClose(angleDiff(10, 350), -20, 1e-9);
  assertClose(angleDiff(0, 90), 90, 1e-9);
  assertClose(angleDiff(90, 0), -90, 1e-9);
  assertClose(Math.abs(angleDiff(0, 180)), 180, 1e-9);
});

test('pointInGeometry: polygon with a hole', () => {
  const g = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  };
  assert(pointInGeometry({ lat: 2, lng: 2 }, g), 'inside body');
  assert(!pointInGeometry({ lat: 5, lng: 5 }, g), 'inside hole');
  assert(!pointInGeometry({ lat: 12, lng: 5 }, g), 'outside');
});

test('pointInGeometry: multipolygon', () => {
  const g = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
    ],
  };
  assert(pointInGeometry({ lat: 0.5, lng: 0.5 }, g));
  assert(pointInGeometry({ lat: 5.5, lng: 5.5 }, g));
  assert(!pointInGeometry({ lat: 3, lng: 3 }, g));
});

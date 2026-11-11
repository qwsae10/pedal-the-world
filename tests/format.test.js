import { test, assertEqual, assertClose } from './harness.js';
import {
  formatSpeed, formatDistance, formatDuration, speedFromMps, mpsFromSpeed,
  speedUnitLabel, distanceUnitLabel,
} from '../src/ui/format.js';

test('format: speed km/h and mph', () => {
  assertEqual(formatSpeed(5, 'km'), '18');
  assertEqual(formatSpeed(5, 'mi'), '11');
  assertEqual(formatSpeed(-1, 'km'), '0');
  assertEqual(speedUnitLabel('km'), 'km/h');
  assertEqual(speedUnitLabel('mi'), 'mph');
});

test('format: speed conversion round trip', () => {
  assertClose(mpsFromSpeed(speedFromMps(7.3, 'mi'), 'mi'), 7.3, 1e-9);
  assertClose(mpsFromSpeed(36, 'km'), 10, 1e-9);
});

test('format: distance', () => {
  assertEqual(formatDistance(420, 'km'), '0.42');
  assertEqual(formatDistance(12345, 'km'), '12.3');
  assertEqual(formatDistance(1609.344, 'mi'), '1.00');
  assertEqual(distanceUnitLabel('mi'), 'mi');
});

test('format: duration', () => {
  assertEqual(formatDuration(0), '0:00');
  assertEqual(formatDuration(65000), '1:05');
  assertEqual(formatDuration(3725000), '1:02:05');
});

// The one place the speed source is created. A real bike sensor replaces the
// simulated source here later; the test-pedals panel only shows when isSimulated.
import { createSimulatedSpeedSource } from '../core/speed/simulated.js';

/** @returns {{source: import('../contracts.js').SpeedSource & Record<string, any>, isSimulated: boolean}} */
export function createSpeedSource() {
  // Starts with a target of 0: nothing moves until she "pedals".
  const source = createSimulatedSpeedSource({ initialSpeedMps: 0 });
  return { source, isSimulated: true };
}

// Finds a random Street View start in a playable country.
import * as defaultConfig from '../config.js';

/** @typedef {import('../contracts.js').Drop} Drop */

/**
 * @param {Object} deps
 * @param {import('../contracts.js').PanoProvider} deps.provider
 * @param {ReturnType<import('./countries.js').createCountryIndex>} deps.countries
 * @param {() => number} deps.rng
 * @param {Object} [deps.config] needs DROP_SEARCH_RADIUS_M, DROP_MAX_ATTEMPTS (defaults from config.js)
 */
export function createDropper({ provider, countries, rng, config = defaultConfig }) {
  const radius = config.DROP_SEARCH_RADIUS_M ?? defaultConfig.DROP_SEARCH_RADIUS_M;
  const maxAttempts = config.DROP_MAX_ATTEMPTS ?? defaultConfig.DROP_MAX_ATTEMPTS;
  const POINTS_PER_COUNTRY = 3;

  return {
    /** @returns {Promise<Drop>} */
    async drop({ excludeCodes = [] } = {}) {
      const excluded = new Set(excludeCodes);
      const candidates = countries.playableCodes.filter((c) => !excluded.has(c));
      if (candidates.length === 0) throw new Error('No playable countries left to drop into');
      let attempts = 0;
      while (attempts < maxAttempts) {
        const code = candidates[Math.floor(rng() * candidates.length)];
        for (let i = 0; i < POINTS_PER_COUNTRY && attempts < maxAttempts; i++) {
          const point = countries.randomPointIn(code, rng);
          attempts++;
          const pano = await provider.findNear(point, radius);
          if (!pano || !pano.links || pano.links.length === 0) continue;
          const country = countries.countryAt(pano);
          if (country && countries.isPlayable(country.code) && !excluded.has(country.code)) {
            return { pano, country };
          }
        }
      }
      throw new Error(`Could not find Street View coverage after ${maxAttempts} attempts`);
    },
  };
}

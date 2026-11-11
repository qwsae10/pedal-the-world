// High score and lifetime stats over an injected KeyValueStore.
export const STATS_KEY = 'bikeapp.stats.v1';

const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
const defaults = () => ({ highScore: 0, totalDistanceM: 0, ridesCompleted: 0, countriesVisited: [] });

/** @param {import('../contracts.js').KeyValueStore} store */
export function createStats(store) {
  function get() {
    try {
      const raw = store.getItem(STATS_KEY);
      if (!raw) return defaults();
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return defaults();
      const visited = Array.isArray(o.countriesVisited)
        ? [...new Set(o.countriesVisited.filter((c) => typeof c === 'string'))] : [];
      return {
        highScore: num(o.highScore), totalDistanceM: num(o.totalDistanceM),
        ridesCompleted: Math.floor(num(o.ridesCompleted)), countriesVisited: visited,
      };
    } catch (e) {
      return defaults();
    }
  }

  function save(stats) {
    try { store.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* storage full or blocked */ }
  }

  function addRide(stats, distanceM, codes) {
    stats.totalDistanceM += num(distanceM);
    stats.ridesCompleted += 1;
    stats.countriesVisited = [...new Set([...stats.countriesVisited, ...(codes || [])])];
  }

  return {
    get,
    recordGuessGame({ score, distanceM, countryCodes }) {
      const stats = get();
      const isNewHighScore = num(score) > stats.highScore;
      if (isNewHighScore) stats.highScore = num(score);
      addRide(stats, distanceM, countryCodes);
      save(stats);
      return { stats, isNewHighScore };
    },
    recordExplorerRide({ distanceM, countryCodes }) {
      const stats = get();
      addRide(stats, distanceM, countryCodes);
      save(stats);
      return stats;
    },
    reset() {
      const stats = defaults();
      save(stats);
      return stats;
    },
  };
}

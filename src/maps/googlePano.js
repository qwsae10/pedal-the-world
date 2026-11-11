// Google Maps loader and the PanoProvider backed by StreetViewService.
/** @typedef {import('../contracts.js').Pano} Pano */
/** @typedef {import('../contracts.js').PanoProvider} PanoProvider */

let loading = null;

/** Loads the Maps JavaScript API once. Resolves with the `google.maps` namespace. */
export function loadGoogleMaps(apiKey) {
  if (window.google && window.google.maps && window.google.maps.StreetViewService) {
    return Promise.resolve(window.google.maps);
  }
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__bikeappMapsReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
    s.src = `https://maps.googleapis.com/maps/api/js?v=weekly&loading=async&callback=__bikeappMapsReady${key}`;
    s.async = true;
    s.onerror = () => { loading = null; reject(new Error('Could not load Google Maps. Check the internet connection.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** @returns {Pano} */
function toPano(data) {
  const loc = data.location;
  return {
    id: loc.pano,
    lat: loc.latLng.lat(),
    lng: loc.latLng.lng(),
    links: (data.links || [])
      .filter((l) => l && l.pano && typeof l.heading === 'number')
      .map((l) => ({ id: l.pano, heading: l.heading })),
  };
}

/**
 * @param {typeof google.maps} maps
 * @returns {PanoProvider}
 */
export function createGooglePanoProvider(maps) {
  const service = new maps.StreetViewService();
  /** @type {Map<string, Pano>} */
  const cache = new Map();
  const remember = (pano) => {
    cache.set(pano.id, pano);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return pano;
  };

  return {
    async getPano(id) {
      if (cache.has(id)) return cache.get(id);
      try {
        const res = await service.getPanorama({ pano: id });
        return remember(toPano(res.data));
      } catch {
        return null;
      }
    },
    async findNear(point, radiusM) {
      try {
        const res = await service.getPanorama({
          location: point,
          radius: radiusM,
          // Official Google imagery only: user photospheres have no road links.
          sources: [maps.StreetViewSource.GOOGLE],
          preference: maps.StreetViewPreference.NEAREST,
        });
        return remember(toPano(res.data));
      } catch {
        return null;
      }
    },
  };
}

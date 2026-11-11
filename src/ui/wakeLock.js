// Keeps the screen on during a ride when the browser allows it.
export function createWakeLock() {
  let sentinel = null;
  let wanted = false;

  async function acquire() {
    if (!wanted || sentinel || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { sentinel = null; });
      if (!wanted) release();
    } catch { /* not allowed or not supported: ignore */ }
  }
  function release() {
    const s = sentinel;
    sentinel = null;
    if (s) s.release().catch(() => {});
  }
  const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };

  return {
    start() {
      wanted = true;
      document.addEventListener('visibilitychange', onVisible);
      acquire();
    },
    stop() {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      release();
    },
  };
}

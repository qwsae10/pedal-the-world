// Tiny test runner that works in jsc (print) and in browsers (console.log).
// In a browser `print` is window.print (the print dialog), so only use it in jsc.
const out = typeof document === 'undefined' && typeof print === 'function'
  ? print
  : (...a) => console.log(...a);
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, message = 'assertion failed') {
  if (!cond) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`);
}

export function assertClose(actual, expected, tolerance, message = '') {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${message} expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

/** Runs every registered test. Returns {passed, failed, lines}. */
export async function run() {
  let passed = 0;
  let failed = 0;
  const lines = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      lines.push(`ok   ${t.name}`);
    } catch (err) {
      failed++;
      lines.push(`FAIL ${t.name}: ${err && err.message}`);
    }
  }
  lines.push(`${passed} passed, ${failed} failed`);
  for (const l of lines) out(l);
  return { passed, failed, lines };
}

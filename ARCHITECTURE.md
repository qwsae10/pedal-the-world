# BikeApp architecture

A static web app: plain ES modules, no build step, no npm. Serve the folder with
`python3 -m http.server 8080` and open http://localhost:8080.

Target: a large touchscreen on an exercise bike (Android 8.1, modern Firefox),
also any desktop browser. No typing anywhere. Big touch targets (min 72px).

## Rules for every module

- Plain JavaScript ES modules with JSDoc types. No TypeScript, no bundler, no CDN
  libraries other than the Google Maps JS API.
- `src/core/**` is pure logic: it must not touch `window`, `document`, `google`
  or `localStorage` directly. Anything external is injected (see contracts).
  This keeps it testable in `jsc` and swappable on the bike.
- Types live in `src/contracts.js`. Do not change that file; if a contract is
  wrong, say so in your report.
- Distances are metres, speeds are metres/second, headings are degrees 0-360
  clockwise from north, times are milliseconds.

## Layout

```
index.html
src/contracts.js            shared JSDoc types (architect-owned)
src/config.js               API key and tunable constants (architect-owned)
src/core/geo.js             haversine, bearing, angleDiff, pointInPolygon
src/core/speed/simulated.js SimulatedSpeedSource
src/core/rideEngine.js      turns speed samples into movement along panoramas
src/core/countries.js       country lookup, random points, answer options
src/core/dropper.js         finds a random Street View start
src/core/guessGame.js       Guess the World state machine
src/core/storage.js         high score and lifetime stats
src/data/countries.json     simplified country polygons
src/maps/googlePano.js      PanoProvider backed by Google StreetViewService
src/ui/**                   screens and the Street View view
tests/*.test.js             pure-logic tests
tests/harness.js            tiny test runner (works in jsc and in a browser)
tests/index.html            runs all tests in a browser
```

## Running tests without Node

```
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/all.js
```

`jsc` has `print`, not `console`. It has no `fetch`, no `setTimeout` loop to rely
on and no JSON module imports, so core modules take data and clocks as arguments.

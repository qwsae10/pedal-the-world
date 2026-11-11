// Shared types. Architect-owned: builders must not edit this file.
// Units: metres, metres/second, degrees clockwise from north, milliseconds.

/**
 * @typedef {Object} LatLng
 * @property {number} lat
 * @property {number} lng
 */

/**
 * One Street View panorama and the panoramas reachable from it.
 * @typedef {Object} Pano
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {PanoLink[]} links
 */

/**
 * @typedef {Object} PanoLink
 * @property {string} id       id of the neighbouring panorama
 * @property {number} heading  direction to travel to reach it
 */

/**
 * Source of panoramas. The Google implementation lives in src/maps/googlePano.js;
 * tests use an in-memory fake.
 * @typedef {Object} PanoProvider
 * @property {(id: string) => Promise<Pano|null>} getPano
 * @property {(point: LatLng, radiusM: number) => Promise<Pano|null>} findNear
 *   Nearest official outdoor panorama within radiusM, or null.
 */

/**
 * Where pedalling speed comes from. Simulated now; the real bike sensor later.
 * @typedef {Object} SpeedSource
 * @property {() => void} start
 * @property {() => void} stop
 * @property {(listener: (speedMps: number) => void) => (() => void)} onSpeed
 *   Subscribe to speed readings. Returns an unsubscribe function. A source
 *   should emit at least once a second while started, including zeros.
 */

/**
 * A choice offered when more than one way forward exists.
 * @typedef {Object} TurnOption
 * @property {string} id        pano id the option leads to
 * @property {number} heading   absolute heading of the option
 * @property {number} relative  heading relative to travel direction, -180..180
 *                              (negative = left)
 */

/**
 * Snapshot emitted by the ride engine whenever something changes.
 * @typedef {Object} RideState
 * @property {Pano} pano              panorama currently shown
 * @property {number} heading         current direction of travel
 * @property {number} speedMps        latest speed reading
 * @property {number} distanceM       total distance ridden this ride
 * @property {number} elapsedMs       time since the ride started, paused time excluded
 * @property {TurnOption[]} turnOptions  ways forward at the upcoming step; empty
 *                                       or length 1 when there is no real choice
 * @property {string|null} chosenTurnId  option the rider tapped, if any
 * @property {boolean} moved          true when this snapshot is a move to a new pano
 */

/**
 * @typedef {Object} RideEngine
 * @property {(start: Pano, initialHeading?: number) => void} begin
 * @property {(speedMps: number, nowMs: number) => Promise<void>} tick
 *   Feed a speed reading with its timestamp. Integrates distance and advances
 *   through panoramas when enough distance has accumulated.
 * @property {(panoId: string) => void} chooseTurn
 * @property {(listener: (state: RideState) => void) => (() => void)} onState
 * @property {() => RideState|null} getState
 * @property {() => void} pause
 * @property {() => void} resume
 */

/**
 * @typedef {Object} Country
 * @property {string} code       ISO 3166-1 alpha-2, upper case
 * @property {string} name       English short name
 * @property {string} continent  e.g. "Europe"
 */

/**
 * @typedef {Object} Drop
 * @property {Pano} pano
 * @property {Country} country
 */

/**
 * Guess the World game snapshot.
 * @typedef {Object} GuessGameState
 * @property {'riding'|'guessing'|'reveal'|'finished'} phase
 * @property {number} roundIndex        0-based
 * @property {number} roundCount
 * @property {number} roundDistanceM    distance to ride before guessing
 * @property {number} roundProgressM    distance ridden this round
 * @property {Country[]} options        answer options, shown in 'guessing' and 'reveal'
 * @property {Country|null} answer      correct country, only set in 'reveal' and 'finished'
 * @property {Country|null} guess       the rider's pick for this round
 * @property {number} score
 * @property {number} streak
 * @property {RoundResult[]} results
 */

/**
 * @typedef {Object} RoundResult
 * @property {Country} answer
 * @property {Country|null} guess
 * @property {boolean} correct
 * @property {number} points
 */

/**
 * Scoring is a swappable function so the rule can change later.
 * @typedef {(input: {correct: boolean, streak: number, answer: Country, guess: Country|null}) => number} ScoreRule
 */

/**
 * Minimal key-value store, so core never touches localStorage directly.
 * @typedef {Object} KeyValueStore
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 */

/**
 * @typedef {Object} Stats
 * @property {number} highScore
 * @property {number} totalDistanceM
 * @property {number} ridesCompleted
 * @property {string[]} countriesVisited  ISO codes
 */

export {};

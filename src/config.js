// Architect-owned. Tunable constants in one place.

// Paste the Google Maps JavaScript API key here. Empty means Google serves a
// watermarked "for development purposes only" view.
export const GOOGLE_MAPS_API_KEY = '';

export const GUESS_ROUND_COUNT = 5;
export const GUESS_ROUND_DISTANCE_M = 1000;
export const GUESS_OPTION_COUNT = 4;
export const POINTS_PER_CORRECT = 100;

// Ride engine
export const MAX_PLAUSIBLE_SPEED_MPS = 20;   // readings above this are clamped
export const MAX_TICK_GAP_MS = 3000;         // longer gaps count as a pause
export const FORWARD_CONE_DEG = 100;         // links within +/- this of travel heading are "forward"
export const TURN_OPTION_MIN_SEPARATION_DEG = 25;

// Dropper
export const DROP_SEARCH_RADIUS_M = 50000;
export const DROP_MAX_ATTEMPTS = 12;

// Simulator
export const SIM_DEFAULT_SPEED_MPS = 5.5;    // about 20 km/h
export const SIM_MAX_SPEED_MPS = 12;

// Presentation
export const APP_NAME = 'Pedal the World';
export const UNITS = 'km';                   // 'km' or 'mi'
export const LOOK_RECENTER_MS = 4000;        // after dragging the view, drift back to the road

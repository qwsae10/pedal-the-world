// Architect-owned. Tunable constants in one place.

// Google Maps JavaScript API key. Visible to anyone by design, so it must stay
// restricted in the Google Cloud console to this site's address and to the
// Maps JavaScript API only.
export const GOOGLE_MAPS_API_KEY = 'AIzaSyD3JWQsswaowpr2P8JGZr5krttRD_rG04U';

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

// Travel multiplier: how much faster she moves through the world than she pedals.
export const TRAVEL_MULTIPLIERS = [1, 2, 3, 5];
export const DEFAULT_TRAVEL_MULTIPLIER = 3;

// Motion between panoramas
export const CROSSFADE_MS = 280;             // blend from one panorama to the next
export const MOTION_ZOOM_MAX = 0.35;         // zoom-in during a step to suggest forward motion; 0 turns it off
export const MOTION_ZOOM_CONE_DEG = 35;      // only zoom while looking roughly along the road

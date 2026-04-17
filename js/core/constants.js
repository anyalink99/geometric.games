const SVG_NS = 'http://www.w3.org/2000/svg';

const CX = 200;
const CY = 200;
const MAX_R = 168;
const BASE_R = 118;
const TAU = Math.PI * 2;

const TARGET_AREA = 30000;

const MOVE_THRESHOLD = 6;
const STATS_KEY = 'geometric.games.stats.v1';
const SQUARE_STATS_KEY = 'geometric.games.stats.square.v1';
const MODE_KEY = 'geometric.games.mode.v1';
const POINT_GRAB_R = 11;
const LINE_GRAB_THRESHOLD = 10;
const MASS_STATS_KEY = 'geometric.games.stats.mass.v1';
const CUT_VARIATION_KEY = 'geometric.games.cut.variation.v1';
const CUT_VARIATIONS = ['half', 'ratio', 'quad', 'tri', 'angle'];
const SQUARE_VARIATION_KEY = 'geometric.games.square.variation.v1';
const SQUARE_VARIATIONS = ['square', 'triangle'];
const CUT_HANDLE_PAD = 22;

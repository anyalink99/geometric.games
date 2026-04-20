const SVG_NS = 'http://www.w3.org/2000/svg';

const CX = 200;
const CY = 200;
const MAX_R = 196;
const BASE_R = 167;
const TAU = Math.PI * 2;

const BOARD_W = 400;
const BOARD_TOP_Y = -80;
const BOARD_BOTTOM_Y = 480;
const BOARD_H = BOARD_BOTTOM_Y - BOARD_TOP_Y;
const FLOOR_Y = BOARD_BOTTOM_Y;

const TARGET_AREA = 60000;

const MOVE_THRESHOLD = 6;
const MODE_KEY = 'geometric.games.mode.v1';
const POINT_GRAB_R = 11;
const LINE_GRAB_THRESHOLD = 10;

const CUT_STATS_PREFIX = 'geometric.games.stats.cut.';
const INSCRIBE_STATS_PREFIX = 'geometric.games.stats.inscribe.';
const BALANCE_STATS_PREFIX = 'geometric.games.stats.balance.';

const CUT_VARIATION_KEY = 'geometric.games.cut.variation.v1';
const CUT_VARIATIONS = ['half', 'ratio', 'quad', 'tri', 'angle'];
const INSCRIBE_VARIATION_KEY = 'geometric.games.inscribe.variation.v1';
const INSCRIBE_VARIATIONS = ['square', 'triangle'];
const BALANCE_VARIATION_KEY = 'geometric.games.balance.variation.v1';
const BALANCE_VARIATIONS = ['pole', 'centroid', 'perch'];
const CUT_HANDLE_PAD = 22;

const BALANCE_PERFECT_THRESHOLD = 5;

/**
 * Terminal color utilities for Push CLI.
 *
 * ANSI escape codes for terminal styling.
 * Automatically disables colors when not outputting to a TTY.
 */

const isColorEnabled = process.stdout.isTTY && !process.env.NO_COLOR;

/**
 * ANSI escape codes.
 */
export const codes = {
  // Reset
  reset: '\x1b[0m',

  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Cursor control
  clearScreen: '\x1b[2J',
  cursorHome: '\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[2K',
  cursorUp: '\x1b[1A',
  cursorDown: '\x1b[1B',
};

/**
 * Wrap text with color codes.
 *
 * @param {string} text - Text to color
 * @param {string} code - ANSI code
 * @returns {string} Colored text (or plain text if colors disabled)
 */
function wrap(text, code) {
  if (!isColorEnabled) {
    return text;
  }
  return `${code}${text}${codes.reset}`;
}

// Style functions
export const bold = (text) => wrap(text, codes.bold);
export const dim = (text) => wrap(text, codes.dim);
export const italic = (text) => wrap(text, codes.italic);
export const underline = (text) => wrap(text, codes.underline);

// Color functions
export const red = (text) => wrap(text, codes.red);
export const green = (text) => wrap(text, codes.green);
export const yellow = (text) => wrap(text, codes.yellow);
export const blue = (text) => wrap(text, codes.blue);
export const magenta = (text) => wrap(text, codes.magenta);
export const cyan = (text) => wrap(text, codes.cyan);
export const white = (text) => wrap(text, codes.white);

// Bright color functions
export const brightRed = (text) => wrap(text, codes.brightRed);
export const brightGreen = (text) => wrap(text, codes.brightGreen);
export const brightYellow = (text) => wrap(text, codes.brightYellow);
export const brightBlue = (text) => wrap(text, codes.brightBlue);
export const brightCyan = (text) => wrap(text, codes.brightCyan);

// Combined styles
export const error = (text) => wrap(text, codes.red);
export const success = (text) => wrap(text, codes.green);
export const warning = (text) => wrap(text, codes.yellow);
export const info = (text) => wrap(text, codes.cyan);
export const muted = (text) => wrap(text, codes.dim);

/**
 * Status indicator symbols with colors.
 */
export const symbols = {
  running: isColorEnabled ? `${codes.green}●${codes.reset}` : '*',
  queued: isColorEnabled ? `${codes.yellow}○${codes.reset}` : 'o',
  completed: isColorEnabled ? `${codes.green}✓${codes.reset}` : '+',
  failed: isColorEnabled ? `${codes.red}✗${codes.reset}` : 'x',
  timeout: isColorEnabled ? `${codes.red}⏱${codes.reset}` : 'T',
  backlog: isColorEnabled ? `${codes.blue}📦${codes.reset}` : '[B]',
  pinned: isColorEnabled ? `${codes.yellow}📌${codes.reset}` : '[P]',
};

/**
 * Check if colors are enabled.
 *
 * @returns {boolean}
 */
export function colorsEnabled() {
  return isColorEnabled;
}

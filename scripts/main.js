/**
 * Generate the calendar from CitoAPI match data.
 *
 * Keeping this file as the package entry point preserves the original
 * `node scripts/main.js` workflow while all implementation lives in the
 * independently testable calendar generator module.
 */
const { generateCalendar } = require('./generateCalendar');

generateCalendar().catch((error) => {
	console.error(`Calendar generation failed: ${error.message}`);
	process.exitCode = 1;
});

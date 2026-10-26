const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOOKBACK_DAYS = Number(process.env.MATCH_LOOKBACK_DAYS || 14);
const CITO_API_BASE_URL = (process.env.CITO_API_BASE_URL || 'https://api.citoapi.com').replace(/\/$/, '');
const CITO_MATCHES_PATH = '/api/v1/cs2/matches/today';
const CITO_STATE_PATH = path.join(ROOT, 'jsons', 'cito-api-state.json');

/**
 * Load local environment values without printing them.
 *
 * GitHub Actions supplies CITO_API_KEY through the workflow environment. The
 * local `.env` fallback keeps `npm run generate` convenient without requiring
 * a dotenv runtime dependency.
 */
function loadLocalEnv() {
	if (process.env.CITO_API_KEY) return;
	try {
		const dotenv = require('node:fs').readFileSync(path.join(ROOT, '.env'), 'utf8');
		for (const line of dotenv.split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
			if (!match || process.env[match[1]]) continue;
			process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
		}
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
}

/**
 * Fetch today's matches from CitoAPI exactly once.
 *
 * @returns {Promise<object[]>} Cito match records.
 */
async function fetchCitoMatches() {
	loadLocalEnv();
	if (!process.env.CITO_API_KEY) throw new Error('CITO_API_KEY is not configured');
	const response = await fetch(`${CITO_API_BASE_URL}${CITO_MATCHES_PATH}`, {
		headers: { accept: 'application/json', 'x-api-key': process.env.CITO_API_KEY },
	});
	const body = await response.text();
	if (!response.ok) throw new Error(`CitoAPI request failed (${response.status}): ${body.slice(0, 300)}`);
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		throw new Error('CitoAPI returned invalid JSON');
	}
	if (!payload?.success || !Array.isArray(payload.data)) throw new Error('CitoAPI response did not contain a data array');
	return payload.data;
}

/**
 * Return whether an event tier is S or A.
 *
 * @param {unknown} tier Event tier.
 * @returns {boolean} Whether the match should enter the calendar.
 */
function isQualifyingTier(tier) {
	return tier === 'S' || tier === 'A';
}

/**
 * Identify the scheduled 12-hour UTC slot.
 *
 * @param {Date} date Current time.
 * @returns {string} Slot identifier.
 */
function citoSlot(date) {
	return `${date.toISOString().slice(0, 10)}-${String(date.getUTCHours()).padStart(2, '0')}`;
}

/**
 * Normalize names for matching while retaining the original display names.
 *
 * @param {string} name Team name.
 * @returns {string} Comparison key.
 */
function normalizeTeamName(name) {
	return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

/**
 * Return the first usable value from an object.
 *
 * @param {object} object Source object.
 * @param {string[]} keys Candidate property names.
 * @returns {unknown} First present value.
 */
function firstValue(object, keys) {
	return keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== '');
}

/**
 * Convert API timestamps (milliseconds, seconds, ISO strings, or Date-like
 * objects) to a valid Date.
 *
 * @param {unknown} value API timestamp.
 * @returns {Date|null} Parsed date or null for invalid input.
 */
function parseDate(value, time = '') {
	if (value && typeof value === 'object' && 'timestamp' in value) value = value.timestamp;
	if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
		const number = Number(value);
		value = new Date(number < 1e12 ? number * 1000 : number);
	} else {
		value = new Date(value);
	}
	return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Read a team name from the common flat or nested scraper representations.
 *
 * @param {unknown} team Team value.
 * @returns {string|null} Team name.
 */
function teamName(team) {
	if (typeof team === 'string') return team;
	if (!team || typeof team !== 'object') return null;
	const name = firstValue(team, ['name', 'teamName', 'title']);
	return typeof name === 'string' ? name : null;
}

/**
 * Adapt a Cito match to the calendar's internal model.
 *
 * @param {object} match Cito match record.
 * @returns {object|null} Normalized match or null for non-S/A events.
 */
function normalizeCitoMatch(match) {
	if (!isQualifyingTier(match?.event?.tier)) return null;
	const team1Name = match.team1Name || teamName(match.team1);
	const team2Name = match.team2Name || teamName(match.team2);
	if (!team1Name || !team2Name || !match.id) return null;
	const maps = Array.isArray(match.maps)
		? match.maps.filter((map) => map?.mapName && map.team1Score !== null && map.team2Score !== null).map((map) => ({
			map_name: map.mapName,
			score: { [team1Name]: map.team1Score, [team2Name]: map.team2Score },
		}))
		: [];
	return {
		...match,
		id: String(match.id),
		date: match.startsAt,
		team1: { name: team1Name, score: match.team1Score },
		team2: { name: team2Name, score: match.team2Score },
		event: match.event?.name || 'Unknown event',
		format: match.bestOf ? `BO${match.bestOf}` : 'Unknown',
		maps,
	};
}

/**
 * Format completed-match map scores for an ICS description.
 *
 * @param {object} match Enriched match record.
 * @returns {string[]} Human-readable map-score lines.
 */
function completedDetailLines(match) {
	const lines = [];
	const maps = Array.isArray(match.maps) ? match.maps : [];
	if (maps.length > 0) {
		lines.push('Map scores:');
		for (const map of maps) {
			const scores = map?.score && typeof map.score === 'object'
				? Object.entries(map.score).map(([team, score]) => `${team} ${score}`).join(' - ')
				: 'score unavailable';
			lines.push(`- ${map.map_name || 'Unknown map'}: ${scores}`);
		}
	}

	return lines;
}

/**
 * Create a detailed description suitable for a calendar event.
 *
 * @param {object} match Raw or enriched match.
 * @param {boolean} isResult Whether the match has completed.
 * @param {string} id Stable match ID.
 * @param {string} format Match format.
 * @param {string} eventName Event name.
 * @returns {string} Detailed event description.
 */
function buildDescription(match, isResult, id, format, eventName) {
	const score1 = firstValue(match.team1, ['score']);
	const score2 = firstValue(match.team2, ['score']);
	const lines = [
		`Event: ${eventName}`,
		`Format: ${format}`,
		`Match ID: ${id}`,
		`Status: ${isResult ? 'completed' : 'scheduled'}`,
	];
	if (isResult && score1 !== undefined && score2 !== undefined) {
		lines.push(`Final score: ${match.team1.name} ${score1} - ${match.team2.name} ${score2}`);
	}
	if (isResult) {
		const detailLines = completedDetailLines(match);
		if (detailLines.length > 0) lines.push(...detailLines);
	}
	return lines.join('\n');
}

/**
 * Normalize one result/upcoming match into the calendar event model.
 *
 * @param {object} match Raw API match.
 * @param {boolean} isResult Whether this is a completed result.
 * @returns {object|null} Normalized match or null when required data is absent.
 */
function normalizeMatch(match, isResult, existingEvent = null) {
	const team1 = teamName(firstValue(match, ['team1', 'teamA', 'homeTeam']));
	const team2 = teamName(firstValue(match, ['team2', 'teamB', 'awayTeam']));
	const parsedStart = parseDate(
		firstValue(match, ['date', 'startTime', 'start', 'timestamp']),
		firstValue(match, ['hour', 'time']) || '',
	);
	const start = parsedStart || (existingEvent?.start ? new Date(existingEvent.start) : null);
	const id = firstValue(match, ['id', 'matchId']);
	if (!team1 || !team2 || !start || id === undefined || id === null) return null;

	const score1 = firstValue(match.team1, ['score']);
	const score2 = firstValue(match.team2, ['score']);
	const format = firstValue(match, ['format', 'bo', 'map', 'meta']) || 'Unknown';
	const event = firstValue(match, ['event', 'eventName', 'tournament']);
	const eventName = typeof event === 'string' ? event : event?.name || 'Unknown event';
	const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
	const score = isResult && score1 !== undefined && score2 !== undefined ? ` (${score1}-${score2})` : '';
	const description = buildDescription(match, isResult, id, format, eventName);
	return {
		id: String(id),
		start: start.toISOString(),
		end: end.toISOString(),
		summary: `${team1} vs ${team2}${score}`,
		description,
		location: eventName,
		teams: [team1, team2],
	};
}

/**
 * Decode RFC 5545 text escaping used by the generated calendar.
 *
 * @param {string} value Escaped ICS value.
 * @returns {string} Plain text value.
 */
function unescapeIcsText(value) {
	return value.replace(/\\n/g, '\n').replace(/\\([\\,;])/g, '$1');
}

/**
 * Read existing timed events so API updates can preserve known fields.
 *
 * All-day events are intentionally ignored because events without a start time
 * are no longer emitted by the generator.
 *
 * @param {string} ics ICS document.
 * @returns {Map<string, object>} Existing events keyed by match ID.
 */
function parseIcsEvents(ics) {
	const events = new Map();
	const blocks = ics.split('BEGIN:VEVENT').slice(1);
	for (const block of blocks) {
		const uid = block.match(/\r?\nUID:(?:[^@\r\n]+@)?([^\r\n]+)/)?.[1];
		const start = block.match(/\r?\nDTSTART:(\d{8}T\d{6}Z)/)?.[1];
		if (!uid || !start) continue;
		const toIso = (value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
		const field = (name) => {
			const match = block.match(new RegExp(`\\r?\\n${name}:(.*)`));
			return match ? unescapeIcsText(match[1]) : '';
		};
		const event = {
			id: uid,
			start: toIso(start),
			end: toIso(block.match(/\r?\nDTEND:(\d{8}T\d{6}Z)/)?.[1] || start),
			summary: field('SUMMARY'),
			description: field('DESCRIPTION'),
			location: field('LOCATION'),
		};
		event.teams = event.summary.split(/\s+vs\s+/i).map((team) => team.replace(/\s*\(\d+-\d+\)\s*$/, '').trim());
		events.set(uid, event);
	}
	return events;
}

/**
 * Merge incoming API data into an existing event without losing fields that
 * the current response omits.
 *
 * @param {object} existing Previously generated event.
 * @param {object} incoming Normalized API event.
 * @returns {object} Updated event.
 */
function mergeCalendarEvent(existing, incoming) {
	if (!existing) return incoming;
	const updated = { ...existing, ...incoming };
	if (!incoming.start) updated.start = existing.start;
	if (!incoming.end) updated.end = existing.end;
	if (!incoming.description?.includes('Map scores:') && existing.description?.includes('Map scores:')) {
		const mapDetails = existing.description.slice(existing.description.indexOf('Map scores:'));
		updated.description = `${incoming.description}\n${mapDetails}`;
	}
	return updated;
}

/**
 * Keep deduplicated matches that are newer than the retention threshold.
 *
 * @param {object[]} matches Normalized matches.
 * @param {Date} now Current time.
 * @returns {object[]} Filtered, deduplicated matches.
 */
function filterMatches(matches, now = new Date()) {
	const earliest = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
	const seen = new Set();
	return matches
		.filter((match) => {
			const start = new Date(match.start);
			const inWindow = start > earliest;
			if (!inWindow || seen.has(match.id)) return false;
			seen.add(match.id);
			return true;
		})
		.sort((a, b) => new Date(a.start) - new Date(b.start))
		.map(({ teams, ...match }) => match);
}

/**
 * Escape a value according to RFC 5545 TEXT rules.
 *
 * @param {string} value ICS text.
 * @returns {string} Escaped text.
 */
function escapeIcsText(value) {
	return String(value).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

/**
 * Format a Date as a UTC iCalendar timestamp.
 *
 * @param {Date} date Date to format.
 * @returns {string} YYYYMMDDTHHMMSSZ timestamp.
 */
function icsDate(date) {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build a standards-compliant UTC calendar.
 *
 * @param {object[]} events Calendar events.
 * @returns {string} ICS document.
 */
function toIcs(events) {
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Counter Strike Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
	for (const event of events) {
		lines.push(
			'BEGIN:VEVENT',
			`UID:${escapeIcsText(event.id)}@counter-strike-calendar`,
			`DTSTAMP:${icsDate(new Date())}`,
			`DTSTART:${icsDate(new Date(event.start))}`,
			`DTEND:${icsDate(new Date(event.end))}`,
			`SUMMARY:${escapeIcsText(event.summary)}`,
			`DESCRIPTION:${escapeIcsText(event.description)}`,
			`LOCATION:${escapeIcsText(event.location)}`,
			'END:VEVENT',
		);
	}
	lines.push('END:VCALENDAR');
	return `${lines.join('\r\n')}\r\n`;
}

/**
 * Fetch source data and write the JSON and ICS calendar files.
 *
 * @returns {Promise<object[]>} Generated events.
 */
async function generateCalendar() {
	loadLocalEnv();
	const icsPath = path.join(ROOT, 'ics', 'finalCalendar.ics');
	const existingIcs = await fs.readFile(icsPath, 'utf8').catch(() => '');
	const existingEvents = parseIcsEvents(existingIcs);
	const slot = new Date();
	if (slot.getUTCMinutes() !== 0 || ![0, 12].includes(slot.getUTCHours())) {
		throw new Error('CitoAPI calls are restricted to 00:00 and 12:00 UTC');
	}
	const currentSlot = citoSlot(slot);
	const state = await fs.readFile(CITO_STATE_PATH, 'utf8').then(JSON.parse).catch((error) => {
		if (error.code === 'ENOENT') return {};
		throw error;
	});
	if (state.lastSuccessfulSlot === currentSlot) {
		throw new Error(`CitoAPI has already been called for the ${currentSlot} UTC slot`);
	}
	const citoMatches = (await fetchCitoMatches()).map(normalizeCitoMatch).filter(Boolean);
	const incomingEvents = citoMatches.map((match) => normalizeMatch(
		match,
		match.status === 'completed' || (match.team1.score !== null && match.team2.score !== null),
		existingEvents.get(match.id),
	)).filter(Boolean);
	const mergedEvents = new Map(existingEvents);
	for (const incoming of incomingEvents) {
		mergedEvents.set(incoming.id, mergeCalendarEvent(mergedEvents.get(incoming.id), incoming));
	}
	const mergedMatches = [...mergedEvents.values()];
	const events = filterMatches(mergedMatches);
	await fs.writeFile(path.join(ROOT, 'jsons', 'finalCalendar.json'), `${JSON.stringify(events, null, 2)}\n`);
	await fs.writeFile(path.join(ROOT, 'ics', 'finalCalendar.ics'), toIcs(events));
	await fs.writeFile(CITO_STATE_PATH, `${JSON.stringify({ lastSuccessfulSlot: currentSlot }, null, 2)}\n`);
	console.log(`Wrote ${events.length} matches to jsons/finalCalendar.json and ics/finalCalendar.ics`);
	return events;
}

module.exports = {
	normalizeTeamName,
	parseDate,
	parseIcsEvents,
	mergeCalendarEvent,
	completedDetailLines,
	buildDescription,
	normalizeMatch,
	normalizeCitoMatch,
	isQualifyingTier,
	citoSlot,
	filterMatches,
	escapeIcsText,
	toIcs,
	generateCalendar,
};

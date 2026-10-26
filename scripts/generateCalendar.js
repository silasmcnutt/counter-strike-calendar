const fs = require('node:fs/promises');
const childProcess = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOOKBACK_DAYS = Number(process.env.MATCH_LOOKBACK_DAYS || 14);
const HLTV_TIME_ZONE = 'Europe/Stockholm';

/**
 * Run the replacement library's Python functions and decode their snapshot.
 *
 * @returns {object} Snapshot from SocksPls/hltv-api.
 */
function fetchHltvSnapshot(startDate, endDate) {
	try {
		const output = childProcess.execFileSync(
			process.env.HLTV_PYTHON || 'python',
			[path.join(__dirname, 'hltv_client.py'), 'snapshot', startDate, endDate],
			{
				encoding: 'utf8',
				env: {
					...process.env,
					HLTV_API_PATH: process.env.HLTV_API_PATH || path.join(ROOT, '..', 'hltv-api'),
					TZ: HLTV_TIME_ZONE,
				},
				maxBuffer: 20 * 1024 * 1024,
				timeout: 10 * 60 * 1000,
			},
		);
		return JSON.parse(output);
	} catch (error) {
		const detail = error?.stderr?.toString().trim() || error.message;
		throw new Error(`HLTV library request failed: ${detail}`);
	}
}

/**
 * Convert the scraper's ranking response into the first 30 named teams.
 *
 * The library returns a list of team records; the fallback shapes also keep
 * this parser tolerant of wrapped snapshots used by older integrations.
 *
 * @param {unknown} response Ranking response.
 * @returns {Set<string>} Normalized top-team names.
 */
function extractTopTeams(response) {
	const candidates = Array.isArray(response)
		? [response[0]?.ranking, response[0]?.data?.ranking, response[0]?.data, response]
		: [response?.topTeams, response?.ranking, response?.data?.ranking, response?.data, response?.results, response?.teams];
	const rows = candidates.find(Array.isArray);
	if (!rows) {
		const preview = JSON.stringify(response).slice(0, 500);
		throw new Error(`Ranking response did not contain a team array. Response: ${preview}`);
	}
	const names = rows
		.map((row) => row?.team?.name || row?.name || row?.teamName)
		.filter((name) => typeof name === 'string' && name.trim())
		.slice(0, 30)
		.map(normalizeTeamName);
	if (names.length === 0) throw new Error('Ranking response did not contain team names');
	return new Set(names);
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
	if (typeof value === 'string') {
		const detailDate = value.match(/^(\d{1,2})(?:st|nd|rd|th) of ([A-Za-z]+) (\d{4})$/);
		if (detailDate) {
			const [, day, month, year] = detailDate;
			const monthNumber = new Date(`${month} 1, ${year}`).getMonth() + 1;
			value = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		}
	}
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && /^\d{1,2}:\d{2}/.test(time)) {
		return parseHltvLocalDate(value, time);
	}
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
		const number = Number(value);
		value = new Date(number < 1e12 ? number * 1000 : number);
	} else {
		value = new Date(value);
	}
	return Number.isNaN(value.getTime()) ? null : value;
}

/**
 * Convert an HLTV local date/time into a UTC Date.
 *
 * The scraper returns the clock time shown by HLTV without a timezone.
 * HLTV uses Central European time, including daylight-saving transitions.
 * `Intl` supplies the correct historical offset without adding a dependency.
 *
 * @param {string} date ISO calendar date.
 * @param {string} time HH:mm or HH:mm:ss clock time.
 * @returns {Date|null} UTC date or null for invalid input.
 */
function parseHltvLocalDate(date, time) {
	const clock = time.length === 5 ? `${time}:00` : time;
	const localAsUtc = new Date(`${date}T${clock}Z`);
	if (Number.isNaN(localAsUtc.getTime())) return null;
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: HLTV_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(localAsUtc);
	const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
	const displayedAsUtc = Date.UTC(
		Number(values.year),
		Number(values.month) - 1,
		Number(values.day),
		Number(values.hour),
		Number(values.minute),
		Number(values.second),
	);
	const offset = displayedAsUtc - localAsUtc.getTime();
	return new Date(localAsUtc.getTime() - offset);
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
 * Adapt a record returned by SocksPls/hltv-api to the calendar's match shape.
 *
 * @param {object} match Raw library match.
 * @param {boolean} isResult Whether this is a completed result.
 * @returns {object} Match in the generator's internal shape.
 */
function adaptLibraryMatch(match, isResult) {
	const id = firstValue(match, ['id', 'matchId', 'match-id']);
	const team1 = firstValue(match, ['team1']);
	const team2 = firstValue(match, ['team2']);
	const date = firstValue(match, ['date']);
	const hour = firstValue(match, ['hour', 'time']);
	const event = firstValue(match, ['event', 'championship']);
	const link = firstValue(match, ['link', 'url']);
	return {
		...match,
		id,
		date,
		hour,
		event,
		link,
		team1: isResult
			? { name: team1, score: firstValue(match, ['team1score']) }
			: team1,
		team2: isResult
			? { name: team2, score: firstValue(match, ['team2score']) }
			: team2,
	};
}

/**
 * Combine one-map rows from get_results_by_date into completed matches.
 *
 * @param {object[]} rows Map-level result rows.
 * @returns {Map<string, object[]>} Maps keyed by match ID.
 */
function collectMapResults(rows) {
	const maps = new Map();
	for (const row of rows || []) {
		const id = firstValue(row, ['id', 'matchId', 'match-id']);
		if (id === undefined || id === null) continue;
		const map = {
			map_name: firstValue(row, ['map', 'mapName']) || 'Unknown map',
			score: {
				[firstValue(row, ['team1']) || 'Team 1']: firstValue(row, ['team1score']),
				[firstValue(row, ['team2']) || 'Team 2']: firstValue(row, ['team2score']),
			},
		};
		if (!maps.has(String(id))) maps.set(String(id), []);
		maps.get(String(id)).push(map);
	}
	return maps;
}

/**
 * Extract the numeric match ID from the API's HLTV match link.
 *
 * Upcoming-match records expose `link` instead of a separate `id`, while
 * result records expose both. Using the link keeps upcoming events stable and
 * allows them to be deduplicated against a later completed result.
 *
 * @param {unknown} link Match link such as `/matches/2399739/team-a-vs-team-b`.
 * @returns {string|null} Match ID or null when the link is not recognized.
 */
function matchIdFromLink(link) {
	if (typeof link !== 'string') return null;
	const match = link.match(/\/matches\/(\d+)/);
	return match ? match[1] : null;
}

/**
 * Extract the API route components from an HLTV match link.
 *
 * @param {unknown} link Match link.
 * @returns {{id: string, name: string}|null} Detail route components.
 */
function matchRouteFromLink(link) {
	if (typeof link !== 'string') return null;
	const match = link.match(/^\/matches\/(\d+)\/([^/?#]+)$/);
	return match ? { id: match[1], name: match[2] } : null;
}

/**
 * Merge detail data without allowing the API's null placeholder fields to
 * erase valid values from the results list.
 *
 * @param {object} result Result-list record.
 * @param {object} detail Match-detail record.
 * @returns {object} Combined match record.
 */
function mergeMatchDetail(result, detail) {
	const merged = { ...result };
	for (const [key, value] of Object.entries(detail || {})) {
		if (value === null || value === undefined || value === '') continue;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			merged[key] = { ...(merged[key] || {}), ...mergeMatchDetail(merged[key] || {}, value) };
		} else {
			merged[key] = value;
		}
	}
	return merged;
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
	const id = firstValue(match, ['id', 'matchId']) || matchIdFromLink(match.link);
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
 * Keep only matches involving a top-30 team in the requested date window.
 *
 * @param {object[]} matches Normalized matches.
 * @param {Set<string>} topTeams Normalized top-team names.
 * @param {Date} now Current time.
 * @returns {object[]} Filtered, deduplicated matches.
 */
function filterMatches(matches, topTeams, now = new Date()) {
	const earliest = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
	const seen = new Set();
	return matches
		.filter((match) => {
			const start = new Date(match.start);
			const inWindow = start >= earliest;
			const hasTopTeam = (match.teams || []).some((team) => topTeams.has(normalizeTeamName(team)));
			if (!inWindow || !hasTopTeam || seen.has(match.id)) return false;
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
	const icsPath = path.join(ROOT, 'ics', 'finalCalendar.ics');
	const existingIcs = await fs.readFile(icsPath, 'utf8').catch(() => '');
	const existingEvents = parseIcsEvents(existingIcs);
	const now = new Date();
	const startDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	const endDate = now.toISOString().slice(0, 10);
	console.log('Fetching HLTV data with SocksPls/hltv-api...');
	const snapshot = fetchHltvSnapshot(startDate, endDate);
	if (snapshot.mapResultsError) {
		console.warn(`Map scores unavailable from hltv-api: ${snapshot.mapResultsError}`);
	}
	const topTeams = extractTopTeams(snapshot);
	const upcomingRows = (snapshot.upcoming || []).map((match) => adaptLibraryMatch(match, false));
	const resultRows = (snapshot.results || []).map((match) => adaptLibraryMatch(match, true));
	const mapResults = collectMapResults(snapshot.mapResults);
	for (const result of resultRows) {
		const id = String(result.id);
		if (mapResults.has(id)) result.maps = mapResults.get(id);
	}
	const resultCandidates = resultRows.filter((match) => {
		const team1 = teamName(match.team1);
		const team2 = teamName(match.team2);
		return team1 && team2 && [team1, team2].some((team) => topTeams.has(normalizeTeamName(team)));
	});
	const upcomingCandidates = upcomingRows.filter((match) => {
		const team1 = teamName(match.team1);
		const team2 = teamName(match.team2);
		return team1 && team2 && [team1, team2].some((team) => topTeams.has(normalizeTeamName(team)));
	});
	const incomingEvents = [
		...upcomingCandidates.map((match) => {
			const id = firstValue(match, ['id', 'matchId']) || matchIdFromLink(match.link);
			return normalizeMatch(match, false, existingEvents.get(String(id)));
		}),
		...resultCandidates.map((match) => {
			const id = firstValue(match, ['id', 'matchId']) || matchIdFromLink(match.link);
			return normalizeMatch(match, true, existingEvents.get(String(id)));
		}),
	].filter(Boolean);
	const mergedEvents = new Map(existingEvents);
	for (const incoming of incomingEvents) {
		mergedEvents.set(incoming.id, mergeCalendarEvent(mergedEvents.get(incoming.id), incoming));
	}
	const matches = [...mergedEvents.values()];
	const events = filterMatches(matches, topTeams);
	await fs.writeFile(path.join(ROOT, 'jsons', 'finalCalendar.json'), `${JSON.stringify(events, null, 2)}\n`);
	await fs.writeFile(path.join(ROOT, 'ics', 'finalCalendar.ics'), toIcs(events));
	console.log(`Wrote ${events.length} matches to jsons/finalCalendar.json and ics/finalCalendar.ics`);
	return events;
}

module.exports = {
	extractTopTeams,
	normalizeTeamName,
	parseDate,
	mergeMatchDetail,
	parseIcsEvents,
	mergeCalendarEvent,
	completedDetailLines,
	buildDescription,
	normalizeMatch,
	adaptLibraryMatch,
	collectMapResults,
	filterMatches,
	escapeIcsText,
	toIcs,
	generateCalendar,
};

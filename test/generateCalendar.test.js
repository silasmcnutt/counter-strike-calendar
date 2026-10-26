const test = require('node:test');
const assert = require('node:assert/strict');
const {
	extractTopTeams,
	normalizeMatch,
	mergeMatchDetail,
	mergeCalendarEvent,
	filterMatches,
	toIcs,
} = require('../scripts/generateCalendar');

test('extracts the first 30 teams from nested ranking rows', () => {
	const rankings = Array.from({ length: 31 }, (_, index) => ({ rank: index + 1, team: { name: `Team ${index + 1}` } }));
	const teams = extractTopTeams([{ ranking: rankings }]);
	assert.equal(teams.size, 30);
	assert.equal(teams.has('team30'), true);
	assert.equal(teams.has('team31'), false);
});

test('extracts rankings from nested data wrappers', () => {
	const teams = extractTopTeams({ data: { ranking: [{ name: 'Spirit' }] } });
	assert.deepEqual([...teams], ['spirit']);
});

test('converts completed HLTV time to UTC', () => {
	const match = normalizeMatch({
		id: 42,
		date: '25th of October 2026',
		hour: '12:00',
		team1: { name: 'Spirit', score: 2 },
		team2: { name: 'G2', score: 1 },
		map: 'bo3',
		event: { name: 'Example event' },
	}, true);
	assert.equal(match.summary, 'Spirit vs G2 (2-1)');
	assert.equal(match.start, '2026-10-25T11:00:00.000Z');
	assert.match(match.description, /Final score: Spirit 2 - G2 1/);
});

test('parses the scraper API match-detail date format', () => {
	const match = normalizeMatch({
		id: 2399736,
		date: '26th of October 2026',
		hour: '09:00',
		team1: { name: 'Nemiga', score: '0' },
		team2: { name: 'Aurora', score: '2' },
		map: 'bo3',
		event: 'PGL Masters Bucharest 2026',
	}, true);
	assert.equal(match.start, '2026-10-26T08:00:00.000Z');
	assert.equal(match.summary, 'Nemiga vs Aurora (0-2)');
});

test('preserves results when match details contain null placeholders', () => {
	const result = {
		id: '2399725',
		date: '2026-10-24',
		link: '/matches/2399725/g2-vs-natus-vincere',
		team1: { name: 'G2', score: '2' },
		team2: { name: 'Natus Vincere', score: '0' },
		event: 'PGL Masters Bucharest 2026',
		map: 'bo3',
	};
	const detail = {
		date: null,
		hour: null,
		event: null,
		team1: { name: null, score: null },
		team2: { name: null, score: null },
	};
	const match = normalizeMatch(mergeMatchDetail(result, detail), true);
	assert.equal(match, null);
});

test('normalizes upcoming matches using their API link as the match ID', () => {
	const match = normalizeMatch({
		link: '/matches/2399739/spirit-vs-furia',
		date: '2026-10-27',
		hour: '15:00',
		meta: 'bo3',
		event: 'Example event',
		team1: { name: 'Spirit' },
		team2: { name: 'FURIA' },
	}, false);
	assert.equal(match.id, '2399739');
	assert.equal(match.summary, 'Spirit vs FURIA');
	assert.match(match.description, /Event: Example event/);
	assert.match(match.description, /Status: scheduled/);
	assert.equal(match.start, '2026-10-27T14:00:00.000Z');
});

test('includes map scores without player statistics in completed descriptions', () => {
	const match = normalizeMatch({
		id: 7,
		date: '26th of October 2026',
		hour: '09:00',
		team1: { name: 'Spirit', score: '2' },
		team2: { name: 'G2', score: '1' },
		map: 'bo3',
		event: 'Example event',
		maps: [{ map_name: 'Mirage', score: { Spirit: '16', G2: '12' } }],
	}, true);
	assert.match(match.description, /Map scores:\n- Mirage: Spirit 16 - G2 12/);
	assert.doesNotMatch(match.description, /Player statistics|donk|K-D/);
});

test('merges detail maps alongside the match object', () => {
	const result = {
		id: '2399736',
		date: '2026-10-26',
		team1: { name: 'Nemiga', score: '0' },
		team2: { name: 'Aurora', score: '2' },
	};
	const detail = {
		match: { date: '26th of October 2026', hour: '09:00' },
		maps: [{ map_name: 'Mirage', score: { Nemiga: '14', Aurora: '16' } }],
	};
	const merged = mergeMatchDetail(result, {
		...detail.match,
		maps: detail.maps,
	});
	const match = normalizeMatch(merged, true);
	assert.match(match.description, /Mirage: Nemiga 14 - Aurora 16/);
	assert.doesNotMatch(match.description, /Player statistics/);
});

test('keeps matches with either top team and removes duplicates', () => {
	const now = new Date('2026-10-26T12:00:00Z');
	const matches = [
		{ id: '1', start: '2026-10-26T10:00:00.000Z', teams: ['Spirit', 'Unknown'] },
		{ id: '1', start: '2026-10-26T10:00:00.000Z', teams: ['Spirit', 'Unknown'] },
		{ id: '2', start: '2026-10-01T10:00:00.000Z', teams: ['Spirit', 'G2'] },
	];
	assert.deepEqual(filterMatches(matches, new Set(['spirit']), now).map(({ id }) => [id]), [['1']]);
});

test('writes UTC DTSTART and escaped ICS text', () => {
	const ics = toIcs([{ id: '1', start: '2026-10-26T10:00:00.000Z', end: '2026-10-26T13:00:00.000Z', summary: 'A, B', description: 'Line 1\nLine 2', location: 'Event' }]);
	assert.match(ics, /DTSTART:20261026T100000Z/);
	assert.match(ics, /SUMMARY:A\\, B/);
	assert.match(ics, /DESCRIPTION:Line 1\\nLine 2/);
});

test('preserves an existing start when result details omit the time', () => {
	const incoming = normalizeMatch({
		id: '1',
		date: '2026-10-24',
		team1: { name: 'G2', score: '2' },
		team2: { name: 'Natus Vincere', score: '0' },
		event: 'Example event',
		map: 'bo3',
	}, true, {
		start: '2026-10-24T10:00:00.000Z',
		end: '2026-10-24T13:00:00.000Z',
	});
	assert.equal(incoming.start, '2026-10-24T10:00:00.000Z');
	assert.equal(mergeCalendarEvent({ id: '1', start: '2026-10-24T10:00:00.000Z' }, incoming).start, '2026-10-24T10:00:00.000Z');
});

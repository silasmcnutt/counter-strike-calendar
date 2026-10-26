const test = require('node:test');
const assert = require('node:assert/strict');
const {
	normalizeMatch,
	mergeCalendarEvent,
	normalizeCitoMatch,
	isQualifyingTier,
	citoSlot,
	filterMatches,
	toIcs,
} = require('../scripts/generateCalendar');

test('keeps only S and A tier Cito matches', () => {
	assert.equal(isQualifyingTier('S'), true);
	assert.equal(isQualifyingTier('A'), true);
	assert.equal(isQualifyingTier('B'), false);
	assert.equal(normalizeCitoMatch({
		id: 'cs2-match-1',
		startsAt: '2026-10-26T18:00:00.000Z',
		status: 'upcoming',
		event: { name: 'Example', tier: 'A' },
		bestOf: 3,
		team1Name: 'Spirit',
		team2Name: 'G2',
		team1Score: null,
		team2Score: null,
	}).event, 'Example');
	assert.equal(normalizeCitoMatch({
		id: 'cs2-match-2',
		startsAt: '2026-10-26T18:00:00.000Z',
		event: { name: 'Lower tier', tier: 'B' },
		team1Name: 'Spirit',
		team2Name: 'G2',
	}), null);
});

test('creates 12-hour UTC Cito slots', () => {
	assert.equal(citoSlot(new Date('2026-10-26T00:00:00.000Z')), '2026-10-26-00');
	assert.equal(citoSlot(new Date('2026-10-26T12:00:00.000Z')), '2026-10-26-12');
});

test('normalizes upcoming Cito matches', () => {
	const match = normalizeMatch({
		id: 'cs2-match-2399739',
		date: '2026-10-27T14:00:00.000Z',
		format: 'BO3',
		event: 'Example event',
		team1: { name: 'Spirit' },
		team2: { name: 'FURIA' },
	}, false);
	assert.equal(match.id, 'cs2-match-2399739');
	assert.equal(match.summary, 'Spirit vs FURIA');
	assert.match(match.description, /Event: Example event/);
	assert.match(match.description, /Status: scheduled/);
	assert.equal(match.start, '2026-10-27T14:00:00.000Z');
});

test('includes map scores without player statistics in completed descriptions', () => {
	const match = normalizeMatch({
		id: 7,
		date: '2026-10-26T08:00:00.000Z',
		team1: { name: 'Spirit', score: '2' },
		team2: { name: 'G2', score: '1' },
		map: 'bo3',
		event: 'Example event',
		maps: [{ map_name: 'Mirage', score: { Spirit: '16', G2: '12' } }],
	}, true);
	assert.match(match.description, /Map scores:\n- Mirage: Spirit 16 - G2 12/);
	assert.doesNotMatch(match.description, /Player statistics|donk|K-D/);
});

test('keeps matches with either top team and removes duplicates', () => {
	const now = new Date('2026-10-26T12:00:00Z');
	const matches = [
		{ id: '1', start: '2026-10-26T10:00:00.000Z', teams: ['Spirit', 'Unknown'] },
		{ id: '1', start: '2026-10-26T10:00:00.000Z', teams: ['Spirit', 'Unknown'] },
		{ id: '2', start: '2026-10-01T10:00:00.000Z', teams: ['Spirit', 'G2'] },
	];
	assert.deepEqual(filterMatches(matches, now).map(({ id }) => [id]), [['1']]);
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
		date: undefined,
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

test('updates an existing event with newly available Cito results', () => {
	const existing = {
		id: 'cs2-match-1',
		start: '2026-10-26T18:00:00.000Z',
		end: '2026-10-26T21:00:00.000Z',
		summary: 'Spirit vs G2',
		description: 'Status: scheduled',
	};
	const incoming = normalizeMatch({
		id: 'cs2-match-1',
		date: '2026-10-26T18:00:00.000Z',
		event: { name: 'Example event' },
		team1: { name: 'Spirit', score: 2 },
		team2: { name: 'G2', score: 1 },
	}, true, existing);
	const updated = mergeCalendarEvent(existing, incoming);
	assert.equal(updated.id, existing.id);
	assert.equal(updated.summary, 'Spirit vs G2 (2-1)');
	assert.match(updated.description, /Final score: Spirit 2 - G2 1/);
});

test('removes events at and beyond the two-week threshold', () => {
	const now = new Date('2026-10-26T12:00:00.000Z');
	const matches = [
		{ id: 'exact', start: '2026-10-12T12:00:00.000Z' },
		{ id: 'old', start: '2026-10-12T11:59:59.000Z' },
		{ id: 'recent', start: '2026-10-12T12:00:01.000Z' },
		{ id: 'future', start: '2026-11-01T12:00:00.000Z' },
	];
	assert.deepEqual(filterMatches(matches, now).map(({ id }) => id), ['recent', 'future']);
});

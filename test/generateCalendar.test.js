const test = require('node:test');
const assert = require('node:assert/strict');
const {
	normalizeMatch,
	parseIcsEvents,
	mergeCalendarEvent,
	normalizeCitoMatch,
	isQualifyingPrestige,
	isQualifyingEvent,
	citoSlot,
	isCitoSlot,
	filterMatches,
	toIcs,
} = require('../scripts/generateCalendar');

test('uses the documented default event filter thresholds', () => {
	assert.equal(isQualifyingEvent({ prestigeScore: 80, prizePool: 100000 }), true);
	assert.equal(isQualifyingEvent({ prestigeScore: 79.99, prizePool: 100000 }), false);
	assert.equal(isQualifyingEvent({ prestigeScore: 80, prizePool: 99999 }), false);
});

test('keeps only matches with qualifying prestige and prize pool', () => {
	assert.equal(isQualifyingPrestige(80), true);
	assert.equal(isQualifyingPrestige(100), true);
	assert.equal(isQualifyingPrestige(79), false);
	assert.equal(isQualifyingEvent({ prestigeScore: 80, prizePool: 100000 }), true);
	assert.equal(isQualifyingEvent({ prestigeScore: 80, prizePool: '$100,000' }), true);
	assert.equal(isQualifyingEvent({ prestigeScore: 80, prizePool: 99999 }), false);
	assert.equal(isQualifyingEvent({ prestigeScore: 79, prizePool: 100000 }), false);
	assert.equal(normalizeCitoMatch({
		id: 'cs2-match-1',
		startsAt: '2026-10-26T18:00:00.000Z',
		status: 'upcoming',
		event: { name: 'Example', prestigeScore: 80, prizePool: 100000 },
		bestOf: 3,
		team1Name: 'Spirit',
		team2Name: 'G2',
		team1Score: null,
		team2Score: null,
	}).event, 'Example');
	assert.equal(normalizeCitoMatch({
		id: 'cs2-match-2',
		startsAt: '2026-10-26T18:00:00.000Z',
		event: { name: 'Lower prestige', prestigeScore: 79 },
		team1Name: 'Spirit',
		team2Name: 'G2',
	}), null);
	assert.equal(normalizeCitoMatch({
		id: 'cs2-match-3',
		startsAt: '2026-10-26T18:00:00.000Z',
		event: { name: 'Lower prize pool', prestigeScore: 80, prizePool: 99999 },
		team1Name: 'Spirit',
		team2Name: 'G2',
	}), null);
});

test('creates three-hour Eastern Cito slots', () => {
	assert.equal(citoSlot(new Date('2026-10-26T04:00:00.000Z')), '2026-10-26-00');
	assert.equal(citoSlot(new Date('2026-10-26T07:00:00.000Z')), '2026-10-26-03');
	assert.equal(isCitoSlot(new Date('2026-10-26T04:00:00.000Z')), true);
	assert.equal(isCitoSlot(new Date('2026-10-26T04:07:00.000Z')), true);
	assert.equal(isCitoSlot(new Date('2026-10-26T05:00:00.000Z')), false);
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
	assert.match(match.description, /Status: scheduled/);
	assert.equal(match.location, 'Example event');
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
	assert.match(match.description, /Status: completed/);
	assert.doesNotMatch(match.description, /Event:|Match ID:/);
	assert.doesNotMatch(match.description, /Player statistics|donk|K-D/);
});

test('omits incomplete scores from title and marks the description in progress', () => {
	const match = normalizeMatch({
		id: 8,
		date: '2026-10-26T08:00:00.000Z',
		team1: { name: 'Spirit', score: 1 },
		team2: { name: 'G2', score: null },
		event: 'Example event',
	}, true);
	assert.equal(match.summary, 'Spirit vs G2');
	assert.match(match.description, /Status: in progress/);
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

test('removes legacy event name and match ID lines from existing descriptions', () => {
	const ics = toIcs([{
		id: '1',
		start: '2026-10-26T10:00:00.000Z',
		end: '2026-10-26T13:00:00.000Z',
		summary: 'Spirit vs G2',
		description: 'Event: Example\nFormat: BO3\nMatch ID: 1\nStatus: completed',
		location: 'Example',
	}]);
	assert.equal(parseIcsEvents(ics).get('1').description, 'Format: BO3\nStatus: completed');
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

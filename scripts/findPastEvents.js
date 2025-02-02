const fs = require('fs');
const path = require('path');
const { HLTV } = require('hltv');

const outputJsonFilePath = path.join(
	__dirname,
	'../jsons/matchesFromPastMonth.json'
); // Path to save the matches data

async function fetchPastMatches(startDate, endDate) {
	try {
		// ---------------------------- Past Events ---------------------------- /
		console.log('Fetching past month results...');
		const pastResults = await HLTV.getPastEvents({
			startDate,
			endDate,
			prizePoolMin: 175000, // Filter events based on minimum prize pool
		});

		console.log('Filtering past results based on prize pool...');
		const filteredPastResults = pastResults.filter((event) => {
			const prizePoolNumber = parsePrizePool(event.prizePool || '');
			return prizePoolNumber >= 175000;
		});

		console.log(
			'Filtered past results with prize pool filter:',
			filteredPastResults.length
		);

		// ---------------------------- Current Events ---------------------------- //

		console.log('Fetching current results...');
		const currentEvents = await HLTV.getEvents();

		console.log('Filtering featured events...');
		const featuredEvents = currentEvents.filter((event) => event.featured);

		console.log('Filtering based on start date...');
		const now = Date.now();
		const filteredFeaturedEvents = featuredEvents.filter(
			(event) => event.dateStart <= now
		);

		// ---------------------------- Doing Stuff ---------------------------- /

		// Add event IDs to a single array
		const eventIds = [];
		filteredPastResults.forEach((event) => {
			eventIds.push(event.id);
		});
		filteredFeaturedEvents.forEach((event) => {
			eventIds.push(event.id);
		});

		console.log('Fetching results for event IDs:', eventIds);

		const resultsPromises = eventIds.map((id) =>
			HLTV.getResults({ eventIds: [id] })
		);
		const results = (await Promise.all(resultsPromises)).flat(); // Flatten the results array

		return formatMatches(results);
	} catch (error) {
		console.error('Error fetching past matches:', error.message);
		return [];
	}
}

function parsePrizePool(prizePool) {
	return parseInt(prizePool.replace(/[^0-9]/g, ''), 10) || 0;
}

function formatMatches(matches) {
	return matches
		.map((match) => {
			if (!match || !match.team1 || !match.team2 || !match.result) {
				return null;
			}

			const startTime = new Date(match.date - 3 * 60 * 60 * 1000);
			const endTime = new Date(startTime.getTime() + 3 * 60 * 60 * 1000); // Assuming a 2-hour match

			return {
				start: startTime.toISOString(),
				end: endTime.toISOString(),
				summary: `(${match.result.team1}) ${match.team1.name} vs (${match.result.team2}) ${match.team2.name}`,
				description: `Format: ${match.format} | Match ID: ${match.id}`,
				location: match.location || 'No location.',
			};
		})
		.filter(Boolean); // Remove any null entries
}

function saveMatchesToJson(matches, filePath) {
	fs.writeFileSync(filePath, JSON.stringify(matches, null, 2));
	console.log(`Matches data saved to ${filePath}`);
}

async function main() {
	const oneMonthAgo = new Date();
	oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
	const today = new Date();
	const startDate = formatDate(oneMonthAgo);
	const endDate = formatDate(today);

	const pastMatches = await fetchPastMatches(startDate, endDate);

	saveMatchesToJson(pastMatches, outputJsonFilePath);
}

function formatDate(date) {
	return date.toISOString().split('T')[0];
}

main();

const fs = require('fs');
const path = require('path');
const { HLTV } = require('hltv'); // Ensure you have HLTV library or the appropriate API for fetching events and matches

async function fetchUpcomingMatches() {
	console.log('Fetching upcoming matches...');

	const jsonFilePath = path.join(__dirname, '../jsons/futureMatches.json'); // Path to the output file

	try {
		const today = new Date();
		const nextMonth = new Date(today);
		nextMonth.setMonth(today.getMonth() + 1);

		const events = await HLTV.getEvents();

		// Check if events are retrieved correctly
		if (!events || !Array.isArray(events)) {
			throw new Error('No events data or events data is not an array');
		}

		const upcomingEvents = events.filter((event) => {
			const eventDate = new Date(event.dateEnd);
			return (
				event.featured === true && eventDate >= today && eventDate <= nextMonth
			);
		});

		upcomingEventIds = [];
		upcomingEvents.forEach((event) => {
			upcomingEventIds.push(event.id);
		});
		console.log(upcomingEventIds);

		// Check if upcomingEvents are retrieved correctly
		if (!upcomingEvents || !Array.isArray(upcomingEvents)) {
			throw new Error(
				'No upcoming events data or upcoming events data is not an array'
			);
		}

		const upcomingMatches = await HLTV.getMatches({
			eventIds: upcomingEventIds,
		});

		// Check if upcomingMatches are retrieved correctly
		if (!upcomingMatches || !Array.isArray(upcomingMatches)) {
			throw new Error(
				'No upcoming matches data or upcoming matches data is not an array'
			);
		}

		let calendarData = [];

		upcomingMatches.forEach((match) => {
			// Check if match properties are defined
			if (match && match.id && match.team1 && match.team2) {
				// Exclude matches where both teams are unknown
				if (match.team1.name !== 'Unknown' && match.team2.name !== 'Unknown') {
					// Parse the date and handle errors
					console.log(match.date);
					let startDate = new Date(match.date - 5 * 60 * 60 * 1000);
					if (isNaN(startDate.getTime())) {
						startDate = new Date(Number(match.date - 5 * 60 * 60 * 1000));
						if (isNaN(startDate.getTime())) {
							console.warn(
								`Invalid date for match ID: ${match.id}, date: ${match.date}`
							);
							return; // Skip this match if the date is invalid
						}
					}

					const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000);

					const matchData = {
						start: new Date(startDate.getTime()).toISOString(),
						end: new Date(endDate.getTime()).toISOString(),
						summary: `${match.team1.name} vs ${match.team2.name}`,
						description: `Format: bo3 | Match ID: ${match.id}`,
						location:
							match.event && match.event.name
								? match.event.name
								: 'No location.',
					};

					calendarData.push(matchData);
				}
			} else {
				console.warn('Match data is incomplete:', match.id);
			}
		});

		fs.writeFileSync(jsonFilePath, JSON.stringify(calendarData, null, 2));
		console.log(`Upcoming matches saved to ${jsonFilePath}`);
	} catch (error) {
		console.error(
			'Error fetching or processing upcoming matches:',
			error.message
		);
	}
}

// Run the script
fetchUpcomingMatches();

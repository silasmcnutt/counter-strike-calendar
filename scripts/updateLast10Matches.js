const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

async function updateLast10Events() {
	const calendarJsonFilePath = path.join(
		__dirname,
		'../jsons/calendarData_filtered.json'
	);
	const matchDataDirectory = path.join(__dirname, '../downloadedPages');
	const browser = await puppeteer.launch({
		executablePath:
			process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
		headless: true,
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-gpu',
			'--disable-dev-shm-usage',
			'--hide-scrollbars',
			'--mute-audio',
		],
	});

	const page = await browser.newPage();

	// Ensure the matchData directory exists
	if (!fs.existsSync(matchDataDirectory)) {
		console.error(`Directory not found: ${matchDataDirectory}`);
		return;
	}

	// Read the current calendar data
	let calendarData = fs.existsSync(calendarJsonFilePath)
		? JSON.parse(fs.readFileSync(calendarJsonFilePath, 'utf-8'))
		: [];

	// Extract the last 10 match IDs from the calendar data
	const today = new Date();
	const last10Matches = calendarData
		.filter((event) => new Date(event.end) < today) // Filter events that have ended
		.sort((a, b) => new Date(b.end) - new Date(a.end)) // Sort by end date descending
		.slice(0, 10);

	const last10MatchIds = last10Matches
		.map((event) => {
			const matchIdMatch = event.description.match(/Match ID: (\d+)/);
			return matchIdMatch ? matchIdMatch[1] : null;
		})
		.filter((id) => id !== null);

	console.log(last10MatchIds);

	// Remove the last 10 events from the calendar data
	const updatedCalendarData = calendarData.filter(
		(event) => !last10Matches.includes(event)
	);

	const updatedMatches = [];

	for (const matchId of last10MatchIds) {
		const matchUrl = `https://www.hltv.org/matches/${matchId}/match`;
		try {
			await page.goto(matchUrl, { waitUntil: 'networkidle2' });

			const matchInfo = await page.evaluate((matchId) => {
				const team1Name =
					document
						.querySelector('.team1-gradient .teamName')
						?.innerText.trim() || 'N/A';
				const team1Score =
					document
						.querySelector('.team1-gradient .won, .team1-gradient .lost')
						?.innerText.trim() || null;
				const team2Name =
					document
						.querySelector('.team2-gradient .teamName')
						?.innerText.trim() || 'N/A';
				const team2Score =
					document
						.querySelector('.team2-gradient .won, .team2-gradient .lost')
						?.innerText.trim() || null;

				// Extract the time data-unix attribute
				const timeUnix =
					document.querySelector('div.time')?.getAttribute('data-unix') || null;

				let startTime = 'N/A';
				if (timeUnix && !isNaN(parseInt(timeUnix, 10))) {
					// Convert Unix time to a Date object
					let startDate = new Date(parseInt(timeUnix, 10));

					// Subtract 4 hours
					startDate = new Date(startDate.getTime() - 5 * 60 * 60 * 1000);

					// Convert to ISO string
					startTime = startDate.toISOString();
				}

				// Format the summary based on the score availability
				let summary;
				if (team1Score === null && team2Score === null) {
					summary = `(Live) ${team1Name} vs. ${team2Name}`;
				} else {
					summary = `(${team1Score ?? 'N/A'}) ${team1Name} vs. (${
						team2Score ?? 'N/A'
					}) ${team2Name}`;
				}

				return {
					summary,
					start: startTime,
					end:
						startTime !== 'N/A'
							? new Date(
									new Date(startTime).getTime() + 3 * 60 * 60 * 1000
							  ).toISOString()
							: 'N/A',
					description: `Match ID: ${matchId}`,
				};
			}, matchId);

			console.log(`Fetched match data for ID ${matchId}.`);
			console.log(`Start Time (with -4 hours): ${matchInfo.start}`);
			updatedMatches.push(matchInfo);
		} catch (error) {
			console.error(
				`Error fetching match data for ID ${matchId}: ${error.message}`
			);
		}
	}

	// Combine updated calendar data with new match data
	const combinedCalendarData = [...updatedCalendarData, ...updatedMatches];

	// Sort by start time
	combinedCalendarData.sort((a, b) => new Date(a.start) - new Date(b.start));

	// Save the updated calendar data to the JSON file
	fs.writeFileSync(
		calendarJsonFilePath,
		JSON.stringify(combinedCalendarData, null, 2),
		'utf-8'
	);
	console.log('Calendar data updated with new match events.');

	await browser.close();
}

// Run the script
updateLast10Events();

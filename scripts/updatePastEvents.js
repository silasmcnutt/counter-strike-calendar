const fs = require('fs');
const path = require('path');

// Paths to JSON files
const baseJsonFilePath = path.join(
	__dirname,
	'../jsons/calendarData_filtered.json'
);
const newMatchesFilePath = path.join(
	__dirname,
	'../jsons/matchesFromPastMonth.json'
);

// Function to load JSON from a file
function loadJsonFile(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Function to save JSON to a file
function saveJsonFile(filePath, data) {
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Function to extract match ID from description
function extractMatchId(description) {
	const matchIdMatch = description.match(/Match ID: (\d+)/);
	return matchIdMatch ? matchIdMatch[1] : null;
}

// Function to compare and update JSON files
function updateCalendarWithNewMatches(baseFilePath, newMatchesFilePath) {
	const baseData = loadJsonFile(baseFilePath);
	const newMatchesData = loadJsonFile(newMatchesFilePath);

	const baseIds = new Set(
		baseData.map((event) => extractMatchId(event.description))
	);
	const newMatchesToAdd = newMatchesData.filter((match) => {
		const matchId = extractMatchId(match.description);
		return matchId && !baseIds.has(matchId);
	});

	if (newMatchesToAdd.length > 0) {
		console.log(`Found ${newMatchesToAdd.length} new matches to add.`);
		baseData.push(...newMatchesToAdd);
	} else {
		console.log('No new matches to add.');
	}

	// Sort by start time
	baseData.sort((a, b) => new Date(a.start) - new Date(b.start));

	// Save updated and sorted data to the base file
	saveJsonFile(baseFilePath, baseData);
	console.log(`Updated and sorted ${baseFilePath} with new matches.`);
}

// Run the script
updateCalendarWithNewMatches(baseJsonFilePath, newMatchesFilePath);

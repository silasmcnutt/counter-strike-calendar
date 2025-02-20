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

// Function to load JSON from a file safely
function loadJsonFile(filePath) {
	try {
		if (!fs.existsSync(filePath)) {
			console.warn(`Warning: ${filePath} not found. Initializing as empty.`);
			return [];
		}
		const data = fs.readFileSync(filePath, 'utf8');
		return data.trim() ? JSON.parse(data) : [];
	} catch (error) {
		console.error(`Error reading or parsing ${filePath}:`, error.message);
		return [];
	}
}

// Function to save JSON to a file
function saveJsonFile(filePath, data) {
	try {
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
		console.log(`Successfully updated ${filePath}`);
	} catch (error) {
		console.error(`Error saving ${filePath}:`, error.message);
	}
}

// Function to extract match ID from description
function extractMatchId(description) {
	const matchIdMatch = description?.match(/Match ID: (\d+)/);
	return matchIdMatch ? matchIdMatch[1] : null;
}

// Function to compare and update JSON files
function updateCalendarWithNewMatches(baseFilePath, newMatchesFilePath) {
	const baseData = loadJsonFile(baseFilePath);
	const newMatchesData = loadJsonFile(newMatchesFilePath);

	const baseIds = new Set(
		baseData.map((event) => extractMatchId(event.description)).filter(Boolean)
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
}

// Run the script
updateCalendarWithNewMatches(baseJsonFilePath, newMatchesFilePath);

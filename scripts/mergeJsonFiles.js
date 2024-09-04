const fs = require('fs');
const path = require('path');

function mergeJsonFiles(file1Path, file2Path, outputPath) {
	try {
		// Read the contents of the first JSON file
		const file1Data = fs.readFileSync(file1Path, 'utf-8');
		const file1Json = JSON.parse(file1Data);

		// Read the contents of the second JSON file
		const file2Data = fs.readFileSync(file2Path, 'utf-8');
		const file2Json = JSON.parse(file2Data);

		// Extract all match IDs from the first JSON file
		const existingMatchIds = new Set(
			file1Json
				.map((event) => {
					const matchIdMatch = event.description.match(/Match ID: (\d+)/);
					return matchIdMatch ? matchIdMatch[1] : null;
				})
				.filter(Boolean)
		);

		// Filter out events from file2Json that have duplicate match IDs
		const uniqueEvents = file2Json.filter((event) => {
			const matchIdMatch = event.description.match(/Match ID: (\d+)/);
			const matchId = matchIdMatch ? matchIdMatch[1] : null;
			return matchId && !existingMatchIds.has(matchId);
		});

		// Combine the contents of both JSON files
		const combinedJson = [...file1Json, ...uniqueEvents];

		// Write the combined data to the output file
		fs.writeFileSync(
			outputPath,
			JSON.stringify(combinedJson, null, 2),
			'utf-8'
		);
		console.log(`Files merged successfully into ${outputPath}`);
	} catch (error) {
		console.error('Error merging JSON files:', error.message);
	}
}

// Define paths to the JSON files
const file1Path = path.join(__dirname, '../jsons/calendarData_filtered.json'); // Replace with your first file path
const file2Path = path.join(__dirname, '../jsons/futureMatches.json'); // Replace with your second file path
const outputPath = path.join(__dirname, '../jsons/finalCalendar.json'); // Path to the output file

// Call the function to merge the files
mergeJsonFiles(file1Path, file2Path, outputPath);

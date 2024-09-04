const fs = require('fs');
const path = require('path');

// Function to remove future events from JSON
function removeFutureEvents(jsonFilePath, outputJsonFilePath) {
	try {
		// Read the JSON file
		const data = fs.readFileSync(jsonFilePath, 'utf-8');
		if (!data) {
			console.error('Error: JSON file is empty or could not be read.');
			return;
		}

		const events = JSON.parse(data);

		// Get the current time
		const now = new Date();

		// Filter out events where the start time is after the current time
		const filteredEvents = events.filter(
			(event) => new Date(event.start) <= now
		);

		if (filteredEvents.length === 0) {
			console.log('No events are in the past.');
		} else {
			// Write the updated JSON file
			fs.writeFileSync(
				outputJsonFilePath,
				JSON.stringify(filteredEvents, null, 2)
			);
			console.log(`Updated JSON file saved: ${outputJsonFilePath}`);
		}
	} catch (error) {
		console.error('Error:', error.message);
	}
}

// File paths
const inputJsonFilePath = path.join(__dirname, '../jsons/calendarData.json'); // Replace with your input JSON file path
const outputJsonFilePath = path.join(
	__dirname,
	'../jsons/calendarData_filtered.json'
); // Replace with your desired output JSON file path

// Remove future events from JSON
removeFutureEvents(inputJsonFilePath, outputJsonFilePath);

const fs = require('fs');
const path = require('path');
const ical = require('ical'); // Import the ical library

// Function to convert ICS to JSON
function convertIcsToJson(icsFilePath, jsonFilePath) {
	try {
		// Read ICS file
		const icsData = fs.readFileSync(icsFilePath, 'utf-8');
		if (!icsData) {
			console.error('Error: ICS file is empty or could not be read.');
			return;
		}

		// Parse ICS data
		const parsedData = ical.parseICS(icsData);

		// Extract events
		const events = Object.values(parsedData)
			.filter((event) => event.type === 'VEVENT')
			.map((event) => ({
				summary: event.summary || 'No Summary',
				start: event.start.toISOString(),
				end: event.end.toISOString(),
				description: event.description || 'No Description',
				location: event.location || 'No Location',
				id: event.uid || 'No UID',
			}));

		if (events.length === 0) {
			console.error('Error: No events found in ICS file.');
		} else {
			// Write JSON file
			fs.writeFileSync(jsonFilePath, JSON.stringify(events, null, 2));
			console.log(`Converted ICS file to JSON: ${jsonFilePath}`);
		}
	} catch (error) {
		console.error('Error:', error.message);
	}
}

// File paths
const icsFilePath = path.join(__dirname, '../ics/matches.ics'); // Replace 'input.ics' with your ICS file path
const jsonFilePath = path.join(__dirname, '../jsons/calendarData.json'); // Replace 'output.json' with your desired JSON file path

// Convert ICS to JSON
convertIcsToJson(icsFilePath, jsonFilePath);

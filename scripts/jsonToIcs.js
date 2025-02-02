const fs = require('fs');
const path = require('path');
const ical = require('ical');

// Function to convert JSON to ICS
function jsonToICS(jsonFilePath, icsFilePath) {
	try {
		// Read the JSON file
		const data = fs.readFileSync(jsonFilePath, 'utf-8');
		if (!data) {
			console.error('Error: JSON file is empty or could not be read.');
			return;
		}

		const events = JSON.parse(data);

		// Create a new calendar
		let calendar = '';

		events.forEach((event, index) => {
			calendar += `BEGIN:VEVENT\n`;
			calendar += `UID:${event.id}\n`;
			calendar += `DTSTAMP:${
				event.dtstamp ||
				new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
			}\n`;
			calendar += `DTSTART;TZID="/America/New_York":${
				event.start.replace(/[-:]/g, '').split('.')[0]
			}\n`;
			calendar += `DTEND;TZID="/America/New_York":${
				event.end
					? event.end.replace(/[-:]/g, '').split('.')[0]
					: new Date(new Date(event.start).getTime() + 3 * 60 * 60 * 1000)
							.toISOString()
							.replace(/[-:]/g, '')
							.split('.')[0]
			}\n`;
			calendar += `SUMMARY:${event.summary || 'No Summary'}\n`;
			calendar += `DESCRIPTION:${event.description || 'No Description'}\n`;
			calendar += `END:VEVENT\n`;
		});

		// Add calendar headers and footer
		const icsData = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Sample Corp//NONSGML Event//EN\n${calendar}END:VCALENDAR`;

		// Write ICS data to file
		fs.writeFileSync(icsFilePath, icsData);
		console.log(`ICS file created: ${icsFilePath}`);
	} catch (error) {
		console.error('Error:', error.message);
	}
}

// File paths
// const inputJsonFilePath = path.join(__dirname, 'calendarData_filtered.json'); // Replace with your input JSON file path
// const outputIcsFilePath = path.join(__dirname, 'matches_filtered.ics'); // Replace with your desired output ICS file path

const inputJsonFilePath = path.join(__dirname, '../jsons/finalCalendar.json'); // Replace with your input JSON file path
const outputIcsFilePath = path.join(__dirname, '../ics/finalCalendar.ics'); // Replace with your desired output ICS file path

// Convert JSON to ICS
jsonToICS(inputJsonFilePath, outputIcsFilePath);

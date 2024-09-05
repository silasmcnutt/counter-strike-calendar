const { exec } = require('child_process');
const path = require('path');

// Set Puppeteer executable path
if (process.platform === 'linux') {
	process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/google-chrome-stable';
}
// Define paths for JSON files
const pastEventsFile = path.join(__dirname, '../jsons/pastEvents.json');
const futureMatchesFile = path.join(__dirname, '../jsons/futureMatches.json');
const mergedFile = path.join(__dirname, '../jsons/mergedData.json');

// Define the commands for each script
const scripts = [
	'node ./scripts/icsToJson.js',
	'node ./scripts/pastEventFiltering.js',
	'node ./scripts/findPastEvents.js',
	'node ./scripts/updatePastEvents.js',
	'node ./scripts/updateLast10Matches.js',
	'node ./scripts/fetchUpcomingMatches.js',
	`node ./scripts/mergeJsonFiles.js ${pastEventsFile} ${futureMatchesFile} ${mergedFile}`,
	`node ./scripts/jsonToIcs.js`,
];

// Function to execute commands sequentially
async function runScripts() {
	for (const script of scripts) {
		console.log(`Running: ${script}`);
		await new Promise((resolve, reject) => {
			exec(script, (error, stdout, stderr) => {
				if (error) {
					console.error(`Error executing script: ${stderr}`);
					reject(error);
				} else {
					console.log(stdout);
					resolve();
				}
			});
		});
	}
	console.log('All scripts executed successfully.');
}

// Run the scripts
runScripts().catch((error) => {
	console.error('Error running scripts:', error);
});

const { HLTV } = require('hltv'); // Ensure you have HLTV library or the appropriate API for fetching events and matches

HLTV.getMatches().then((res) => {
	console.log(res);
});

<div align="center">
<img src="./images/header.png" style="max-height:250px">
<p>A UTC calendar of professional Counter-Strike matches</p>
<img src="https://img.shields.io/badge/made_with_♡_by-silas-red" alt="Made with love by Silas">
<a href="https://github.com/silasmcnutt/counter-strike-calendar/blob/main/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
</div>

# Counter-Strike Calendar

This repository publishes an iCalendar feed containing:

- Upcoming and recent matches from CitoAPI whose event prestige score is 80 or higher.
- Completed scores and map-by-map results when CitoAPI provides them.

The calendar uses CitoAPI's CS2 matches endpoint. It only includes matches
whose event prestige score is at least 80, and updates existing events by match ID.
The generator keeps existing events by match ID, adds new upcoming matches,
and updates existing events when scores, maps, or start times become
available. New matches without a usable start time are omitted. Completed
events are removed once they are 14 days old; future events remain scheduled.

## Subscribe to the calendar

Use the raw GitHub URL as a calendar subscription:

```text
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/finalCalendar.ics
```

### Google Calendar

1. Copy the URL above.
2. Open Google Calendar.
3. Select **Other calendars** > **From URL**.
4. Paste the URL and select **Add calendar**.

### Apple Calendar or Outlook

Add a calendar subscription using the same URL. The calendar client controls how frequently it refreshes a subscribed feed;
GitHub updates the file every three hours on the hour in Eastern time.

## Local development

### Requirements

- Node.js 18 or newer
- A CitoAPI key

### Generate the calendar

From this repository:

```powershell
npm install
npm test
npm run generate
```

The local generator reads `CITO_API_KEY` from `.env`. Never commit that file.
GitHub Actions reads the `CITO_API_KEY` repository secret.

The generated files are:

- [`ics/finalCalendar.ics`](./ics/finalCalendar.ics) - the calendar feed.
- [`jsons/finalCalendar.json`](./jsons/finalCalendar.json) - normalized event
  data for inspection and debugging.

## Configuration

The generator uses this optional environment variable:

| Variable | Default | Description |
| --- | --- | --- |
| `MATCH_LOOKBACK_DAYS` | `14` | Age limit for past events |

Example:

```powershell
$env:MATCH_LOOKBACK_DAYS = "14"
npm run generate
```

All event times in the ICS feed are UTC timestamps. CitoAPI provides ISO 8601
timestamps with timezone information, which are preserved and serialized as
UTC.

## CitoAPI integration

The generator makes requests to:

- `GET https://api.citoapi.com/api/v1/cs2/matches/upcoming`
- `GET https://api.citoapi.com/api/v1/cs2/matches/recent`

The API key is sent using the `x-api-key` header. The workflow checks once per
hour, while the generator permits API calls only at 00:00, 03:00, 06:00, and
other three-hour boundaries in `America/New_York`. It records the last
successful Eastern slot in `jsons/cito-api-state.json`, preventing duplicate
calls for the same slot.

The endpoint is called only after the configured key is available. The response
is expected to contain a `data` array, with each match's `event.prestigeScore`,
`startsAt`, teams, scores, and optional map results. Matches without a
prestige score of at least 80 are ignored.

GitHub setup:

1. Add `CITO_API_KEY` under **Settings > Secrets and variables > Actions** as
   a repository secret.
2. Ensure workflow permissions allow **Read and write permissions**.
   3. Keep the workflow file on the default branch. GitHub runs its hourly check
   in UTC; the generator selects the three-hour Eastern slots. Scheduled
   workflows can be delayed by GitHub load.
   4. The generator rejects duplicate executions for the same Eastern slot and
   commits the updated ICS, JSON, and slot state files.

## Project layout

- [`scripts/generateCalendar.js`](./scripts/generateCalendar.js) - CitoAPI
  integration, event merging, filtering, and ICS serialization.
- [`scripts/main.js`](./scripts/main.js) - command-line entry point.
- [`test/generateCalendar.test.js`](./test/generateCalendar.test.js) - tests.
- [`.github/workflows/update-calendar.yml`](./.github/workflows/update-calendar.yml)
  - hourly GitHub Actions check with three-hour Eastern refreshes.

## License

This project is available under the [MIT License](./LICENSE.txt).

<div align="center">
<img src="./images/header.png" style="max-height:250px">
<p>A UTC calendar of professional Counter-Strike matches</p>
<img src="https://img.shields.io/badge/made_with_♡_by-silas-red" alt="Made with love by Silas">
<a href="https://github.com/silasmcnutt/counter-strike-calendar/blob/main/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
</div>

# Counter-Strike Calendar

This repository publishes an iCalendar feed containing:

- Upcoming matches where at least one team is in HLTV's current top 30.
- Completed matches from the previous 14 days involving a top-30 team.
- Scores and map-by-map results for completed matches when HLTV provides them.

The calendar is generated with the unofficial
[M3MONs/hltv-scraper-api](https://github.com/M3MONs/hltv-scraper-api) service.
The generator keeps existing events by match ID, adds new upcoming matches,
and updates existing events when scores, maps, or start times become
available. New matches without a usable start time are omitted.

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

Add a calendar subscription using the same URL. The calendar client controls
how frequently it refreshes a subscribed feed; GitHub updates the file hourly.

## Local development

### Requirements

- Node.js 18 or newer
- Python 3.12 or newer for the upstream API
- Git

### Start the API

Clone and start the API in a separate terminal. Follow its installation
instructions for the Python dependencies:

```powershell
git clone https://github.com/M3MONs/hltv-scraper-api.git
cd hltv-scraper-api
python -m pip install -r requirements.txt
python app.py
```

The API should be available at `http://127.0.0.1:8000`.

### Generate the calendar

From this repository:

```powershell
npm install
npm test
npm run generate
```

The generated files are:

- [`ics/finalCalendar.ics`](./ics/finalCalendar.ics) - the calendar feed.
- [`jsons/finalCalendar.json`](./jsons/finalCalendar.json) - normalized event
  data for inspection and debugging.

## Configuration

The generator uses these optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `HLTV_API_BASE_URL` | `http://127.0.0.1:8000` | Base URL of the running scraper API |
| `MATCH_LOOKBACK_DAYS` | `14` | Age limit for completed events |
| `RESULTS_PAGES` | `3` | Number of 100-result pages to request |

Example:

```powershell
$env:HLTV_API_BASE_URL = "http://127.0.0.1:8000"
$env:MATCH_LOOKBACK_DAYS = "14"
npm run generate
```

All event times in the ICS feed are UTC timestamps. The API's timezone-less
HLTV times are interpreted in `Europe/Stockholm`, including daylight-saving
transitions, before conversion to UTC.

## API endpoints used

The generator uses these endpoints from
[M3MONs/hltv-scraper-api](https://github.com/M3MONs/hltv-scraper-api):

- `GET /api/v1/teams/rankings/hltv`
- `GET /api/v1/matches/upcoming`
- `GET /api/v1/results/{offset}`
- `GET /api/v1/matches/{id}/{match_name}`

The upstream service is an unofficial scraper and may occasionally return
incomplete data or be affected by HLTV availability and rate limiting. The
generator fails instead of silently replacing the calendar with an empty
feed when required API requests fail.

## Project layout

- [`scripts/generateCalendar.js`](./scripts/generateCalendar.js) - API
  integration, event merging, filtering, and ICS serialization.
- [`scripts/main.js`](./scripts/main.js) - command-line entry point.
- [`test/generateCalendar.test.js`](./test/generateCalendar.test.js) - tests.
- [`.github/workflows/update-calendar.yml`](./.github/workflows/update-calendar.yml)
  - hourly GitHub Actions job.

## License

This project is available under the [MIT License](./LICENSE.txt).

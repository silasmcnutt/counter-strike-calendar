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

The calendar uses the unofficial
[SocksPls/hltv-api](https://github.com/SocksPls/hltv-api) Python library
directly. No Flask server or other local API service is required.
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
- Python 3.12 or newer for the HLTV library
- Git

### Install the HLTV library

The generator invokes the library through a small JSON bridge. Clone it next
to this repository and install its dependencies:

```powershell
git clone https://github.com/SocksPls/hltv-api.git ..\hltv-api
cd ..\hltv-api
python -m pip install -r requirements.txt
cd ..\counter-strike-calendar
```

If the library is in another location, set `HLTV_API_PATH` to that directory.

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
| `HLTV_API_PATH` | `..\hltv-api` | Directory containing the cloned `main.py` library |
| `MATCH_LOOKBACK_DAYS` | `14` | Age limit for completed events |

Example:

```powershell
$env:HLTV_API_PATH = "..\hltv-api"
$env:MATCH_LOOKBACK_DAYS = "14"
npm run generate
```

All event times in the ICS feed are UTC timestamps. The API's timezone-less
HLTV times are interpreted in `Europe/Stockholm`, including daylight-saving
transitions, before conversion to UTC.

## Library functions used

The bridge invokes these functions from
[SocksPls/hltv-api](https://github.com/SocksPls/hltv-api):

- `top30teams()` for the current ranking.
- `get_matches()` for upcoming matches.
- `get_results()` for completed matches.
- `get_results_by_date()` for map-by-map scores during the lookback window.

The upstream library scrapes HLTV directly and may occasionally be affected by
HLTV availability, Cloudflare, or rate limiting. The generator reports library
errors instead of silently replacing the calendar with an empty feed. If the
optional map-results page is unavailable, the generator logs a warning and
continues with the aggregate completed-match score.

## Project layout

- [`scripts/generateCalendar.js`](./scripts/generateCalendar.js) - API
  integration, event merging, filtering, and ICS serialization.
- [`scripts/main.js`](./scripts/main.js) - command-line entry point.
- [`test/generateCalendar.test.js`](./test/generateCalendar.test.js) - tests.
- [`.github/workflows/update-calendar.yml`](./.github/workflows/update-calendar.yml)
  - hourly GitHub Actions job.

## License

This project is available under the [MIT License](./LICENSE.txt).

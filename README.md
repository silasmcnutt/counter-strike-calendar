<div align="center">
<img src="./images/header.png" style="max-height:250px">
<p>A UTC calendar of professional Counter-Strike matches</p>
<img src="https://img.shields.io/badge/made_with_♡_by-silas-red" alt="Made with love by Silas">
<a href="https://github.com/silasmcnutt/counter-strike-calendar/blob/main/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
</div>

# Counter-Strike Calendar

An automatically updated calendar for notable professional Counter-Strike
matches.

## What is included?

- Upcoming matches from high-profile events.
- Recent completed matches.
- Match scores and map scores when available.
- Match times shown in UTC.
- Event names shown as the event location.

The calendar currently includes events with:

- A prestige score of at least **80**.
- A prize pool of at least **$100,000**.

Completed matches are kept for two weeks. Upcoming matches remain on the
calendar until they become old enough to be removed.

## Subscribe

Add this URL as a calendar subscription in Google Calendar, Apple Calendar,
Outlook, or another calendar app:

```text
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/finalCalendar.ics
```

### Google Calendar

1. Open Google Calendar.
2. Select **Other calendars** > **From URL**.
3. Paste the URL above.
4. Select **Add calendar**.

For Apple Calendar and Outlook, choose the option to subscribe to a calendar
using a URL and paste the same link.

Calendar applications decide how often they refresh subscriptions. This
calendar is updated every four hours on the hour, although scheduled updates
may occasionally be delayed. The workflow can also be run manually at any
time from GitHub Actions.

## Data source

Match information is provided by [CitoAPI](https://citoapi.com/). Event
selection is intentionally limited to larger, higher-prestige events so the
calendar stays focused on matches that are likely to be most useful to fans.

## License

This project is available under the [MIT License](./LICENSE.txt).

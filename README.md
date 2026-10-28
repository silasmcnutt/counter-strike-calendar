<div align="center">
<img src="./images/header.png" style="max-height:250px">
<p>A UTC calendar of professional Counter-Strike matches</p>
<img src="https://img.shields.io/badge/made_with_♡_by-silas-red" alt="Made with love by Silas">
<a href="https://github.com/silasmcnutt/counter-strike-calendar/blob/main/LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
</div>

# Counter-Strike Calendar

Follow professional Counter-Strike matches through calendar subscriptions.

## Choose a calendar

### All teams

Subscribe to every qualifying match:

```text
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/_ALL-TEAMS.ics
```

### Individual teams

Each team has its own calendar. Team filenames are lowercase and hyphenated.
Replace `<team-name>` with the team's filename:

```text
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/<team-name>.ics
```

Examples:

```text
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/spirit.ics
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/natus-vincere.ics
https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/g2.ics
```

Team calendars contain every upcoming and recent match involving that team,
regardless of event prestige or prize pool. They include score updates and map
scores when available. Matches are kept for two weeks, just like the all-teams
calendar.

## Add a calendar

Use the subscription URL in Google Calendar, Apple Calendar, Outlook, or
another calendar app.

For Google Calendar:

1. Open **Other calendars**.
2. Select **From URL**.
3. Paste the calendar URL.
4. Select **Add calendar**.

Calendar apps control how often they refresh subscriptions. This project
updates the feeds approximately every four hours.

## Match selection

The feeds focus on larger events with:

- A prestige score of at least **80**
- A prize pool of at least **$100,000**

Upcoming and recent matches are included. Completed matches remain available
for two weeks.

## License

This project is available under the [MIT License](./LICENSE.txt).

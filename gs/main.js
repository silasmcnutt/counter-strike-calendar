// Google Scripts Code
function updateCalendar() {
  const calendarId = "your_google_calendar_id"; // Replace with your Google Calendar ID
  const icsUrl = "your_ics_calendar_url"; // Replace with the URL to the ICS file

  // Fetch and parse the ICS file
  const icsContent = UrlFetchApp.fetch(icsUrl).getContentText();
  const events = parseICS(icsContent);

  // Access the target Google Calendar
  const calendar = CalendarApp.getCalendarById(calendarId);
  
  // Erase all current events in the calendar
  const now = new Date();
  const eventsToDelete = calendar.getEvents(now, new Date(now.getFullYear() + 1, 11, 31)); // Gets all future events
  for (let event of eventsToDelete) {
    event.deleteEvent();
  }
  
  // Add the new events from the ICS file
  for (let event of events) {
    calendar.createEvent(event.title, new Date(event.start), new Date(event.end), {
      description: event.description,
      location: event.location
    });
  }
}

function parseICS(icsContent) {
  const events = [];
  
  // Basic ICS parsing (you may want to improve this for more complex ICS formats)
  const lines = icsContent.split('\n');
  let currentEvent = {};
  
  for (let line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      currentEvent = {};
    } else if (line.startsWith("SUMMARY:")) {
      currentEvent.title = line.replace("SUMMARY:", "").trim();
    } else if (line.startsWith("DTSTART:")) {
      currentEvent.start = parseDate(line.replace("DTSTART:", "").trim());
    } else if (line.startsWith("DTEND:")) {
      currentEvent.end = parseDate(line.replace("DTEND:", "").trim());
    } else if (line.startsWith("DESCRIPTION:")) {
      currentEvent.description = line.replace("DESCRIPTION:", "").trim();
    } else if (line.startsWith("LOCATION:")) {
      currentEvent.location = line.replace("LOCATION:", "").trim();
    } else if (line.startsWith("END:VEVENT")) {
      events.push(currentEvent);
    }
  }
  
  return events;
}

function parseDate(icsDate) {
  const year = icsDate.substring(0, 4);
  const month = icsDate.substring(4, 6) - 1; // Months are zero-indexed in JavaScript
  const day = icsDate.substring(6, 8);
  const hour = icsDate.substring(9, 11);
  const minute = icsDate.substring(11, 13);

  return new Date(year, month, day, hour, minute);
}

function setTrigger() {
  // Creates a trigger to run the updateCalendar function every 30 minutes
  ScriptApp.newTrigger('updateCalendar')
    .timeBased()
    .everyMinutes(30)
    .create();
}


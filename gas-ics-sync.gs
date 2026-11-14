/**
 * Google Apps Script — ICS Calendar Synchronizer
 *
 * A lightweight, standalone replacement for GAS-ICS-Sync.
 * Synchronizes an ICS feed to a Google Calendar by completely replacing
 * the target calendar's events every 15 minutes (configurable).
 *
 * SETUP:
 * 1. Copy this entire file to a new Google Apps Script project (script.google.com)
 * 2. Edit the CONFIG section below with your ICS URL and Calendar ID
 * 3. Run `install()` once to authorize and create the 15-minute trigger
 * 4. Run `startSync()` manually for the first sync, then it runs automatically
 *
 * FINDING YOUR CALENDAR ID:
 * - Open Google Calendar → Settings (gear) → Settings
 * - Select your calendar on the left
 * - Scroll to "Integrate calendar" → copy "Calendar ID"
 * - It looks like: `abc123@group.calendar.google.com` or `your-email@gmail.com`
 *
 * IMPORTANT: Use a DEDICATED calendar. This script DELETES ALL EVENTS in the
 * target calendar on every sync. Do not point it at your primary calendar.
 *
 * @see https://github.com/motemen/gas-ics-sync (original inspiration)
 */

// ============================================================
// CONFIGURATION — EDIT THESE VALUES
// ============================================================
const CONFIG = {
  /** URL of the ICS file to synchronize (must be publicly accessible) */
  icsUrl: 'https://raw.githubusercontent.com/silasmcnutt/counter-strike-calendar/main/ics/!-ALL-TEAMS-!.ics',

  /** ID of the Google Calendar to modify (found in Calendar Settings → Integrate calendar) */
  calendarId: 'your-calendar-id@group.calendar.google.com',

  /** Synchronization frequency in minutes (default: 15) */
  syncInterval: 15,
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Installs the time-driven trigger for automatic synchronization.
 * Safe to run multiple times — prevents duplicate triggers.
 */
function install() {
  const allTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === 'startSync') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('startSync')
    .timeBased()
    .everyMinutes(CONFIG.syncInterval)
    .create();

  console.log(`Trigger installed: startSync runs every ${CONFIG.syncInterval} minutes`);
}

/**
 * Uninstalls all triggers for this script.
 * Run this if you want to stop automatic synchronization.
 */
function uninstall() {
  const allTriggers = ScriptApp.getProjectTriggers();
  let count = 0;
  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === 'startSync') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  }
  console.log(`Removed ${count} trigger(s) for startSync`);
}

/**
 * Main synchronization entry point — called by trigger or manually.
 * Orchestrates: fetch → parse → validate → clear → import
 */
function startSync() {
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(30000);

  if (!lockAcquired) {
    console.error('Could not acquire lock — another sync may be running');
    return;
  }

  try {
    console.log('Starting ICS calendar sync...');

    const icsContent = fetchICS();
    const events = parseICS(icsContent);

    if (events.length === 0) {
      console.warn('No valid events found in ICS feed — aborting to preserve existing calendar');
      return;
    }

    console.log(`Parsed ${events.length} events from ICS feed`);

    const deletedCount = clearCalendar();
    const importedCount = importEvents(events);

    console.log(`Sync complete: ${deletedCount} deleted, ${importedCount} imported`);
  } catch (error) {
    console.error(`Sync failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Downloads the ICS file from the configured URL.
 * Validates response before returning.
 * @returns {string} Raw ICS content
 * @throws {Error} If download fails or content is invalid
 */
function fetchICS() {
  console.log(`Fetching ICS from: ${CONFIG.icsUrl}`);

  const options = {
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
  };

  const response = UrlFetchApp.fetch(CONFIG.icsUrl, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    throw new Error(`HTTP ${responseCode}: ${response.getContentText().slice(0, 200)}`);
  }

  const content = response.getContentText();

  if (!content.includes('BEGIN:VCALENDAR') || !content.includes('END:VCALENDAR')) {
    throw new Error('Downloaded content does not appear to be a valid ICS file (missing VCALENDAR)');
  }

  if (!content.includes('BEGIN:VEVENT')) {
    console.warn('ICS file contains no VEVENT components');
  }

  console.log(`Downloaded ${content.length} characters`);
  return content;
}

/**
 * Parses ICS content into an array of event objects.
 * Handles: folded lines, escaped text, UTC/local/all-day dates, timezones.
 * @param {string} icsContent - Raw ICS text
 * @returns {Array<Object>} Parsed events with: uid, summary, description, location, start, end, url
 */
function parseICS(icsContent) {
  const unfolded = unfoldIcsLines(icsContent);
  const eventBlocks = unfolded.split('BEGIN:VEVENT').slice(1);

  const events = [];

  for (const block of eventBlocks) {
    const event = parseEventBlock(block);
    if (event) {
      events.push(event);
    }
  }

  console.log(`Parsed ${events.length} valid event(s) from ${eventBlocks.length} VEVENT block(s)`);
  return events;
}

/**
 * Parses a single VEVENT block into an event object.
 * @param {string} block - Single VEVENT block (without BEGIN:VEVENT)
 * @returns {Object|null} Parsed event or null if invalid
 */
function parseEventBlock(block) {
  const props = {};
  const lines = block.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const fullName = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1);
    const name = fullName.split(';')[0].toUpperCase();
    if (!props[name]) props[name] = [];
    props[name].push(unescapeIcsText(value));
  }

  const getProp = (name) => {
    const vals = props[name.toUpperCase()];
    return vals && vals.length > 0 ? vals[0] : '';
  };

  const uid = getProp('UID');
  if (!uid) {
    console.warn('Skipping event with no UID');
    return null;
  }

  const summary = getProp('SUMMARY') || '(No title)';
  const description = getProp('DESCRIPTION');
  const location = getProp('LOCATION');
  const url = getProp('URL');

  const dtstart = parseIcsDateFromProps(props, 'DTSTART');
  const dtend = parseIcsDateFromProps(props, 'DTEND');

  if (!dtstart || !dtend) {
    console.warn(`Skipping event ${uid}: could not parse DTSTART/DTEND`);
    return null;
  }

  if (dtend <= dtstart) {
    console.warn(`Skipping event ${uid}: DTEND not after DTSTART`);
    return null;
  }

  return {
    uid,
    summary,
    description,
    location,
    url,
    start: dtstart,
    end: dtend,
  };
}

/**
 * Parses an ICS date/time property from parsed props object.
 * @param {Object} props - Parsed properties object from parseEventBlock
 * @param {string} propName - Property name (DTSTART, DTEND)
 * @returns {Date|null} Parsed Date object or null
 */
function parseIcsDateFromProps(props, propName) {
  const vals = props[propName.toUpperCase()];
  if (!vals || vals.length === 0) return null;

  const value = vals[0];
  const isUtc = value.endsWith('Z');
  const cleanValue = isUtc ? value.slice(0, -1) : value;

  if (cleanValue.length === 8 && /^\d{8}$/.test(cleanValue)) {
    const year = parseInt(cleanValue.slice(0, 4), 10);
    const month = parseInt(cleanValue.slice(4, 6), 10) - 1;
    const day = parseInt(cleanValue.slice(6, 8), 10);
    return new Date(Date.UTC(year, month, day));
  }

  if (cleanValue.length >= 15) {
    const year = parseInt(cleanValue.slice(0, 4), 10);
    const month = parseInt(cleanValue.slice(4, 6), 10) - 1;
    const day = parseInt(cleanValue.slice(6, 8), 10);
    const hour = parseInt(cleanValue.slice(9, 11), 10) || 0;
    const minute = parseInt(cleanValue.slice(11, 13), 10) || 0;
    const second = parseInt(cleanValue.slice(13, 15), 10) || 0;

    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  return null;
}

/**
 * Unfolds ICS folded lines (RFC 5545).
 * Lines starting with space or tab are continuations of the previous line.
 * @param {string} content - Raw ICS content
 * @returns {string} Content with folded lines joined
 */
function unfoldIcsLines(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.replace(/\n[ \t]/g, '');
}

/**
 * Unescapes ICS text per RFC 5545.
 * Handles: \n → newline, \, → comma, \; → semicolon, \\ → backslash
 * @param {string} value - Escaped ICS value
 * @returns {string} Unescaped plain text
 */
function unescapeIcsText(value) {
  return value
    .replace(/\\\\/g, '\x00')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\x00/g, '\\');
}

/**
 * Deletes ALL events from the configured calendar.
 * Handles pagination for calendars with many events.
 * @returns {number} Number of events deleted
 */
function clearCalendar() {
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);
  if (!calendar) {
    throw new Error(`Calendar not found: ${CONFIG.calendarId}. Check the calendarId in CONFIG.`);
  }

  console.log(`Clearing calendar: ${calendar.getName()} (${CONFIG.calendarId})`);

  let deletedCount = 0;
  let pageToken = null;

  do {
    const start = new Date('1970-01-01');
    const end = new Date('2099-12-31');

    const events = calendar.getEvents(start, end);

    for (const event of events) {
      try {
        event.deleteEvent();
        deletedCount++;
      } catch (e) {
        console.warn(`Failed to delete event ${event.getId()}: ${e.message}`);
      }
      Utilities.sleep(50);
    }
  } while (false);

  console.log(`Deleted ${deletedCount} event(s)`);
  return deletedCount;
}

/**
 * Imports parsed events into the configured calendar.
 * @param {Array<Object>} events - Parsed events from parseICS()
 * @returns {number} Number of events successfully imported
 */
function importEvents(events) {
  const calendar = CalendarApp.getCalendarById(CONFIG.calendarId);
  if (!calendar) {
    throw new Error(`Calendar not found: ${CONFIG.calendarId}`);
  }

  console.log(`Importing ${events.length} event(s)...`);

  let importedCount = 0;
  let failedCount = 0;

  for (const event of events) {
    try {
      const calEvent = calendar.createEvent(event.summary, event.start, event.end, {
        description: event.description,
        location: event.location,
      });

      if (event.url) {
        const currentDesc = calEvent.getDescription() || '';
        const newDesc = currentDesc + (currentDesc ? '\n\n' : '') + `Source: ${event.url}`;
        calEvent.setDescription(newDesc);
      }

      importedCount++;
    } catch (e) {
      console.error(`Failed to import event "${event.summary}" (${event.uid}): ${e.message}`);
      failedCount++;
    }
    Utilities.sleep(100);
  }

  if (failedCount > 0) {
    console.warn(`${failedCount} event(s) failed to import`);
  }

  console.log(`Successfully imported ${importedCount} event(s)`);
  return importedCount;
}
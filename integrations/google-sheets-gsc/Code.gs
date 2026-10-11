/**
 * OpenFindability — GSC -> private Google Sheet (bound Apps Script).
 * No service account JSON, no public web app, no paid data connector.
 *
 * Enable the Search Console API in the Apps Script-linked Cloud project.
 * Add the OAuth scopes from appsscript.json and run setupGscSync().
 */
var OF_GSC = {
  tz: "Europe/Rome",
  pageCap: 100,
  queryCap: 150,
  dailyRefreshDays: 10,
  detailRefreshDays: 3,
  sheetHeaders: {
    Properties: ["property", "project_slug", "enabled", "primary", "search_type"],
    Daily: ["property", "date", "clicks", "impressions", "ctr", "position", "fetched_at"],
    TopPages: ["property", "date", "page", "clicks", "impressions", "ctr", "position", "fetched_at"],
    TopQueries: ["property", "date", "query", "page", "clicks", "impressions", "ctr", "position", "fetched_at"],
    SEO_Overview: ["property", "project_slug", "period_days", "end_date", "clicks", "impressions", "ctr", "position", "observed_days", "updated_at"],
    SyncLog: ["at", "property", "status", "daily_days", "page_rows", "query_rows", "message"]
  }
};

function ofWorkbook_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Bind this script to a Sheet or set SPREADSHEET_ID in Script Properties.");
  return ss;
}

function ofEnsure_(ss, name) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = OF_GSC.sheetHeaders[name];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, head.length).setValues([head]);
    sheet.setFrozenRows(1);
  } else {
    var existing = sheet.getRange(1, 1, 1, head.length).getValues()[0];
    if (existing.join("|") !== head.join("|")) {
      throw new Error("Unexpected headers in " + name + "; not overwriting a user-modified sheet.");
    }
  }
  return sheet;
}

function setupGscSync() {
  var ss = ofWorkbook_();
  Object.keys(OF_GSC.sheetHeaders).forEach(function(name) { ofEnsure_(ss, name); });
  // Apps Script may already have user-created triggers: only replace ours.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "syncGscDaily") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("syncGscDaily").timeBased().everyDays(1).atHour(6).inTimezone(OF_GSC.tz).create();
  Logger.log("Configured daily GSC sync around 06:00 " + OF_GSC.tz +
    ". Add property rows in Properties then manually run syncGscDaily.");
}

function ofDates_(days) {
  // Use calendar arithmetic in the report timezone, not 24h-ms subtraction,
  // otherwise DST transitions can skip/duplicate one reporting day.
  var today = Utilities.formatDate(new Date(), OF_GSC.tz, "yyyy-MM-dd");
  var values = [];
  for (var offset = days + 1; offset >= 2; offset--) {
    var day = new Date(today + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - offset);
    values.push(Utilities.formatDate(day, "GMT", "yyyy-MM-dd"));
  }
  return values;
}

/** Optional one-time daily-total backfill (no expensive query/page history). */
function backfillGscDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("A GSC sync is already running.");
  try {
    var ss = ofWorkbook_();
    var props = ofProperties_(ofEnsure_(ss, "Properties"));
    var dailySheet = ofEnsure_(ss, "Daily");
    var days = ofDates_(90);
    var now = new Date().toISOString();
    props.forEach(function(prop) {
      var result = ofApi_(prop.property, days[0], days[days.length - 1], ["date"], 25000, prop.searchType);
      var rows = result.map(function(r) {
        return [prop.property, r.keys[0], r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0, now];
      });
      ofReplaceWindow_(dailySheet, prop.property, days, rows, 2);
    });
    ofOverview_(ofEnsure_(ss, "SEO_Overview"), dailySheet, props, now);
  } finally {
    lock.releaseLock();
  }
}

function ofApi_(property, dateStart, dateEnd, dimensions, limit, searchType) {
  var payload = {
    startDate: dateStart, endDate: dateEnd,
    dimensions: dimensions, type: searchType || "web",
    dataState: "final", rowLimit: Math.min(limit, 25000), startRow: 0
  };
  var url = "https://searchconsole.googleapis.com/webmasters/v3/sites/" +
    encodeURIComponent(property) + "/searchAnalytics/query";
  var delay = 800;
  for (var attempt = 0; attempt < 4; attempt++) {
    var response = UrlFetchApp.fetch(url, {
      method: "post", contentType: "application/json",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status === 200) {
      var data = JSON.parse(response.getContentText());
      return data.rows || [];
    }
    if (status !== 429 && status < 500) {
      // Surface Google's own reason: "API has not been used in project N" (enable the Search
      // Console API in the script's Cloud project) and "User does not have sufficient permission
      // for site" (this Google account is not a user of the property) are both 403s.
      var reason = "";
      try { reason = JSON.parse(response.getContentText()).error.message; } catch (e) { reason = response.getContentText(); }
      throw new Error("GSC HTTP " + status + " for " + property + " (" + dimensions.join(",") + "): " + String(reason).slice(0, 300));
    }
    Utilities.sleep(delay);
    delay *= 2;
  }
  throw new Error("GSC request failed after retries for " + property);
}

// Rebuild only this property's *recent window*. Calls must finish before writes.
// This is deterministic, prevents duplicates and removes rows that Google no
// longer returns. No raw API payloads are stored in the workbook.
function ofReplaceWindow_(sheet, property, dates, freshRows, keyColumnCount) {
  var n = sheet.getLastRow();
  var width = OF_GSC.sheetHeaders[sheet.getName()].length;
  var current = n > 1 ? sheet.getRange(2, 1, n - 1, width).getValues() : [];
  var covered = {};
  dates.forEach(function(date) { covered[date] = true; });
  var retained = current.filter(function(row) {
    return String(row[0]) !== property || !covered[String(row[1])];
  });
  var merged = retained.concat(freshRows);
  // Reject repeated keys rather than producing confusing duplicated numbers.
  var unique = {};
  merged.forEach(function(row) {
    var key = row.slice(0, keyColumnCount).join("\u0001");
    if (unique[key]) throw new Error("Duplicate GSC key in " + sheet.getName());
    unique[key] = true;
  });
  if (merged.length > 0) {
    if (sheet.getMaxRows() < merged.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), merged.length + 1 - sheet.getMaxRows());
    sheet.getRange(2, 1, merged.length, width).setValues(merged);
  }
  if (current.length > merged.length) sheet.getRange(merged.length + 2, 1, current.length - merged.length, width).clearContent();
}

function ofProperties_(sheet) {
  var count = sheet.getLastRow();
  if (count < 2) return [];
  return sheet.getRange(2, 1, count - 1, 5).getValues().filter(function(row) {
    return row[0] && (row[2] === true || String(row[2]).toLowerCase() === "true");
  }).map(function(row) {
    return {
      property: String(row[0]).trim(), slug: String(row[1]).trim(),
      primary: row[3] === true || String(row[3]).toLowerCase() === "true",
      searchType: String(row[4] || "web").trim()
    };
  });
}

function syncGscDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("Previous GSC sync is still running.");
  try {
    var ss = ofWorkbook_();
    var props = ofProperties_(ofEnsure_(ss, "Properties"));
    var dailySheet = ofEnsure_(ss, "Daily");
    var pagesSheet = ofEnsure_(ss, "TopPages");
    var queriesSheet = ofEnsure_(ss, "TopQueries");
    var overviewSheet = ofEnsure_(ss, "SEO_Overview");
    var log = ofEnsure_(ss, "SyncLog");
    var now = new Date().toISOString();
    var allDays = ofDates_(OF_GSC.dailyRefreshDays);
    var detailDays = allDays.slice(-OF_GSC.detailRefreshDays);
    props.forEach(function(prop) {
      var daily = [], pages = [], queries = [];
      try {
        var totals = ofApi_(prop.property, allDays[0], allDays[allDays.length - 1], ["date"], 25000, prop.searchType);
        daily = totals.map(function(r) {
          return [prop.property, r.keys[0], r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0, now];
        });
        // Date+URL/query dimensions: explicit day; do not write a range
        // aggregate as if it represented one particular date.
        detailDays.forEach(function(date) {
          ofApi_(prop.property, date, date, ["date", "page"], OF_GSC.pageCap, prop.searchType).forEach(function(r) {
            pages.push([prop.property, date, r.keys[1], r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0, now]);
          });
          ofApi_(prop.property, date, date, ["date", "query", "page"], OF_GSC.queryCap, prop.searchType).forEach(function(r) {
            queries.push([prop.property, date, r.keys[1], r.keys[2], r.clicks || 0, r.impressions || 0, r.ctr || 0, r.position || 0, now]);
          });
        });
        ofReplaceWindow_(dailySheet, prop.property, allDays, daily, 2);
        ofReplaceWindow_(pagesSheet, prop.property, detailDays, pages, 3);
        ofReplaceWindow_(queriesSheet, prop.property, detailDays, queries, 4);
        log.appendRow([now, prop.property, "success", daily.length, pages.length, queries.length, ""]);
      } catch (err) {
        log.appendRow([now, prop.property, "failed", daily.length, pages.length, queries.length, String(err).slice(0, 250)]);
      }
    });
    ofOverview_(overviewSheet, dailySheet, props, now);
  } finally {
    lock.releaseLock();
  }
}

function ofOverview_(overviewSheet, dailySheet, properties, now) {
  var last = dailySheet.getLastRow();
  var all = last > 1 ? dailySheet.getRange(2, 1, last - 1, 7).getValues() : [];
  var rows = [];
  properties.filter(function(p) { return p.primary; }).forEach(function(p) {
    var own = all.filter(function(r) { return String(r[0]) === p.property; })
      .sort(function(a,b) { return String(a[1]).localeCompare(String(b[1])); });
    if (!own.length) return;
    [7, 28].forEach(function(days) {
      var end = String(own[own.length - 1][1]);
      var startDate = new Date(end + "T00:00:00Z");
      startDate.setUTCDate(startDate.getUTCDate() - days + 1);
      var start = Utilities.formatDate(startDate, "GMT", "yyyy-MM-dd");
      var selected = own.filter(function(r) { return String(r[1]) >= start && String(r[1]) <= end; });
      var clicks = 0, imp = 0, weighted = 0;
      selected.forEach(function(r) {
        clicks += Number(r[2]); imp += Number(r[3]); weighted += Number(r[5]) * Number(r[3]);
      });
      rows.push([p.property, p.slug, days, end, clicks, imp, imp ? clicks / imp : 0, imp ? weighted / imp : 0, selected.length, now]);
    });
  });
  var count = overviewSheet.getLastRow();
  var width = OF_GSC.sheetHeaders.SEO_Overview.length;
  if (rows.length) {
    if (overviewSheet.getMaxRows() < rows.length + 1) overviewSheet.insertRowsAfter(overviewSheet.getMaxRows(), rows.length + 1 - overviewSheet.getMaxRows());
    overviewSheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
  if (count - 1 > rows.length) overviewSheet.getRange(rows.length + 2, 1, count - 1 - rows.length, width).clearContent();
}

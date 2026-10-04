/**
 * Auto-Approval Engine
 * 
 * Implements 24-hour review window expiration and automatic approval matching code.gs:863-922:
 * 1. Checks all daily reports with status 'Pending Review' (or unreviewed with completed eod_data).
 * 2. Determines expiry time:
 *    a. parseTimestampSafe(r.expiry_timestamp)
 *    b. parseTimestampSafe(r.eod_submitted_at) + 24h
 *    c. parseTimestampSafe(r.last_updated) + 24h
 *    d. Fallback: parseTimestampSafe(r.date) + 36h (end of day + 12h)
 *    e. Hard safeguard: If report date is older than 36h, it is definitely expired
 * 3. If now > expiryTime:
 *    - Recomputes system_score if 0 or null from bod_data and eod_data
 *    - Sets head_rating = 100 (DEFAULT_HEAD_RATING)
 *    - Sets final_score = calculateFinalScore(system_score, 100)
 *    - Sets approval_status = 'Auto Approved'
 *    - Sets approval_timestamp and rated_on
 *    - Sets rated_by = 'System (Auto Approval)'
 *    - Updates database and pushes update to Google Sheets (syncDailyReportToSheets)
 *    - Inserts employee notification
 */

import { query, run, get } from './db.js';
import {
  calculatePerformance,
  calculateFinalScore,
  parseScoreHelper,
  DEFAULT_HEAD_RATING
} from './scoringEngine.js';
import { parseTimestampSafe, syncDailyReportToSheets, normalizeDateToDDMMYYYY } from './googleSheets.js';

const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTO_APPROVAL_THROTTLE_MS = 30 * 1000; // Run at most once every 30 seconds
let lastCheckTime = 0;

/**
 * Helper to process a list of candidate reports for auto-approval.
 */
async function processCandidateReports(reports, now) {
  let autoApprovedCount = 0;

  for (const r of reports) {
    // Validate that EOD data actually exists and has tasks
    let eodObj = null;
    if (r.eod_data) {
      try {
        eodObj = typeof r.eod_data === 'object' ? r.eod_data : JSON.parse(r.eod_data);
      } catch (e) {}
    }
    if (!eodObj || typeof eodObj !== 'object' || Object.keys(eodObj).length === 0) {
      continue; // Skip reports where Evening EOD was never completed
    }

    // Safeguard 0: Under NO circumstance can today's report be auto-approved on the same day!
    const todayStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
    const normDate = normalizeDateToDDMMYYYY(r.date);
    if (normDate === todayStr || r.date === todayStr) {
      continue;
    }

    // Safeguard A: NEVER auto-approve if the head has manually approved or rated
    const hasHumanReviewer = (
      r.approval_status === 'Approved' ||
      (r.rating_edited_by && r.rating_edited_by.trim() !== '' && !r.rating_edited_by.toLowerCase().includes('system')) ||
      (r.rated_by && r.rated_by.trim() !== '' && !r.rated_by.toLowerCase().includes('system'))
    );
    if (hasHumanReviewer) {
      continue;
    }

    // Determine review window floor:
    // A daily report for date D represents work for that day.
    // The manager review window MUST give the head the ENTIRE next day (until 23:59:59 of Date D + 1) to review!
    // Example: For 03/10/2026, the review window is OPEN all through 04/10/2026 until 23:59:59.
    let minReviewExpiry = null;
    const normDateStr = normalizeDateToDDMMYYYY(r.date);
    const dParts = normDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dParts) {
      const rDay = parseInt(dParts[1], 10);
      const rMonth = parseInt(dParts[2], 10) - 1;
      const rYear = parseInt(dParts[3], 10);
      // Next day end (23:59:59.999): Day D + 1
      minReviewExpiry = new Date(rYear, rMonth, rDay + 1, 23, 59, 59, 999).getTime();
    }

    let expiryTime = parseTimestampSafe(r.expiry_timestamp, true);
    if (!expiryTime && r.eod_submitted_at) {
      const eodSub = parseTimestampSafe(r.eod_submitted_at);
      if (eodSub) expiryTime = eodSub + REVIEW_WINDOW_MS;
    }
    if (!expiryTime && r.last_updated) {
      const lu = parseTimestampSafe(r.last_updated);
      if (lu) expiryTime = lu + REVIEW_WINDOW_MS;
    }
    // Fallback: report date + 48 hours
    if (!expiryTime && r.date) {
      const rd = parseTimestampSafe(r.date);
      if (rd) expiryTime = rd + (48 * 60 * 60 * 1000);
    }

    // Safety floor: A report for date D can NEVER expire before 23:59:59 of date D+1
    if (minReviewExpiry) {
      expiryTime = Math.max(expiryTime || 0, minReviewExpiry);
    }

    if (expiryTime && now > expiryTime) {
      let sysScore = parseScoreHelper(r.system_score, 100);
      // If system score was 0 or null, recompute from eod_data
      if ((sysScore === 0 || r.system_score === null) && eodObj) {
        let bodObj = null;
        try { bodObj = typeof r.bod_data === 'object' ? r.bod_data : JSON.parse(r.bod_data); } catch (e) {}
        const recomputed = calculatePerformance(bodObj, eodObj);
        if (recomputed > 0) sysScore = recomputed;
      }

      const finalScore = calculateFinalScore(sysScore, DEFAULT_HEAD_RATING);
      const expiryDateStr = new Date(expiryTime).toISOString();
      const nowIso = new Date().toISOString();

      const isPg = Boolean(process.env.DATABASE_URL);
      if (isPg) {
        await run(
          `UPDATE daily_reports 
           SET system_score = ?,
               "systemScore" = ?,
               head_rating = ?, 
               "headRating" = ?,
               final_score = ?, 
               "finalScore" = ?,
               approval_status = 'Auto Approved', 
               approval_timestamp = ?, 
               rated_by = 'System (Auto Approval)', 
               rated_on = ?, 
               last_updated = ?,
               "lastUpdated" = ?
           WHERE id = ? OR (date = ? AND employee_id = ?)`,
          [sysScore, sysScore, DEFAULT_HEAD_RATING, String(DEFAULT_HEAD_RATING), finalScore, finalScore, expiryDateStr, expiryDateStr, nowIso, nowIso, r.id, r.date, r.employee_id]
        );
      } else {
        await run(
          `UPDATE daily_reports 
           SET system_score = ?, 
               head_rating = ?, 
               final_score = ?, 
               approval_status = 'Auto Approved', 
               approval_timestamp = ?, 
               rated_by = 'System (Auto Approval)', 
               rated_on = ?, 
               last_updated = ? 
           WHERE id = ? OR (date = ? AND employee_id = ?)`,
          [sysScore, DEFAULT_HEAD_RATING, finalScore, expiryDateStr, expiryDateStr, nowIso, r.id, r.date, r.employee_id]
        );
      }

      // Send employee notification
      try {
        const notifId = 'N' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        await run(
          `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
          [notifId, r.employee_id, 'Auto Approved', `Your report for ${r.date} was auto-approved with a head rating of 100%.`, nowIso]
        );
      } catch (notifErr) {
        // Ignore notification insert error
      }

      autoApprovedCount++;
      console.log(`[Auto Approval] ✅ Auto-approved report for ${r.employee_id} on ${r.date} (SysScore: ${sysScore}%, FinalScore: ${finalScore}%)`);
    }
  }

  return autoApprovedCount;
}

/**
 * Checks all reports in the database across all employees for expired review windows.
 */
export async function checkAutoApprovals(force = false) {
  try {
    const now = Date.now();
    if (!force && (now - lastCheckTime < AUTO_APPROVAL_THROTTLE_MS)) {
      return 0; // Return early if checked recently
    }
    lastCheckTime = now;

    // Find all reports pending review that have completed EOD data and NO human reviewer
    const reports = await query(`
      SELECT * FROM daily_reports 
      WHERE (approval_status IS NULL OR approval_status = 'Pending Review' OR approval_status = '')
        AND (rating_edited_by IS NULL OR rating_edited_by = '' OR LOWER(rating_edited_by) LIKE '%system%')
        AND (rated_by IS NULL OR rated_by = '' OR LOWER(rated_by) LIKE '%system%')
        AND eod_data IS NOT NULL 
        AND eod_data != ''
        AND eod_data != '{}'
        AND eod_data != 'null'
    `);

    const autoApprovedCount = await processCandidateReports(reports, now);

    if (autoApprovedCount > 0) {
      console.log(`[Auto Approval] Successfully auto-approved ${autoApprovedCount} expired daily reports. Triggering batch outbound sync...`);
      import('./syncEngine.js').then(m => m.syncOutbound()).catch(err => {
        console.warn('[Auto Approval] Background outbound sync notice:', err.message);
      });
    }

    return { success: true, count: autoApprovedCount };
  } catch (err) {
    console.error('[Auto Approval] ❌ Error running auto approvals:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Instant unthrottled auto-approval check specifically for one employee.
 * Called on every employee dashboard load to guarantee the employee always
 * sees up-to-date statuses without waiting for the global background timer.
 */
export async function checkEmployeeAutoApprovals(empId) {
  if (!empId) return 0;
  try {
    const now = Date.now();
    const reports = await query(`
      SELECT * FROM daily_reports 
      WHERE (employee_id = ? OR employee_id = ?)
        AND (approval_status IS NULL OR approval_status = 'Pending Review' OR approval_status = '')
        AND (rating_edited_by IS NULL OR rating_edited_by = '' OR LOWER(rating_edited_by) LIKE '%system%')
        AND (rated_by IS NULL OR rated_by = '' OR LOWER(rated_by) LIKE '%system%')
        AND eod_data IS NOT NULL 
        AND eod_data != ''
        AND eod_data != '{}'
        AND eod_data != 'null'
    `, [empId, empId]);

    if (!reports || reports.length === 0) return 0;
    return await processCandidateReports(reports, now);
  } catch (err) {
    console.warn('[Auto Approval] checkEmployeeAutoApprovals notice:', err.message);
    return 0;
  }
}

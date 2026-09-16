/**
 * Auto-Approval Engine
 * 
 * Implements 24-hour review window expiration and automatic approval matching code.gs:863-922:
 * 1. Checks all daily reports with status 'Pending Review' (or unreviewed with completed eod_data).
 * 2. Determines expiry time:
 *    a. parseTimestampSafe(r.expiry_timestamp)
 *    b. parseTimestampSafe(r.last_updated) + 24h
 *    c. Fallback: parseTimestampSafe(r.date) + 36h (end of day + 12h)
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
import { parseTimestampSafe, syncDailyReportToSheets } from './googleSheets.js';

const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkAutoApprovals() {
  try {
    const now = Date.now();
    // Find all reports pending review that have completed EOD data
    const reports = await query(`
      SELECT * FROM daily_reports 
      WHERE (approval_status IS NULL OR approval_status = 'Pending Review' OR approval_status = '')
        AND eod_data IS NOT NULL 
        AND eod_data != ''
    `);

    let autoApprovedCount = 0;

    for (const r of reports) {
      let expiryTime = parseTimestampSafe(r.expiry_timestamp);
      if (!expiryTime && r.last_updated) {
        const lu = parseTimestampSafe(r.last_updated);
        if (lu) expiryTime = lu + REVIEW_WINDOW_MS;
      }
      // Fallback: report date + 36 hours (e.g. end of work day + 24 hours review window)
      if (!expiryTime && r.date) {
        const rd = parseTimestampSafe(r.date);
        if (rd) expiryTime = rd + (36 * 60 * 60 * 1000);
      }

      if (expiryTime && now > expiryTime) {
        let sysScore = parseScoreHelper(r.system_score, 100);
        // If system score was 0 or null, recompute from eod_data
        if ((sysScore === 0 || r.system_score === null) && r.eod_data) {
          let bodObj = null, eodObj = null;
          try { bodObj = typeof r.bod_data === 'object' ? r.bod_data : JSON.parse(r.bod_data); } catch (e) {}
          try { eodObj = typeof r.eod_data === 'object' ? r.eod_data : JSON.parse(r.eod_data); } catch (e) {}
          const recomputed = calculatePerformance(bodObj, eodObj);
          if (recomputed > 0) sysScore = recomputed;
        }

        const finalScore = calculateFinalScore(sysScore, DEFAULT_HEAD_RATING);
        const expiryDateStr = new Date(expiryTime).toISOString();
        const nowIso = new Date().toISOString();

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

        // Send employee notification
        try {
          const notifId = 'N' + Date.now() + '_' + Math.floor(Math.random() * 10000);
          await run(
            `INSERT INTO notifications (id, employee_id, type, message, created_on, read) VALUES (?, ?, ?, ?, ?, 0)`,
            [notifId, r.employee_id, 'Auto Approved', `Your report for ${r.date} was auto-approved with a head rating of 100%.`, nowIso]
          );
        } catch (notifErr) {
          console.warn('[Auto Approval] Notification insert notice:', notifErr.message);
        }

        // Outbound sync to Google Sheets
        try {
          const updated = await get(
            `SELECT * FROM daily_reports WHERE date = ? AND employee_id = ?`,
            [r.date, r.employee_id]
          );
          if (updated) {
            syncDailyReportToSheets(updated).catch(err => {
              console.warn('[Auto Approval] Sheet sync notice (ignored):', err.message);
            });
          }
        } catch (syncErr) {
          console.warn('[Auto Approval] Outbound sync fetch notice:', syncErr.message);
        }

        autoApprovedCount++;
        console.log(`[Auto Approval] ✅ Auto-approved report for ${r.employee_id} on ${r.date} (SysScore: ${sysScore}%, FinalScore: ${finalScore}%)`);
      }
    }

    if (autoApprovedCount > 0) {
      console.log(`[Auto Approval] Successfully auto-approved ${autoApprovedCount} expired daily reports.`);
    }

    return { success: true, count: autoApprovedCount };
  } catch (err) {
    console.error('[Auto Approval] ❌ Error running auto approvals:', err);
    return { success: false, error: err.message };
  }
}

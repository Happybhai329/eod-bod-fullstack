import React, { useState, useEffect } from 'react';

function safeClientPercentage(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : Math.round(num);
}

export default function ReportDetailModal({ isOpen, onClose, report, user, onOpenFine, onRateSuccess }) {
  const [currentReport, setCurrentReport] = useState(report);
  const [attendance, setAttendance] = useState('Present');
  const [overtime, setOvertime] = useState(0);
  const [rating, setRating] = useState(100);
  const [savingRating, setSavingRating] = useState(false);
  const [ratingMsg, setRatingMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (report) {
      setCurrentReport(report);
      setAttendance(report.attendance || 'Present');
      setOvertime(report.overtime !== undefined && report.overtime !== null ? report.overtime : 0);
      setRating(report.head_rating !== undefined && report.head_rating !== null ? report.head_rating : 100);
      setRatingMsg({ text: '', type: '' });
    }
  }, [report]);

  if (!isOpen || !currentReport) return null;

  let bodData = null;
  let eodData = null;
  try { bodData = typeof currentReport.bod_data === 'string' ? JSON.parse(currentReport.bod_data) : currentReport.bod_data; } catch (e) {}
  try { eodData = typeof currentReport.eod_data === 'string' ? JSON.parse(currentReport.eod_data) : currentReport.eod_data; } catch (e) {}

  const hasEod = Boolean(eodData && typeof eodData === 'object' && Object.keys(eodData).length > 0);
  const isHead = Boolean(user?.isHead || user?.role?.toLowerCase().includes('head') || user?.role?.toLowerCase().includes('admin'));
  const approvalStatus = currentReport.approval_status || currentReport.ratingStatus || 'Pending Review';
  const isLocked = approvalStatus === 'Approved' || approvalStatus === 'Auto Approved';
  const hasExistingRating = currentReport.head_rating !== null && currentReport.head_rating !== undefined;

  const sysScore = safeClientPercentage(currentReport.system_score ?? currentReport.sysScore);
  const headRatingVal = hasExistingRating ? safeClientPercentage(currentReport.head_rating) : null;
  const finalScoreVal = !hasEod ? null : (!isLocked && approvalStatus === 'Pending Review' && !hasExistingRating ? null : safeClientPercentage(currentReport.final_score));

  const empId = currentReport.employee_id || currentReport.empId;
  const dateStr = currentReport.date;

  const handleSaveHeadRating = async () => {
    const numRating = parseFloat(rating);
    if (isNaN(numRating) || numRating < 0 || numRating > 200) {
      alert('Quality rating must be a valid number between 0 and 200.');
      return;
    }

    const numOvertime = parseFloat(overtime);
    if (isNaN(numOvertime) || numOvertime < 0) {
      alert('Overtime hours must be a non-negative number.');
      return;
    }

    setSavingRating(true);
    setRatingMsg({ text: '', type: '' });

    try {
      const res = await fetch('/api/head/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId,
          dateStr,
          rating: numRating,
          attendance,
          overtime: numOvertime,
          headId: user?.id || 'HEAD'
        })
      });

      const data = await res.json();
      if (data.success) {
        setRatingMsg({ text: `Rating saved! Final score: ${data.finalScore}%`, type: 'success' });
        setCurrentReport(prev => ({
          ...prev,
          head_rating: numRating,
          final_score: data.finalScore,
          attendance,
          overtime: numOvertime,
          approval_status: 'Approved',
          rating_last_updated: new Date().toISOString(),
          rating_edited_by: user?.name || user?.id
        }));
        if (onRateSuccess) onRateSuccess();
      } else {
        setRatingMsg({ text: data.message || 'Rating could not be saved.', type: 'danger' });
      }
    } catch (err) {
      setRatingMsg({ text: 'A system error prevented the rating update.', type: 'danger' });
    } finally {
      setSavingRating(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px', width: '95%' }}>
        {/* Modal Header matching index.html taskDetailModal */}
        <div className="modal-header bg-navy text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            Task Details - <span style={{ color: '#f6bd3b' }}>{dateStr}</span> ({empId})
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        {/* Modal Body matching index.html */}
        <div className="modal-body bg-light" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '20px' }}>
          {/* Detail Overview Bar */}
          <div className="detail-overview mb-3">
            <span><strong>Date:</strong> {dateStr}</span>
            <span>|</span>
            <span><strong>Department:</strong> {currentReport.department || 'General'}</span>
            <span>|</span>
            <span>
              <strong>System Completion:</strong>{' '}
              {hasEod ? (
                `${sysScore}%`
              ) : (
                <span
                  className="badge"
                  style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.74rem', padding: '2px 6px', fontWeight: 600 }}
                >
                  Pending EOD
                </span>
              )}
            </span>
            {headRatingVal !== null && (
              <>
                <span>|</span>
                <span><strong>Head Rating:</strong> {headRatingVal}%</span>
              </>
            )}
            <span>|</span>
            <span><strong>Final Score:</strong> {hasEod && finalScoreVal !== null ? `${finalScoreVal}%` : 'Pending'}</span>
          </div>

          {/* 3 Score Cards with Progress Bars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div className="score-card">
              <div className="score-label">System %</div>
              <div className="score-value" style={{ fontSize: hasEod ? '1.5rem' : '1rem' }}>
                {hasEod ? `${sysScore}%` : 'Pending EOD'}
              </div>
              <div className="progress">
                <div className="progress-bar bg-primary" style={{ width: `${hasEod ? Math.min(100, sysScore) : 0}%` }}></div>
              </div>
            </div>

            <div className="score-card">
              <div className="score-label">Head %</div>
              <div className="score-value">{headRatingVal !== null ? `${headRatingVal}%` : '-'}</div>
              <div className="progress">
                <div className="progress-bar bg-warning" style={{ width: `${headRatingVal !== null ? Math.min(100, headRatingVal / 2) : 0}%` }}></div>
              </div>
            </div>

            <div className="score-card">
              <div className="score-label">Final %</div>
              <div className="score-value">{hasEod && finalScoreVal !== null ? `${finalScoreVal}%` : '-'}</div>
              <div className="progress">
                <div className="progress-bar bg-success" style={{ width: `${hasEod && finalScoreVal !== null ? Math.min(100, finalScoreVal / 2) : 0}%` }}></div>
              </div>
            </div>
          </div>

          {/* Status Badges */}
          <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
            <span className={`badge ${isLocked ? 'status-approved' : 'status-pending'}`}>
              <i className={`bi ${isLocked ? 'bi-check-circle-fill' : 'bi-hourglass-split'} me-1`}></i>
              {approvalStatus}
            </span>
            {!isLocked && (
              <span className="badge status-pending">
                <i className="bi bi-clock me-1"></i>
                Pending Review
              </span>
            )}
            {currentReport.fine_amount > 0 && (
              <span className="badge status-fine">
                <i className="bi bi-exclamation-octagon me-1"></i>
                Fine: ₹{currentReport.fine_amount} ({currentReport.fine_status || 'Pending'})
              </span>
            )}
          </div>

          {/* BOD (Morning) Target Section */}
          {bodData && Object.keys(bodData).length > 0 && (
            <div className="mb-4">
              <h6 className="text-primary border-bottom pb-2 fw-bold" style={{ fontSize: '0.95rem' }}>
                <i className="bi bi-sun me-1"></i> BOD (Morning) Target
              </h6>
              {Object.keys(bodData).map((key) => {
                const item = bodData[key];
                return (
                  <div key={key} className="detail-task mb-2">
                    <strong style={{ fontSize: '0.9rem', color: '#13233f' }}>{key}</strong>
                    <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                      {item.type === 'dynamicList' ? (
                        item.list && item.list.length > 0 ? (
                          <ul className="mb-0 mt-2 ps-3" style={{ listStyleType: 'none' }}>
                            {item.list.map((l, idx) => (
                              <li key={idx} className="mb-2">
                                <b>{l.title}</b>
                                {l.time && (
                                  <span className="badge bg-info text-dark shadow-sm ms-2" style={{ fontSize: '0.72rem' }}>
                                    <i className="bi bi-clock me-1"></i>{l.time}
                                  </span>
                                )}
                                {(l.hasTarget === true || l.hasTarget === 'true' || l.hasTarget === undefined) ? (
                                  <span className="text-muted ms-2">| Target: <b>{l.target || 'N/A'}</b></span>
                                ) : (
                                  <span className="text-muted ms-2">| <i>(Yes/No Task)</i></span>
                                )}
                                {l.description && (
                                  <ul className="mb-0 mt-1 ps-3 text-muted small" style={{ listStyleType: 'circle' }}>
                                    {l.description.split('\n').filter(x => x.trim() !== '').map((line, liIdx) => (
                                      <li key={liIdx}>{line}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted">No items listed.</span>
                        )
                      ) : item.type === 'checkbox' ? (
                        <span>Target: <b>{item.value}</b></span>
                      ) : item.type === 'number' ? (
                        <span>Target Count: <b>{item.value}</b></span>
                      ) : item.type === 'categoryNumber' ? (
                        <div>
                          <span>Target: <b>{item.value || 'N/A'}</b></span>
                          {item.subCategories && (
                            <ul className="mb-0 mt-1 ps-3">
                              {Object.entries(item.subCategories).map(([cat, val]) => (
                                <li key={cat}>{cat}: <b>{val}</b></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <span>{item.value || 'N/A'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* EOD (Evening) Status Section */}
          {eodData && Object.keys(eodData).length > 0 && (
            <div className="mb-4">
              <h6 className="text-success border-bottom pb-2 fw-bold" style={{ fontSize: '0.95rem' }}>
                <i className="bi bi-moon-stars me-1"></i> EOD (Evening) Status
              </h6>
              {Object.keys(eodData).map((key) => {
                const item = eodData[key];
                return (
                  <div key={key} className="detail-task mb-2">
                    <strong style={{ fontSize: '0.9rem', color: '#13233f' }}>{key}</strong>
                    <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                      {item.type === 'dynamicList' ? (
                        item.list && item.list.length > 0 ? (
                          <ul className="mb-0 mt-2 ps-3" style={{ listStyleType: 'none' }}>
                            {item.list.map((l, idx) => {
                              const bItem = (bodData && bodData[key] && bodData[key].list)
                                ? bodData[key].list.find(x => x.title === l.title)
                                : null;

                              return (
                                <li key={idx} className="mb-2">
                                  <b>{l.title}</b>
                                  {l.time && (
                                    <span className="badge bg-info text-dark shadow-sm ms-2" style={{ fontSize: '0.72rem' }}>
                                      <i className="bi bi-clock me-1"></i>{l.time}
                                    </span>
                                  )}
                                  {(l.hasTarget === true || l.hasTarget === 'true' || l.hasTarget === undefined) ? (
                                    <>
                                      {l.target && <span className="text-muted ms-2">| Target: {l.target}</span>}
                                      <span className="ms-2">| Achieved: <b className="text-success">{l.achieved || 0}</b></span>
                                    </>
                                  ) : (
                                    <span className="ms-2">
                                      | Status: {l.status === 'Done' ? (
                                        <b className="text-success">Done</b>
                                      ) : (
                                        <b className="text-danger">Not Done</b>
                                      )}
                                    </span>
                                  )}
                                  {l.isVoluntary && (
                                    <span className="badge bg-success ms-2" style={{ fontSize: '0.7rem' }}>Voluntary</span>
                                  )}

                                  {/* Interactive / Visual Checklist marks */}
                                  {bItem && bItem.description && l.checklist && (
                                    <div className="mt-2 ms-2 ps-2 border-start border-2 border-primary" style={{ borderLeftColor: '#3157d5' }}>
                                      {bItem.description.split('\n').filter(x => x.trim() !== '').map((line, cIdx) => {
                                        const isChecked = Boolean(l.checklist[cIdx]);
                                        return (
                                          <div key={cIdx} className="small mb-1 d-flex align-items-center gap-2">
                                            {isChecked ? (
                                              <i className="bi bi-check-square-fill text-success" style={{ fontSize: '0.9rem' }}></i>
                                            ) : (
                                              <i className="bi bi-square text-muted" style={{ fontSize: '0.9rem' }}></i>
                                            )}
                                            <span className={isChecked ? 'text-success fw-bold' : 'text-muted'}>
                                              {line}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <span className="text-muted">No items listed.</span>
                        )
                      ) : item.type === 'checkbox' ? (
                        <span>Status: {item.status === 'Done' ? <b className="text-success">Done</b> : <b className="text-danger">Not Done</b>}</span>
                      ) : item.type === 'number' ? (
                        <span>Achieved: <b className="text-success">{item.value}</b></span>
                      ) : item.type === 'categoryNumber' ? (
                        <div>
                          <span>Main Value: <b>{item.value || 'N/A'}</b></span>
                          {item.subCategories && (
                            <ul className="mb-0 mt-1 ps-3">
                              {Object.entries(item.subCategories).map(([cat, val]) => (
                                <li key={cat}>{cat}: <b>{val}</b></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <span>{item.value || 'N/A'}</span>
                      )}

                      {item.remarks && item.remarks.trim() !== '' && (
                        <div className="mt-2 text-muted small bg-light p-2 rounded border" style={{ whiteSpace: 'pre-wrap' }}>
                          <strong>Remarks/Details:</strong><br />
                          {item.remarks}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!bodData && !eodData && (
            <p className="text-muted text-center py-4">No task data available for this date.</p>
          )}

          {/* Head Rating, Attendance & Scrutiny Panel */}
          <div className="card p-3 mt-3 border-info bg-light" style={{ borderColor: '#38bdf8' }}>
            <h6 className="text-info border-bottom pb-2 fw-bold" style={{ fontSize: '0.95rem', color: '#0284c7' }}>
              <i className="bi bi-shield-check me-1"></i> Head Rating, Attendance & Scrutiny
            </h6>

            <div className="mb-2" style={{ fontSize: '0.85rem' }}>
              <strong>System Computed Score:</strong> {hasEod ? `${sysScore}%` : 'Pending (Awaiting EOD submission)'}
            </div>

            {/* Audit banner */}
            {!hasEod ? (
              <div className="alert alert-warning py-2 mb-3 small" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                <i className="bi bi-hourglass-split me-1"></i>
                <strong>Awaiting EOD Submission:</strong> The employee has submitted morning BOD tasks, but the evening EOD report has not yet been submitted. Under standard operating rules, reports can only be scored and rated after EOD submission.
              </div>
            ) : hasExistingRating ? (
              <div className="alert alert-info py-2 mb-3 small">
                <strong>Current Score:</strong> {finalScoreVal}%<br />
                {currentReport.rating_last_updated && (
                  <><strong>Last Updated:</strong> {currentReport.rating_last_updated}<br /></>
                )}
                {currentReport.rating_edited_by && (
                  <><strong>Edited By:</strong> {currentReport.rating_edited_by}</>
                )}
              </div>
            ) : (
              <div className="alert alert-secondary py-2 mb-3 small">
                <strong>Current Score:</strong> {finalScoreVal !== null ? `${finalScoreVal}%` : 'Pending'}<br />
                No saved head rating yet.
              </div>
            )}

            {/* If viewed by Head and report is not locked: interactive scrutiny controls */}
            {isHead && !isLocked && hasEod && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="form-label text-navy fw-bold" style={{ fontSize: '0.8rem', marginBottom: '4px', display: 'block' }}>
                      Attendance
                    </label>
                    <select
                      className="form-select border-primary"
                      value={attendance}
                      onChange={(e) => setAttendance(e.target.value)}
                    >
                      <option value="Present">Present</option>
                      <option value="Absent">Absent (Leave)</option>
                      <option value="Late">Late</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label text-navy fw-bold" style={{ fontSize: '0.8rem', marginBottom: '4px', display: 'block' }}>
                      Overtime (Hrs)
                    </label>
                    <input
                      type="number"
                      className="form-control border-primary"
                      min="0"
                      step="0.25"
                      value={overtime}
                      onChange={(e) => setOvertime(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label text-navy fw-bold" style={{ fontSize: '0.8rem', marginBottom: '4px', display: 'block' }}>
                      Head Quality Rating (0-200)
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="number"
                        className="form-control border-primary"
                        min="0"
                        max="200"
                        step="0.5"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        placeholder="0-200"
                      />
                      <button
                        type="button"
                        className="btn btn-primary fw-bold"
                        disabled={savingRating}
                        onClick={handleSaveHeadRating}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {savingRating ? 'Saving...' : (hasExistingRating ? 'Update Rating' : 'Save')}
                      </button>
                    </div>
                    <small className="text-muted d-block mt-1" style={{ fontSize: '0.72rem' }}>
                      Quality of work: 0% poor | 100% excellent | 200% exceptional
                    </small>
                  </div>
                </div>

                {ratingMsg.text && (
                  <div className={`alert ${ratingMsg.type === 'success' ? 'alert-info' : 'alert-warning'} py-2 mb-2 small fw-bold`}>
                    {ratingMsg.text}
                  </div>
                )}

                <div className="mt-2">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm fw-bold"
                    onClick={() => {
                      if (onOpenFine) onOpenFine(empId, dateStr);
                    }}
                  >
                    <i className="bi bi-exclamation-octagon me-1"></i> Issue Fine
                  </button>
                </div>
              </div>
            )}

            {/* If viewed by Head and report is locked */}
            {isHead && isLocked && (
              <div className="alert alert-warning py-2 mb-0 small">
                <i className="bi bi-lock me-1"></i> This report is locked ({approvalStatus}). Rating cannot be changed.
              </div>
            )}

            {/* If viewed by regular employee */}
            {!isHead && (
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <span className="badge bg-secondary">Attendance: {currentReport.attendance || 'Present'}</span>
                <span className="badge bg-secondary">Overtime: {currentReport.overtime || 0} Hrs</span>
                <span className="badge bg-primary">Final Approved Score: {currentReport.final_score !== null && currentReport.final_score !== undefined ? `${currentReport.final_score}%` : 'Pending'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer matching index.html */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

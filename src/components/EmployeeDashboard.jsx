import React, { useState, useEffect } from 'react';
import AssignedTasksPanel from './AssignedTasksPanel';

function formatRemainingTime(ms) {
  if (ms == null || isNaN(ms) || ms <= 0) return '';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function formatScorePercent(val) {
  if (val === null || val === undefined || val === '' || val === '-') return '-';
  let n = parseFloat(String(val).replace('%', '').trim());
  if (isNaN(n)) return '-';
  while (n > 200) n = n / 100;
  return `${Math.round(n)}%`;
}

function parseDateToMs(dStr) {
  if (!dStr) return 0;
  const parts = String(dStr).split('/');
  if (parts.length === 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
  return new Date(dStr).getTime() || 0;
}

function hasEod(r) {
  if (!r) return false;
  if (r.has_eod !== undefined) return Boolean(r.has_eod);
  if (!r.eod_data) return false;
  try {
    const parsed = typeof r.eod_data === 'object' ? r.eod_data : JSON.parse(r.eod_data);
    return Boolean(parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0);
  } catch (e) {
    return false;
  }
}

export default function EmployeeDashboard({ user, showToast, onOpenForm, onOpenKraSop, onOpenDetail, refreshTrigger }) {
  const [filter, setFilter] = useState('Weekly');
  const [data, setData] = useState({ average: 0, reports: [], fines: [] });
  const [todayStatus, setTodayStatus] = useState({ bodFilled: false, eodFilled: false });
  const [bodData, setBodData] = useState(null);
  const [eodData, setEodData] = useState(null);
  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Fine response state
  const [selectedFine, setSelectedFine] = useState(null);
  const [fineStatusChoice, setFineStatusChoice] = useState('Acknowledged');
  const [employeeRemarks, setEmployeeRemarks] = useState('');
  const [updatingFine, setUpdatingFine] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetchFormAndDashboard();
  }, [user.id, filter, refreshTrigger]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const fetchFormAndDashboard = async () => {
    setLoading(true);
    try {
      // Fetch dynamic form status and dashboard performance in parallel for maximum speed
      const [formRes, dashRes] = await Promise.all([
        fetch(`/api/employee/${user.id}/form`),
        fetch(`/api/employee/${user.id}/dashboard?filter=${filter}`)
      ]);

      const [formData, dashData] = await Promise.all([
        formRes.json(),
        dashRes.json()
      ]);

      if (formData.success) {
        setTodayStatus(formData.todayStatus || { bodFilled: false, eodFilled: false });
        setBodData(formData.bodData);
        setEodData(formData.eodData);
        setConfig(formData.config || []);
        setFetchedAt(Date.now());
        setNow(Date.now());
      }

      if (dashData.success) {
        setData(dashData.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const elapsed = Math.max(0, now - fetchedAt);
  const bodRemaining = Math.max(0, (todayStatus.bodRemainingMs || 0) - elapsed);
  const eodRemaining = Math.max(0, (todayStatus.eodRemainingMs || 0) - elapsed);
  const isBodEditable = todayStatus.bodEditable && (todayStatus.bodRemainingMs ? bodRemaining > 0 : true);
  const isEodEditable = todayStatus.eodEditable && (todayStatus.eodRemainingMs ? eodRemaining > 0 : true);

  const handleOpenFineResponse = (fine) => {
    setSelectedFine(fine);
    setFineStatusChoice(fine.status === 'Pending' ? 'Acknowledged' : fine.status);
    setEmployeeRemarks(fine.employee_remarks || '');
  };

  const handleSaveFineResponse = async (e) => {
    e.preventDefault();
    if (!selectedFine) return;
    setUpdatingFine(true);
    try {
      const res = await fetch('/api/fines/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fineId: selectedFine.id,
          status: fineStatusChoice,
          employeeRemarks: employeeRemarks.trim()
        })
      });
      const resData = await res.json();
      if (resData.success) {
        setSelectedFine(null);
        fetchFormAndDashboard();
      } else {
        alert(resData.message || 'Failed to update fine.');
      }
    } catch (err) {
      alert('Error updating fine status.');
    } finally {
      setUpdatingFine(false);
    }
  };

  const getStatusBadge = (r) => {
    const status = typeof r === 'string' ? r : (r.approval_status || r.ratingStatus);
    if (status === 'EOD Missed') {
      return <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5' }}>EOD Missed</span>;
    }
    if (status === 'Pending EOD') {
      return <span className="badge badge-pending">Pending EOD</span>;
    }
    if (status === 'Approved') return <span className="badge badge-approved">Approved</span>;
    if (status === 'Auto Approved') return <span className="badge badge-auto">Auto Approved</span>;
    return <span className="badge badge-pending">Pending Review</span>;
  };

  return (
    <div>
      {/* Page Intro */}
      <div className="section-header" style={{ marginBottom: '24px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            My Workday Workspace
          </span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--ink)' }}>
            Welcome back, {user.name}
          </h1>
          <p className="section-description">
            {user.department} {user.subDepartment ? `• ${user.subDepartment}` : ''} • Employee ID: {user.id}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onOpenKraSop}>
            <i className="bi bi-journal-text me-1"></i> View KRA & SOPs
          </button>
          <button className="btn btn-secondary" onClick={fetchFormAndDashboard}>
            <i className="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
        </div>
      </div>

      {/* Today's Action Tiles */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Today's Reports</h2>
            <p className="section-description">Complete morning BOD plan first, then submit evening EOD progress.</p>
          </div>
          <span className="badge badge-auto" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            Today: {new Date().toLocaleDateString('en-GB')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {/* BOD Tile */}
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Morning</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>🌅 BOD Planning</h3>
              </div>
              {todayStatus.bodFilled ? (
                <span className="badge badge-approved">Submitted</span>
              ) : (
                <span className="badge badge-pending">Pending</span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '8px' }}>
              Define today's key priorities, targets, and expected outcomes.
            </p>
            {todayStatus.bodFilled ? (
              isBodEditable ? (
                <span className="small text-warning fw-semibold d-block mb-3">
                  Edit available for {formatRemainingTime(bodRemaining)}
                </span>
              ) : (
                <span className="small text-muted d-block mb-3">Edit window closed</span>
              )
            ) : (
              <span className="small text-muted d-block mb-3">Not submitted yet</span>
            )}
            {todayStatus.bodFilled ? (
              isBodEditable ? (
                <button
                  className="btn btn-warning"
                  style={{ width: '100%' }}
                  onClick={() => onOpenForm('BOD', config, bodData, eodData)}
                >
                  <i className="bi bi-pencil-square me-1"></i> Edit Morning BOD
                </button>
              ) : (
                <button
                  className="btn btn-outline-primary"
                  style={{ width: '100%' }}
                  disabled
                >
                  <i className="bi bi-check-circle me-1"></i> Morning BOD Submitted
                </button>
              )
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => onOpenForm('BOD', config, bodData, eodData)}
              >
                <i className="bi bi-sun me-1"></i> Open BOD Form
              </button>
            )}
          </div>

          {/* EOD Tile */}
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase' }}>Evening</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>🌆 EOD Progress</h3>
              </div>
              {todayStatus.eodFilled ? (
                <span className="badge badge-approved">Submitted</span>
              ) : !todayStatus.bodFilled ? (
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                  <i className="bi bi-lock-fill me-1"></i> Locked
                </span>
              ) : (
                <span className="badge badge-pending">Pending</span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '8px' }}>
              Record actual completions and calculate today's performance score.
            </p>
            {todayStatus.eodFilled ? (
              isEodEditable ? (
                <span className="small text-warning fw-semibold d-block mb-3">
                  Edit available for {formatRemainingTime(eodRemaining)}
                </span>
              ) : (
                <span className="small text-muted d-block mb-3">Edit window closed</span>
              )
            ) : !todayStatus.bodFilled ? (
              <span className="small text-danger fw-semibold d-block mb-3">
                <i className="bi bi-exclamation-triangle-fill me-1"></i> Morning BOD must be submitted first
              </span>
            ) : (
              <span className="small text-muted d-block mb-3">Not submitted yet</span>
            )}
            {todayStatus.eodFilled ? (
              isEodEditable ? (
                <button
                  className="btn btn-warning"
                  style={{ width: '100%' }}
                  onClick={() => onOpenForm('EOD', config, bodData, eodData)}
                >
                  <i className="bi bi-pencil-square me-1"></i> Edit Evening EOD
                </button>
              ) : (
                <button
                  className="btn btn-outline-success"
                  style={{ width: '100%' }}
                  disabled
                >
                  <i className="bi bi-check-circle me-1"></i> Evening EOD Submitted
                </button>
              )
            ) : !todayStatus.bodFilled ? (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', opacity: 0.65, cursor: 'not-allowed' }}
                disabled
                title="Morning BOD must be submitted before Evening EOD unlocks"
              >
                <i className="bi bi-lock-fill me-1"></i> Submit Morning BOD First
              </button>
            ) : (
              <button
                className="btn btn-gold"
                style={{ width: '100%' }}
                onClick={() => onOpenForm('EOD', config, bodData, eodData)}
              >
                <i className="bi bi-moon-stars me-1"></i> Open EOD Form
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Assigned Tasks Card */}
      <AssignedTasksPanel empId={user.id} isModal={false} showToast={showToast} />

      {/* Performance Card */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">My Performance Average</h2>
            <p className="section-description">Average score across approved daily reports.</p>
          </div>
          <div className="filter-pills">
            <button className={`btn-pill ${filter === 'Daily' ? 'active' : ''}`} onClick={() => setFilter('Daily')}>Today</button>
            <button className={`btn-pill ${filter === 'Weekly' ? 'active' : ''}`} onClick={() => setFilter('Weekly')}>7 Days</button>
            <button className={`btn-pill ${filter === 'Monthly' ? 'active' : ''}`} onClick={() => setFilter('Monthly')}>30 Days</button>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f8fafc)', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)', padding: '28px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Approved Performance Average ({filter})
          </span>
          <h1 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--ink)', margin: '8px 0 0' }}>
            {data.average}%
          </h1>
        </div>
      </div>

      {/* Fine Notices Section */}
      {data.fines && data.fines.length > 0 && (
        <div className="app-card" style={{ borderColor: '#fca5a5' }}>
          <div className="section-header">
            <div>
              <h2 className="section-title" style={{ color: 'var(--danger)' }}>
                <i className="bi bi-exclamation-octagon-fill me-1"></i> Fine Notices ({data.fines.length})
              </h2>
              <p className="section-description">Disciplinary fine notices issued. Review, print official notice, and submit explanation/acknowledgment.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {data.fines.map((f) => (
              <div
                key={f.id}
                style={{
                  background: 'var(--danger-light)',
                  border: '1px solid #fca5a5',
                  borderRadius: 'var(--radius)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--danger)' }}>{f.id} • {f.date}</span>
                    <span className={`badge ${f.status === 'Acknowledged' ? 'badge-approved' : f.status === 'Disputed' ? 'badge-pending' : 'badge-danger'}`}>
                      {f.status || 'Pending'}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--danger)', marginBottom: '6px' }}>
                    ₹{f.amount}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--ink)', marginBottom: '8px' }}>
                    <strong>Reason:</strong> {f.reason}
                  </p>
                  {f.employee_remarks && (
                    <div style={{ fontSize: '0.78rem', background: 'white', border: '1px solid #fed7aa', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px', color: 'var(--ink)' }}>
                      <strong>Your Remarks:</strong> {f.employee_remarks}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <a
                    href={`/api/fines/${f.id}/document`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <i className="bi bi-file-earmark-pdf me-1"></i> View Notice
                  </a>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => handleOpenFineResponse(f)}
                  >
                    <i className="bi bi-pencil-square me-1"></i> Respond
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report History Table */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Report History</h2>
            <p className="section-description">Review details, ratings, and feedback on completed reports.</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="form-control"
              style={{ width: '180px', padding: '6px 12px', fontSize: '0.82rem' }}
              placeholder="Search date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="form-select"
              style={{ width: '150px', padding: '6px 12px', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Review</option>
              <option value="Approved">Approved</option>
              <option value="Auto Approved">Auto Approved</option>
              <option value="EOD Missed">EOD Missed</option>
            </select>
          </div>
        </div>

        <div className="table-shell" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="data-table" style={{ minWidth: '640px' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>System %</th>
                <th>Head Rating</th>
                <th>Final Score %</th>
                <th>Status</th>
                <th>Fine</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sortedReports = [...(data.reports || [])].sort((a, b) => parseDateToMs(b.date) - parseDateToMs(a.date));
                const filtered = sortedReports.filter(r => {
                  const matchesSearch = !searchTerm || r.date.includes(searchTerm);
                  const matchesStatus = statusFilter === 'All' ||
                    (statusFilter === 'Pending' && (r.approval_status === 'Pending Review' || r.approval_status === 'Pending EOD')) ||
                    (statusFilter === 'Approved' && r.approval_status === 'Approved') ||
                    (statusFilter === 'Auto Approved' && r.approval_status === 'Auto Approved') ||
                    (statusFilter === 'EOD Missed' && r.approval_status === 'EOD Missed');
                  return matchesSearch && matchesStatus;
                });

                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: '24px' }}>
                        No reports match your selected criteria.
                      </td>
                    </tr>
                  );
                }

                return filtered.map((r) => {
                  const validEod = hasEod(r);
                  return (
                    <tr key={r.id || r.date}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td>
                        {!validEod ? (
                          <span className="badge" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', fontSize: '0.72rem' }}>
                            {r.approval_status === 'Pending EOD' ? 'Pending EOD' : 'EOD Missed'}
                          </span>
                        ) : (
                          formatScorePercent(r.system_score ?? r.sysScore)
                        )}
                      </td>
                      <td>{validEod && r.head_rating !== null && r.head_rating !== undefined ? formatScorePercent(r.head_rating) : 'Not Rated'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {!validEod ? (
                          <span style={{ color: 'var(--ink-muted)' }}>—</span>
                        ) : (
                          r.final_score !== null && r.final_score !== undefined ? formatScorePercent(r.final_score) : 'Pending'
                        )}
                      </td>
                      <td>{getStatusBadge(r)}</td>
                      <td>
                        {r.fine_amount > 0 ? (
                          <span className="badge badge-danger">₹{r.fine_amount}</span>
                        ) : (
                          <span style={{ color: 'var(--ink-muted)' }}>-</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => onOpenDetail(r)}>
                          <i className="bi bi-eye"></i> Details
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Fine Response Modal */}
      {selectedFine && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--danger)' }}>
                  🛑 Fine Response: {selectedFine.id}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  Task Date: {selectedFine.date} • Amount: ₹{selectedFine.amount}
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedFine(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form onSubmit={handleSaveFineResponse} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div className="modal-body">
                <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', padding: '14px', borderRadius: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>Reason Given:</span>
                  <p style={{ fontSize: '0.88rem', color: 'var(--ink)', margin: '4px 0 0' }}>{selectedFine.reason}</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Response Action</label>
                  <select
                    className="form-select"
                    value={fineStatusChoice}
                    onChange={(e) => setFineStatusChoice(e.target.value)}
                  >
                    <option value="Acknowledged">Acknowledge Fine (Accept Penalty)</option>
                    <option value="Disputed">Dispute Fine (Request Review by Head)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Employee Remarks / Explanation</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    placeholder="Provide your explanation, justification, or acknowledgment remarks..."
                    value={employeeRemarks}
                    onChange={(e) => setEmployeeRemarks(e.target.value)}
                  ></textarea>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <a
                    href={`/api/fines/${selectedFine.id}/document`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}
                  >
                    <i className="bi bi-box-arrow-up-right me-1"></i> Open Printable Fine Document in New Tab
                  </a>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedFine(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updatingFine}>
                  {updatingFine ? 'Saving...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

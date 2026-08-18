import React, { useState, useEffect } from 'react';

export default function HeadDashboard({ user, showToast, onOpenForm, onOpenConfig, onOpenFine, onOpenKraSop, onOpenStructure, onOpenDetail }) {
  const [filter, setFilter] = useState('Weekly');
  const [data, setData] = useState({ overallAverage: 0, topPerformer: 'N/A', needsAttention: 'N/A', reports: [], managedEmployees: [] });
  const [loading, setLoading] = useState(false);
  const [ratingInputs, setRatingInputs] = useState({});
  const [myTaskConfig, setMyTaskConfig] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  useEffect(() => {
    fetchHeadDashboard();
    fetchMyConfig();
  }, [user.id, filter]);

  const fetchHeadDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/head/dashboard?headId=${user.id}&filter=${filter}`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);

        // Initialize inline rating inputs
        const initialRatings = {};
        (result.data.reports || []).forEach(r => {
          initialRatings[r.id || `${r.employee_id}_${r.date}`] = {
            rating: r.head_rating !== null && r.head_rating !== undefined ? r.head_rating : 100,
            attendance: r.attendance || 'Present',
            overtime: r.overtime || 0
          };
        });
        setRatingInputs(initialRatings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyConfig = async () => {
    try {
      const res = await fetch(`/api/config/${user.id}`);
      const result = await res.json();
      if (result.success) setMyTaskConfig(result.config || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRatingChange = (reportKey, field, val) => {
    setRatingInputs(prev => ({
      ...prev,
      [reportKey]: {
        ...prev[reportKey],
        [field]: val
      }
    }));
  };

  const handleSaveRating = async (report) => {
    const reportKey = report.id || `${report.employee_id}_${report.date}`;
    const input = ratingInputs[reportKey] || { rating: 100, attendance: 'Present', overtime: 0 };

    try {
      const res = await fetch('/api/head/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empId: report.employee_id,
          dateStr: report.date,
          rating: Number(input.rating),
          attendance: input.attendance,
          overtime: Number(input.overtime),
          headId: user.id
        })
      });
      const result = await res.json();
      if (result.success) {
        if (showToast) showToast(`Report for ${report.employee_id} approved with rating ${input.rating}%.`);
        fetchHeadDashboard();
      } else {
        alert(result.message || 'Failed to save rating.');
      }
    } catch (err) {
      alert('Error connecting to backend API.');
    }
  };

  const exportToCSV = () => {
    const rows = displayedReports;
    if (rows.length === 0) {
      alert('No reports to export.');
      return;
    }

    const headers = ['Date', 'Employee ID', 'Department', 'System Score %', 'Head Rating %', 'Final Score %', 'Attendance', 'Overtime (hrs)', 'Status', 'Fine Amount', 'Fine Reason', 'Employee Remarks'];
    const csvContent = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.date || ''}"`,
        `"${r.employee_id || ''}"`,
        `"${r.department || ''}"`,
        r.system_score ?? 0,
        r.head_rating ?? '',
        r.final_score ?? '',
        `"${r.attendance || 'Present'}"`,
        r.overtime || 0,
        `"${r.approval_status || 'Pending Review'}"`,
        r.fine_amount || 0,
        `"${(r.fine_reason || '').replace(/"/g, '""')}"`,
        `"${(r.employee_remarks || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Team_Operations_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showToast) showToast('CSV report downloaded successfully!');
  };

  const displayedReports = (data.reports || []).filter(r => {
    const matchesSearch = !searchTerm ||
      r.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.department && r.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.date.includes(searchTerm);

    const matchesStatus = statusFilter === 'All' ||
      (statusFilter === 'Pending' && r.approval_status === 'Pending Review') ||
      (statusFilter === 'Approved' && r.approval_status === 'Approved') ||
      (statusFilter === 'Auto Approved' && r.approval_status === 'Auto Approved');

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* Intro Header */}
      <div className="section-header" style={{ marginBottom: '24px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Management Operations & Oversight
          </span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--ink)' }}>
            Department Performance
          </h1>
          <p className="section-description">
            Review team submissions, rate reports, issue fine notices, and manage department tasks.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(user?.role?.toLowerCase().includes('admin') || user?.isAdmin) && (
            <button className="btn btn-secondary" onClick={onOpenStructure}>
              <i className="bi bi-diagram-3 me-1"></i> Department Structure
            </button>
          )}
          <button className="btn btn-secondary" onClick={onOpenKraSop}>
            <i className="bi bi-journal-text me-1"></i> KRA & SOP Search
          </button>
          <button className="btn btn-primary" onClick={fetchHeadDashboard}>
            <i className="bi bi-arrow-clockwise me-1"></i> Refresh Insights
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Performance Snapshot</h2>
            <p className="section-description">Select time period to compute metrics across managed team.</p>
          </div>
          <div className="filter-pills">
            <button className={`btn-pill ${filter === 'Daily' ? 'active' : ''}`} onClick={() => setFilter('Daily')}>Today</button>
            <button className={`btn-pill ${filter === 'Weekly' ? 'active' : ''}`} onClick={() => setFilter('Weekly')}>7 Days</button>
            <button className={`btn-pill ${filter === 'Monthly' ? 'active' : ''}`} onClick={() => setFilter('Monthly')}>30 Days</button>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Overall Average Score</span>
            <strong className="metric-value">{data.overallAverage}%</strong>
            <span className="metric-note">Approved performance score</span>
          </div>

          <div className="metric-card" style={{ borderColor: '#a7f3d0' }}>
            <span className="metric-label" style={{ color: 'var(--success)' }}>Top Performer</span>
            <strong className="metric-value" style={{ fontSize: '1.3rem', color: 'var(--success)' }}>{data.topPerformer}</strong>
            <span className="metric-note">Highest score in selected period</span>
          </div>

          <div className="metric-card" style={{ borderColor: '#fca5a5' }}>
            <span className="metric-label" style={{ color: 'var(--danger)' }}>Needs Attention</span>
            <strong className="metric-value" style={{ fontSize: '1.3rem', color: 'var(--danger)' }}>{data.needsAttention}</strong>
            <span className="metric-note">Lowest score in selected period</span>
          </div>
        </div>
      </div>

      {/* Managed Team List */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Managed Team Members</h2>
            <p className="section-description">Configure task setup & targets for employees under your supervision.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {data.managedEmployees.map((emp) => (
            <div
              key={emp.id}
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <strong style={{ fontSize: '0.9rem', color: 'var(--ink)', display: 'block' }}>{emp.name}</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{emp.id} • {emp.designation || emp.role}</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenConfig(emp.id, emp.name)}
                title="Configure Tasks"
              >
                <i className="bi bi-gear me-1"></i> Setup Tasks
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* My Own Work Section for Heads */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">
              <i className="bi bi-person-badge text-primary me-1"></i> My Own Work (Head Submissions)
            </h2>
            <p className="section-description">Configure and submit your own morning BOD and evening EOD reports as {user.name} ({user.id}).</p>
          </div>
          <div className="filter-pills">
            <button className="btn-pill" onClick={() => onOpenConfig(user.id, user.name)}>
              <i className="bi bi-gear me-1"></i> Manage My Tasks
            </button>
            <button className="btn-pill" onClick={() => onOpenForm('BOD', myTaskConfig, null, null)}>
              <i className="bi bi-sun me-1"></i> Open My BOD
            </button>
            <button className="btn-pill" onClick={() => onOpenForm('EOD', myTaskConfig, null, null)}>
              <i className="bi bi-moon-stars me-1"></i> Open My EOD
            </button>
          </div>
        </div>
      </div>

      {/* Report Review & Rating Panel */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Report Review & Rating</h2>
            <p className="section-description">Review submitted EOD reports, set Head Rating multiplier (0-200%), and approve final scores.</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              className="form-control"
              style={{ width: '220px', padding: '6px 12px', fontSize: '0.82rem' }}
              placeholder="Search Emp ID / Dept / Date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="form-select"
              style={{ width: '160px', padding: '6px 12px', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending Review</option>
              <option value="Approved">Approved</option>
              <option value="Auto Approved">Auto Approved</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={exportToCSV} title="Export CSV">
              <i className="bi bi-download me-1"></i> Export CSV ({displayedReports.length})
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Emp ID</th>
                <th>Dept</th>
                <th>System %</th>
                <th>Head Rating (0-200%)</th>
                <th>Attendance</th>
                <th>Overtime</th>
                <th>Final Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedReports.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: '24px' }}>
                    No reports match your selected search or filter criteria.
                  </td>
                </tr>
              ) : (
                displayedReports.map((r) => {
                  const reportKey = r.id || `${r.employee_id}_${r.date}`;
                  const input = ratingInputs[reportKey] || { rating: 100, attendance: 'Present', overtime: 0 };
                  const isLocked = r.approval_status === 'Approved' || r.approval_status === 'Auto Approved';

                  return (
                    <tr key={reportKey}>
                      <td style={{ fontWeight: 600 }}>{r.date}</td>
                      <td>
                        <strong>{r.employee_id}</strong>
                      </td>
                      <td>{r.department}</td>
                      <td>{r.system_score}%</td>
                      <td>
                        {isLocked ? (
                          <span>{r.head_rating}%</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max="200"
                            className="form-control"
                            style={{ width: '80px', padding: '4px 8px' }}
                            value={input.rating}
                            onChange={(e) => handleRatingChange(reportKey, 'rating', e.target.value)}
                          />
                        )}
                      </td>
                      <td>
                        {isLocked ? (
                          <span>{r.attendance || 'Present'}</span>
                        ) : (
                          <select
                            className="form-select"
                            style={{ width: '100px', padding: '4px 8px' }}
                            value={input.attendance}
                            onChange={(e) => handleRatingChange(reportKey, 'attendance', e.target.value)}
                          >
                            <option value="Present">Present</option>
                            <option value="Late">Late</option>
                            <option value="Absent">Absent</option>
                          </select>
                        )}
                      </td>
                      <td>
                        {isLocked ? (
                          <span>{r.overtime || 0}h</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            className="form-control"
                            style={{ width: '70px', padding: '4px 8px' }}
                            value={input.overtime}
                            onChange={(e) => handleRatingChange(reportKey, 'overtime', e.target.value)}
                          />
                        )}
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                        {r.final_score !== null && r.final_score !== undefined ? `${r.final_score}%` : 'Pending'}
                        {r.fine_amount > 0 && (
                          <div style={{ marginTop: '4px' }}>
                            <a
                              href={`/api/fines/${r.fine_doc_url ? r.fine_doc_url.split('/').pop() : ''}/document`}
                              target="_blank"
                              rel="noreferrer"
                              className="badge badge-danger"
                              style={{ textDecoration: 'none', fontSize: '0.7rem' }}
                              title={r.employee_remarks ? `Remarks: ${r.employee_remarks}` : 'View Fine Notice'}
                            >
                              ₹{r.fine_amount} ({r.fine_status || 'Pending'})
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!isLocked && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleSaveRating(r)}>
                              Approve
                            </button>
                          )}
                          <button className="btn btn-secondary btn-sm" onClick={() => onOpenDetail(r)}>
                            <i className="bi bi-eye"></i>
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => onOpenFine(r.employee_id, r.date)}
                            title="Issue Fine Notice"
                          >
                            <i className="bi bi-exclamation-octagon"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

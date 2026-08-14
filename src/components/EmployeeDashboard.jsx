import React, { useState, useEffect } from 'react';

export default function EmployeeDashboard({ user, onOpenForm, onOpenKraSop, onOpenDetail }) {
  const [filter, setFilter] = useState('Weekly');
  const [data, setData] = useState({ average: 0, reports: [], fines: [] });
  const [todayStatus, setTodayStatus] = useState({ bodFilled: false, eodFilled: false });
  const [bodData, setBodData] = useState(null);
  const [eodData, setEodData] = useState(null);
  const [config, setConfig] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFormAndDashboard();
  }, [user.id, filter]);

  const fetchFormAndDashboard = async () => {
    setLoading(true);
    try {
      // Fetch dynamic form status for today
      const formRes = await fetch(`/api/employee/${user.id}/form`);
      const formData = await formRes.json();
      if (formData.success) {
        setTodayStatus(formData.todayStatus);
        setBodData(formData.bodData);
        setEodData(formData.eodData);
        setConfig(formData.config || []);
      }

      // Fetch dashboard performance & history
      const dashRes = await fetch(`/api/employee/${user.id}/dashboard?filter=${filter}`);
      const dashData = await dashRes.json();
      if (dashData.success) {
        setData(dashData.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
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

        <div style={{ display: 'flex', gap: '8px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
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
                <span className="badge badge-pending">Not Submitted</span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '16px' }}>
              Define today's key priorities, targets, and expected outcomes.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => onOpenForm('BOD', config, bodData, eodData)}
            >
              <i className="bi bi-sun me-1"></i> {todayStatus.bodFilled ? 'Edit Morning BOD' : 'Open BOD Form'}
            </button>
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
              ) : (
                <span className="badge badge-pending">Not Submitted</span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', marginBottom: '16px' }}>
              Record actual completions and calculate today's performance score.
            </p>
            <button
              className="btn btn-gold"
              style={{ width: '100%' }}
              onClick={() => onOpenForm('EOD', config, bodData, eodData)}
            >
              <i className="bi bi-moon-stars me-1"></i> {todayStatus.eodFilled ? 'Edit Evening EOD' : 'Open EOD Form'}
            </button>
          </div>
        </div>
      </div>

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

      {/* Report History Table */}
      <div className="app-card">
        <div className="section-header">
          <div>
            <h2 className="section-title">Report History</h2>
            <p className="section-description">Review details, ratings, and feedback on completed reports.</p>
          </div>
        </div>

        <div className="table-shell">
          <table className="data-table">
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
              {data.reports.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: '24px' }}>
                    No reports submitted yet.
                  </td>
                </tr>
              ) : (
                data.reports.map((r) => (
                  <tr key={r.id || r.date}>
                    <td style={{ fontWeight: 600 }}>{r.date}</td>
                    <td>{r.system_score ?? r.sysScore ?? '-'}%</td>
                    <td>{r.head_rating !== null && r.head_rating !== undefined ? `${r.head_rating}%` : 'Not Rated'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                      {r.final_score !== null && r.final_score !== undefined ? `${r.final_score}%` : 'Pending'}
                    </td>
                    <td>{getStatusBadge(r.approval_status || r.ratingStatus)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

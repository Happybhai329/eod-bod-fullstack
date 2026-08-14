import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [role, setRole] = useState('Employee');
  const [empId, setEmpId] = useState('TPC25107MR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!empId.trim()) {
      setError('Please enter your Employee ID.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empId: empId.trim(), role })
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.user);
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      setError('System error connecting to backend API.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoId, demoRole) => {
    setRole(demoRole);
    setEmpId(demoId);
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 120px)', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="app-card"
        style={{
          maxWidth: '850px',
          width: '100%',
          padding: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
        }}
      >
        <div
          style={{
            background: 'linear-gradient(145deg, #0f172a, #1e3a8a)',
            color: 'white',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div className="brand-mark" style={{ marginBottom: '24px' }}>B/E</div>
            <p style={{ color: '#93c5fd', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Operations Hub
            </p>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 16px', lineHeight: 1.2 }}>
              Keep every workday visible.
            </h1>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              Plan morning priorities (BOD), record evening achievements (EOD), and track team performance with objective scoring.
            </p>
          </div>

          <div style={{ marginTop: '32px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Authorized Department Access Only</span>
          </div>
        </div>

        <div style={{ padding: '40px 32px' }}>
          <p style={{ color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Welcome back
          </p>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 16px' }}>Sign in to your workspace</h2>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              type="button"
              className={`btn ${role === 'Employee' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setRole('Employee')}
            >
              <i className="bi bi-person me-1"></i> Employee
            </button>
            <button
              type="button"
              className={`btn ${role === 'Head' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setRole('Head')}
            >
              <i className="bi bi-shield-check me-1"></i> Head / Admin
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="empIdInput">Employee ID</label>
              <input
                id="empIdInput"
                type="text"
                className="form-control"
                placeholder="e.g. TPC25107MR or HEAD001"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: '16px'
                }}
              >
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-gold" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Continue to Dashboard'}
            </button>
          </form>

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '8px', fontWeight: 700 }}>
              Quick Demo Accounts:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickDemo('TPC25107MR', 'Employee')}
              >
                Sales Emp (TPC25107MR)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickDemo('HEAD001', 'Head')}
              >
                Sales Head (HEAD001)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickDemo('TPC25109HR', 'Employee')}
              >
                Faculty Emp (TPC25109HR)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleQuickDemo('HEAD002', 'Head')}
              >
                Academic Head (HEAD002)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [role, setRole] = useState('Employee');
  const [empId, setEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!empId.trim()) {
      setError('Please enter your Employee Name or ID.');
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
        setError(data.message || 'Authentication failed. Please verify your ID.');
      }
    } catch (err) {
      setError('System error connecting to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 140px)', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
      <div
        className="app-card"
        style={{
          maxWidth: '860px',
          width: '100%',
          padding: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.15)',
          border: '1px solid var(--line)'
        }}
      >
        {/* Left Branding Panel */}
        <div
          style={{
            background: 'linear-gradient(150deg, #09122c, #1e293b 60%, #0f172a)',
            color: 'white',
            padding: '48px 36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  color: 'white',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  letterSpacing: '0.05em'
                }}
              >
                B/E
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em', color: '#93c5fd', textTransform: 'uppercase' }}>
                Operations Hub
              </span>
            </div>

            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.25, color: '#ffffff', marginBottom: '16px' }}>
              Structured Operations. Measurable Results.
            </h1>

            <p style={{ color: '#94a3b8', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '24px' }}>
              Manage daily morning priority planning (BOD), evening execution tracking (EOD), objective score evaluations, and team operational standards.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', color: '#cbd5e1' }}>
                <i className="bi bi-check2-circle text-primary" style={{ color: '#60a5fa', fontSize: '1.1rem' }}></i>
                <span>Objective performance scoring algorithm</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', color: '#cbd5e1' }}>
                <i className="bi bi-shield-lock" style={{ color: '#60a5fa', fontSize: '1.1rem' }}></i>
                <span>Role-based department access & reviews</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', color: '#cbd5e1' }}>
                <i className="bi bi-cloud-arrow-up" style={{ color: '#60a5fa', fontSize: '1.1rem' }}></i>
                <span>Real-time enterprise outbox synchronization</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '36px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bi bi-lock-fill"></i> Secure Authorized Access Portal
            </span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div style={{ padding: '48px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '24px' }}>
            <span style={{ color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Workspace Authentication
            </span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '6px 0 0', color: 'var(--ink)' }}>
              Sign in to your account
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
              Select your role and enter your designated ID to proceed.
            </p>
          </div>

          {/* Role Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'var(--surface-raised)',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              marginBottom: '24px'
            }}
          >
            <button
              type="button"
              className={`btn ${role === 'Employee' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                border: 'none',
                boxShadow: role === 'Employee' ? 'var(--shadow-sm)' : 'none',
                fontSize: '0.86rem',
                padding: '8px 12px'
              }}
              onClick={() => setRole('Employee')}
            >
              <i className="bi bi-person me-1"></i> Staff / Employee
            </button>
            <button
              type="button"
              className={`btn ${role === 'Head' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                border: 'none',
                boxShadow: role === 'Head' ? 'var(--shadow-sm)' : 'none',
                fontSize: '0.86rem',
                padding: '8px 12px'
              }}
              onClick={() => setRole('Head')}
            >
              <i className="bi bi-shield-check me-1"></i> Head / Admin
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" htmlFor="empIdInput">
                {role === 'Head' ? 'Head / Manager Name or ID' : 'Employee Name or ID'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="empIdInput"
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px', fontSize: '0.92rem' }}
                  placeholder={role === 'Head' ? 'Enter Head name or ID' : 'Enter Employee name or ID'}
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  autoFocus
                />
                <i
                  className="bi bi-person-badge"
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--ink-muted)',
                    fontSize: '1rem'
                  }}
                ></i>
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--danger-light)',
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginBottom: '18px',
                  border: '1px solid #fca5a5',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <i className="bi bi-exclamation-circle-fill"></i>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '0.92rem',
                fontWeight: 700,
                letterSpacing: '0.02em'
              }}
              disabled={loading}
            >
              {loading ? (
                <span>
                  <i className="bi bi-arrow-repeat spin me-2"></i> Authenticating...
                </span>
              ) : (
                <span>
                  Continue to Workspace <i className="bi bi-arrow-right ms-1"></i>
                </span>
              )}
            </button>
          </form>

          <div style={{ marginTop: '28px', textAlign: 'center' }}>
            <small style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
              Need assistance or ID lookup? Contact your system administrator.
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}


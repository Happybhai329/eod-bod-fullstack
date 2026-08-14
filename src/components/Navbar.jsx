import React from 'react';

export default function Navbar({ user, onLogout, onOpenNotifications, unreadNotifCount, activeView = 'team', onViewChange }) {
  return (
    <header className="app-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="brand-mark">B/E</div>
        <div className="brand-copy">
          <strong>Daily Operations Hub</strong>
          <small>BOD & EOD Full Stack Workspace</small>
        </div>
      </div>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user.isHead && (
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', padding: '3px', borderRadius: '8px', gap: '4px' }}>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'team' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700 }}
                onClick={() => onViewChange('team')}
              >
                <i className="bi bi-people-fill me-1"></i> Team Review
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700 }}
                onClick={() => onViewChange('personal')}
              >
                <i className="bi bi-person-workspace me-1"></i> My Workday
              </button>
            </div>
          )}

          <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            <div style={{ fontWeight: 700, color: 'white' }}>{user.name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              {user.department} {user.subDepartment ? `(${user.subDepartment})` : ''} • {user.role}
            </div>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={onOpenNotifications}
            style={{ position: 'relative', padding: '8px 12px' }}
            title="Notifications"
          >
            <i className="bi bi-bell"></i>
            {unreadNotifCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: 'var(--danger)',
                  color: 'white',
                  borderRadius: '50%',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {unreadNotifCount}
              </span>
            )}
          </button>

          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            <i className="bi bi-box-arrow-right"></i> Sign out
          </button>
        </div>
      )}
    </header>
  );
}

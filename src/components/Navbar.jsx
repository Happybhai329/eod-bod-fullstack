import React from 'react';

export default function Navbar({ user, onLogout, onOpenNotifications, unreadNotifCount, activeView = 'team', onViewChange }) {
  return (
    <header className="app-navbar">
      <div className="brand-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div className="brand-mark">B/E</div>
        <div className="brand-copy">
          <strong>Daily Operations Hub</strong>
          <small className="brand-subtitle">BOD & EOD Full Stack Workspace</small>
        </div>
      </div>

      {user && (
        <div className="navbar-right-group">
          {user.isHead && (
            <div className="navbar-view-switcher">
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'team' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700 }}
                onClick={() => onViewChange('team')}
              >
                <i className="bi bi-people-fill me-1"></i> <span className="btn-label-responsive">Team Review</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 700 }}
                onClick={() => onViewChange('personal')}
              >
                <i className="bi bi-person-workspace me-1"></i> <span className="btn-label-responsive">My Workday</span>
              </button>
            </div>
          )}

          <div className="navbar-user-info">
            <div className="navbar-user-name">{user.name}</div>
            <div className="navbar-user-dept">
              {user.department} {user.subDepartment ? `(${user.subDepartment})` : ''} • {user.role}
            </div>
          </div>

          <div className="navbar-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={onOpenNotifications}
              style={{ position: 'relative', padding: '7px 10px' }}
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

            <button className="btn btn-secondary btn-sm btn-signout" onClick={onLogout} title="Sign out">
              <i className="bi bi-box-arrow-right"></i> <span className="signout-text">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

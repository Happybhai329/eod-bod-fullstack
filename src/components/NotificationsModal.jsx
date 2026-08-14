import React, { useState, useEffect } from 'react';

export default function NotificationsModal({ isOpen, onClose, empId, onRefreshCount }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !empId) return;
    fetchNotifs();
  }, [isOpen, empId]);

  const fetchNotifs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications/${empId}`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        // Mark as read
        await fetch(`/api/notifications/${empId}/read`, { method: 'POST' });
        if (onRefreshCount) onRefreshCount();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>🔔 Notifications</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              Recent updates, approvals, and notices.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <p>Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textAlign: 'center', padding: '24px' }}>
              No notifications found.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: n.read ? 'white' : 'var(--primary-light)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--ink)' }}>{n.type}</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                      {new Date(n.created_on || n.createdOn).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', margin: 0 }}>
                    {n.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';

/**
 * Notifications Modal
 * Matches 1:1 with notificationsModal in D:\prime\bod and eod\index.html lines 636-648
 */
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
      <div className="modal-content" style={{ maxWidth: '560px', width: '95%' }}>
        {/* Modal Header matching index.html notificationsModal */}
        <div className="modal-header bg-navy text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            <i className="bi bi-bell me-2"></i>Notifications
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        {/* Modal Body matching index.html */}
        <div className="modal-body bg-light" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px' }}>
          {loading ? (
            <div className="text-center text-muted py-4">
              <span className="spinner-border spinner-border-sm me-2 spin"></span> Loading...
            </div>
          ) : notifications.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', textAlign: 'center', padding: '24px', margin: 0 }}>
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

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

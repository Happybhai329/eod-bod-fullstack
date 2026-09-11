import React, { useState, useEffect } from 'react';

/**
 * KRA & SOP Repository Modal
 * Matches 1:1 with searchKRAs and sopDetailModal in D:\prime\bod and eod\index.html lines 2720-2797
 */
export default function KraSopModal({ isOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [kras, setKras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedKra, setSelectedKra] = useState(null);
  const [sops, setSops] = useState([]);
  const [loadingSops, setLoadingSops] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchKras('');
      setSelectedKra(null);
      setSops([]);
    }
  }, [isOpen]);

  const fetchKras = async (term) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kras?search=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.success) {
        setKras(data.kras || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSops = async (kra) => {
    setSelectedKra(kra);
    setLoadingSops(true);
    try {
      const res = await fetch(`/api/sops/${kra.id}`);
      const data = await res.json();
      if (data.success) {
        setSops(data.sops || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSops(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '950px', width: '95%' }}>
        {/* Modal Header matching index.html */}
        <div className="modal-header bg-navy text-white" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <h5 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            {selectedKra ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light me-2"
                  onClick={() => setSelectedKra(null)}
                  title="Back to KRA list"
                >
                  <i className="bi bi-arrow-left"></i>
                </button>
                SOP Details - <span style={{ color: '#f6bd3b' }}>{selectedKra.id}</span>
              </>
            ) : (
              <>
                <i className="bi bi-journal-text me-2"></i>KRA & SOP Repository
              </>
            )}
          </h5>
          <button type="button" className="btn-close-white" onClick={onClose}>×</button>
        </div>

        {/* Modal Body matching index.html */}
        <div className="modal-body bg-light" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '20px' }}>
          {selectedKra ? (
            /* SOP Details View matching sopDetailModal lines 2766-2788 */
            <div>
              <div className="detail-overview mb-3">
                <span><strong>KRA ID:</strong> {selectedKra.id}</span>
                <span>|</span>
                <span><strong>Position:</strong> {selectedKra.position_name || selectedKra.position || '-'}</span>
                <span>|</span>
                <span><strong>Type:</strong> {selectedKra.type || '-'}</span>
              </div>

              <div className="detail-task mb-3">
                <strong style={{ color: '#13233f' }}>KRA Description:</strong>
                <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                  {selectedKra.text || '-'}
                </div>
              </div>

              {loadingSops ? (
                <div className="text-center text-muted py-4">
                  <span className="spinner-border spinner-border-sm me-2 spin"></span> Loading SOPs...
                </div>
              ) : sops.length === 0 ? (
                <div className="alert alert-warning py-2 small">
                  No SOPs found for this KRA.
                </div>
              ) : (
                <div>
                  <h6 className="text-success border-bottom pb-2 mt-3 fw-bold" style={{ fontSize: '0.95rem' }}>
                    SOPs ({sops.length})
                  </h6>
                  {sops.map((sop, idx) => (
                    <div key={sop.id || idx} className="detail-task mb-3">
                      <div className="d-flex justify-content-between align-items-start">
                        <strong style={{ fontSize: '0.92rem', color: '#13233f' }}>
                          SOP {idx + 1}{sop.id ? ` - ${sop.id}` : ''}
                        </strong>
                        {sop.doc_link && (
                          <a
                            href={sop.doc_link}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline-primary"
                          >
                            <i className="bi bi-file-earmark-text me-1"></i> Document
                          </a>
                        )}
                      </div>

                      {(sop.text || sop.sopText) && (
                        <div className="mt-2" style={{ fontSize: '0.85rem' }}>
                          <strong>Procedure:</strong>
                          <div style={{ whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                            {sop.text || sop.sopText}
                          </div>
                        </div>
                      )}

                      {sop.checklist && (
                        <div className="mt-2" style={{ fontSize: '0.85rem' }}>
                          <strong>Checklist:</strong>
                          <div style={{ whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                            {sop.checklist}
                          </div>
                        </div>
                      )}

                      {sop.form_fields && (
                        <div className="mt-2" style={{ fontSize: '0.85rem' }}>
                          <strong>Form Fields:</strong>
                          <div style={{ whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                            {sop.form_fields}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* KRA Search View matching searchKRAs lines 2720-2750 */
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by KRA ID, text, position name, or type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchKras(search)}
                />
                <button
                  type="button"
                  className="btn btn-primary fw-bold"
                  onClick={() => fetchKras(search)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-search me-1"></i> Search
                </button>
              </div>

              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>KRA ID</th>
                      <th style={{ width: '25%' }}>Position</th>
                      <th style={{ width: '35%' }}>Description</th>
                      <th style={{ width: '10%' }}>Type</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="5" className="text-center py-4 text-muted">
                          <span className="spinner-border spinner-border-sm me-2 spin"></span> Searching KRAs...
                        </td>
                      </tr>
                    ) : kras.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-4 text-muted">
                          No KRAs found. Try a different search.
                        </td>
                      </tr>
                    ) : (
                      kras.map((kra) => (
                        <tr key={kra.id}>
                          <td><strong>{kra.id}</strong></td>
                          <td>{kra.position_name || kra.position || '-'}</td>
                          <td>{kra.text || '-'}</td>
                          <td>{kra.type || '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleViewSops(kra)}
                            >
                              <i className="bi bi-journal-text me-1"></i> View SOPs
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: selectedKra ? 'space-between' : 'flex-end' }}>
          {selectedKra && (
            <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedKra(null)}>
              <i className="bi bi-arrow-left me-1"></i> Back to KRAs
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

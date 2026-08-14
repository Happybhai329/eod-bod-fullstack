import React, { useState, useEffect } from 'react';

export default function KraSopModal({ isOpen, onClose }) {
  const [search, setSearch] = useState('');
  const [kras, setKras] = useState([]);
  const [selectedKra, setSelectedKra] = useState(null);
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchKras('');
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

  const handleSelectKra = async (kra) => {
    setSelectedKra(kra);
    try {
      const res = await fetch(`/api/sops/${kra.id}`);
      const data = await res.json();
      if (data.success) {
        setSops(data.sops || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '850px' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>📖 KRA & SOP Repository</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
              Search Key Result Areas & Standard Operating Procedures across roles.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search by KRA ID, text, position name, or type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchKras(search)}
            />
            <button className="btn btn-primary" onClick={() => fetchKras(search)}>
              <i className="bi bi-search"></i> Search
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selectedKra ? '1fr 1fr' : '1fr', gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px', color: 'var(--ink-muted)' }}>
                Key Result Areas (KRAs)
              </h4>
              {loading ? (
                <p>Loading KRAs...</p>
              ) : kras.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>No KRAs found matching search.</p>
              ) : (
                <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {kras.map((kra) => (
                    <div
                      key={kra.id}
                      onClick={() => handleSelectKra(kra)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: selectedKra?.id === kra.id ? '2px solid var(--primary)' : '1px solid var(--line)',
                        background: selectedKra?.id === kra.id ? 'var(--primary-light)' : 'white',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{kra.id}</strong>
                        <span className="badge badge-auto">{kra.position_name || kra.position}</span>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--ink)', margin: 0 }}>{kra.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedKra && (
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--ink)', marginBottom: '4px' }}>
                  SOPs for {selectedKra.id}
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '12px' }}>
                  Standard Operating Procedures & Checklists
                </p>

                {sops.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>No detailed SOPs linked to this KRA yet.</p>
                ) : (
                  sops.map((sop) => (
                    <div key={sop.id} style={{ background: 'white', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ink)', display: 'block', marginBottom: '4px' }}>
                        {sop.id}: {sop.sopText || sop.text}
                      </strong>
                      {sop.checklist && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: '6px 0', whiteSpace: 'pre-line' }}>
                          <strong>Checklist:</strong>
                          <p>{sop.checklist}</p>
                        </div>
                      )}
                      {sop.doc_link && (
                        <a href={sop.doc_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
                          <i className="bi bi-link-45deg me-1"></i> Open SOP Document Link
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

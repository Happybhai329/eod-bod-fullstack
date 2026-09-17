import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Login from './components/Login';
import EmployeeDashboard from './components/EmployeeDashboard';
import HeadDashboard from './components/HeadDashboard';
import BodEodFormModal from './components/BodEodFormModal';
import TaskConfigModal from './components/TaskConfigModal';
import FineModal from './components/FineModal';
import KraSopModal from './components/KraSopModal';
import NotificationsModal from './components/NotificationsModal';
import DepartmentStructureModal from './components/DepartmentStructureModal';
import ReportDetailModal from './components/ReportDetailModal';

export default function App() {
  const [user, setUser] = useState(null);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formPhase, setFormPhase] = useState('BOD');
  const [formConfig, setFormConfig] = useState([]);
  const [formBodData, setFormBodData] = useState(null);
  const [formEodData, setFormEodData] = useState(null);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configEmpId, setConfigEmpId] = useState('');
  const [configEmpName, setConfigEmpName] = useState('');

  const [isFineOpen, setIsFineOpen] = useState(false);
  const [fineEmpId, setFineEmpId] = useState('');
  const [fineDateStr, setFineDateStr] = useState('');

  const [isKraSopOpen, setIsKraSopOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isStructureOpen, setIsStructureOpen] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailReport, setDetailReport] = useState(null);

  const [activeView, setActiveView] = useState('team');
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [toast, setToast] = useState(null);
  const [reportRefreshCounter, setReportRefreshCounter] = useState(0);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('operations_hub_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.id) {
          setUser(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to restore session from localStorage:', e);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchUnreadNotifs();
    if (user.isHead) setActiveView('team');
  }, [user]);

  const fetchUnreadNotifs = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications/${user.id}`);
      const data = await res.json();
      if (data.success) {
        const unread = (data.notifications || []).filter(n => !n.read).length;
        setUnreadNotifs(unread);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    try {
      localStorage.setItem('operations_hub_user', JSON.stringify(loggedUser));
    } catch (e) {}
    showToast(`Welcome back, ${loggedUser.name}!`);
    if (loggedUser.isHead) setActiveView('team');
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem('operations_hub_user');
    } catch (e) {}
    showToast('Signed out successfully.', 'info');
  };

  // Open BOD/EOD modal
  const handleOpenForm = (phase, cfg, bodData, eodData) => {
    setFormPhase(phase);
    setFormConfig(cfg);
    setFormBodData(bodData);
    setFormEodData(eodData);
    setIsFormOpen(true);
  };

  // Save BOD/EOD report
  const handleSaveReport = async (phase, phaseData) => {
    const res = await fetch(`/api/employee/${user.id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase, phaseData })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Error saving report.');
    }
    showToast(`${phase} report submitted successfully!`);
    fetchUnreadNotifs();

    // Immediately update modal cache so reopen has fresh data
    if (phase === 'BOD') setFormBodData(phaseData);
    if (phase === 'EOD') setFormEodData(phaseData);

    // Increment refresh trigger to reload dashboard from server immediately
    setReportRefreshCounter(prev => prev + 1);
  };

  // Open Task Config modal
  const handleOpenConfig = (empId, empName) => {
    setConfigEmpId(empId);
    setConfigEmpName(empName);
    setIsConfigOpen(true);
  };

  // Save Task Config
  const handleSaveConfig = async (empId, configJson) => {
    const res = await fetch(`/api/config/${empId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configJson })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Error saving config.');
    }
    showToast('Task configuration saved successfully!');
  };

  // Open Fine modal
  const handleOpenFine = (empId, dateStr) => {
    setFineEmpId(empId);
    setFineDateStr(dateStr);
    setIsFineOpen(true);
  };

  // Issue Fine
  const handleIssueFine = async (finePayload) => {
    const res = await fetch('/api/fines/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finePayload)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Error issuing fine.');
    }
    showToast(`Fine notice issued for ${finePayload.empId}.`, 'warning');
  };

  // Open Detail modal
  const handleOpenDetail = (report) => {
    setDetailReport(report);
    setIsDetailOpen(true);
  };

  return (
    <div>
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenNotifications={() => setIsNotifOpen(true)}
        unreadNotifCount={unreadNotifs}
        activeView={activeView}
        onViewChange={(v) => setActiveView(v)}
      />

      <main className="app-container">
        {!user ? (
          <Login onLogin={handleLogin} />
        ) : user.isHead && activeView === 'team' ? (
          <HeadDashboard
            user={user}
            showToast={showToast}
            onOpenForm={handleOpenForm}
            onOpenConfig={handleOpenConfig}
            onOpenFine={handleOpenFine}
            onOpenKraSop={() => setIsKraSopOpen(true)}
            onOpenStructure={() => setIsStructureOpen(true)}
            onOpenDetail={handleOpenDetail}
            refreshTrigger={reportRefreshCounter}
          />
        ) : (
          <EmployeeDashboard
            user={user}
            showToast={showToast}
            onOpenForm={handleOpenForm}
            onOpenKraSop={() => setIsKraSopOpen(true)}
            onOpenDetail={handleOpenDetail}
            refreshTrigger={reportRefreshCounter}
          />
        )}
      </main>

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-alert toast-${toast.type}`}>
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : toast.type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'}`}></i>
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Modals */}
      <BodEodFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        phase={formPhase}
        config={formConfig}
        initialBodData={formBodData}
        initialEodData={formEodData}
        onSave={handleSaveReport}
        user={user}
      />

      <TaskConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        empId={configEmpId}
        empName={configEmpName}
        onSave={handleSaveConfig}
      />

      <FineModal
        isOpen={isFineOpen}
        onClose={() => setIsFineOpen(false)}
        empId={fineEmpId}
        dateStr={fineDateStr}
        headId={user?.id}
        onIssueFine={handleIssueFine}
      />

      <KraSopModal
        isOpen={isKraSopOpen}
        onClose={() => setIsKraSopOpen(false)}
      />

      <NotificationsModal
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        empId={user?.id}
        onRefreshCount={fetchUnreadNotifs}
      />

      <DepartmentStructureModal
        isOpen={isStructureOpen}
        onClose={() => setIsStructureOpen(false)}
        user={user}
      />

      <ReportDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        report={detailReport}
        user={user}
        onOpenFine={(empId, date) => {
          setIsDetailOpen(false);
          handleOpenFine(empId, date);
        }}
        onRateSuccess={() => {
          showToast('Rating saved successfully!');
        }}
      />
    </div>
  );
}

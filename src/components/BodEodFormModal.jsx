import React, { useState, useEffect, useMemo } from 'react';
import AssignedTasksPanel from './AssignedTasksPanel';

/**
 * Escapes HTML characters for safe PDF generation.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes task configurations from either Google Sheets (taskName/inputType)
 * or standard schema (key/label/type).
 */
export function normalizeTasks(rawConfig) {
  if (!Array.isArray(rawConfig) || rawConfig.length === 0) {
    return [
      {
        taskName: "Today's Work Items & Objectives",
        key: 'daily_tasks',
        inputType: 'dynamicList',
        displayPhase: 'BOTH',
        subCategories: [],
        subCategoryPhase: 'EOD',
        target: 1,
        description: ''
      }
    ];
  }

  return rawConfig.map((task, idx) => {
    const taskName = (task.taskName || task.label || task.name || `Task ${idx + 1}`).trim();
    const key = task.key || task.taskKey || task.id || taskName;

    // Determine task input type
    let inputType = 'number';
    const rawType = (task.inputType || task.type || '').toLowerCase();
    if (rawType.includes('dynamic') || rawType.includes('list')) {
      inputType = 'dynamicList';
    } else if (rawType.includes('check') || rawType.includes('bool')) {
      inputType = 'checkbox';
    } else if (rawType.includes('category') || Array.isArray(task.subCategories) || Array.isArray(task.categories)) {
      inputType = 'categoryNumber';
    } else if (rawType.includes('num') || rawType.includes('count') || rawType.includes('target')) {
      inputType = 'number';
    } else {
      inputType = 'dynamicList';
    }

    const subCategories = Array.isArray(task.subCategories) && task.subCategories.length > 0
      ? task.subCategories
      : (Array.isArray(task.categories) && task.categories.length > 0 ? task.categories : ['General']);

    const displayPhase = (task.displayPhase || 'BOTH').toUpperCase();
    const subCategoryPhase = (task.subCategoryPhase || 'EOD').toUpperCase();
    const target = task.target !== undefined ? Number(task.target) : (task.defaultTarget !== undefined ? Number(task.defaultTarget) : 1);
    const description = task.description || '';

    return {
      taskName,
      key,
      inputType,
      displayPhase,
      subCategories,
      subCategoryPhase,
      target,
      description
    };
  });
}

export default function BodEodFormModal({
  isOpen,
  onClose,
  phase,
  config,
  initialBodData,
  initialEodData,
  onSave,
  user
}) {
  const [formData, setFormData] = useState({});
  const [voluntaryOpenMap, setVoluntaryOpenMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareData, setShareData] = useState({ waText: '', pdfHtml: '' });
  const [copied, setCopied] = useState(false);

  const normalizedTasks = useMemo(() => normalizeTasks(config), [config]);

  // Filter tasks visible for the current phase matching reference GS app logic
  const visibleTasks = useMemo(() => {
    return normalizedTasks.filter(t => {
      const m = (t.displayPhase === 'BOTH' || t.displayPhase === phase + '_ONLY');
      const s = (t.inputType === 'categoryNumber' && (t.subCategoryPhase === 'BOTH' || t.subCategoryPhase === phase));
      return m || s;
    });
  }, [normalizedTasks, phase]);

  // Helper to find existing task data from bod/eod payloads
  const findTaskData = (dataObj, t) => {
    if (!dataObj || typeof dataObj !== 'object') return null;
    if (dataObj[t.taskName]) return dataObj[t.taskName];
    if (dataObj[t.key]) return dataObj[t.key];
    return null;
  };

  useEffect(() => {
    if (!isOpen) {
      setShareModalOpen(false);
      setCopied(false);
      setError('');
      return;
    }

    const initialForm = {};
    const initialVolMap = {};

    visibleTasks.forEach((t) => {
      const taskName = t.taskName;
      const bodSaved = findTaskData(initialBodData, t);
      const eodSaved = findTaskData(initialEodData, t);
      const savedData = (phase === 'BOD') ? bodSaved : eodSaved;

      if (t.inputType === 'dynamicList') {
        if (phase === 'BOD') {
          // BOD Dynamic List
          let list = [];
          if (savedData && Array.isArray(savedData.list) && savedData.list.length > 0) {
            list = savedData.list.map(l => ({
              title: l.title || l.text || '',
              time: l.time || '',
              hasTarget: l.hasTarget === true || l.hasTarget === 'true' || l.hasTarget === undefined,
              target: l.target !== undefined ? l.target : 1,
              description: l.description || '',
              achieved: '',
              status: '',
              checklist: [],
              isVoluntary: false
            }));
          } else {
            list = [
              { title: '', time: '', hasTarget: true, target: 1, description: '', achieved: '', status: '', checklist: [], isVoluntary: false }
            ];
          }
          initialForm[taskName] = {
            type: 'dynamicList',
            remarks: '',
            list
          };
        } else {
          // EOD Dynamic List
          const bodList = (bodSaved && Array.isArray(bodSaved.list)) ? bodSaved.list : [];
          const eodList = (savedData && Array.isArray(savedData.list)) ? savedData.list : [];

          // Morning items mapped to their EOD progress & checklists
          const morningItems = bodList.map((bItem) => {
            const eMatch = eodList.find(e => e.title === bItem.title && !e.isVoluntary);
            const descLines = (bItem.description || '').split('\n').filter(x => x.trim() !== '');
            const savedChecklist = eMatch && Array.isArray(eMatch.checklist) ? eMatch.checklist : [];
            const checklist = descLines.map((_, idx) => Boolean(savedChecklist[idx]));

            return {
              title: bItem.title || '',
              time: bItem.time || '',
              hasTarget: bItem.hasTarget === true || bItem.hasTarget === 'true' || bItem.hasTarget === undefined,
              target: bItem.target !== undefined ? bItem.target : 1,
              description: bItem.description || '',
              achieved: eMatch ? (eMatch.achieved !== undefined ? eMatch.achieved : '') : '',
              status: eMatch ? (eMatch.status || 'Not Done') : 'Not Done',
              checklist,
              isVoluntary: false
            };
          });

          // Voluntary extra items
          const volItems = eodList.filter(e => e.isVoluntary).map(v => ({
            title: v.title || '',
            time: v.time || '',
            hasTarget: v.hasTarget === true || v.hasTarget === 'true' || v.hasTarget === undefined,
            target: '',
            description: '',
            achieved: v.achieved !== undefined ? v.achieved : '',
            status: v.status || 'Not Done',
            checklist: [],
            isVoluntary: true
          }));

          if (volItems.length > 0) {
            initialVolMap[taskName] = true;
          }

          initialForm[taskName] = {
            type: 'dynamicList',
            remarks: savedData?.remarks || '',
            morningItems,
            volItems
          };
        }
      } else if (t.inputType === 'checkbox') {
        if (phase === 'BOD') {
          initialForm[taskName] = {
            type: 'checkbox',
            value: '1',
            remarks: ''
          };
        } else {
          initialForm[taskName] = {
            type: 'checkbox',
            status: savedData?.status || 'Done',
            remarks: savedData?.remarks || ''
          };
        }
      } else if (t.inputType === 'categoryNumber') {
        const subMap = savedData?.subCategories || (phase === 'EOD' && bodSaved?.subCategories ? bodSaved.subCategories : {});
        const subCatEntries = [];
        if (subMap && Object.keys(subMap).length > 0) {
          for (const k in subMap) {
            subCatEntries.push({ key: k, val: subMap[k] });
          }
        } else if (t.subCategories && t.subCategories.length > 0) {
          subCatEntries.push({ key: t.subCategories[0], val: '' });
        }
        const fallbackTarget = bodSaved?.value !== undefined ? bodSaved.value : (t.target || '');
        initialForm[taskName] = {
          type: 'categoryNumber',
          value: savedData?.value !== undefined ? savedData.value : fallbackTarget,
          subCatEntries,
          remarks: savedData?.remarks || ''
        };
      } else {
        // Number or text target
        if (phase === 'BOD') {
          initialForm[taskName] = {
            type: 'number',
            value: savedData?.value !== undefined ? savedData.value : (t.target || ''),
            remarks: ''
          };
        } else {
          const fallbackTarget = bodSaved?.value !== undefined ? bodSaved.value : (t.target || '');
          initialForm[taskName] = {
            type: 'number',
            value: savedData?.value !== undefined ? savedData.value : fallbackTarget,
            remarks: savedData?.remarks || ''
          };
        }
      }
    });

    setFormData(initialForm);
    setVoluntaryOpenMap(initialVolMap);
  }, [isOpen, phase, visibleTasks, initialBodData, initialEodData]);

  if (!isOpen) return null;

  // ==========================================
  // HANDLERS FOR DYNAMIC LIST
  // ==========================================
  const addDynItemBOD = (taskName) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', list: [] };
      return {
        ...prev,
        [taskName]: {
          ...task,
          list: [
            ...(task.list || []),
            { title: '', time: '', hasTarget: true, target: '', description: '', achieved: '', status: '', checklist: [], isVoluntary: false }
          ]
        }
      };
    });
  };

  const removeDynItemBOD = (taskName, index) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', list: [] };
      const nextList = [...(task.list || [])];
      nextList.splice(index, 1);
      return {
        ...prev,
        [taskName]: { ...task, list: nextList }
      };
    });
  };

  const updateDynItemBOD = (taskName, index, field, value) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', list: [] };
      const nextList = [...(task.list || [])];
      nextList[index] = { ...nextList[index], [field]: value };
      return {
        ...prev,
        [taskName]: { ...task, list: nextList }
      };
    });
  };

  const toggleChecklistEOD = (taskName, morningIdx, chkIdx, checked) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', morningItems: [] };
      const nextMorning = [...(task.morningItems || [])];
      const item = { ...nextMorning[morningIdx] };
      const chk = [...(item.checklist || [])];
      chk[chkIdx] = checked;
      item.checklist = chk;
      nextMorning[morningIdx] = item;
      return {
        ...prev,
        [taskName]: { ...task, morningItems: nextMorning }
      };
    });
  };

  const updateMorningFieldEOD = (taskName, morningIdx, field, value) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', morningItems: [] };
      const nextMorning = [...(task.morningItems || [])];
      nextMorning[morningIdx] = { ...nextMorning[morningIdx], [field]: value };
      return {
        ...prev,
        [taskName]: { ...task, morningItems: nextMorning }
      };
    });
  };

  const setVoluntaryToggle = (taskName, show) => {
    setVoluntaryOpenMap(prev => ({ ...prev, [taskName]: show }));
    if (show) {
      setFormData(prev => {
        const task = prev[taskName] || { type: 'dynamicList', volItems: [] };
        if (!task.volItems || task.volItems.length === 0) {
          return {
            ...prev,
            [taskName]: {
              ...task,
              volItems: [
                { title: '', time: '', hasTarget: true, target: '', description: '', achieved: '', status: 'Not Done', checklist: [], isVoluntary: true }
              ]
            }
          };
        }
        return prev;
      });
    }
  };

  const addVolItemEOD = (taskName) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', volItems: [] };
      return {
        ...prev,
        [taskName]: {
          ...task,
          volItems: [
            ...(task.volItems || []),
            { title: '', time: '', hasTarget: true, target: '', description: '', achieved: '', status: 'Not Done', checklist: [], isVoluntary: true }
          ]
        }
      };
    });
  };

  const removeVolItemEOD = (taskName, index) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', volItems: [] };
      const nextVol = [...(task.volItems || [])];
      nextVol.splice(index, 1);
      return {
        ...prev,
        [taskName]: { ...task, volItems: nextVol }
      };
    });
  };

  const updateVolItemEOD = (taskName, index, field, value) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'dynamicList', volItems: [] };
      const nextVol = [...(task.volItems || [])];
      nextVol[index] = { ...nextVol[index], [field]: value };
      return {
        ...prev,
        [taskName]: { ...task, volItems: nextVol }
      };
    });
  };

  // ==========================================
  // HANDLERS FOR OTHER INPUT TYPES
  // ==========================================
  const updateTaskRemarks = (taskName, remarks) => {
    setFormData(prev => ({
      ...prev,
      [taskName]: { ...prev[taskName], remarks }
    }));
  };

  const updateCheckboxStatus = (taskName, status) => {
    setFormData(prev => ({
      ...prev,
      [taskName]: { ...prev[taskName], status, type: 'checkbox' }
    }));
  };

  const updateNumberValue = (taskName, value) => {
    setFormData(prev => ({
      ...prev,
      [taskName]: { ...prev[taskName], value, type: prev[taskName]?.type || 'number' }
    }));
  };

  const addSubCatRow = (taskName, defaultCat) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'categoryNumber', subCatEntries: [] };
      return {
        ...prev,
        [taskName]: {
          ...task,
          subCatEntries: [...(task.subCatEntries || []), { key: defaultCat, val: '' }]
        }
      };
    });
  };

  const removeSubCatRow = (taskName, sIdx) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'categoryNumber', subCatEntries: [] };
      const nextEntries = [...(task.subCatEntries || [])];
      nextEntries.splice(sIdx, 1);
      return {
        ...prev,
        [taskName]: { ...task, subCatEntries: nextEntries }
      };
    });
  };

  const updateSubCatKey = (taskName, sIdx, key) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'categoryNumber', subCatEntries: [] };
      const nextEntries = [...(task.subCatEntries || [])];
      nextEntries[sIdx] = { ...nextEntries[sIdx], key };
      return {
        ...prev,
        [taskName]: { ...task, subCatEntries: nextEntries }
      };
    });
  };

  const updateSubCatVal = (taskName, sIdx, val) => {
    setFormData(prev => {
      const task = prev[taskName] || { type: 'categoryNumber', subCatEntries: [] };
      const nextEntries = [...(task.subCatEntries || [])];
      nextEntries[sIdx] = { ...nextEntries[sIdx], val };
      return {
        ...prev,
        [taskName]: { ...task, subCatEntries: nextEntries }
      };
    });
  };

  // ==========================================
  // REAL-TIME SYSTEM SCORE ESTIMATION (EOD)
  // ==========================================
  const computeLiveScore = () => {
    if (phase !== 'EOD' || visibleTasks.length === 0) return null;
    const scores = [];

    visibleTasks.forEach(t => {
      const taskName = t.taskName;
      const state = formData[taskName];
      if (!state) return;
      const bodSaved = findTaskData(initialBodData, t) || {};

      let target = (bodSaved.value !== undefined && bodSaved.value !== null && bodSaved.value !== '') ? Number(bodSaved.value) : 0;
      let achieved = 0;

      if (t.inputType === 'dynamicList') {
        let tSum = 0;
        let aSum = 0;
        (state.morningItems || []).forEach(item => {
          const itemTarget = item.hasTarget ? Number(item.target) || 1 : 1;
          const itemAchieved = item.hasTarget ? Number(item.achieved) || 0 : (item.status === 'Done' ? 1 : 0);
          tSum += itemTarget;
          aSum += itemAchieved;
        });

        if (voluntaryOpenMap[taskName]) {
          (state.volItems || []).forEach(v => {
            const vAchieved = v.hasTarget ? Number(v.achieved) || 0 : (v.status === 'Done' ? 1 : 0);
            aSum += vAchieved;
          });
        }

        target = tSum;
        achieved = aSum;
      } else if (t.inputType === 'checkbox') {
        target = 1;
        achieved = state.status === 'Done' ? 1 : 0;
      } else if (t.inputType === 'categoryNumber') {
        target = (bodSaved.value !== undefined && bodSaved.value !== null && bodSaved.value !== '') ? Number(bodSaved.value) : 0;
        achieved = (state.subCatEntries || []).reduce((acc, row) => acc + (Number(row.val) || 0), 0);
      } else {
        target = (bodSaved.value !== undefined && bodSaved.value !== null && bodSaved.value !== '') ? Number(bodSaved.value) : 0;
        achieved = Number(state.value) || 0;
      }

      // Exact 1:1 match with code.gs calculatePerformance:
      // If target is 0 or unassigned, achieved >= 0 awards 100% (unassigned tasks do not penalize employee)
      const p = target <= 0 ? (achieved >= 0 ? 100 : 0) : (achieved / target) * 100;
      scores.push(Math.min(100, Math.max(0, p)));
    });

    if (scores.length === 0) return 0;
    const total = scores.reduce((a, b) => a + b, 0);
    return Math.round(total / scores.length);
  };

  const liveScore = computeLiveScore();

  // ==========================================
  // SUBMIT REPORT HANDLER (Exact GS App Parity)
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    // Strict validation: EOD cannot be submitted without a pre-existing Morning BOD
    if (phase === 'EOD') {
      const hasBod = initialBodData && typeof initialBodData === 'object' && Object.keys(initialBodData).length > 0;
      if (!hasBod) {
        setError('Morning BOD report has not been submitted for today. You must submit your Morning BOD before submitting Evening EOD.');
        setSaving(false);
        return;
      }
    }

    try {
      const fData = {};
      const empName = user?.name || 'Employee';
      const empDept = user?.department || '';
      const currDate = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY

      let waText = `*${phase} Report*\n*Name:* ${empName}\n*Date:* ${currDate}\n\n*----- TASKS -----*\n`;
      let pdfHtml = `<div style="font-family:Arial; padding:20px;"><h2 style="color:#0B2447; text-align:center; border-bottom:2px solid #0B2447; padding-bottom:10px;">${phase} Report</h2><p><b>Name:</b> ${escapeHtml(empName)}<br><b>Dept:</b> ${escapeHtml(empDept)}<br><b>Date:</b> ${currDate}</p><hr><table style="width:100%; border-collapse: collapse;">`;

      visibleTasks.forEach((t) => {
        const taskName = t.taskName;
        const taskState = formData[taskName] || {};
        const m = (t.displayPhase === 'BOTH' || t.displayPhase === phase + '_ONLY');
        const s = (t.inputType === 'categoryNumber' && (t.subCategoryPhase === 'BOTH' || t.subCategoryPhase === phase));
        if (!m && !s) return;

        const tData = { type: t.inputType, remarks: (taskState.remarks || '').trim() };
        let hasP = false;
        let displayString = '';

        waText += `\n*${taskName}*\n`;
        pdfHtml += `<tr style="background-color:#f4f7f6;"><td colspan="2" style="padding:8px; border:1px solid #ddd;"><b>${escapeHtml(taskName)}</b></td></tr>`;

        if (m) {
          if (t.inputType === 'dynamicList') {
            tData.list = [];

            if (phase === 'BOD') {
              (taskState.list || []).forEach(item => {
                const title = (item.title || '').trim();
                const time = item.time || '';
                const hasTar = item.hasTarget === true || item.hasTarget === 'true' || item.hasTarget === undefined;
                const target = item.target !== undefined && item.target !== '' ? item.target : '';
                const desc = (item.description || '').trim();

                if (title !== '') {
                  tData.list.push({
                    title,
                    time,
                    hasTarget: hasTar,
                    target,
                    description: desc,
                    achieved: '',
                    status: '',
                    checklist: [],
                    isVoluntary: false
                  });
                }
              });
            } else {
              // EOD phase
              (taskState.morningItems || []).forEach(mItem => {
                const title = (mItem.title || '').trim();
                const time = mItem.time || '';
                const hasTar = mItem.hasTarget === true || mItem.hasTarget === 'true' || mItem.hasTarget === undefined;
                const target = mItem.target !== undefined ? mItem.target : '';
                const desc = (mItem.description || '').trim();
                const achieved = hasTar ? (mItem.achieved !== undefined ? mItem.achieved : '') : '';
                const status = !hasTar ? (mItem.status || 'Not Done') : '';
                const checklistArr = Array.isArray(mItem.checklist) ? mItem.checklist : [];

                if (title !== '') {
                  tData.list.push({
                    title,
                    time,
                    hasTarget: hasTar,
                    target,
                    description: desc,
                    achieved,
                    status,
                    checklist: checklistArr,
                    isVoluntary: false
                  });
                }
              });

              if (voluntaryOpenMap[taskName]) {
                (taskState.volItems || []).forEach(vItem => {
                  const title = (vItem.title || '').trim();
                  const time = vItem.time || '';
                  const hasTar = vItem.hasTarget === true || vItem.hasTarget === 'true' || vItem.hasTarget === undefined;
                  const achieved = hasTar ? (vItem.achieved !== undefined ? vItem.achieved : '') : '';
                  const status = !hasTar ? (vItem.status || 'Not Done') : '';

                  if (title !== '') {
                    tData.list.push({
                      title,
                      time,
                      hasTarget: hasTar,
                      target: '',
                      achieved,
                      status,
                      checklist: [],
                      isVoluntary: true
                    });
                  }
                });
              }
            }

            if (tData.list.length > 0) {
              tData.list.forEach(item => {
                let txt = '';
                const timeStr = item.time ? ` [${item.time}]` : '';

                if (phase === 'BOD') {
                  txt = `${item.title}${timeStr}` + (item.hasTarget ? ` (Target: ${item.target})` : ` (Yes/No Task)`);
                  if (item.description) {
                    const lines = item.description.split('\n').filter(x => x.trim() !== '');
                    if (lines.length > 0) txt += `\n      - ` + lines.join(`\n      - `);
                  }
                  waText += `    ${txt}\n`;
                  const descHtml = item.description ? `<br><small style="color:gray;">${escapeHtml(item.description).replace(/\n/g, '<br>')}</small>` : '';
                  pdfHtml += `<tr><td style="padding:8px; border:1px solid #ddd; padding-left:20px;">${escapeHtml(item.title)}${timeStr}${descHtml}</td><td style="padding:8px; border:1px solid #ddd;">${item.hasTarget ? 'Target: ' + escapeHtml(item.target) : 'Yes/No Task'}</td></tr>`;
                } else {
                  txt = `${item.title}${timeStr} -> `;
                  if (item.hasTarget) {
                    txt += `Achieved: ${item.achieved || 'N/A'}`;
                    if (item.target) txt += ` / Target: ${item.target}`;
                  } else {
                    txt += `${item.status === 'Done' ? 'Done' : 'Not Done'}`;
                  }
                  if (item.isVoluntary) txt += ` [Voluntary]`;

                  let checkHtml = '';
                  const bodSaved = findTaskData(initialBodData, t);
                  const bItem = (bodSaved && Array.isArray(bodSaved.list)) ? bodSaved.list.find(x => x.title === item.title) : null;
                  if (bItem && bItem.description && item.checklist) {
                    const lines = bItem.description.split('\n').filter(x => x.trim() !== '');
                    lines.forEach((line, idx) => {
                      const tick = item.checklist[idx] ? '☑' : '☐';
                      txt += `\n      ${tick} ${line}`;
                      checkHtml += `<br><span style="color:${item.checklist[idx] ? 'green' : 'gray'}">${item.checklist[idx] ? '☑' : '☐'} ${escapeHtml(line)}</span>`;
                    });
                  }

                  waText += `    ${txt}\n`;
                  const cell1 = `<b>${escapeHtml(item.title)}</b>${timeStr} ${item.isVoluntary ? '<br><small class="text-success">(Voluntary)</small>' : ''}${checkHtml}`;
                  const cell2 = item.hasTarget ? `Target: ${escapeHtml(item.target || 'N/A')} <br> <b>Achieved: ${escapeHtml(item.achieved || 'N/A')}</b>` : `<b>${item.status === 'Done' ? 'Done' : 'Not Done'}</b>`;
                  pdfHtml += `<tr><td style="padding:8px; border:1px solid #ddd; padding-left:20px;">${cell1}</td><td style="padding:8px; border:1px solid #ddd;">${cell2}</td></tr>`;
                }
                hasP = true;
              });
            }
          } else if (t.inputType === 'checkbox') {
            if (phase === 'EOD') {
              tData.status = taskState.status || 'Not Done';
              displayString = `Status: ${tData.status === 'Done' ? 'Done' : 'Not Done'}`;
            } else {
              tData.value = '1';
              displayString = `Task assigned for today (Yes/No)`;
            }
          } else {
            // Number or generic
            tData.value = taskState.value !== undefined ? String(taskState.value) : '';
            if (phase === 'EOD') {
              const bodSaved = findTaskData(initialBodData, t);
              const bodTarget = bodSaved ? bodSaved.value : 'N/A';
              displayString = `Target: ${escapeHtml(bodTarget)} | Achieved: ${escapeHtml(taskState.value || '')}`;
            } else {
              displayString = `Target: ${escapeHtml(taskState.value || '')}`;
            }
          }
        }

        if (displayString !== '') {
          waText += `    ${displayString}\n`;
          pdfHtml += `<tr><td style="padding:8px; border:1px solid #ddd; width:60%;">Target / Achieved</td><td style="padding:8px; border:1px solid #ddd;">${displayString}</td></tr>`;
          hasP = true;
        }

        if (s) {
          tData.subCategories = {};
          (taskState.subCatEntries || []).forEach(row => {
            const k = (row.key || '').trim();
            const v = parseInt(row.val, 10);
            if (k && !isNaN(v)) {
              tData.subCategories[k] = (tData.subCategories[k] || 0) + v;
            }
          });

          for (const k in tData.subCategories) {
            waText += `    ${k}: ${tData.subCategories[k]}\n`;
            pdfHtml += `<tr><td style="padding:8px; border:1px solid #ddd; padding-left: 20px;">${escapeHtml(k)}</td><td style="padding:8px; border:1px solid #ddd;">${tData.subCategories[k]}</td></tr>`;
            hasP = true;
          }
        }

        if (tData.remarks !== '') {
          waText += `    Remarks/Details: ${tData.remarks}\n`;
          pdfHtml += `<tr><td style="padding:8px; border:1px solid #ddd;">Remarks/Details</td><td style="padding:8px; border:1px solid #ddd; color:gray;">${escapeHtml(tData.remarks).replace(/\n/g, '<br>')}</td></tr>`;
        }

        if (!hasP && tData.remarks === '') {
          waText += `    (No input provided)\n`;
          pdfHtml += `<tr><td colspan="2" style="padding:8px; border:1px solid #ddd; color:gray;">No input</td></tr>`;
        }

        fData[taskName] = tData;
      });

      pdfHtml += `</table></div>`;

      // Save via API
      await onSave(phase, fData);

      // Open Success & Share modal
      setShareData({ waText, pdfHtml });
      setShareModalOpen(true);
    } catch (err) {
      setError(err.message || 'Failed to submit report.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyText = () => {
    if (!shareData.waText) return;
    navigator.clipboard.writeText(shareData.waText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleDownloadPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print or download PDF.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${phase} Report - ${user?.name || 'Employee'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #13233f; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            td, th { padding: 8px 12px; border: 1px solid #ddd; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${shareData.pdfHtml}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCloseAll = () => {
    setShareModalOpen(false);
    onClose();
  };

  return (
    <>
      {/* 1. MAIN BOD / EOD FORM MODAL */}
      <div className="modal-overlay">
        <div className="modal-content" style={{ maxWidth: '780px' }}>
          {/* Exact GS App Navy Header */}
          <div className="modal-header bg-navy text-white">
            <h5 className="modal-title fw-bold">
              <span>{phase}</span> Submissions
            </h5>
            <button type="button" className="btn-close-white" onClick={onClose} title="Close">
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="modal-body bg-light" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {error && (
                <div style={{ padding: '10px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  {error}
                </div>
              )}

              {/* Warning when EOD opened without pre-existing BOD */}
              {phase === 'EOD' && (!initialBodData || Object.keys(initialBodData).length === 0) && (
                <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', border: '1px solid #f87171', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', fontWeight: 600 }}>
                  <i className="bi bi-shield-slash-fill me-2"></i>
                  Morning BOD Required: You cannot submit an Evening EOD report because no Morning BOD plan was submitted today.
                </div>
              )}

              {/* Real-time Score preview in EOD */}
              {phase === 'EOD' && liveScore !== null && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
                      ⚡ Real-Time Estimated System Score:
                    </span>
                    <strong style={{ fontSize: '1.25rem', color: liveScore >= 80 ? 'var(--success)' : liveScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                      {liveScore}%
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${liveScore}%`,
                        height: '100%',
                        background: liveScore >= 80 ? 'var(--success)' : liveScore >= 50 ? 'var(--warning)' : 'var(--danger)',
                        transition: 'width 0.25s ease, background 0.25s ease'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Exact GS App Assigned Tasks Panel */}
              <AssignedTasksPanel empId={user?.id || user?.emp_id} isModal={true} />

              {/* Render visible tasks */}
              {visibleTasks.map((t, i) => {
                const taskName = t.taskName;
                const taskState = formData[taskName] || {};
                const bodSaved = findTaskData(initialBodData, t);
                const hasVol = Boolean(voluntaryOpenMap[taskName]);
                const m = (t.displayPhase === 'BOTH' || t.displayPhase === phase + '_ONLY');
                const s = (t.inputType === 'categoryNumber' && (t.subCategoryPhase === 'BOTH' || t.subCategoryPhase === phase));

                return (
                  <div className="card p-3 mb-3 border-secondary shadow-sm bg-white" key={taskName}>
                    <h5 className="text-navy fw-bold border-bottom pb-2">
                      {taskName}
                    </h5>

                    {/* If EOD and has BOD Target */}
                    {phase === 'EOD' && bodSaved && t.inputType !== 'dynamicList' && (
                      <div className="mb-3 text-primary small">
                        <strong>BOD Target:</strong> {bodSaved.value || 'N/A'}
                      </div>
                    )}

                    {m && (
                      <>
                        {/* ===================================== */}
                        {/* 1. DYNAMIC LIST */}
                        {/* ===================================== */}
                        {t.inputType === 'dynamicList' && (
                          <div className="dynamic-list-wrapper mt-3 border rounded p-3 bg-light">
                            {phase === 'BOD' ? (
                              <>
                                <label className="form-label text-navy fw-bold">
                                  List Items, Targets & Time
                                </label>
                                <div>
                                  {(taskState.list || []).map((item, idx) => (
                                    <div className="row mt-2 align-items-start dyn-row border-bottom pb-2 mb-2" key={idx}>
                                      <div className="col-12 mb-1 d-flex gap-2">
                                        <input
                                          type="text"
                                          className="form-control form-control-sm dyn-title border-primary flex-grow-1"
                                          value={item.title || ''}
                                          placeholder="Item Name / Task"
                                          onChange={(e) => updateDynItemBOD(taskName, idx, 'title', e.target.value)}
                                        />
                                        <input
                                          type="time"
                                          className="form-control form-control-sm dyn-time border-primary"
                                          style={{ width: '110px' }}
                                          value={item.time || ''}
                                          title="Optional Time"
                                          onChange={(e) => updateDynItemBOD(taskName, idx, 'time', e.target.value)}
                                        />
                                        {(taskState.list || []).length > 1 && (
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-danger fw-bold"
                                            onClick={() => removeDynItemBOD(taskName, idx)}
                                            title="Delete item"
                                          >
                                            X
                                          </button>
                                        )}
                                      </div>
                                      <div className="col-12 d-flex gap-2">
                                        <select
                                          className="form-select form-select-sm dyn-has-target border-primary"
                                          style={{ width: '140px' }}
                                          value={item.hasTarget ? 'true' : 'false'}
                                          onChange={(e) => updateDynItemBOD(taskName, idx, 'hasTarget', e.target.value === 'true')}
                                        >
                                          <option value="true">Number Target</option>
                                          <option value="false">Yes/No Task</option>
                                        </select>
                                        <div className="dyn-val-container flex-grow-1">
                                          {item.hasTarget && (
                                            <input
                                              type="number"
                                              className="form-control form-control-sm dyn-target border-primary"
                                              placeholder="Target"
                                              value={item.target !== undefined ? item.target : ''}
                                              onChange={(e) => updateDynItemBOD(taskName, idx, 'target', e.target.value)}
                                            />
                                          )}
                                        </div>
                                      </div>
                                      <div className="col-12 mt-1">
                                        <textarea
                                          className="form-control form-control-sm dyn-desc border-primary"
                                          rows="2"
                                          placeholder="Add checklist items (one per line) or general description..."
                                          value={item.description || ''}
                                          onChange={(e) => updateDynItemBOD(taskName, idx, 'description', e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary mt-2 fw-bold"
                                  onClick={() => addDynItemBOD(taskName)}
                                >
                                  + Add Item
                                </button>
                              </>
                            ) : (
                              /* EOD DYNAMIC LIST */
                              <>
                                <label className="form-label text-navy fw-bold">
                                  Update Morning Items (Checklists & Progress)
                                </label>
                                <div>
                                  {(taskState.morningItems || []).length > 0 ? (
                                    (taskState.morningItems || []).map((mItem, bIdx) => {
                                      const hasTar = mItem.hasTarget === true || mItem.hasTarget === 'true' || mItem.hasTarget === undefined;
                                      const descLines = (mItem.description || '').split('\n').filter(x => x.trim() !== '');

                                      return (
                                        <div className="row mt-2 align-items-start dyn-row border-bottom pb-2 mb-2" data-is-bod="true" key={bIdx}>
                                          <div className="col-12 mb-1 d-flex justify-content-between align-items-center">
                                            <input
                                              type="text"
                                              className="form-control form-control-sm dyn-title fw-bold text-navy"
                                              value={mItem.title || ''}
                                              readOnly
                                              style={{ background: 'transparent', border: 'none', paddingLeft: 0, fontSize: '1rem' }}
                                            />
                                            {mItem.time && (
                                              <span className="badge bg-info text-dark shadow-sm">
                                                <i className="bi bi-clock me-1"></i>{mItem.time}
                                              </span>
                                            )}
                                          </div>

                                          {/* Checklist Items */}
                                          {descLines.length > 0 && (
                                            <div className="col-12 mb-2 ps-3 border-start border-3 border-primary dyn-checklist">
                                              {descLines.map((line, lIdx) => (
                                                <div className="form-check mt-1" key={lIdx}>
                                                  <input
                                                    className="form-check-input chk-item border-primary"
                                                    type="checkbox"
                                                    id={`chk_${i}_${bIdx}_${lIdx}`}
                                                    checked={Boolean(mItem.checklist?.[lIdx])}
                                                    onChange={(e) => toggleChecklistEOD(taskName, bIdx, lIdx, e.target.checked)}
                                                  />
                                                  <label className="form-check-label text-secondary" htmlFor={`chk_${i}_${bIdx}_${lIdx}`}>
                                                    {line}
                                                  </label>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          <div className="col-12 d-flex gap-2 align-items-center mt-1">
                                            <div style={{ width: '140px' }}>
                                              <input
                                                type="text"
                                                className="form-control form-control-sm text-muted bg-light"
                                                value={hasTar ? `Target: ${mItem.target || 1}` : 'Yes/No Task'}
                                                readOnly
                                              />
                                            </div>
                                            <div className="dyn-val-container flex-grow-1">
                                              {hasTar ? (
                                                <input
                                                  type="number"
                                                  className="form-control form-control-sm dyn-achieved border-success"
                                                  placeholder="Achieved Score"
                                                  value={mItem.achieved !== undefined ? mItem.achieved : ''}
                                                  onChange={(e) => updateMorningFieldEOD(taskName, bIdx, 'achieved', e.target.value)}
                                                />
                                              ) : (
                                                <select
                                                  className="form-select form-select-sm dyn-status border-success"
                                                  value={mItem.status || 'Not Done'}
                                                  onChange={(e) => updateMorningFieldEOD(taskName, bIdx, 'status', e.target.value)}
                                                >
                                                  <option value="Not Done">Not Done</option>
                                                  <option value="Done">Done</option>
                                                </select>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="small text-muted py-2">No items were added in the morning.</div>
                                  )}
                                </div>

                                {/* Voluntary Extra Items Section */}
                                <div className="mt-4 pt-3 border-top border-secondary">
                                  <label className="form-label text-navy fw-bold d-block">
                                    Add Extra/Voluntary Items?
                                  </label>
                                  <div className="form-check form-check-inline">
                                    <input
                                      className="form-check-input"
                                      type="radio"
                                      name={`vol_${i}`}
                                      id={`vol_yes_${i}`}
                                      value="yes"
                                      checked={hasVol}
                                      onChange={() => setVoluntaryToggle(taskName, true)}
                                    />
                                    <label className="form-check-label text-success" htmlFor={`vol_yes_${i}`}>
                                      Yes
                                    </label>
                                  </div>
                                  <div className="form-check form-check-inline">
                                    <input
                                      className="form-check-input"
                                      type="radio"
                                      name={`vol_${i}`}
                                      id={`vol_no_${i}`}
                                      value="no"
                                      checked={!hasVol}
                                      onChange={() => setVoluntaryToggle(taskName, false)}
                                    />
                                    <label className="form-check-label text-danger" htmlFor={`vol_no_${i}`}>
                                      No
                                    </label>
                                  </div>

                                  {hasVol && (
                                    <div className="mt-2">
                                      <div>
                                        {(taskState.volItems || []).map((vItem, vIdx) => (
                                          <div className="row mt-2 align-items-start dyn-row border-bottom pb-2 mb-2" key={vIdx}>
                                            <div className="col-12 mb-1 d-flex gap-2">
                                              <input
                                                type="text"
                                                className="form-control form-control-sm dyn-title border-success flex-grow-1"
                                                placeholder="Voluntary Item"
                                                value={vItem.title || ''}
                                                onChange={(e) => updateVolItemEOD(taskName, vIdx, 'title', e.target.value)}
                                              />
                                              <input
                                                type="time"
                                                className="form-control form-control-sm dyn-time border-success"
                                                style={{ width: '110px' }}
                                                title="Optional Time"
                                                value={vItem.time || ''}
                                                onChange={(e) => updateVolItemEOD(taskName, vIdx, 'time', e.target.value)}
                                              />
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-danger fw-bold"
                                                onClick={() => removeVolItemEOD(taskName, vIdx)}
                                              >
                                                X
                                              </button>
                                            </div>
                                            <div className="col-12 d-flex gap-2">
                                              <select
                                                className="form-select form-select-sm dyn-has-target border-success"
                                                style={{ width: '140px' }}
                                                value={vItem.hasTarget ? 'true' : 'false'}
                                                onChange={(e) => updateVolItemEOD(taskName, vIdx, 'hasTarget', e.target.value === 'true')}
                                              >
                                                <option value="true">Number Score</option>
                                                <option value="false">Yes/No Task</option>
                                              </select>
                                              <div className="dyn-val-container flex-grow-1">
                                                {vItem.hasTarget ? (
                                                  <input
                                                    type="number"
                                                    className="form-control form-control-sm dyn-achieved border-success"
                                                    placeholder="Achieved"
                                                    value={vItem.achieved !== undefined ? vItem.achieved : ''}
                                                    onChange={(e) => updateVolItemEOD(taskName, vIdx, 'achieved', e.target.value)}
                                                  />
                                                ) : (
                                                  <select
                                                    className="form-select form-select-sm dyn-status border-success"
                                                    value={vItem.status || 'Not Done'}
                                                    onChange={(e) => updateVolItemEOD(taskName, vIdx, 'status', e.target.value)}
                                                  >
                                                    <option value="Not Done">Not Done</option>
                                                    <option value="Done">Done</option>
                                                  </select>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-success mt-2 fw-bold"
                                        onClick={() => addVolItemEOD(taskName)}
                                      >
                                        + Add Extra Item
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* ===================================== */}
                        {/* 2. CHECKBOX (YES/NO) */}
                        {/* ===================================== */}
                        {t.inputType === 'checkbox' && (
                          <div>
                            {phase === 'EOD' ? (
                              <>
                                <label className="form-label mt-2 text-muted fw-bold">Task Status</label>
                                <div className="radio-status d-flex gap-3 mt-1">
                                  <div className="form-check">
                                    <input
                                      className="form-check-input status-radio"
                                      type="radio"
                                      name={`status_${i}`}
                                      id={`done_${i}`}
                                      value="Done"
                                      checked={taskState.status === 'Done'}
                                      onChange={() => updateCheckboxStatus(taskName, 'Done')}
                                    />
                                    <label className="form-check-label text-success fw-bold ms-1" htmlFor={`done_${i}`}>
                                      Done
                                    </label>
                                  </div>
                                  <div className="form-check">
                                    <input
                                      className="form-check-input status-radio"
                                      type="radio"
                                      name={`status_${i}`}
                                      id={`notdone_${i}`}
                                      value="Not Done"
                                      checked={taskState.status === 'Not Done'}
                                      onChange={() => updateCheckboxStatus(taskName, 'Not Done')}
                                    />
                                    <label className="form-check-label text-danger fw-bold ms-1" htmlFor={`notdone_${i}`}>
                                      Not Done
                                    </label>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <label className="form-label mt-2 text-muted fw-bold">Task Type</label>
                                <div className="alert alert-info py-2 mb-0 small border-info">
                                  This is a Yes/No task. You will mark it as Done/Not Done in the Evening Report.
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* ===================================== */}
                        {/* 3. NUMBER / STANDARD INPUT */}
                        {/* ===================================== */}
                        {t.inputType !== 'dynamicList' && t.inputType !== 'checkbox' && (
                          <div>
                            <label className="form-label mt-2 text-muted fw-bold">
                              {phase === 'EOD' ? 'Achieved Count / Details' : 'Main Target / Text'}
                            </label>
                            <input
                              type={t.inputType === 'number' ? 'number' : 'text'}
                              className="form-control main-val border-primary"
                              placeholder="Enter details or number"
                              value={taskState.value !== undefined ? taskState.value : ''}
                              onChange={(e) => updateNumberValue(taskName, e.target.value)}
                            />
                          </div>
                        )}

                        {/* EOD Remarks for main tasks */}
                        {phase === 'EOD' && (
                          <textarea
                            className="form-control mt-3 task-remarks border-warning"
                            rows="2"
                            placeholder="Remarks, Details (Names), or Reason if not done..."
                            value={taskState.remarks || ''}
                            onChange={(e) => updateTaskRemarks(taskName, e.target.value)}
                          />
                        )}
                      </>
                    )}

                    {/* ===================================== */}
                    {/* 4. SUB-CATEGORIES (categoryNumber) */}
                    {/* ===================================== */}
                    {s && (
                      <div className="mt-3 p-3 bg-light border border-success rounded">
                        <label className="form-label text-success fw-bold">Sub-Categories</label>
                        <div>
                          {(taskState.subCatEntries || []).map((row, sIdx) => (
                            <div className="row mt-2 align-items-center subcat-row" key={sIdx}>
                              <div className="col-6 pe-1" style={{ width: '50%' }}>
                                <select
                                  className="form-select form-select-sm border-success fw-bold subcat-key"
                                  value={row.key}
                                  onChange={(e) => updateSubCatKey(taskName, sIdx, e.target.value)}
                                >
                                  {(t.subCategories || ['General']).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-4 px-1" style={{ width: '35%' }}>
                                <input
                                  type="number"
                                  className="form-control form-control-sm border-success subcat-val"
                                  placeholder="Count"
                                  value={row.val !== undefined ? row.val : ''}
                                  onChange={(e) => updateSubCatVal(taskName, sIdx, e.target.value)}
                                />
                              </div>
                              <div className="col-2 ps-1 text-end" style={{ width: '15%' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger fw-bold"
                                  onClick={() => removeSubCatRow(taskName, sIdx)}
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-success mt-2 fw-bold"
                          onClick={() => addSubCatRow(taskName, t.subCategories?.[0] || 'General')}
                        >
                          + Add Record
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleTasks.length === 0 && (
                <div className="h5 text-center text-muted mt-4">
                  No daily tasks configured.
                </div>
              )}
            </div>

            {/* Modal Footer with exact GS App button styling */}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="submit"
                className="btn btn-gold fw-bold px-4"
                disabled={saving || visibleTasks.length === 0 || (phase === 'EOD' && (!initialBodData || Object.keys(initialBodData).length === 0))}
              >
                {saving ? 'Submitting report...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ===================================== */}
      {/* 2. SUCCESS & SHARE MODAL (1:1 with GS App) */}
      {/* ===================================== */}
      {shareModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header bg-success text-white">
              <h5 className="modal-title fw-bold">Report Submitted!</h5>
              <button type="button" className="btn-close-white" onClick={handleCloseAll} title="Close">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="modal-body bg-light">
              <div className="mb-3">
                <textarea
                  id="whatsapp-copy-text"
                  className="form-control border-success"
                  rows="10"
                  readOnly
                  value={shareData.waText}
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>
              <div className="d-flex justify-content-between gap-2">
                <button
                  type="button"
                  className="btn btn-primary fw-bold w-100"
                  onClick={handleCopyText}
                >
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger fw-bold w-100"
                  onClick={handleDownloadPdf}
                >
                  Download PDF
                </button>
              </div>
              <button
                type="button"
                className="btn btn-secondary w-100 mt-3"
                onClick={handleCloseAll}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

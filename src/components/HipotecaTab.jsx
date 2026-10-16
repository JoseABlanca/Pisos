import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Trash2, Eye, FileText, Plus, Landmark, Calculator, FolderOpen, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import Accounts from '../pages/Accounts';
import Window from './Window';

export default function HipotecaTab({ 
  formData, 
  setFormData, 
  user, 
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  availableAccounts = [],
  cecos = [],
  queryUserIds
}) {
  const [activeSubTab, setActiveSubTab] = useState('datos'); // datos, docs, amortizacion, amortizacion_real
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  
  // Modals states
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [showCecosModal, setShowCecosModal] = useState(false);
  
  // CECO search state
  const [cecoSearch, setCecoSearch] = useState('');
  const [selectedCecoTemp, setSelectedCecoTemp] = useState('');

  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const q = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', userIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournalEntries(list);
      setLoadingEntries(false);
    }, (error) => {
      console.error("Error loading journal entries in HipotecaTab:", error);
      setLoadingEntries(false);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  const activeMortgageAccount = formData.mortgageAccount || '';
  const activeInterestCeco = formData.mortgageCeco || '';

  const principalEntries = useMemo(() => {
    if (!formData.cebe) return [];
    
    const targetAccount = availableAccounts.find(a => a.code === activeMortgageAccount);
    const cleanActiveAcc = String(activeMortgageAccount || '').trim().toLowerCase();

    const list = [];
    journalEntries.forEach(entry => {
      if (!entry.date) return;
      
      const hasLineCebe = entry.lines?.some(l => l.cebe);
      
      entry.lines?.forEach(l => {
        const lineCebe = l.cebe || (!hasLineCebe && entry.cebe) || '';
        if (lineCebe !== formData.cebe) return;

        const accCode = String(l.accountCode || l.accountId || '').trim();

        // Must NOT be interest account 662 / 66
        if (accCode.startsWith('66')) return;

        // Principal matching criteria:
        // 1. Account starts with 52 (e.g. 520, 520001) or 17 (e.g. 170, 171)
        const isStandardPrincipalAcc = accCode.startsWith('52') || accCode.startsWith('17');
        
        // 2. Matches configured activeMortgageAccount
        const isAccMatch = !accCode.startsWith('66') && (
          (targetAccount && l.accountId === targetAccount.id) || 
          (cleanActiveAcc && accCode.toLowerCase() === cleanActiveAcc)
        );

        if (isStandardPrincipalAcc || isAccMatch) {
          list.push({
            date: entry.date,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0
          });
        }
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [journalEntries, availableAccounts, activeMortgageAccount, formData.cebe]);

  const interestEntries = useMemo(() => {
    if (!formData.cebe) return [];

    const cleanInterestCeco = String(activeInterestCeco || '').trim().toLowerCase();
    const targetAccount = availableAccounts.find(a => a.code === activeInterestCeco);

    const list = [];
    journalEntries.forEach(entry => {
      if (!entry.date) return;
      
      const hasLineLevel = entry.lines?.some(l => l.cebe || l.ceco);
      
      entry.lines?.forEach(l => {
        const lineCebe = l.cebe || (!hasLineLevel && entry.cebe) || '';
        if (lineCebe !== formData.cebe) return;
        
        const accCode = String(l.accountCode || l.accountId || '').trim();
        const lineCeco = String(l.ceco || (!hasLineLevel && entry.ceco) || '').trim().toLowerCase();

        // Interest matching criteria:
        // 1. Account starts with 662 or 66 (Intereses de deudas)
        const isStandardInterestAcc = accCode.startsWith('662') || accCode.startsWith('66');

        // 2. Matches activeInterestCeco (CECO code/name)
        const isCecoMatch = cleanInterestCeco && (
          lineCeco === cleanInterestCeco ||
          lineCeco.replace(/^(cebe|ceco)/i, '') === cleanInterestCeco.replace(/^(cebe|ceco)/i, '') ||
          lineCeco.includes(cleanInterestCeco)
        );

        // 3. Matches account if activeInterestCeco was specified as an account code
        const isAccMatch = (targetAccount && l.accountId === targetAccount.id) || 
                           (cleanInterestCeco && accCode.toLowerCase() === cleanInterestCeco);

        if (isStandardInterestAcc || isCecoMatch || isAccMatch) {
          list.push({
            date: entry.date,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0
          });
        }
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [journalEntries, availableAccounts, activeInterestCeco, formData.cebe]);

  const realAmortizationTable = useMemo(() => {
    const P = parseFloat(formData.loanAmount) || 0;
    if (P <= 0) return [];

    const principalByMonth = {};
    principalEntries.forEach(e => {
      const monthKey = e.date.substring(0, 7);
      const netPaid = e.debit - e.credit;
      principalByMonth[monthKey] = (principalByMonth[monthKey] || 0) + netPaid;
    });

    const interestByMonth = {};
    interestEntries.forEach(e => {
      const monthKey = e.date.substring(0, 7);
      const paid = e.debit - e.credit;
      interestByMonth[monthKey] = (interestByMonth[monthKey] || 0) + paid;
    });

    let startYear, startMonth;
    if (formData.mortgageStart) {
      const start = new Date(formData.mortgageStart);
      startYear = start.getFullYear();
      startMonth = start.getMonth();
    } else {
      const allDates = [...principalEntries, ...interestEntries].map(e => e.date);
      if (allDates.length === 0) return [];
      allDates.sort();
      const start = new Date(allDates[0]);
      startYear = start.getFullYear();
      startMonth = start.getMonth();
    }

    const todayObj = new Date();
    const endYear = todayObj.getFullYear();
    const endMonth = todayObj.getMonth();

    const table = [];
    let currentBalance = P;
    let monthIndex = 1;

    let y = startYear;
    let m = startMonth;

    while (y < endYear || (y === endYear && m <= endMonth)) {
      const yearStr = String(y);
      const monthStr = String(m + 1).padStart(2, '0');
      const monthKey = `${yearStr}-${monthStr}`;

      const principalPaid = principalByMonth[monthKey] || 0;
      const interestPaid = interestByMonth[monthKey] || 0;
      const quota = principalPaid + interestPaid;

      const startingBalance = currentBalance;
      const interestRate = startingBalance > 0 ? (interestPaid / startingBalance) * 12 * 100 : 0;

      currentBalance -= principalPaid;

      table.push({
        month: monthIndex++,
        date: monthKey,
        payment: quota,
        principal: principalPaid,
        interest: interestPaid,
        interestRate: interestRate,
        balance: Math.max(0, currentBalance)
      });

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }

    return table;
  }, [formData.loanAmount, formData.mortgageStart, principalEntries, interestEntries]);

  const calculatedPendingCapital = useMemo(() => {
    if (realAmortizationTable.length > 0) {
      return realAmortizationTable[realAmortizationTable.length - 1].balance;
    }
    return parseFloat(formData.loanAmount) || 0;
  }, [realAmortizationTable, formData.loanAmount]);

  const calculatedGeneratedInterests = useMemo(() => {
    return realAmortizationTable.reduce((sum, row) => sum + (row.interest || 0), 0);
  }, [realAmortizationTable]);

  const calculatedInterestRate = useMemo(() => {
    if (realAmortizationTable.length > 0) {
      return realAmortizationTable[realAmortizationTable.length - 1].interestRate;
    }
    return 0;
  }, [realAmortizationTable]);

  useEffect(() => {
    const pendingVal = Number(calculatedPendingCapital).toFixed(2);
    const interestsVal = Number(calculatedGeneratedInterests).toFixed(2);
    const rateVal = Number(calculatedInterestRate).toFixed(2);

    const prevPendingVal = Number(formData.mortgagePending || 0).toFixed(2);
    const prevInterestsVal = Number(formData.generatedInterests || 0).toFixed(2);
    const prevRateVal = Number(formData.lastInterestRate || 0).toFixed(2);

    if (pendingVal !== prevPendingVal || interestsVal !== prevInterestsVal || rateVal !== prevRateVal) {
      setFormData(prev => ({
        ...prev,
        mortgagePending: parseFloat(pendingVal),
        generatedInterests: parseFloat(interestsVal),
        lastInterestRate: parseFloat(rateVal)
      }));
    }
  }, [calculatedPendingCapital, calculatedGeneratedInterests, calculatedInterestRate, setFormData]);

  const filteredCecos = useMemo(() => {
    const term = cecoSearch.toLowerCase().trim();
    return cecos.filter(c => 
      c.code.toLowerCase().includes(term) || 
      c.name.toLowerCase().includes(term)
    );
  }, [cecos, cecoSearch]);

  const handleFileUpload = async (e) => {
    const inputTarget = e.target;
    const files = Array.from(inputTarget.files);
    if (!files.length || !user || !formData.id) return;

    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'mortgage');
        newDocs.push({
          id: Date.now() + Math.random().toString(36).substring(7),
          name: file.name,
          concept: '',
          date: new Date().toISOString().split('T')[0],
          url,
          type: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString()
        });
      }

      setFormData(prev => ({
        ...prev,
        mortgageDocs: [...(prev.mortgageDocs || []), ...newDocs]
      }));
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      if (inputTarget) {
        inputTarget.value = ''; // Reset input safely
      }
    }
  };

  const deleteDocument = (docId) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      setFormData(prev => ({
        ...prev,
        mortgageDocs: prev.mortgageDocs.filter(d => d.id !== docId)
      }));
    }
  };

  const updateDocument = (docId, field, value) => {
    setFormData(prev => ({
      ...prev,
      mortgageDocs: prev.mortgageDocs.map(d => 
        d.id === docId ? { ...d, [field]: value } : d
      )
    }));
  };

  const calculateAmortization = useMemo(() => {
    const P = parseFloat(formData.loanAmount) || 0;
    const n = parseInt(formData.totalMonths) || 0;
    const isVariable = formData.mortgageType === 'variable';
    const isMixed = formData.mortgageType === 'mixta';
    
    // Simplification for the simulation: 
    // If it's mixed, we will just use the fixed rate for the simulation, or a mix if requested,
    // but a standard table is usually generated using a single reference rate for the whole simulation unless specified.
    // For now, we'll use the 'interest' (which represents fixed interest or the initial interest for variable)
    const annualRate = parseFloat(formData.interest) || 0;
    const r = annualRate / 100 / 12;

    if (P <= 0 || n <= 0) return [];

    let currentBalance = P;
    const table = [];
    
    const monthlyPayment = r === 0 
      ? P / n 
      : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    const startDate = formData.mortgageStart ? new Date(formData.mortgageStart) : new Date();

    for (let i = 1; i <= n; i++) {
      const interestPayment = currentBalance * r;
      const principalPayment = monthlyPayment - interestPayment;
      currentBalance -= principalPayment;

      const rowDate = new Date(startDate);
      rowDate.setMonth(rowDate.getMonth() + i);

      table.push({
        month: i,
        date: rowDate.toISOString().split('T')[0],
        payment: monthlyPayment,
        principal: principalPayment,
        interest: interestPayment,
        interestRate: annualRate,
        balance: Math.max(0, currentBalance)
      });
    }
    
    return table;
  }, [formData.loanAmount, formData.totalMonths, formData.interest, formData.mortgageType, formData.mortgageStart]);

  // Calculate remaining months based on start date
  const remainingMonths = useMemo(() => {
    if (!formData.mortgageStart || !formData.totalMonths) return '';
    const start = new Date(formData.mortgageStart);
    const now = new Date();
    
    const diffMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    const total = parseInt(formData.totalMonths) || 0;
    
    const remaining = total - diffMonths;
    return remaining > 0 ? remaining : 0;
  }, [formData.mortgageStart, formData.totalMonths]);

  const calculatedExpiryDate = useMemo(() => {
    if (!formData.mortgageStart || !formData.totalMonths) return '';
    const start = new Date(formData.mortgageStart + 'T00:00:00');
    const total = parseInt(formData.totalMonths) || 0;
    start.setMonth(start.getMonth() + total);
    
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [formData.mortgageStart, formData.totalMonths]);

  useEffect(() => {
    if (calculatedExpiryDate && calculatedExpiryDate !== formData.expiry) {
      setFormData(prev => ({
        ...prev,
        expiry: calculatedExpiryDate
      }));
    }
  }, [calculatedExpiryDate, formData.expiry, setFormData]);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Sub-tabs header */}
      <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('datos')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'datos' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Landmark className="w-3 h-3" /> Datos
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('docs')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'docs' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <FolderOpen className="w-3 h-3" /> Documentos
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('amortizacion_real')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'amortizacion_real' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Calculator className="w-3 h-3" /> Cuadro Amortización
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('amortizacion')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'amortizacion' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Calculator className="w-3 h-3" /> Cuadro Amortización Teórico
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeSubTab === 'datos' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Columna Izquierda */}
              <div className="space-y-3">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Nombre Entidad Financiera:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={formData.bank || ''} 
                    onChange={e => setFormData({ ...formData, bank: e.target.value })} 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Nº Préstamo:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={formData.loanNumber || ''} 
                    onChange={e => setFormData({ ...formData, loanNumber: e.target.value })} 
                  />
                </div>
                
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Cuenta Amortización Principal:</label>
                  <div className="flex gap-1">
                    <input 
                      type="text" 
                      className="win-input flex-1 bg-[#fafafa] cursor-pointer font-mono text-gray-800" 
                      placeholder="Haga clic para seleccionar cuenta..."
                      value={formData.mortgageAccount ? `${formData.mortgageAccount} - ${availableAccounts.find(a => a.code === formData.mortgageAccount)?.name || ''}` : ''}
                      readOnly
                      onClick={() => setShowAccountsModal(true)}
                    />
                    <button 
                      type="button" 
                      className="btn-classic px-2.5 text-red-600 font-bold flex items-center justify-center shrink-0 cursor-pointer text-xs" 
                      onClick={() => setFormData({ ...formData, mortgageAccount: '' })}
                      title="Quitar cuenta"
                    >
                      X
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">CECO Intereses Hipoteca:</label>
                  <div className="flex gap-1">
                    <input 
                      type="text" 
                      className="win-input flex-1 bg-[#fafafa] cursor-pointer font-mono text-gray-800" 
                      placeholder="Haga clic para seleccionar CECO..."
                      value={formData.mortgageCeco ? `${formData.mortgageCeco} - ${cecos.find(c => c.code === formData.mortgageCeco)?.name || ''}` : ''}
                      readOnly
                      onClick={() => setShowCecosModal(true)}
                    />
                    <button 
                      type="button" 
                      className="btn-classic px-2.5 text-red-600 font-bold flex items-center justify-center shrink-0 cursor-pointer text-xs" 
                      onClick={() => setFormData({ ...formData, mortgageCeco: '' })}
                      title="Quitar CECO"
                    >
                      X
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Tipo de Hipoteca:</label>
                  <select 
                    className="win-input w-full"
                    value={formData.mortgageType || 'fija'}
                    onChange={e => setFormData({ ...formData, mortgageType: e.target.value })}
                  >
                    <option value="fija">Fija</option>
                    <option value="mixta">Mixta</option>
                    <option value="variable">Variable</option>
                  </select>
                </div>

                {formData.mortgageType === 'mixta' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2.5">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Años de Fija:</label>
                      <input 
                        type="number" 
                        className="win-input w-full" 
                        value={formData.fixedYears || ''} 
                        onChange={e => setFormData({ ...formData, fixedYears: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-2.5">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Años Variables:</label>
                      <input 
                        type="number" 
                        className="win-input w-full" 
                        value={formData.variableYears || ''} 
                        onChange={e => setFormData({ ...formData, variableYears: e.target.value })} 
                      />
                    </div>
                  </div>
                )}

                {/* Tipos de interes dependiendo de la hipoteca */}
                {(formData.mortgageType === 'fija' || formData.mortgageType === 'mixta') && (
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Tipo de Interés Fijo (%):</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="win-input w-full" 
                      value={formData.interest || ''} 
                      onChange={e => setFormData({ ...formData, interest: e.target.value })} 
                    />
                  </div>
                )}

                {(formData.mortgageType === 'variable' || formData.mortgageType === 'mixta') && (
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Tipo de Interés Variable (Euribor + Diferencial):</label>
                    <input 
                      type="text" 
                      className="win-input w-full" 
                      placeholder="Ej: Euribor + 0.99%"
                      value={formData.variableInterest || ''} 
                      onChange={e => setFormData({ ...formData, variableInterest: e.target.value })} 
                    />
                  </div>
                )}
                
                {/* if it's strictly variable, we still might need the current 'interest' to calculate the simulated table */}
                {formData.mortgageType === 'variable' && (
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Interés de Salida / Actual para simulación (%):</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="win-input w-full" 
                      value={formData.interest || ''} 
                      onChange={e => setFormData({ ...formData, interest: e.target.value })} 
                    />
                  </div>
                )}

                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Último Tipo de Interés Real (%):</label>
                  <input 
                    type="text" 
                    className="win-input w-full bg-[#fafafa] font-semibold text-gray-800" 
                    value={formData.lastInterestRate !== undefined ? `${Number(formData.lastInterestRate).toFixed(2)} %` : '0.00 %'} 
                    readOnly
                  />
                </div>
              </div>

              {/* Columna Derecha */}
              <div className="space-y-3">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Capital Concedido (€):</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="win-input w-full text-right" 
                    value={formData.loanAmount || ''} 
                    onChange={e => setFormData({ ...formData, loanAmount: e.target.value })} 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Capital Pendiente (€):</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="win-input w-full text-right bg-[#fafafa] text-gray-800" 
                    value={formData.mortgagePending || ''} 
                    readOnly 
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Intereses Generados (€):</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="win-input w-full text-right bg-[#fafafa] text-gray-800" 
                    value={formData.generatedInterests || ''} 
                    readOnly 
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Inicio:</label>
                    <input 
                      type="date" 
                      className="win-input w-full" 
                      value={formData.mortgageStart || ''} 
                      onChange={e => setFormData({ ...formData, mortgageStart: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Meses Tot.:</label>
                    <input 
                      type="number" 
                      className="win-input w-full text-right" 
                      value={formData.totalMonths || ''} 
                      onChange={e => setFormData({ ...formData, totalMonths: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Restantes:</label>
                    <input 
                      type="number" 
                      className="win-input w-full text-right bg-[#fafafa] font-semibold text-gray-800" 
                      value={remainingMonths} 
                      readOnly
                      disabled
                    />
                  </div>
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Fecha Vencimiento:</label>
                  <input 
                    type="date" 
                    className="win-input w-full bg-[#fafafa] font-semibold text-gray-800" 
                    value={formData.expiry || ''} 
                    readOnly
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'docs' && (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Documentos</h3>
              <div className="relative">
                <input
                  type="file"
                  multiple
                  id="mortgage-doc-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <label 
                  htmlFor="mortgage-doc-upload" 
                  className={`btn-classic flex items-center space-x-1 px-3 py-1 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-[11px] font-bold">{isUploading ? 'Subiendo...' : 'Adjuntar'}</span>
                </label>
              </div>
            </div>

            <div className="flex-1 bg-white overflow-hidden flex flex-col min-h-[180px]">
              <div className="flex-1 overflow-auto border border-gray-50 rounded-sm">
                <table className="modern-table w-full border-0">
                  <thead>
                    <tr>
                      <th className="w-[20%] text-left text-[10px]">Fecha</th>
                      <th className="w-[30%] text-left text-[10px]">Documento</th>
                      <th className="w-[35%] text-left text-[10px]">Concepto</th>
                      <th className="w-[15%] text-center text-[10px]">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!formData.mortgageDocs || formData.mortgageDocs.length === 0) ? (
                      <tr>
                        <td colSpan="4" className="text-center text-[#888] italic py-8">No hay documentos</td>
                      </tr>
                    ) : (
                      formData.mortgageDocs.map((doc) => (
                        <tr key={doc.id}>
                          <td className="py-1 px-2">
                            <input
                              type="date"
                              className="w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white focus:border-[#666] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] text-[11px] px-1 outline-none h-[24px] transition-colors rounded-sm"
                              value={doc.date || ''}
                              onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center space-x-2 truncate">
                              <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                              <span className="truncate text-gray-700" title={doc.name}>{doc.name}</span>
                            </div>
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="text"
                              className="w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white focus:border-[#666] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] text-[11px] px-1 outline-none h-[24px] transition-colors rounded-sm"
                              value={doc.concept || ''}
                              onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                              placeholder="Ej. Escritura, Recibo..."
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex justify-center items-center space-x-4">
                              <button 
                                type="button"
                                className="text-gray-500 hover:text-blue-600 transition-colors"
                                onClick={() => setPreviewDocument(doc)}
                                title="Previsualizar"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                type="button"
                                className="text-gray-500 hover:text-red-600 transition-colors"
                                onClick={() => deleteDocument(doc.id)}
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'amortizacion' && (
          <div className="h-full flex flex-col">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic mb-4">Cuadro de Amortización Teórico (Simulado)</h3>
            <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#fafafa] grid grid-cols-7 gap-2 p-2 text-[10px] font-bold uppercase text-right text-[#333] border-b border-slate-100">
                <div className="text-center">Mes</div>
                <div className="text-center">Fecha</div>
                <div>Cuota</div>
                <div>Principal</div>
                <div>Intereses</div>
                <div>Interés (%)</div>
                <div>Capital Pendiente</div>
              </div>
              <div className="flex-1 overflow-auto">
                {calculateAmortization.length === 0 ? (
                  <div className="text-center text-slate-400 italic py-8 text-[11px]">
                    Faltan datos para calcular el cuadro (Capital, Interés, Meses)
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {calculateAmortization.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-7 gap-2 px-2 py-1 text-[11px] text-right bg-white border-b border-slate-100">
                        <div className="text-center text-black">{row.month}</div>
                        <div className="text-center text-black">{row.date}</div>
                        <div>{row.payment.toFixed(2)} €</div>
                        <div>{row.principal.toFixed(2)} €</div>
                        <div>{row.interest.toFixed(2)} €</div>
                        <div>{row.interestRate.toFixed(2)} %</div>
                        <div>{row.balance.toFixed(2)} €</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'amortizacion_real' && (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[12px] font-bold text-black uppercase italic">Cuadro de Amortización Real</h3>
              <div className="text-[10px] bg-white border border-[#808080] px-3 py-1 rounded text-black flex gap-4">
                <span>CEBE: <strong>{formData.cebe || 'No configurado'}</strong></span>
                <span>Principal: <strong>{activeMortgageAccount || 'Cuenta 520/170 (Auto)'}</strong></span>
                <span>Intereses: <strong>{activeInterestCeco || 'Cuenta 662 / CECO Intereses (Auto)'}</strong></span>
              </div>
            </div>
            
            {!formData.cebe ? (
              <div className="text-center text-red-600 bg-red-50 border border-red-200 p-6 rounded text-[11px] italic">
                ⚠️ Este activo no tiene un CEBE asociado. Asígnale un CEBE en la pestaña "Datos" para poder vincular sus movimientos contables.
              </div>
            ) : (
              <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
                <div className="bg-[#fafafa] grid grid-cols-7 gap-2 p-2 text-[10px] font-bold uppercase text-right text-[#333] border-b border-slate-100">
                  <div className="text-center">Mes</div>
                  <div className="text-center">Fecha</div>
                  <div>Cuota</div>
                  <div>Principal</div>
                  <div>Intereses</div>
                  <div>Interés (%)</div>
                  <div>Capital Pendiente</div>
                </div>
                <div className="flex-1 overflow-auto">
                  {realAmortizationTable.length === 0 ? (
                    <div className="text-center text-slate-400 italic py-8 text-[11px]">
                      No se encontraron apuntes contables para los parámetros configurados en el periodo.
                    </div>
                  ) : (
                    <div className="p-2 space-y-1">
                      {realAmortizationTable.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-7 gap-2 px-2 py-1 text-[11px] text-right bg-white border-b border-slate-100">
                          <div className="text-center text-black">{row.month}</div>
                          <div className="text-center text-black">{row.date}</div>
                          <div className="text-black">{row.payment.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div className="text-black">{row.principal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div className="text-black">{row.interest.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div className="text-black">{row.interestRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</div>
                          <div className="text-black">{row.balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Accounts Selection Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <Window 
            title="Configuración de Cuentas Contables"
            width={isMobile ? "100%" : "900px"}
            initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
            onClose={() => setShowAccountsModal(false)}
          >
            <div className="bg-white flex flex-col w-full h-[600px] relative overflow-hidden">
              <div className="flex-1 overflow-hidden relative">
                <Accounts 
                  isModal={true} 
                  onAccountSelect={(code) => {
                    setFormData(prev => ({ ...prev, mortgageAccount: code }));
                    setShowAccountsModal(false);
                  }} 
                />
              </div>
              <div className="flex justify-end gap-2 shrink-0 px-3 py-1.5 bg-[#f0f0f0] border-t border-gray-300">
                <button 
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" 
                  onClick={() => setShowAccountsModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}

      {/* CECO Selection Modal */}
      {showCecosModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <Window 
            title="Selección de Centro de Coste (CECO)"
            width={isMobile ? "100%" : "800px"}
            initialPos={{ x: isMobile ? 0 : 60, y: isMobile ? 0 : 30 }}
            onClose={() => setShowCecosModal(false)}
          >
            <div className="bg-[#d4d0c8] flex flex-col h-[500px]">
              <div className="p-2 border-b border-[#808080] bg-[#f5f5f5] flex gap-2">
                <input 
                  type="text" 
                  placeholder="Buscar por código o nombre..." 
                  className="win-input flex-1"
                  value={cecoSearch}
                  onChange={e => setCecoSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-auto p-1 bg-white">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#fafafa] text-slate-700 text-[10px] font-bold uppercase sticky top-0 border-b border-slate-100">
                      <th className="px-3 py-2 text-left border-b border-slate-100 w-32">Código</th>
                      <th className="px-3 py-2 text-left border-b border-slate-100">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCecos.map(c => (
                      <tr 
                        key={c.id} 
                        className="hover:bg-[#e8f0fe] cursor-pointer text-[11px] border-b border-slate-100"
                        onDoubleClick={() => {
                          setFormData({ ...formData, mortgageCeco: c.code });
                          setShowCecosModal(false);
                        }}
                        onClick={() => setSelectedCecoTemp(c.code)}
                      >
                        <td className={`px-3 py-2 font-mono ${selectedCecoTemp === c.code ? 'bg-[#316ac5] text-white font-bold' : ''}`}>{c.code}</td>
                        <td className={`px-3 py-2 ${selectedCecoTemp === c.code ? 'bg-[#316ac5] text-white font-bold' : ''}`}>{c.name}</td>
                      </tr>
                    ))}
                    {filteredCecos.length === 0 && (
                      <tr>
                        <td colSpan="2" className="p-8 text-center text-slate-400 italic">No se encontraron CECOs.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-[#d4d0c8] px-4 py-3 flex justify-end space-x-2 border-t border-[#808080]">
                <button 
                  type="button"
                  onClick={() => {
                    if (selectedCecoTemp) {
                      setFormData({ ...formData, mortgageCeco: selectedCecoTemp });
                      setShowCecosModal(false);
                    }
                  }} 
                  disabled={!selectedCecoTemp}
                  className="btn-classic px-5 py-1 text-[10px] font-bold bg-[#e1e1e1] border-[#888] text-[#333] hover:bg-[#d0d0d0] disabled:opacity-50"
                >
                  Aceptar
                </button>
                <button type="button" onClick={() => setShowCecosModal(false)} className="btn-classic px-5 py-1 text-[10px] font-bold bg-[#e1e1e1] border-[#888] text-[#333] hover:bg-[#d0d0d0]">
                  Cancelar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

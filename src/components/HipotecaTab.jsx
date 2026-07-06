import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Trash2, Eye, FileText, Plus, Landmark, Calculator, FolderOpen, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import Accounts from '../pages/Accounts';

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
    if (!activeMortgageAccount || !formData.cebe) return [];
    
    // Find the account document ID for the selected code
    const targetAccount = availableAccounts.find(a => a.code === activeMortgageAccount);

    const list = [];
    journalEntries.forEach(entry => {
      if (!entry.date) return;
      
      const hasLineCebe = entry.lines?.some(l => l.cebe);
      
      entry.lines?.forEach(l => {
        const isAccMatch = (targetAccount && l.accountId === targetAccount.id) || 
                           String(l.accountCode || l.accountId || '').trim() === String(activeMortgageAccount).trim();
        if (!isAccMatch) return;
        
        const lineCebe = l.cebe || (!hasLineCebe && entry.cebe) || '';
        if (lineCebe !== formData.cebe) return;

        list.push({
          date: entry.date,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0
        });
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [journalEntries, availableAccounts, activeMortgageAccount, formData.cebe]);

  const interestEntries = useMemo(() => {
    if (!activeInterestCeco || !formData.cebe) return [];

    const list = [];
    journalEntries.forEach(entry => {
      if (!entry.date) return;
      
      const hasLineLevel = entry.lines?.some(l => l.cebe || l.ceco);
      
      entry.lines?.forEach(l => {
        const lineCebe = l.cebe || (!hasLineLevel && entry.cebe) || '';
        if (lineCebe !== formData.cebe) return;
        
        const lineCeco = l.ceco || (!hasLineLevel && entry.ceco) || '';
        if (lineCeco !== activeInterestCeco) return;

        list.push({
          date: entry.date,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0
        });
      });
    });
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [journalEntries, activeInterestCeco, formData.cebe]);

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

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Sub-tabs header */}
      <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('datos')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'datos' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Landmark className="w-3 h-3" /> Datos
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('docs')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'docs' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <FolderOpen className="w-3 h-3" /> Documentos
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('amortizacion_real')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'amortizacion_real' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Calculator className="w-3 h-3" /> Cuadro Amortización
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('amortizacion')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'amortizacion' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
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
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Nombre Entidad Financiera:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={formData.bank || ''} 
                    onChange={e => setFormData({ ...formData, bank: e.target.value })} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Nº Préstamo:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={formData.loanNumber || ''} 
                    onChange={e => setFormData({ ...formData, loanNumber: e.target.value })} 
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Cuenta Amortización Principal:</label>
                  <div className="flex gap-1">
                    <input 
                      type="text" 
                      className="win-input flex-1 bg-slate-50 cursor-pointer font-mono" 
                      placeholder="Haga clic para seleccionar cuenta..."
                      value={formData.mortgageAccount ? `${formData.mortgageAccount} - ${availableAccounts.find(a => a.code === formData.mortgageAccount)?.name || ''}` : ''}
                      readOnly
                      onClick={() => setShowAccountsModal(true)}
                    />
                    {formData.mortgageAccount && (
                      <button 
                        type="button" 
                        className="btn-classic px-2 text-red-600 font-bold" 
                        onClick={() => setFormData({ ...formData, mortgageAccount: '' })}
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">CECO Intereses Hipoteca:</label>
                  <div className="flex gap-1">
                    <input 
                      type="text" 
                      className="win-input flex-1 bg-slate-50 cursor-pointer font-mono" 
                      placeholder="Haga clic para seleccionar CECO..."
                      value={formData.mortgageCeco ? `${formData.mortgageCeco} - ${cecos.find(c => c.code === formData.mortgageCeco)?.name || ''}` : ''}
                      readOnly
                      onClick={() => setShowCecosModal(true)}
                    />
                    {formData.mortgageCeco && (
                      <button 
                        type="button" 
                        className="btn-classic px-2 text-red-600 font-bold" 
                        onClick={() => setFormData({ ...formData, mortgageCeco: '' })}
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Tipo de Hipoteca:</label>
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
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Años de Fija:</label>
                      <input 
                        type="number" 
                        className="win-input w-full" 
                        value={formData.fixedYears || ''} 
                        onChange={e => setFormData({ ...formData, fixedYears: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Años Variables:</label>
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Tipo de Interés Fijo (%):</label>
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Tipo de Interés Variable (Euribor + Diferencial):</label>
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Interés de Salida / Actual para simulación (%):</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="win-input w-full" 
                      value={formData.interest || ''} 
                      onChange={e => setFormData({ ...formData, interest: e.target.value })} 
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Último Tipo de Interés Real (%):</label>
                  <input 
                    type="text" 
                    className="win-input w-full bg-slate-50 font-semibold text-blue-900" 
                    value={formData.lastInterestRate !== undefined ? `${Number(formData.lastInterestRate).toFixed(2)} %` : '0.00 %'} 
                    readOnly
                  />
                </div>
              </div>

              {/* Columna Derecha */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Capital Concedido (€):</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="win-input w-full text-right" 
                    value={formData.loanAmount || ''} 
                    onChange={e => setFormData({ ...formData, loanAmount: e.target.value })} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Capital Pendiente (€):</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="win-input w-full text-right bg-slate-50 font-semibold" 
                    value={formData.mortgagePending || ''} 
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Intereses Generados (€):</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="win-input w-full text-right bg-slate-50 font-semibold" 
                    value={formData.generatedInterests || ''} 
                    readOnly
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Inicio:</label>
                    <input 
                      type="date" 
                      className="win-input w-full" 
                      value={formData.mortgageStart || ''} 
                      onChange={e => setFormData({ ...formData, mortgageStart: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Meses Tot.:</label>
                    <input 
                      type="number" 
                      className="win-input w-full text-right" 
                      value={formData.totalMonths || ''} 
                      onChange={e => setFormData({ ...formData, totalMonths: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Restantes:</label>
                    <input 
                      type="number" 
                      className="win-input w-full text-right bg-slate-100" 
                      value={remainingMonths} 
                      readOnly
                      disabled
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Fecha Vencimiento:</label>
                  <input 
                    type="date" 
                    className="win-input w-full" 
                    value={formData.expiry || ''} 
                    onChange={e => setFormData({ ...formData, expiry: e.target.value })} 
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

            <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#f0f0f0] grid grid-cols-12 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase">
                <div className="col-span-4">Documento</div>
                <div className="col-span-4">Concepto</div>
                <div className="col-span-2">Fecha</div>
                <div className="col-span-2 text-center">Acción</div>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-2">
                {(!formData.mortgageDocs || formData.mortgageDocs.length === 0) ? (
                  <div className="text-center text-slate-400 italic py-8 text-[11px]">No hay documentos</div>
                ) : (
                  formData.mortgageDocs.map((doc) => (
                    <div key={doc.id} className="grid grid-cols-12 gap-2 items-center text-[11px] border-b border-slate-100 pb-2">
                      <div className="col-span-4 flex items-center space-x-2 truncate">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate" title={doc.name}>{doc.name}</span>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          className="win-input w-full text-[11px]"
                          value={doc.concept || ''}
                          onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                          placeholder="Ej. Escritura, Recibo..."
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="date"
                          className="win-input w-full text-[11px]"
                          value={doc.date || ''}
                          onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 flex justify-center space-x-2">
                        <button 
                          className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                          onClick={() => setPreviewDocument(doc)}
                          title="Previsualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          className="p-1 hover:bg-red-50 text-red-600 rounded"
                          onClick={() => deleteDocument(doc.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'amortizacion' && (
          <div className="h-full flex flex-col">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic mb-4">Cuadro de Amortización Teórico (Simulado)</h3>
            <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#f0f0f0] grid grid-cols-7 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase text-right">
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
                      <div key={idx} className={`grid grid-cols-7 gap-2 px-2 py-1 text-[11px] text-right ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <div className="text-center">{row.month}</div>
                        <div className="text-center">{row.date}</div>
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
              <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Cuadro de Amortización Real</h3>
              <div className="text-[10px] bg-blue-50 border border-blue-200 px-3 py-1 rounded text-blue-800 flex gap-4">
                <span>CEBE: <strong>{formData.cebe || 'No configurado'}</strong></span>
                <span>Principal: <strong>{activeMortgageAccount || 'No configurada'}</strong></span>
                <span>Intereses: <strong>{activeInterestCeco || 'No configurado'}</strong></span>
              </div>
            </div>
            
            {!formData.cebe ? (
              <div className="text-center text-red-600 bg-red-50 border border-red-200 p-6 rounded text-[11px] italic">
                ⚠️ Este activo no tiene un CEBE asociado. Asígnale un CEBE en la pestaña "Datos" para poder vincular sus movimientos contables.
              </div>
            ) : (!activeMortgageAccount || !activeInterestCeco) ? (
              <div className="text-center text-amber-700 bg-amber-50 border border-amber-200 p-6 rounded text-[11px] italic">
                ⚠️ Falta configurar la cuenta contable de principal y el CECO de intereses en la subpestaña "Datos".
              </div>
            ) : (
              <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
                <div className="bg-[#f0f0f0] grid grid-cols-7 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase text-right">
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
                        <div key={idx} className={`grid grid-cols-7 gap-2 px-2 py-1 text-[11px] text-right ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <div className="text-center">{row.month}</div>
                          <div className="text-center">{row.date}</div>
                          <div>{row.payment.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div>{row.principal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div>{row.interest.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                          <div>{row.interestRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</div>
                          <div>{row.balance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[1000px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
              <h2 className="font-bold text-[13px] tracking-wide uppercase">Selección de Cuenta Contable</h2>
              <button type="button" onClick={() => setShowAccountsModal(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <Accounts 
                isModal={true} 
                onAccountSelect={(code) => {
                  setFormData({ ...formData, mortgageAccount: code });
                  setShowAccountsModal(false);
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* CECO Selection Modal */}
      {showCecosModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[800px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
              <h2 className="font-bold text-[13px] tracking-wide uppercase">Selección de Centro de Coste (CECO)</h2>
              <button type="button" onClick={() => setShowCecosModal(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex gap-2">
              <input 
                type="text" 
                placeholder="Buscar por código o nombre..." 
                className="win-input flex-1"
                value={cecoSearch}
                onChange={e => setCecoSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-auto p-2">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase sticky top-0">
                    <th className="px-3 py-2 text-left border-b border-slate-200 w-32">Código</th>
                    <th className="px-3 py-2 text-left border-b border-slate-200">Descripción</th>
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
                className="btn-classic px-5 py-1 text-[10px] font-bold bg-blue-50 border-blue-300 hover:bg-blue-100 disabled:opacity-50"
              >
                Aceptar
              </button>
              <button type="button" onClick={() => setShowCecosModal(false)} className="btn-classic px-5 py-1 text-[10px] font-bold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

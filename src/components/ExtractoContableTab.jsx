import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, TrendingUp, TrendingDown, RefreshCw, FilePlus, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useNavigate } from 'react-router-dom';
import Window from './Window';
import { useTableFilters } from '../hooks/useTableFilters';

export default function ExtractoContableTab({ 
  formData, 
  setFormData, 
  mode, // 'rentals' | 'properties'
  cebes = [], 
  cecos = [], 
  setPreviewDocument,
  onAddEntry
}) {
  const { user, queryUserIds } = useAuth();
  const navigate = useNavigate();
  const { 
    activeTableFilters, 
    applyTableFilters, 
    applyTableSort, 
    sortConfig, 
    clearAllFilters, 
    TableHeaderWithFilter, 
    renderFilterMenu 
  } = useTableFilters();

  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState(null);
  const [accountsMap, setAccountsMap] = useState({});
  const [selectedIncomeCecos, setSelectedIncomeCecos] = useState([]);
  const [showIncomeCecoDropdown, setShowIncomeCecoDropdown] = useState(false);
  const [incomeCecoSearch, setIncomeCecoSearch] = useState('');

  const [selectedExpenseCecos, setSelectedExpenseCecos] = useState([]);
  const [showExpenseCecoDropdown, setShowExpenseCecoDropdown] = useState(false);
  const [expenseCecoSearch, setExpenseCecoSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Subscribe to accounts to display names in entry viewer
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', userIds));
    const unsubscribe = onSnapshot(qAcc, (snap) => {
      const mapping = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        mapping[doc.id] = data.name || '';
      });
      setAccountsMap(mapping);
    }, (error) => {
      console.error("Error fetching accounts in ExtractoContableTab:", error);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  const getCecoName = (cecoCode) => {
    if (!cecoCode) return '';
    const cleanCode = String(cecoCode).trim().toUpperCase().replace(/^CECO/i, '');
    const cecoObj = cecos.find(c => String(c.code).trim().toUpperCase().replace(/^CECO/i, '') === cleanCode);
    return cecoObj ? cecoObj.name : cecoCode;
  };

  const getCebeName = (cebeCode) => {
    if (!cebeCode) return '';
    const cleanCode = String(cebeCode).trim().toUpperCase().replace(/^CEBE/i, '');
    const cebeObj = cebes.find(c => String(c.code).trim().toUpperCase().replace(/^CEBE/i, '') === cleanCode);
    return cebeObj ? cebeObj.name : cebeCode;
  };

  // Retrieve current CEBE and CECO depending on mode
  const currentCebe = useMemo(() => {
    if (mode === 'rentals') {
      return formData?.incomeCebeId || '';
    } else {
      return formData?.cebe || '';
    }
  }, [formData, mode]);

  const currentCeco = useMemo(() => {
    if (mode === 'rentals') {
      return formData?.expenseCecoId || '';
    } else {
      return formData?.ceco || '';
    }
  }, [formData, mode]);

  // Subscribe to journal entries
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    setLoading(true);
    const q = query(
      collection(db, 'journal_entries'), 
      where('userId', 'in', userIds)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournalEntries(all);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching journal entries in ExtractoContableTab:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, queryUserIds]);

  // Process entries into table rows, splitting compound entries into separate rows for each group 6/7 line
  const processedEntries = useMemo(() => {
    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const currentRef = String(formData?.reference || '').trim().toUpperCase();

    const normIncomeCecos = (formData?.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));
    const normExpenseCecos = (formData?.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));

    if (mode === 'rentals') {
      if (!normValueCebe || !currentRef) return [];
    } else {
      if (!normValueCebe && normIncomeCecos.length === 0 && normExpenseCecos.length === 0) return [];
    }

    const rows = [];

    journalEntries.forEach(entry => {
      const hasLines = entry.lines && Array.isArray(entry.lines) && entry.lines.length > 0;
      const hasLineLevelAnalytics = hasLines && entry.lines.some(l => l.cebe || l.ceco || (l.accountCode && (String(l.accountCode).startsWith('6') || String(l.accountCode).startsWith('7'))));

      if (hasLineLevelAnalytics) {
        entry.lines.forEach((l, lineIdx) => {
          const accCode = String(l.accountCode || '').trim();
          const lineCebe = l.cebe || entry.cebe || '';
          const lineCeco = l.ceco || entry.ceco || '';
          const normLineCebe = String(lineCebe).trim().replace(/^(CEBE|CECO)/i, '');
          const normLineCeco = String(lineCeco).trim().replace(/^(CEBE|CECO)/i, '');

          let isMatch = false;
          let isIncomeSide = false;

          if (mode === 'rentals') {
            let matchCebe = normLineCebe.startsWith(normValueCebe);
            let docVal = String(l.document || entry.document || entry.documentName || '').trim().toUpperCase();
            let matchRef = docVal === currentRef;

            if (matchCebe && matchRef) {
              if (accCode.startsWith('7')) {
                isMatch = true;
                isIncomeSide = true;
              } else if (accCode.startsWith('6')) {
                isMatch = true;
                isIncomeSide = false;
              } else if (lineCebe || lineCeco) {
                isMatch = true;
                const debit = Number(l.debit) || 0;
                const credit = Number(l.credit) || 0;
                isIncomeSide = credit >= debit;
              }
            }
          } else {
            // Properties mode
            let lineCebeMatch = false;
            if (normValueCebe && normLineCebe.startsWith(normValueCebe)) {
              lineCebeMatch = true;
            }

            let lineIncomeCecoMatch = false;
            if (normIncomeCecos.length > 0 && normIncomeCecos.some(c => normLineCeco.startsWith(c))) {
              lineIncomeCecoMatch = true;
            }

            let lineExpenseCecoMatch = false;
            if (normExpenseCecos.length > 0 && normExpenseCecos.some(c => normLineCeco.startsWith(c))) {
              lineExpenseCecoMatch = true;
            }

            if (lineCebeMatch || lineIncomeCecoMatch || lineExpenseCecoMatch) {
              if (accCode.startsWith('7')) {
                isMatch = true;
                isIncomeSide = true;
              } else if (accCode.startsWith('6')) {
                isMatch = true;
                isIncomeSide = false;
              } else {
                if (lineCebeMatch || lineIncomeCecoMatch) {
                  isMatch = true;
                  isIncomeSide = true;
                } else if (lineExpenseCecoMatch) {
                  isMatch = true;
                  isIncomeSide = false;
                }
              }
            }
          }

          if (!isMatch) return;

          // Apply CECO filter (selectedIncomeCecos / selectedExpenseCecos)
          if (selectedIncomeCecos.length > 0 || selectedExpenseCecos.length > 0) {
            const cleanLineCeco = String(lineCeco).trim().toUpperCase();
            if (isIncomeSide && selectedIncomeCecos.length > 0) {
              const matchesInc = selectedIncomeCecos.some(sel => cleanLineCeco.startsWith(String(sel).trim().toUpperCase()));
              if (!matchesInc) return;
            }
            if (!isIncomeSide && selectedExpenseCecos.length > 0) {
              const matchesExp = selectedExpenseCecos.some(sel => cleanLineCeco.startsWith(String(sel).trim().toUpperCase()));
              if (!matchesExp) return;
            }
          }

          // Apply Date Range Filter
          if (startDate && entry.date < startDate) return;
          if (endDate && entry.date > endDate) return;

          // Calculate amount for this line
          const debit = Number(l.debit) || 0;
          const credit = Number(l.credit) || 0;
          let lineAmount = 0;

          if (isIncomeSide) {
            lineAmount = credit > 0 ? credit : (debit > 0 ? debit : (debit + credit));
          } else {
            lineAmount = debit > 0 ? debit : (credit > 0 ? credit : (debit + credit));
          }

          const signedAmount = isIncomeSide ? Math.abs(lineAmount) : -Math.abs(lineAmount);
          const amountColor = isIncomeSide ? 'text-green-700 font-bold' : 'text-red-600 font-bold';

          // Display Center (CECO or CEBE name)
          let displayCenter = '';
          if (lineCeco) {
            const cecoName = getCecoName(lineCeco);
            displayCenter = cecoName && cecoName !== lineCeco ? `${lineCeco} - ${cecoName}` : lineCeco;
          } else if (lineCebe) {
            const cebeName = getCebeName(lineCebe);
            displayCenter = cebeName && cebeName !== lineCebe ? `${lineCebe} - ${cebeName}` : lineCebe;
          }

          const displayDocUrl = l.documentUrl || entry.documentUrl;
          const displayDocName = l.documentName || entry.documentName || 'Documento';

          const lineDesc = l.concept && l.concept !== entry.description
            ? `${entry.description} (${l.concept})`
            : entry.description;

          rows.push({
            id: `${entry.id}_line_${lineIdx}`,
            rawEntryId: entry.id,
            parentEntry: entry,
            date: entry.date,
            dateFormatted: entry.date ? new Date(entry.date).toLocaleDateString('es-ES') : '',
            numberFormatted: String(entry.number || entry.id?.substring(0, 6) || ''),
            description: lineDesc,
            descriptionFormatted: lineDesc,
            cecoFormatted: displayCenter,
            displayCenter,
            amountColor,
            signedAmount,
            signedAmountFormatted: signedAmount,
            cebeEntryAmount: isIncomeSide ? Math.abs(lineAmount) : 0,
            cecoEntryAmount: !isIncomeSide ? Math.abs(lineAmount) : 0,
            displayDocUrl,
            displayDocName,
            documentFormatted: displayDocUrl ? (displayDocName || 'Documento') : 'Sin documento',
            isImpuesto: entry.isImpuesto,
            impuestoFormatted: entry.isImpuesto ? 'Sí' : 'No'
          });
        });
      } else {
        // Fallback for old entries without line analytics
        let isMatch = false;
        let isIncomeSide = false;

        if (mode === 'rentals') {
          const normRef = String(formData?.reference || '').trim().toUpperCase();
          let matchCebe = entry.cebe ? String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normValueCebe) : false;
          let docVal = String(entry.document || entry.documentName || '').trim().toUpperCase();
          let matchRef = docVal === normRef;

          if (matchCebe && matchRef) {
            isMatch = true;
            const totalAmt = entry.total || 0;
            const desc = String(entry.description || '').toLowerCase();
            const isExpense = totalAmt < 0 || desc.includes('comunidad') || desc.includes('gasto');
            isIncomeSide = !isExpense;
          }
        } else {
          let globalCebe = false;
          if (normValueCebe && entry.cebe) {
            const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (normField.startsWith(normValueCebe)) globalCebe = true;
          }
          if (normIncomeCecos.length > 0 && entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normIncomeCecos.some(c => normField.startsWith(c))) globalCebe = true;
          }
          if (globalCebe) {
            isMatch = true;
            isIncomeSide = true;
          }

          let globalCeco = false;
          if (normExpenseCecos.length > 0 && entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normExpenseCecos.some(c => normField.startsWith(c))) globalCeco = true;
          }
          if (globalCeco) {
            isMatch = true;
            isIncomeSide = false;
          }
        }

        if (!isMatch) return;

        const entryCeco = entry.ceco || entry.cebe || '';
        if (selectedIncomeCecos.length > 0 || selectedExpenseCecos.length > 0) {
          const cleanCeco = String(entryCeco).trim().toUpperCase();
          if (isIncomeSide && selectedIncomeCecos.length > 0) {
            if (!selectedIncomeCecos.some(sel => cleanCeco.startsWith(String(sel).trim().toUpperCase()))) return;
          }
          if (!isIncomeSide && selectedExpenseCecos.length > 0) {
            if (!selectedExpenseCecos.some(sel => cleanCeco.startsWith(String(sel).trim().toUpperCase()))) return;
          }
        }

        if (startDate && entry.date < startDate) return;
        if (endDate && entry.date > endDate) return;

        const totalAmt = Math.abs(entry.total || 0);
        const signedAmount = isIncomeSide ? totalAmt : -totalAmt;
        const amountColor = isIncomeSide ? 'text-green-700 font-bold' : 'text-red-600 font-bold';

        let displayCenter = '';
        if (entry.ceco) {
          const cName = getCecoName(entry.ceco);
          displayCenter = cName && cName !== entry.ceco ? `${entry.ceco} - ${cName}` : entry.ceco;
        } else if (entry.cebe) {
          const cName = getCebeName(entry.cebe);
          displayCenter = cName && cName !== entry.cebe ? `${entry.cebe} - ${cName}` : entry.cebe;
        }

        const displayDocUrl = entry.documentUrl;
        const displayDocName = entry.documentName || 'Documento';

        rows.push({
          id: entry.id,
          rawEntryId: entry.id,
          parentEntry: entry,
          date: entry.date,
          dateFormatted: entry.date ? new Date(entry.date).toLocaleDateString('es-ES') : '',
          numberFormatted: String(entry.number || entry.id?.substring(0, 6) || ''),
          description: entry.description || '',
          descriptionFormatted: entry.description || '',
          cecoFormatted: displayCenter,
          displayCenter,
          amountColor,
          signedAmount,
          signedAmountFormatted: signedAmount,
          cebeEntryAmount: isIncomeSide ? totalAmt : 0,
          cecoEntryAmount: !isIncomeSide ? totalAmt : 0,
          displayDocUrl,
          displayDocName,
          documentFormatted: displayDocUrl ? (displayDocName || 'Documento') : 'Sin documento',
          isImpuesto: entry.isImpuesto,
          impuestoFormatted: entry.isImpuesto ? 'Sí' : 'No'
        });
      }
    });

    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, currentCebe, currentCeco, mode, formData, cecos, cebes, startDate, endDate, selectedIncomeCecos, selectedExpenseCecos]);

  // Apply table column filters and sorting
  const finalDisplayEntries = useMemo(() => {
    let result = applyTableFilters(processedEntries, 'extractoContable');
    result = applyTableSort(result, 'extractoContable');
    return result;
  }, [processedEntries, activeTableFilters, sortConfig, applyTableFilters, applyTableSort]);

  // Calculate totals from displayed entries
  const totals = useMemo(() => {
    let cebeSum = 0;
    let cecoSum = 0;

    finalDisplayEntries.forEach(item => {
      if (item.cebeEntryAmount) cebeSum += item.cebeEntryAmount;
      if (item.cecoEntryAmount) cecoSum += item.cecoEntryAmount;
    });

    return {
      cebe: cebeSum,
      ceco: cecoSum,
      balance: cebeSum - cecoSum
    };
  }, [finalDisplayEntries]);

  const handleCebeChange = async (e) => {
    const val = e.target.value;
    if (mode === 'rentals') {
      setFormData(prev => ({ ...prev, incomeCebeId: val }));
      if (formData?.docId) {
        try {
          const docRef = doc(db, 'rentals', formData.docId);
          await updateDoc(docRef, { incomeCebeId: val });
        } catch (err) {
          console.error("Error al guardar CEBE en alquiler:", err);
        }
      }
    } else {
      setFormData(prev => ({ ...prev, cebe: val }));
      if (formData?.id) {
        try {
          const docRef = doc(db, 'properties', formData.id);
          await updateDoc(docRef, { cebe: val });
        } catch (err) {
          console.error("Error al guardar CEBE en propiedad:", err);
        }
      }
    }
  };

  const handleCecoChange = async (e) => {
    const val = e.target.value;
    if (mode === 'rentals') {
      setFormData(prev => ({ ...prev, expenseCecoId: val }));
      if (formData?.docId) {
        try {
          const docRef = doc(db, 'rentals', formData.docId);
          await updateDoc(docRef, { expenseCecoId: val });
        } catch (err) {
          console.error("Error al guardar CECO en alquiler:", err);
        }
      }
    } else {
      setFormData(prev => ({ ...prev, ceco: val }));
      if (formData?.id) {
        try {
          const docRef = doc(db, 'properties', formData.id);
          await updateDoc(docRef, { ceco: val });
        } catch (err) {
          console.error("Error al guardar CECO en propiedad:", err);
        }
      }
    }
  };

  const handleViewDoc = (entry) => {
    if (entry.documentUrl) {
      if (setPreviewDocument) {
        setPreviewDocument({ url: entry.documentUrl, name: entry.documentName || 'Documento' });
      } else {
        window.open(entry.documentUrl, '_blank');
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs font-sans text-slate-800">
      {/* Selector Inputs (only editable if mode === 'rentals', otherwise read-only show or select from inputs) */}
      {mode === 'rentals' ? (
        <div className="p-3 bg-slate-100 border border-slate-300 win-bevel flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1 max-w-sm flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold text-slate-700 uppercase">CEBE Asociado (Ingresos):</label>
              <select 
                className="win-input w-full cursor-pointer" 
                value={currentCebe} 
                onChange={handleCebeChange}
              >
                <option value="">-- Seleccionar CEBE --</option>
                {cebes.map(c => (
                  <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>
            {onAddEntry && (
              <button 
                type="button"
                className="px-4 py-1.5 bg-[#4a69bd] text-white text-[11px] font-bold uppercase shadow-sm hover:bg-[#3b5598] self-end h-[30px] rounded"
                onClick={onAddEntry}
              >
                + Añadir Asiento
              </button>
            )}
          </div>
          {formData?.reference && (
            <div className="text-[10px] text-slate-500 font-semibold uppercase mt-1">
              Filtro por Referencia Alquiler (en Documento): <span className="font-mono bg-white px-1.5 py-0.5 border border-slate-300 rounded font-bold text-slate-700">{formData.reference}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 bg-slate-100 border border-slate-300 win-bevel flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <div className="flex gap-4">
            <div>
              <span className="font-bold text-slate-500 mr-1">CEBE:</span>
              <span className="font-mono bg-white px-2 py-0.5 border border-slate-300 rounded font-semibold text-blue-900">
                {currentCebe || 'Ninguno'}
              </span>
            </div>
          </div>
          {!currentCebe && (
            <div className="text-[11px] text-amber-700 font-bold">
              ⚠️ Configure un CEBE en la pestaña "Datos" para ver el extracto.
            </div>
          )}
        </div>
      )}

      {/* Date Range Filters & CECO Multiselect */}
      <div className="p-2.5 bg-slate-100 border border-[#808080] win-bevel flex flex-wrap items-center gap-4 text-xs select-none relative">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-700 uppercase">Desde:</span>
          <input 
            type="date" 
            className="win-input px-2 py-0.5 max-w-[140px] font-mono text-[11px] border border-gray-400 bg-white" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-700 uppercase">Hasta:</span>
          <input 
            type="date" 
            className="win-input px-2 py-0.5 max-w-[140px] font-mono text-[11px] border border-gray-400 bg-white" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
          />
        </div>
           {/* CECOs Ingresos Multiselect Filter */}
        <div className="flex items-center gap-2 relative">
          <span className="text-[10px] font-bold text-slate-700 uppercase">CECOs Ingresos:</span>
          <div className="relative min-w-[180px]">
            <button
              type="button"
              onClick={() => setShowIncomeCecoDropdown(!showIncomeCecoDropdown)}
              className="win-input w-full flex justify-between items-center bg-white px-2 py-1 font-mono text-[11px] border border-gray-400 cursor-pointer rounded min-h-[24px]"
            >
              <span className="truncate max-w-[150px] text-slate-750 font-sans">
                {selectedIncomeCecos.length === 0 ? 'Todos los Ingresos' : selectedIncomeCecos.join(', ')}
              </span>
              <span className="text-[9px] text-slate-500">▼</span>
            </button>
            
            {showIncomeCecoDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowIncomeCecoDropdown(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#808080] shadow-lg max-h-[200px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel z-50">
                  <input
                    type="text"
                    placeholder="Buscar CECO..."
                    className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case"
                    value={incomeCecoSearch}
                    onChange={e => setIncomeCecoSearch(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                  <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                    <input
                      type="checkbox"
                      checked={selectedIncomeCecos.length === 0}
                      onChange={() => setSelectedIncomeCecos([])}
                      className="mt-0.5"
                    />
                    <span>Todos</span>
                  </label>
                  {cecos
                    .filter(c => 
                      c.code.toLowerCase().includes(incomeCecoSearch.toLowerCase()) || 
                      c.name.toLowerCase().includes(incomeCecoSearch.toLowerCase())
                    )
                    .map(c => (
                      <label key={c.id} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                        <input
                          type="checkbox"
                          checked={selectedIncomeCecos.includes(c.code)}
                          onChange={() => {
                            setSelectedIncomeCecos(prev =>
                              prev.includes(c.code)
                                ? prev.filter(code => code !== c.code)
                                : [...prev, c.code]
                            );
                          }}
                          className="mt-0.5"
                        />
                        <span className="text-slate-700">{c.code} - {c.name}</span>
                      </label>
                    ))}
                  {cecos.filter(c => 
                    c.code.toLowerCase().includes(incomeCecoSearch.toLowerCase()) || 
                    c.name.toLowerCase().includes(incomeCecoSearch.toLowerCase())
                  ).length === 0 && (
                    <span className="text-[10px] text-slate-400 italic px-1">No se encontraron CECOs</span>
                  )}
                </div>
              </>
            )}
          </div>
          {selectedIncomeCecos.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIncomeCecos([])}
              className="px-2 py-0.5 border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 shadow-sm text-[10px] font-bold uppercase cursor-pointer rounded"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* CECOs Gastos Multiselect Filter */}
        <div className="flex items-center gap-2 relative">
          <span className="text-[10px] font-bold text-slate-700 uppercase">CECOs Gastos:</span>
          <div className="relative min-w-[180px]">
            <button
              type="button"
              onClick={() => setShowExpenseCecoDropdown(!showExpenseCecoDropdown)}
              className="win-input w-full flex justify-between items-center bg-white px-2 py-1 font-mono text-[11px] border border-gray-400 cursor-pointer rounded min-h-[24px]"
            >
              <span className="truncate max-w-[150px] text-slate-750 font-sans">
                {selectedExpenseCecos.length === 0 ? 'Todos los Gastos' : selectedExpenseCecos.join(', ')}
              </span>
              <span className="text-[9px] text-slate-555">▼</span>
            </button>
            
            {showExpenseCecoDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExpenseCecoDropdown(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#808080] shadow-lg max-h-[200px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel z-50">
                  <input
                    type="text"
                    placeholder="Buscar CECO..."
                    className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case"
                    value={expenseCecoSearch}
                    onChange={e => setExpenseCecoSearch(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                  <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                    <input
                      type="checkbox"
                      checked={selectedExpenseCecos.length === 0}
                      onChange={() => setSelectedExpenseCecos([])}
                      className="mt-0.5"
                    />
                    <span>Todos</span>
                  </label>
                  {cecos
                    .filter(c => 
                      c.code.toLowerCase().includes(expenseCecoSearch.toLowerCase()) || 
                      c.name.toLowerCase().includes(expenseCecoSearch.toLowerCase())
                    )
                    .map(c => (
                      <label key={c.id} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                        <input
                          type="checkbox"
                          checked={selectedExpenseCecos.includes(c.code)}
                          onChange={() => {
                            setSelectedExpenseCecos(prev =>
                              prev.includes(c.code)
                                ? prev.filter(code => code !== c.code)
                                : [...prev, c.code]
                            );
                          }}
                          className="mt-0.5"
                        />
                        <span className="text-slate-700">{c.code} - {c.name}</span>
                      </label>
                    ))}
                  {cecos.filter(c => 
                    c.code.toLowerCase().includes(expenseCecoSearch.toLowerCase()) || 
                    c.name.toLowerCase().includes(expenseCecoSearch.toLowerCase())
                  ).length === 0 && (
                    <span className="text-[10px] text-slate-400 italic px-1">No se encontraron CECOs</span>
                  )}
                </div>
              </>
            )}
          </div>
          {selectedExpenseCecos.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedExpenseCecos([])}
              className="px-2 py-0.5 border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 shadow-sm text-[10px] font-bold uppercase cursor-pointer rounded"
            >
              Limpiar
            </button>
          )}
        </div>

        {(startDate || endDate || selectedIncomeCecos.length > 0 || selectedExpenseCecos.length > 0 || Object.keys(activeTableFilters['extractoContable'] || {}).length > 0) && (
          <button 
            type="button" 
            onClick={() => { setStartDate(''); setEndDate(''); setSelectedIncomeCecos([]); setSelectedExpenseCecos([]); clearAllFilters(); }} 
            className="px-3 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[10px] font-bold uppercase cursor-pointer rounded ml-auto"
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Metrics Row (Written text, no cards) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 bg-slate-50 border border-slate-200 rounded shadow-sm text-xs font-bold text-slate-700 select-none">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Ingresos:</span>
          <span className="font-mono text-green-700 text-sm">
            {totals.cebe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="w-px h-4 bg-slate-300" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Gastos:</span>
          <span className="font-mono text-red-600 text-sm">
            -{totals.ceco.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="w-px h-4 bg-slate-300" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Total:</span>
          <span className={`font-mono text-sm ${totals.balance >= 0 ? 'text-blue-900' : 'text-amber-800'}`}>
            {totals.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="flex-1 flex flex-col min-h-[250px]">
        <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[10px] border border-[#808080] border-b-0 shrink-0 flex justify-between items-center">
          <span>Registros del Extracto</span>
          {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-600 animate-spin" />}
        </div>
        
        <div className="flex-1 overflow-auto border border-[#808080] win-bevel bg-white">
          <table className="win-table min-w-full">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#e7e1d3]">
                <TableHeaderWithFilter label="Fecha" columnKey="dateFormatted" data={processedEntries} tableId="extractoContable" className="w-24 text-[10px]" />
                <TableHeaderWithFilter label="Asiento Nº" columnKey="numberFormatted" data={processedEntries} tableId="extractoContable" className="w-20 text-[10px]" />
                <TableHeaderWithFilter label="Concepto" columnKey="descriptionFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px]" />
                <TableHeaderWithFilter label="CECO" columnKey="cecoFormatted" data={processedEntries} tableId="extractoContable" className="w-48 text-[10px]" />
                <TableHeaderWithFilter label="Importe" columnKey="signedAmount" data={processedEntries} tableId="extractoContable" className="w-32 text-right text-[10px]" />
                <TableHeaderWithFilter label="Documento" columnKey="documentFormatted" data={processedEntries} tableId="extractoContable" className="w-36 text-[10px]" />
                <TableHeaderWithFilter label="Imp." columnKey="impuestoFormatted" data={processedEntries} tableId="extractoContable" className="w-12 text-center text-[10px]" />
              </tr>
            </thead>
            <tbody>
              {finalDisplayEntries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-slate-500 italic py-16">
                    {loading ? 'Cargando asientos...' : 'No hay asientos contables registrados para este CEBE/CECO.'}
                  </td>
                </tr>
              ) : (
                finalDisplayEntries.map((entry) => {
                  const displayCenter = entry.displayCenter;
                  const amountColor = entry.amountColor;
                  const signedAmount = entry.signedAmount;
                  const displayDocUrl = entry.displayDocUrl;
                  const displayDocName = entry.displayDocName;
                  const targetEntryId = entry.rawEntryId || entry.id;

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="font-mono text-[10px]">{entry.dateFormatted}</td>
                      <td className="font-mono text-[10px] text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedJournalEntry(entry.parentEntry || entry)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-bold flex items-center justify-center gap-1 mx-auto"
                          title="Ver asiento contable completo"
                        >
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>{entry.numberFormatted}</span>
                        </button>
                      </td>
                      <td className="truncate max-w-[200px]" title={entry.description}>{entry.description}</td>
                      <td className="font-mono text-[10px] font-semibold">{displayCenter}</td>
                      <td className={`text-right font-mono font-semibold ${amountColor}`}>
                        {signedAmount > 0 ? '+' : ''}{signedAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="p-1">
                        {displayDocUrl ? (
                          <div className="flex items-center justify-between gap-1 w-full">
                            <button
                              type="button"
                              onClick={() => {
                                if (setPreviewDocument) {
                                  setPreviewDocument({ url: displayDocUrl, name: displayDocName });
                                } else {
                                  window.open(displayDocUrl, '_blank');
                                }
                              }}
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium text-[10px] truncate max-w-[100px]"
                              title={displayDocName}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                              <span className="truncate">{displayDocName}</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (window.confirm('¿Deseas eliminar este documento?')) {
                                  try {
                                    const entryRef = doc(db, 'journal_entries', targetEntryId);
                                    await updateDoc(entryRef, {
                                      documentUrl: null,
                                      documentName: null
                                    });
                                  } catch (err) {
                                    console.error(err);
                                    alert("Error al eliminar documento: " + err.message);
                                  }
                                }
                              }}
                              className="text-red-500 hover:text-red-700 p-0.5 shrink-0"
                              title="Eliminar documento"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 cursor-pointer font-medium select-none">
                            <FilePlus className="w-3.5 h-3.5 text-slate-400" />
                            <span>Adjuntar</span>
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !user) return;
                                try {
                                  const url = await uploadFileToStorage(file, user.uid, 'journal_entries', `${targetEntryId}_extracto`, 'docs');
                                  const entryRef = doc(db, 'journal_entries', targetEntryId);
                                  await updateDoc(entryRef, {
                                    documentUrl: url,
                                    documentName: file.name
                                  });
                                } catch (err) {
                                  console.error(err);
                                  alert('Error al subir: ' + err.message);
                                }
                              }}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            />
                          </label>
                        )}
                      </td>
                      <td className="p-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="w-3.5 h-3.5 cursor-pointer accent-blue-600" 
                          checked={!!entry.isImpuesto} 
                          onChange={async () => {
                            try {
                              const entryRef = doc(db, 'journal_entries', targetEntryId);
                              await updateDoc(entryRef, {
                                isImpuesto: !entry.isImpuesto
                              });
                            } catch (err) {
                              console.error(err);
                              alert("Error al actualizar impuesto: " + err.message);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {renderFilterMenu()}

      {/* Retro Windows-style popup modal to view and access full seat details */}
      {selectedJournalEntry && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-[100]">
          <Window 
            title={`Asiento Contable Nº ${selectedJournalEntry.number || selectedJournalEntry.id?.substring(0, 6)}`}
            width="800px"
            initialPos={{ x: 100, y: 50 }}
            onClose={() => setSelectedJournalEntry(null)}
          >
            <div className="bg-[#d4d0c8] p-3 flex flex-col gap-3 min-h-[350px] text-xs">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-2.5 bg-white border border-[#808080] win-bevel text-[11px]">
                <div>
                  <span className="font-bold text-slate-500 mr-2 uppercase text-[9px]">Fecha:</span>
                  <span className="font-mono font-bold text-slate-800">{new Date(selectedJournalEntry.date).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 mr-2 uppercase text-[9px]">Nº Asiento:</span>
                  <span className="font-mono font-bold text-blue-900">{selectedJournalEntry.number || selectedJournalEntry.id?.substring(0, 6)}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-bold text-slate-500 mr-2 uppercase text-[9px]">Concepto General:</span>
                  <span className="text-slate-800 font-semibold">{selectedJournalEntry.description}</span>
                </div>
                {selectedJournalEntry.document && (
                  <div className="col-span-2">
                    <span className="font-bold text-slate-500 mr-2 uppercase text-[9px]">Referencia Doc:</span>
                    <span className="font-mono bg-slate-100 px-1 border border-slate-350 font-bold text-slate-700">{selectedJournalEntry.document}</span>
                  </div>
                )}
              </div>

              {/* Lines Table */}
              <div className="flex-1 overflow-auto border border-[#808080] win-bevel bg-white max-h-[250px]">
                <table className="win-table min-w-full">
                  <thead>
                    <tr className="sticky top-0 z-10 bg-[#e7e1d3]">
                      <th className="w-24 text-[10px]">Cuenta</th>
                      <th className="text-[10px]">Nombre Cuenta</th>
                      <th className="text-[10px]">Apunte / Concepto</th>
                      <th className="w-16 text-[10px]">CEBE</th>
                      <th className="w-16 text-[10px]">CECO</th>
                      <th className="w-24 text-right text-[10px]">Debe</th>
                      <th className="w-24 text-right text-[10px]">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedJournalEntry.lines || []).map((line, idx) => {
                      const accountCode = line.accountCode || '';
                      const accountName = accountsMap[line.accountId] || '';
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="font-mono text-[10px] font-bold text-blue-900">{accountCode}</td>
                          <td className="truncate max-w-[120px] text-[10px] text-slate-600" title={accountName}>{accountName || 'Cargando cuenta...'}</td>
                          <td className="truncate max-w-[160px] text-[10px]" title={line.concept}>{line.concept || selectedJournalEntry.description}</td>
                          <td className="font-mono text-[9px] text-slate-500">{line.cebe || ''}</td>
                          <td className="font-mono text-[9px] text-slate-500">{line.ceco || ''}</td>
                          <td className="font-mono text-[10px] text-right text-slate-700 font-bold">
                            {line.debit && Number(line.debit) > 0 ? Number(line.debit).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : ''}
                          </td>
                          <td className="font-mono text-[10px] text-right text-slate-700 font-bold">
                            {line.credit && Number(line.credit) > 0 ? Number(line.credit).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end gap-2 shrink-0 pt-2 border-t border-[#808080]">
                <button 
                  type="button"
                  className="px-5 py-1 border border-gray-400 bg-[#4a69bd] text-white hover:bg-[#3b5598] shadow-sm text-[11px] font-bold uppercase cursor-pointer rounded" 
                  onClick={() => {
                    navigate('/journal-entry', { state: { editEntry: selectedJournalEntry } });
                    setSelectedJournalEntry(null);
                  }}
                >
                  Editar Asiento
                </button>
                <button 
                  type="button"
                  className="px-5 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer rounded" 
                  onClick={() => setSelectedJournalEntry(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

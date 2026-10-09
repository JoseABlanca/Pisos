import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, TrendingUp, TrendingDown, RefreshCw, FilePlus, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useNavigate } from 'react-router-dom';
import Window from './Window';
import { useTableFilters } from '../hooks/useTableFilters';
import { useDragResize } from '../hooks/useDragResize';
import AnalyticalCenters from '../pages/AnalyticalCenters';
import JournalEntry from '../pages/JournalEntry';

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
  // CEBE selector (estilo Analítica > Desviación)
  const [cebeInput, setCebeInput] = useState('');
  const [showCebeDropdown, setShowCebeDropdown] = useState(false);
  const [showCebeSel, setShowCebeSel] = useState(false);
  const centerDR = useDragResize({ initW: 700, initH: 500, minW: 400, minH: 300, storageKey: 'extracto_centerModal' });

  const [selectedNegativeCecos, setSelectedNegativeCecos] = useState(formData?.negativeCecos || []);
  const [showNegativeCecoDropdown, setShowNegativeCecoDropdown] = useState(false);
  const [negativeCecoSearch, setNegativeCecoSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sync selectedNegativeCecos with formData prop
  useEffect(() => {
    if (formData?.negativeCecos && Array.isArray(formData.negativeCecos)) {
      setSelectedNegativeCecos(formData.negativeCecos);
    }
  }, [formData?.negativeCecos]);

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

  // Keep the CEBE text input in sync with the saved CEBE
  useEffect(() => {
    setCebeInput(currentCebe || '');
  }, [currentCebe]);

  const matchingCebes = useMemo(() => {
    const q = String(cebeInput || '').trim().toLowerCase();
    if (!q || q === String(currentCebe || '').toLowerCase()) return cebes;
    return cebes.filter(c =>
      String(c.code || '').toLowerCase().includes(q) ||
      String(c.name || '').toLowerCase().includes(q)
    );
  }, [cebes, cebeInput, currentCebe]);

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
    const normNegativeCecos = (selectedNegativeCecos || []).map(c => String(c).trim().toUpperCase().replace(/^(CEBE|CECO)/i, ''));

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
          const hasExplicitLineAnalytic = Boolean(l.cebe || l.ceco);
          const isGroup6 = accCode.startsWith('6');
          const isGroup7 = accCode.startsWith('7');

          // Skip bank/treasury/balance sheet lines (e.g. 572, 400, 430) unless they explicitly specify line-level analytics
          if (!isGroup6 && !isGroup7 && !hasExplicitLineAnalytic) {
            return;
          }

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
              if (isGroup7) {
                isMatch = true;
                isIncomeSide = true;
              } else if (isGroup6) {
                isMatch = true;
                isIncomeSide = false;
              } else if (hasExplicitLineAnalytic) {
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

            // KEY FIX: if the line/entry carries a CEBE that belongs to a DIFFERENT property → skip.
            // This prevents generic CECOs shared across properties from bleeding other property data in.
            if (normLineCebe && normValueCebe && !lineCebeMatch) return;

            let lineIncomeCecoMatch = false;
            if (normIncomeCecos.length > 0 && normIncomeCecos.some(c => normLineCeco.startsWith(c))) {
              lineIncomeCecoMatch = true;
            }

            let lineExpenseCecoMatch = false;
            if (normExpenseCecos.length > 0 && normExpenseCecos.some(c => normLineCeco.startsWith(c))) {
              lineExpenseCecoMatch = true;
            }

            if (lineCebeMatch || lineIncomeCecoMatch || lineExpenseCecoMatch) {
              if (isGroup7) {
                isMatch = true;
                isIncomeSide = true;
              } else if (isGroup6) {
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

          // Apply Date Range Filter
          if (startDate && entry.date < startDate) return;
          if (endDate && entry.date > endDate) return;

          // CECO Negativo (Sign inversion) check
          const isNegativeCeco = normNegativeCecos.length > 0 && normLineCeco && normNegativeCecos.some(nc => normLineCeco.startsWith(nc));
          const effectiveIsIncomeSide = isNegativeCeco ? !isIncomeSide : isIncomeSide;

          // Calculate amount for this line
          const debit = Number(l.debit) || 0;
          const credit = Number(l.credit) || 0;
          let lineAmount = 0;

          if (isIncomeSide) {
            lineAmount = credit > 0 ? credit : (debit > 0 ? debit : (debit + credit));
          } else {
            lineAmount = debit > 0 ? debit : (credit > 0 ? credit : (debit + credit));
          }

          const signedAmount = effectiveIsIncomeSide ? Math.abs(lineAmount) : -Math.abs(lineAmount);
          const amountColor = effectiveIsIncomeSide ? 'text-black font-bold' : 'text-black font-bold';

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
            cebeEntryAmount: effectiveIsIncomeSide ? Math.abs(lineAmount) : 0,
            cecoEntryAmount: !effectiveIsIncomeSide ? Math.abs(lineAmount) : 0,
            displayDocUrl,
            displayDocName,
            documentFormatted: displayDocUrl ? (displayDocName || 'Documento') : 'Sin documento',
            isImpuesto: entry.isImpuesto,
            impuestoFormatted: entry.isImpuesto ? 'Sí' : 'No',
            isNegativeCeco
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
          // KEY FIX: if the entry has a CEBE that belongs to a DIFFERENT property → skip entirely.
          if (entry.cebe && normValueCebe) {
            const entryNormCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (!entryNormCebe.startsWith(normValueCebe)) {
              return; // Entry belongs to another property
            }
          }

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

        if (startDate && entry.date < startDate) return;
        if (endDate && entry.date > endDate) return;

        const entryCecoClean = String(entryCeco).trim().toUpperCase().replace(/^(CEBE|CECO)/i, '');
        const isNegativeCeco = normNegativeCecos.length > 0 && entryCecoClean && normNegativeCecos.some(nc => entryCecoClean.startsWith(nc));
        const effectiveIsIncomeSide = isNegativeCeco ? !isIncomeSide : isIncomeSide;

        const totalAmt = Math.abs(entry.total || 0);
        const signedAmount = effectiveIsIncomeSide ? totalAmt : -totalAmt;
        const amountColor = effectiveIsIncomeSide ? 'text-black font-bold' : 'text-black font-bold';

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
          cebeEntryAmount: effectiveIsIncomeSide ? totalAmt : 0,
          cecoEntryAmount: !effectiveIsIncomeSide ? totalAmt : 0,
          displayDocUrl,
          displayDocName,
          documentFormatted: displayDocUrl ? (displayDocName || 'Documento') : 'Sin documento',
          isImpuesto: entry.isImpuesto,
          impuestoFormatted: entry.isImpuesto ? 'Sí' : 'No',
          isNegativeCeco
        });
      }
    });

    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, currentCebe, currentCeco, mode, formData, cecos, cebes, startDate, endDate, selectedNegativeCecos]);

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

  // Commit a CEBE value (only exact codes or empty are persisted)
  const commitCebe = (val) => {
    const v = String(val || '').trim();
    if (v === String(currentCebe || '')) return;
    if (v && !cebes.some(c => String(c.code) === v)) {
      // Not a valid CEBE code → revert the input
      setCebeInput(currentCebe || '');
      return;
    }
    handleCebeChange({ target: { value: v } });
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

  const handleNegativeCecosChange = async (newCecos) => {
    setSelectedNegativeCecos(newCecos);
    if (setFormData) {
      setFormData(prev => ({ ...prev, negativeCecos: newCecos }));
    }
    if (mode === 'rentals' && formData?.docId) {
      try {
        const docRef = doc(db, 'rentals', formData.docId);
        await updateDoc(docRef, { negativeCecos: newCecos });
      } catch (err) {
        console.error("Error al guardar CECO Negativo en alquiler:", err);
      }
    } else if (mode === 'properties' && formData?.id) {
      try {
        const docRef = doc(db, 'properties', formData.id);
        await updateDoc(docRef, { negativeCecos: newCecos });
      } catch (err) {
        console.error("Error al guardar CECO Negativo en propiedad:", err);
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
    <div className="flex flex-col h-full overflow-hidden min-h-0 gap-4 text-xs font-sans text-slate-800">
      {/* Filtros: CEBE + Desde/Hasta (estilo Analítica > Desviación) */}
      <div className="flex flex-col gap-2 select-none">
        <div className="flex items-center gap-4 flex-wrap">
          {/* CEBE */}
          <div className="flex items-center gap-1">
            <span
              onClick={() => setShowCebeSel(true)}
              className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[50px] text-center shrink-0 font-bold cursor-pointer hover:bg-[#dcdcdc] select-none active:bg-[#c8c8c8]"
              title="Abrir selector de CEBE (F3)"
            >CEBE:</span>
            <div className="relative">
              <input
                type="text"
                value={cebeInput}
                onChange={e => { setCebeInput(e.target.value); setShowCebeDropdown(true); }}
                onFocus={() => setShowCebeDropdown(true)}
                onBlur={() => { setShowCebeDropdown(false); commitCebe(cebeInput); }}
                onKeyDown={e => {
                  if (e.key === 'F3') { e.preventDefault(); setShowCebeSel(true); }
                  else if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  else if (e.key === 'Escape') { setCebeInput(currentCebe || ''); e.currentTarget.blur(); }
                }}
                className="w-[160px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-mono"
                placeholder="Seleccionar"
              />
              {showCebeDropdown && (
                <div className="absolute left-0 mt-1 bg-white border border-[#999] shadow-lg z-[4000] w-[260px] max-h-[200px] overflow-y-auto rounded-sm text-[11px]">
                  {matchingCebes.length === 0 ? (
                    <div className="p-2 text-gray-400 italic">No hay resultados</div>
                  ) : (
                    matchingCebes.slice(0, 100).map(c => (
                      <div
                        key={c.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setCebeInput(c.code);
                          commitCebe(c.code);
                          setShowCebeDropdown(false);
                        }}
                        className={`p-1 px-2 hover:bg-[#cce5ff] cursor-pointer truncate font-mono text-left ${c.code === currentCebe ? 'bg-[#e8f1fb] font-bold' : ''}`}
                        title={`${c.code} - ${c.name}`}
                      >
                        {c.code} - {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShowCebeSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6" title="Selector de CEBE"><FileText size={13} /></button>
            {currentCebe && (
              <button type="button" onClick={() => { setCebeInput(''); commitCebe(''); }} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold" title="Quitar CEBE">X</button>
            )}
          </div>

          {/* Desde */}
          <div className="flex items-center gap-1">
            <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold">Desde:</span>
            <input
              type="date"
              className="border border-[#999] px-2 py-[2px] text-[11px] bg-white outline-none font-mono"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          {/* Hasta */}
          <div className="flex items-center gap-1">
            <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold">Hasta:</span>
            <input
              type="date"
              className="border border-[#999] px-2 py-[2px] text-[11px] bg-white outline-none font-mono"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {(startDate || endDate || selectedNegativeCecos.length > 0 || Object.keys(activeTableFilters['extractoContable'] || {}).length > 0) && (
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate(''); handleNegativeCecosChange([]); clearAllFilters(); }}
                className="px-3 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[10px] font-bold uppercase cursor-pointer rounded"
              >
                Limpiar Filtros
              </button>
            )}
            {mode === 'rentals' && onAddEntry && (
              <button
                type="button"
                className="px-4 py-1 bg-[#4a69bd] text-white text-[11px] font-bold uppercase shadow-sm hover:bg-[#3b5598] rounded"
                onClick={onAddEntry}
              >
                + Añadir Asiento
              </button>
            )}
          </div>
        </div>

        {mode === 'rentals' && formData?.reference && (
          <div className="text-[10px] text-slate-500 font-semibold uppercase">
            Filtro por Referencia Alquiler (en Documento): <span className="font-mono bg-white px-1.5 py-0.5 border border-slate-300 rounded font-bold text-slate-700">{formData.reference}</span>
          </div>
        )}
        {!currentCebe && (
          <div className="text-[11px] text-[#555] font-bold">
            Selecciona un CEBE para ver el extracto.
          </div>
        )}
      </div>

      {/* CECO (invertir signo) — dedicated row, always visible */}
      <div className="flex flex-wrap items-center gap-3 text-xs select-none relative">
        <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] font-bold" title="Selecciona los CECOs cuyo signo quieres invertir (ej. Amortizaciones para verlas como ingreso o como gasto)">
          CECO (invertir signo):
        </span>
        <div className="relative min-w-[220px]">
          <button
            type="button"
            onClick={() => setShowNegativeCecoDropdown(!showNegativeCecoDropdown)}
            className="w-full flex justify-between items-center bg-white px-2 py-[3px] font-mono text-[11px] border border-[#999] cursor-pointer min-h-[24px] hover:border-[#666]"
          >
            <span className="truncate max-w-[200px] font-sans text-slate-800">
              {selectedNegativeCecos.length === 0 ? 'Ninguno seleccionado' : selectedNegativeCecos.join(', ')}
            </span>
            <span className="text-[9px] text-slate-500 ml-2">▼</span>
          </button>

          {showNegativeCecoDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNegativeCecoDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 bg-white border border-[#999] shadow-lg max-h-[220px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded-sm z-50 min-w-[260px]">
                <input
                  type="text"
                  placeholder="Buscar CECO..."
                  className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans"
                  value={negativeCecoSearch}
                  onChange={e => setNegativeCecoSearch(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-black border-b border-slate-100 pb-1">
                  <input
                    type="checkbox"
                    checked={selectedNegativeCecos.length === 0}
                    onChange={() => handleNegativeCecosChange([])}
                    className="mt-0.5"
                  />
                  <span>Ninguno</span>
                </label>
                {cecos
                  .filter(c =>
                    c.code.toLowerCase().includes(negativeCecoSearch.toLowerCase()) ||
                    c.name.toLowerCase().includes(negativeCecoSearch.toLowerCase())
                  )
                  .map(c => (
                    <label key={c.id} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                      <input
                        type="checkbox"
                        checked={selectedNegativeCecos.includes(c.code)}
                        onChange={() => {
                          const next = selectedNegativeCecos.includes(c.code)
                            ? selectedNegativeCecos.filter(code => code !== c.code)
                            : [...selectedNegativeCecos, c.code];
                          handleNegativeCecosChange(next);
                        }}
                        className="mt-0.5"
                      />
                      <span className="text-slate-700">{c.code} - {c.name}</span>
                    </label>
                  ))}
                {cecos.filter(c =>
                  c.code.toLowerCase().includes(negativeCecoSearch.toLowerCase()) ||
                  c.name.toLowerCase().includes(negativeCecoSearch.toLowerCase())
                ).length === 0 && (
                  <span className="text-[10px] text-slate-400 italic px-1">No se encontraron CECOs</span>
                )}
              </div>
            </>
          )}
        </div>
        {selectedNegativeCecos.length > 0 && (
          <>
            <span className="text-[10px] text-slate-600 font-semibold">
              {selectedNegativeCecos.length} CECO{selectedNegativeCecos.length > 1 ? 's' : ''} con signo invertido
            </span>
            <button
              type="button"
              onClick={() => handleNegativeCecosChange([])}
              className="px-2 py-0.5 border border-gray-400 bg-gray-100 text-black hover:bg-gray-200 shadow-sm text-[10px] font-bold uppercase cursor-pointer rounded"
            >
              Quitar
            </button>
          </>
        )}
      </div>

      {/* Metrics Row (Written text, no cards) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 bg-[#f0f0f0] border border-gray-300 rounded shadow-sm text-xs font-bold text-gray-700 select-none shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Ingresos:</span>
          <span className="font-mono text-black text-sm">
            {totals.cebe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Gastos:</span>
          <span className="font-mono text-black text-sm">
            -{totals.ceco.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 uppercase text-[9px]">Total:</span>
          <span className={`font-mono text-sm ${totals.balance >= 0 ? 'text-black' : 'text-amber-800'}`}>
            {totals.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="flex-1 flex flex-col min-h-0 mb-2">
        <div className="flex justify-between items-center mb-2 shrink-0">
          <h3 className="text-[12px] font-bold text-gray-800 italic uppercase">Registros del Extracto</h3>
          {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-600 animate-spin" />}
        </div>
        
        <div className="flex-1 overflow-auto bg-white border border-gray-300 rounded-sm">
          <table className="modern-table min-w-full border-0 relative">
            <thead className="sticky -top-px z-20 shadow-[0_-1px_0_0_#f0f0f0] bg-[#f0f0f0]">
              <tr className="bg-[#f0f0f0]">
                <TableHeaderWithFilter label="Fecha" columnKey="dateFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="Asiento Nº" columnKey="numberFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="Concepto" columnKey="descriptionFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="CECO" columnKey="cecoFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="Importe" columnKey="signedAmount" data={processedEntries} tableId="extractoContable" className="text-right text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="Documento" columnKey="documentFormatted" data={processedEntries} tableId="extractoContable" className="text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
                <TableHeaderWithFilter label="Imp." columnKey="impuestoFormatted" data={processedEntries} tableId="extractoContable" className="text-center text-[10px] bg-[#f0f0f0] z-20 !border-b-0" />
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
                          className="text-black hover:text-black font-bold flex items-center justify-center mx-auto cursor-pointer"
                          title="Ver y editar asiento contable completo"
                        >
                          <span className="underline decoration-black">{entry.numberFormatted}</span>
                        </button>
                      </td>
                      <td className="truncate max-w-[200px]" title={entry.description}>{entry.description}</td>
                      <td className="font-mono text-[10px] font-semibold">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{displayCenter}</span>
                          {entry.isNegativeCeco && (
                            <span className="px-1 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded border border-amber-300" title="CECO Negativo (Signo invertido)">
                              CECO -
                            </span>
                          )}
                        </div>
                      </td>
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
                              className="text-black hover:text-black hover:underline flex items-center gap-1 font-medium text-[10px] truncate max-w-[100px]"
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
                              className="text-black hover:text-black p-0.5 shrink-0"
                              title="Eliminar documento"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-black cursor-pointer font-medium select-none">
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

      {/* Editor Modal de Asiento */}
      {selectedJournalEntry && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-[100]">
          <Window 
            title={`Editar Asiento Contable Nº ${selectedJournalEntry.number || selectedJournalEntry.id?.substring(0, 6)}`}
            width="1150px"
            height="750px"
            initialPos={{ x: 50, y: 50 }}
            onClose={() => setSelectedJournalEntry(null)}
          >
            <div className="bg-white flex flex-col w-full h-full relative overflow-hidden">
              <JournalEntry 
                isModal={true} 
                initialEntry={selectedJournalEntry} 
                onClose={() => setSelectedJournalEntry(null)} 
              />
            </div>
          </Window>
        </div>
      )}

      {/* Selector de CEBE (igual que en Analítica > Desviación) */}
      {showCebeSel && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto shadow-2xl relative" style={{ width: centerDR.size.w, height: centerDR.size.h, left: centerDR.pos.x, top: centerDR.pos.y, position: 'absolute' }}>
            <div onMouseDown={e => centerDR.onDragDown(e)} className="h-[30px] bg-[#4472c4] flex items-center justify-between px-3 cursor-move shrink-0">
              <span className="text-white text-[12px] font-bold">Selección de CEBE</span>
              <button type="button" onClick={() => setShowCebeSel(false)} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="bg-white" style={{ height: 'calc(100% - 30px)' }}>
              <AnalyticalCenters type="cebe" isModal={true} onSelect={(val) => { setCebeInput(val || ''); if ((val || '') !== (currentCebe || '')) handleCebeChange({ target: { value: val || '' } }); setShowCebeSel(false); }} />
            </div>

            {/* Resize Handles */}
            <div onMouseDown={e => centerDR.onResizeDown(e, 'e')} className="absolute top-0 right-0 w-2 h-full cursor-e-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 's')} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" />
          </div>
        </div>
      )}
    </div>
  );
}

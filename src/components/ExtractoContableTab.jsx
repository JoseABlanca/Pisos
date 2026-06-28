import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, TrendingUp, TrendingDown, RefreshCw, FilePlus, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useNavigate } from 'react-router-dom';
import Window from './Window';

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
  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState(null);
  const [accountsMap, setAccountsMap] = useState({});

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

  // Filter entries that match current CEBE or CECO (hierarchical matching)
  const filteredEntries = useMemo(() => {
    if (mode === 'rentals') {
      if (!currentCebe) return [];
      const normValueCebe = String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '');
      const currentRef = String(formData?.reference || '').trim().toUpperCase();
      if (!currentRef) return [];

      return journalEntries.filter(entry => {
        let matchCebe = false;
        let matchRef = false;

        // Check line levels
        if (entry.lines) {
          entry.lines.forEach(l => {
            let lineMatchCebe = false;
            let lineMatchRef = false;
            
            if (l.cebe) {
              const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
            }
            if (l.document) {
              if (String(l.document).trim().toUpperCase() === currentRef) lineMatchRef = true;
            }

            if (lineMatchCebe && lineMatchRef) {
              matchCebe = true;
              matchRef = true;
            }
          });
        }

        // Fallback check on global header for old entries
        if (!matchCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCebe)) matchCebe = true;
        }
        if (!matchRef && (entry.document || entry.documentName)) {
          const docVal = String(entry.document || entry.documentName || '').trim().toUpperCase();
          if (docVal === currentRef) matchRef = true;
        }

        return matchCebe && matchRef;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // Default properties mode (as before)
    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normIncomeCecos = (formData?.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));
    const normExpenseCecos = (formData?.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));

    if (!normValueCebe && normIncomeCecos.length === 0 && normExpenseCecos.length === 0) return [];

    return journalEntries.filter(entry => {
      let matchCebe = false;
      let matchCeco = false;

      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

      if (entry.lines) {
        entry.lines.forEach(l => {
          // Income check: must match CEBE AND (if any selected) Income CECOs
          let lineCebeMatch = false;
          if (normValueCebe && l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (normField.startsWith(normValueCebe)) lineCebeMatch = true;
          } else if (!l.cebe && normValueCebe) {
            const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
            if (entryCebe.startsWith(normValueCebe)) lineCebeMatch = true;
          }

          let lineCecoMatch = false;
          if (normIncomeCecos.length > 0) {
            if (l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normIncomeCecos.some(c => normField.startsWith(c))) lineCecoMatch = true;
            } else if (!l.ceco) {
              const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
              if (normIncomeCecos.some(c => entryCeco.startsWith(c))) lineCecoMatch = true;
            }
          } else {
            lineCecoMatch = true;
          }

          if (lineCebeMatch && lineCecoMatch) {
            matchCebe = true;
          }

          // Expense check: must match CEBE (if present) AND Expense CECOs
          let lineExpenseCebeMatch = true;
          if (l.cebe && normValueCebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            lineExpenseCebeMatch = normField.startsWith(normValueCebe);
          } else if (!l.cebe && entry.cebe && normValueCebe) {
            const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            lineExpenseCebeMatch = entryCebe.startsWith(normValueCebe);
          }

          let lineExpenseCecoMatch = false;
          if (normExpenseCecos.length > 0) {
            if (l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normExpenseCecos.some(c => normField.startsWith(c))) lineExpenseCecoMatch = true;
            } else if (!l.ceco) {
              const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
              if (normExpenseCecos.some(c => entryCeco.startsWith(c))) lineExpenseCecoMatch = true;
            }
          } else {
            lineExpenseCecoMatch = true;
          }

          if (lineExpenseCebeMatch && lineExpenseCecoMatch) {
            matchCeco = true;
          }
        });
      }

      if (!hasLineLevelAnalytics) {
        // Global Income
        let globalCebe = false;
        if (normValueCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCebe)) globalCebe = true;
        }
        
        let globalIncomeCeco = false;
        if (normIncomeCecos.length > 0) {
          if (entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normIncomeCecos.some(c => normField.startsWith(c))) globalIncomeCeco = true;
          }
        } else {
          globalIncomeCeco = true;
        }

        if (globalCebe && globalIncomeCeco) matchCebe = true;

        // Global Expense
        let globalExpenseCebe = true;
        if (entry.cebe && normValueCebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          globalExpenseCebe = normField.startsWith(normValueCebe);
        }

        let globalExpenseCeco = false;
        if (normExpenseCecos.length > 0) {
          if (entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normExpenseCecos.some(c => normField.startsWith(c))) globalExpenseCeco = true;
          }
        } else {
          globalExpenseCeco = true;
        }

        if (globalExpenseCebe && globalExpenseCeco) matchCeco = true;
      }

      return matchCebe || matchCeco;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, currentCebe, formData?.taxIncomeCecos, formData?.taxExpenseCecos, formData?.reference, mode]);

  // Calculate totals
  const totals = useMemo(() => {
    let cebeSum = 0;
    let cecoSum = 0;

    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';

    filteredEntries.forEach(entry => {
      let cebeEntryAmount = 0;
      let cecoEntryAmount = 0;
      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

      if (entry.lines) {
        entry.lines.forEach(l => {
          const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
          const accCode = String(l.accountCode || '');

          if (mode === 'rentals') {
            if (accCode.startsWith('7')) {
              cebeEntryAmount += lineAmt;
            } else if (accCode.startsWith('6')) {
              cecoEntryAmount += lineAmt;
            }
          } else {
            // Properties mode
            let lineMatchCebe = false;
            let lineMatchCeco = false;
            
            // Match CEBE or Income CECOs
            if (normValueCebe && l.cebe) {
              const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
            }
            const normIncomeCecos = (formData?.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));
            if (normIncomeCecos.length > 0 && l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normIncomeCecos.some(c => normField.startsWith(c))) lineMatchCebe = true;
            }

            // Match Expense CECOs
            const normExpenseCecos = (formData?.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));
            if (normExpenseCecos.length > 0 && l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normExpenseCecos.some(c => normField.startsWith(c))) lineMatchCeco = true;
            }

            if (lineMatchCebe) {
              cebeEntryAmount += lineAmt;
            }
            if (lineMatchCeco) {
              cecoEntryAmount += lineAmt;
            }
          }
        });
      }

      if (!hasLineLevelAnalytics) {
        if (mode === 'rentals') {
          const totalAmt = entry.total || 0;
          if (totalAmt < 0 || String(entry.description || '').toLowerCase().includes('comunidad') || String(entry.description || '').toLowerCase().includes('gasto')) {
            cecoEntryAmount = Math.abs(totalAmt);
          } else {
            cebeEntryAmount = totalAmt;
          }
        } else {
          // Properties mode
          let globalCebe = false;
          const normIncomeCecos = (formData?.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));
          const normExpenseCecos = (formData?.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, ''));

          if (normValueCebe && entry.cebe) {
            const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (normField.startsWith(normValueCebe)) globalCebe = true;
          }
          if (normIncomeCecos.length > 0 && entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normIncomeCecos.some(c => normField.startsWith(c))) globalCebe = true;
          }
          if (globalCebe) {
            cebeEntryAmount = entry.total || 0;
          }

          let globalCeco = false;
          if (normExpenseCecos.length > 0 && entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normExpenseCecos.some(c => normField.startsWith(c))) globalCeco = true;
          }
          if (globalCeco) {
            cecoEntryAmount = entry.total || 0;
          }
        }
      }

      cebeSum += cebeEntryAmount;
      cecoSum += cecoEntryAmount;
    });

    return {
      cebe: cebeSum,
      ceco: cecoSum,
      balance: cebeSum - cecoSum
    };
  }, [filteredEntries, currentCebe, currentCeco, formData?.taxIncomeCecos, formData?.taxExpenseCecos, mode]);

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
                <th className="w-24 text-[10px]">Fecha</th>
                <th className="w-20 text-[10px]">Asiento Nº</th>
                <th className="text-[10px]">Concepto</th>
                <th className="w-48 text-[10px]">{mode === 'rentals' ? 'CECO' : 'Centro'}</th>
                <th className="w-32 text-right text-[10px]">Importe</th>
                <th className="w-36 text-[10px]">Documento</th>
                <th className="w-12 text-center text-[10px]">Imp.</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-slate-500 italic py-16">
                    {loading ? 'Cargando asientos...' : 'No hay asientos contables registrados para este CEBE/CECO.'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  // Determine if matches cebe, ceco, or both at line levels
                  let displayCenter = '';
                  let amountColor = 'text-slate-700';
                  
                  const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
                  const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';

                  let cebeEntryAmount = 0;
                  let cecoEntryAmount = 0;
                  let matchedLineCebes = new Set();
                  let matchedLineCecos = new Set();
                  let matchedLineDocUrl = null;
                  let matchedLineDocName = null;

                  if (entry.lines) {
                    entry.lines.forEach(l => {
                      const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
                      const accCode = String(l.accountCode || '');

                      if (mode === 'rentals') {
                        if (accCode.startsWith('7')) {
                          cebeEntryAmount += lineAmt;
                          if (l.cebe) matchedLineCebes.add(l.cebe);
                          if (l.ceco) matchedLineCecos.add(l.ceco);
                        } else if (accCode.startsWith('6')) {
                          cecoEntryAmount += lineAmt;
                          if (l.ceco) matchedLineCecos.add(l.ceco);
                        }
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
                      } else {
                        // Properties mode
                        let lineMatchCebe = false;
                        let lineMatchCeco = false;
                        if (normValueCebe && l.cebe) {
                          const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                          if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
                        }
                        if (normValueCeco && l.ceco) {
                          const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                          if (normField.startsWith(normValueCeco)) lineMatchCeco = true;
                        }

                        if (lineMatchCebe) {
                          if (accCode.startsWith('7')) {
                            cebeEntryAmount += lineAmt;
                          } else if (accCode.startsWith('6')) {
                            cecoEntryAmount += lineAmt;
                          } else {
                            cebeEntryAmount += lineAmt;
                          }
                          matchedLineCebes.add(l.cebe);
                        }
                        if (lineMatchCeco) {
                          if (accCode.startsWith('6')) {
                            cecoEntryAmount += lineAmt;
                          } else if (accCode.startsWith('7')) {
                            cebeEntryAmount += lineAmt;
                          } else {
                            cecoEntryAmount += lineAmt;
                          }
                          matchedLineCecos.add(l.ceco);
                        }
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
                      }
                    });
                  }

                  const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

                  // Fallbacks for old entries
                  if (!hasLineLevelAnalytics) {
                    if (mode === 'rentals') {
                      if (entry.cebe) matchedLineCebes.add(entry.cebe);
                      if (entry.ceco) matchedLineCecos.add(entry.ceco);
                      const totalAmt = entry.total || 0;
                      if (totalAmt < 0 || String(entry.description || '').toLowerCase().includes('comunidad') || String(entry.description || '').toLowerCase().includes('gasto')) {
                        cecoEntryAmount = Math.abs(totalAmt);
                      } else {
                        cebeEntryAmount = totalAmt;
                      }
                    } else {
                      if (matchedLineCebes.size === 0 && normValueCebe && entry.cebe) {
                        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                        if (normField.startsWith(normValueCebe)) {
                          cebeEntryAmount = entry.total || 0;
                          matchedLineCebes.add(entry.cebe);
                        }
                      }
                      if (matchedLineCecos.size === 0 && normValueCeco && entry.ceco) {
                        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                        if (normField.startsWith(normValueCeco)) {
                          cecoEntryAmount = entry.total || 0;
                          matchedLineCecos.add(entry.ceco);
                        }
                      }
                    }
                  }

                   const isCebe = cebeEntryAmount > 0;
                  const isCeco = cecoEntryAmount > 0;
                  let signedAmount = 0;

                  if (mode === 'rentals') {
                    // In rentals mode, always prioritize displaying the CECO(s) in the CECO column
                    if (matchedLineCecos.size > 0) {
                      const cecosList = Array.from(matchedLineCecos).map(code => {
                        const name = getCecoName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      displayCenter = cecosList.join(', ');
                    } else if (matchedLineCebes.size > 0) {
                      const cebesList = Array.from(matchedLineCebes).map(code => {
                        const name = getCebeName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      displayCenter = cebesList.join(', ');
                    } else {
                      displayCenter = '';
                    }

                    if (isCebe && !isCeco) {
                      amountColor = 'text-green-700 font-bold';
                      signedAmount = cebeEntryAmount;
                    } else if (!isCebe && isCeco) {
                      amountColor = 'text-red-600 font-bold';
                      signedAmount = -cecoEntryAmount;
                    } else {
                      amountColor = 'text-slate-700';
                      signedAmount = cebeEntryAmount - cecoEntryAmount;
                    }
                  } else {
                    // Properties mode (original formatting)
                    if (isCebe && !isCeco) {
                      const cebesList = Array.from(matchedLineCebes).map(code => {
                        const name = getCebeName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      displayCenter = `CEBE: ${cebesList.join(', ')}`;
                      amountColor = 'text-green-700 font-bold';
                      signedAmount = cebeEntryAmount;
                    } else if (!isCebe && isCeco) {
                      const cecosList = Array.from(matchedLineCecos).map(code => {
                        const name = getCecoName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      displayCenter = `CECO: ${cecosList.join(', ')}`;
                      amountColor = 'text-red-600 font-bold';
                      signedAmount = -cecoEntryAmount;
                    } else if (isCebe && isCeco) {
                      const cebesList = Array.from(matchedLineCebes).map(code => {
                        const name = getCebeName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      const cecosList = Array.from(matchedLineCecos).map(code => {
                        const name = getCecoName(code);
                        return name && name !== code ? `${code} - ${name}` : code;
                      });
                      displayCenter = `AMBOS (${cebesList.join(', ')} / ${cecosList.join(', ')})`;
                      amountColor = 'text-slate-700';
                      signedAmount = cebeEntryAmount - cecoEntryAmount;
                    }
                  }

                  const displayDocUrl = matchedLineDocUrl || entry.documentUrl;
                  const displayDocName = matchedLineDocName || entry.documentName || 'Documento';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="font-mono text-[10px]">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="font-mono text-[10px] text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedJournalEntry(entry)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-bold flex items-center justify-center gap-1 mx-auto"
                          title="Ver asiento contable completo"
                        >
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>{entry.number || entry.id?.substring(0, 6)}</span>
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
                                    const entryRef = doc(db, 'journal_entries', entry.id);
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
                                  const url = await uploadFileToStorage(file, user.uid, 'journal_entries', `${entry.id}_extracto`, 'docs');
                                  const entryRef = doc(db, 'journal_entries', entry.id);
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
                              const entryRef = doc(db, 'journal_entries', entry.id);
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

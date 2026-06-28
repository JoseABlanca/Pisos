import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

export default function ExtractoContableTab({ 
  formData, 
  setFormData, 
  mode, // 'rentals' | 'properties'
  cebes = [], 
  cecos = [], 
  setPreviewDocument 
}) {
  const { user, queryUserIds } = useAuth();
  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!currentCebe && !currentCeco) return [];

    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';

    return journalEntries.filter(entry => {
      let matchCebe = false;
      let matchCeco = false;

      // Check global levels first (for backward compatibility)
      if (normValueCebe && entry.cebe) {
        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
        if (normField.startsWith(normValueCebe)) matchCebe = true;
      }
      if (normValueCeco && entry.ceco) {
        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
        if (normField.startsWith(normValueCeco)) matchCeco = true;
      }

      // Check line levels next
      if (entry.lines) {
        entry.lines.forEach(l => {
          if (normValueCebe && l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (normField.startsWith(normValueCebe)) matchCebe = true;
          }
          if (normValueCeco && l.ceco) {
            const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normField.startsWith(normValueCeco)) matchCeco = true;
          }
        });
      }

      return matchCebe || matchCeco;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, currentCebe, currentCeco]);

  // Calculate totals
  const totals = useMemo(() => {
    let cebeSum = 0;
    let cecoSum = 0;

    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';

    filteredEntries.forEach(entry => {
      let cebeEntryAmount = 0;
      let cecoEntryAmount = 0;
      let hasLineMatchCebe = false;
      let hasLineMatchCeco = false;

      // Check line level matches
      if (entry.lines) {
        entry.lines.forEach(l => {
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
            cebeEntryAmount += (Number(l.debit) || 0) + (Number(l.credit) || 0);
            hasLineMatchCebe = true;
          }
          if (lineMatchCeco) {
            cecoEntryAmount += (Number(l.debit) || 0) + (Number(l.credit) || 0);
            hasLineMatchCeco = true;
          }
        });
      }

      // If no lines matched but global matched (fallback for old data)
      if (!hasLineMatchCebe && normValueCebe && entry.cebe) {
        const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
        if (normField.startsWith(normValueCebe)) {
          cebeEntryAmount = entry.total || 0;
        }
      }
      if (!hasLineMatchCeco && normValueCeco && entry.ceco) {
        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
        if (normField.startsWith(normValueCeco)) {
          cecoEntryAmount = entry.total || 0;
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
  }, [filteredEntries, currentCebe, currentCeco]);

  const handleCebeChange = (e) => {
    const val = e.target.value;
    if (mode === 'rentals') {
      setFormData(prev => ({ ...prev, incomeCebeId: val }));
    } else {
      setFormData(prev => ({ ...prev, cebe: val }));
    }
  };

  const handleCecoChange = (e) => {
    const val = e.target.value;
    if (mode === 'rentals') {
      setFormData(prev => ({ ...prev, expenseCecoId: val }));
    } else {
      setFormData(prev => ({ ...prev, ceco: val }));
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-100 border border-slate-300 win-bevel">
          <div className="flex flex-col gap-1">
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
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">CECO Asociado (Gastos):</label>
            <select 
              className="win-input w-full cursor-pointer" 
              value={currentCeco} 
              onChange={handleCecoChange}
            >
              <option value="">-- Seleccionar CECO --</option>
              {cecos.map(c => (
                <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
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
            <div>
              <span className="font-bold text-slate-500 mr-1">CECO:</span>
              <span className="font-mono bg-white px-2 py-0.5 border border-slate-300 rounded font-semibold text-amber-900">
                {currentCeco || 'Ninguno'}
              </span>
            </div>
          </div>
          {!currentCebe && !currentCeco && (
            <div className="text-[11px] text-amber-700 font-bold">
              ⚠️ Configure un CEBE o CECO en la pestaña "Datos" para ver el extracto.
            </div>
          )}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[9px] font-bold text-slate-600 uppercase mb-1">Total CEBE (Ingresos)</div>
            <div className="font-mono text-[15px] font-bold text-green-700">
              {totals.cebe.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </div>
          </div>
          <TrendingUp className="w-8 h-8 text-green-600/30 shrink-0" />
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[9px] font-bold text-slate-600 uppercase mb-1">Total CECO (Gastos)</div>
            <div className="font-mono text-[15px] font-bold text-red-600">
              -{totals.ceco.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </div>
          </div>
          <TrendingDown className="w-8 h-8 text-red-600/30 shrink-0" />
        </div>

        <div className={`p-3 border rounded shadow-sm flex items-center justify-between ${totals.balance >= 0 ? 'bg-blue-50/50 border-blue-200' : 'bg-amber-50/50 border-amber-200'}`}>
          <div>
            <div className={`text-[9px] font-bold uppercase mb-1 ${totals.balance >= 0 ? 'text-blue-700' : 'text-amber-800'}`}>
              Balance Neto (CEBE - CECO)
            </div>
            <div className={`font-mono text-[15px] font-bold ${totals.balance >= 0 ? 'text-blue-950' : 'text-amber-950'}`}>
              {totals.balance.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </div>
          </div>
          <div className="font-bold text-[18px] opacity-20 font-mono shrink-0">
            {totals.balance >= 0 ? '+' : '-'}
          </div>
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
                <th className="w-24 text-[10px]">Centro</th>
                <th className="w-32 text-right text-[10px]">Importe</th>
                <th className="w-36 text-[10px]">Documento</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-slate-500 italic py-16">
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
                        cebeEntryAmount += (Number(l.debit) || 0) + (Number(l.credit) || 0);
                        matchedLineCebes.add(l.cebe);
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
                      }
                      if (lineMatchCeco) {
                        cecoEntryAmount += (Number(l.debit) || 0) + (Number(l.credit) || 0);
                        matchedLineCecos.add(l.ceco);
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
                      }
                    });
                  }

                  // Fallbacks for old entries
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

                  const isCebe = cebeEntryAmount > 0;
                  const isCeco = cecoEntryAmount > 0;
                  let signedAmount = 0;

                  if (isCebe && !isCeco) {
                    displayCenter = `CEBE: ${Array.from(matchedLineCebes).join(', ')}`;
                    amountColor = 'text-green-700 font-bold';
                    signedAmount = cebeEntryAmount;
                  } else if (!isCebe && isCeco) {
                    displayCenter = `CECO: ${Array.from(matchedLineCecos).join(', ')}`;
                    amountColor = 'text-red-600 font-bold';
                    signedAmount = -cecoEntryAmount;
                  } else if (isCebe && isCeco) {
                    displayCenter = `AMBOS (${Array.from(matchedLineCebes).join(', ')} / ${Array.from(matchedLineCecos).join(', ')})`;
                    amountColor = 'text-slate-700';
                    signedAmount = cebeEntryAmount - cecoEntryAmount;
                  }

                  const displayDocUrl = matchedLineDocUrl || entry.documentUrl;
                  const displayDocName = matchedLineDocName || entry.documentName || 'Documento';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="font-mono text-[10px]">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="font-mono text-[10px] text-center">{entry.number || entry.id?.substring(0, 6)}</td>
                      <td className="truncate max-w-[200px]" title={entry.description}>{entry.description}</td>
                      <td className="font-mono text-[10px] font-semibold">{displayCenter}</td>
                      <td className={`text-right font-mono font-semibold ${amountColor}`}>
                        {signedAmount > 0 ? '+' : ''}{signedAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </td>
                      <td className="p-1">
                        {displayDocUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (setPreviewDocument) {
                                setPreviewDocument({ url: displayDocUrl, name: displayDocName });
                              } else {
                                window.open(displayDocUrl, '_blank');
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium text-[10px] truncate max-w-[130px]"
                            title={displayDocName}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                            <span className="truncate">{displayDocName}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">Sin documento</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

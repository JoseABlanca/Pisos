import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, TrendingUp, TrendingDown, RefreshCw, FilePlus, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

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
    if (!currentCebe && !currentCeco) return [];
    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';

    return journalEntries.filter(entry => {
      let matchCebe = false;
      let matchCeco = false;

      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

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

      if (!hasLineLevelAnalytics) {
        if (normValueCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCebe)) matchCebe = true;
        }
        if (normValueCeco && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCeco)) matchCeco = true;
        }
      }

      return matchCebe || matchCeco;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, currentCebe, currentCeco, formData?.reference, mode]);

  // Calculate totals
  const totals = useMemo(() => {
    let cebeSum = 0;
    let cecoSum = 0;

    const normValueCebe = currentCebe ? String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = currentCeco ? String(currentCeco).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const currentRef = String(formData?.reference || '').trim().toUpperCase();

    filteredEntries.forEach(entry => {
      let cebeEntryAmount = 0;
      let cecoEntryAmount = 0;
      let hasLineMatchCebe = false;
      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

      if (mode === 'rentals') {
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
              cebeEntryAmount += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              hasLineMatchCebe = true;
            }
          });
        }

        if (!hasLineLevelAnalytics && !hasLineMatchCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCebe)) {
            const docVal = String(entry.document || entry.documentName || '').trim().toUpperCase();
            if (docVal === currentRef) {
              cebeEntryAmount = entry.total || 0;
            }
          }
        }
        cebeSum += cebeEntryAmount;
      } else {
        // Properties mode
        let hasLineMatchCeco = false;
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

        if (!hasLineLevelAnalytics && !hasLineMatchCebe && normValueCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCebe)) {
            cebeEntryAmount = entry.total || 0;
          }
        }
        if (!hasLineLevelAnalytics && !hasLineMatchCeco && normValueCeco && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
          if (normField.startsWith(normValueCeco)) {
            cecoEntryAmount = entry.total || 0;
          }
        }

        cebeSum += cebeEntryAmount;
        cecoSum += cecoEntryAmount;
      }
    });

    return {
      cebe: cebeSum,
      ceco: cecoSum,
      balance: cebeSum - cecoSum
    };
  }, [filteredEntries, currentCebe, currentCeco, formData?.reference, mode]);

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
                <th className="w-24 text-[10px]">Centro</th>
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

                      const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
                      const accCode = String(l.accountCode || '');

                      if (lineMatchCebe) {
                        if (accCode.startsWith('7')) {
                          cebeEntryAmount += lineAmt;
                        } else if (accCode.startsWith('6')) {
                          cecoEntryAmount += lineAmt;
                        } else {
                          cebeEntryAmount += lineAmt;
                        }
                        matchedLineCebes.add(l.cebe);
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
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
                        if (l.documentUrl && !matchedLineDocUrl) {
                          matchedLineDocUrl = l.documentUrl;
                          matchedLineDocName = l.documentName;
                        }
                      }
                    });
                  }

                  const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

                  // Fallbacks for old entries
                  if (!hasLineLevelAnalytics && matchedLineCebes.size === 0 && normValueCebe && entry.cebe) {
                    const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                    if (normField.startsWith(normValueCebe)) {
                      cebeEntryAmount = entry.total || 0;
                      matchedLineCebes.add(entry.cebe);
                    }
                  }
                  if (!hasLineLevelAnalytics && matchedLineCecos.size === 0 && normValueCeco && entry.ceco) {
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
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { deleteJournalEntry } from '../services/accounting';
import { Upload, Trash2, Eye, FileText, X, Edit, ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function ExtractoPnLTab({ formData, user, queryUserIds, setPreviewDocument }) {
  const [activeSubTab, setActiveSubTab] = useState('ingresos'); // ingresos, gastos, total

  const cecoCode = formData.ceco || '';
  const cebeCode = formData.cebe || '';

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Sub-tabs header */}
      <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0">
        <button
          onClick={() => setActiveSubTab('ingresos')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'ingresos' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          Ingresos
        </button>
        <button
          onClick={() => setActiveSubTab('gastos')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'gastos' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          Gastos
        </button>
        <button
          onClick={() => setActiveSubTab('total')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'total' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          Total
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeSubTab === 'ingresos' && (
          <div className="space-y-4">
            <h4 className="text-[12px] font-bold text-slate-800 uppercase italic">Extracto de Ingresos</h4>
            {!cebeCode ? (
              <p className="text-[11px] text-gray-500 italic">No hay ningún CEBE asociado a esta propiedad. Configúralo en la pestaña Datos.</p>
            ) : (
              <PnLJournalViewer 
                type="cebe"
                cecoCode={cecoCode}
                cebeCode={cebeCode}
                userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                setPreviewDocument={setPreviewDocument}
              />
            )}
          </div>
        )}

        {activeSubTab === 'gastos' && (
          <div className="space-y-4">
            <h4 className="text-[12px] font-bold text-slate-800 uppercase italic">Extracto de Gastos</h4>
            {!cecoCode ? (
              <p className="text-[11px] text-gray-500 italic">No hay ningún CECO asociado a esta propiedad. Configúralo en la pestaña Datos.</p>
            ) : (
              <PnLJournalViewer 
                type="ceco"
                cecoCode={cecoCode}
                cebeCode={cebeCode}
                userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                setPreviewDocument={setPreviewDocument}
              />
            )}
          </div>
        )}

        {activeSubTab === 'total' && (
          <div className="space-y-4">
            <h4 className="text-[12px] font-bold text-slate-800 uppercase italic">Extracto P&L Consolidado (Ingresos y Gastos)</h4>
            {!cebeCode && !cecoCode ? (
              <p className="text-[11px] text-gray-500 italic">No hay ningún CECO o CEBE asociado a esta propiedad. Configúralos en la pestaña Datos.</p>
            ) : (
              <PnLJournalViewer 
                type="both"
                cecoCode={cecoCode}
                cebeCode={cebeCode}
                userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                setPreviewDocument={setPreviewDocument}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PnLJournalViewer({ type, cecoCode, cebeCode, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (type === 'cebe' && !cebeCode) { setEntries([]); return; }
    if (type === 'ceco' && !cecoCode) { setEntries([]); return; }
    if (type === 'both' && !cecoCode && !cebeCode) { setEntries([]); return; }
    if (!userIds || userIds.length === 0) { setEntries([]); return; }

    const q = query(
      collection(db, 'journal_entries'), 
      where('userId', 'in', userIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all.filter(entry => {
        let matchesCeco = false;
        if (cecoCode && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
          const normValue = String(cecoCode).trim().replace(/^(CEBE|CECO)/i, '');
          matchesCeco = normField.startsWith(normValue);
        }

        let matchesCebe = false;
        if (cebeCode && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          const normValue = String(cebeCode).trim().replace(/^(CEBE|CECO)/i, '');
          matchesCebe = normField.startsWith(normValue);
        }

        if (type === 'cebe') return matchesCebe;
        if (type === 'ceco') return matchesCeco;
        return matchesCeco || matchesCebe;
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [type, cecoCode, cebeCode, userIds]);

  const handleUploadDoc = async (e, entry) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(entry.id);
    try {
      const url = await uploadFileToStorage(file, entry.userId || userIds[0], 'journal_entries', entry.id, 'docs');
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: url,
        documentName: file.name
      });
    } catch (err) {
      console.error(err);
      alert('Error al subir el documento: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteDoc = async (entry) => {
    if (!window.confirm('¿Eliminar el documento asociado a este asiento?')) return;
    try {
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: null,
        documentName: null
      });
    } catch (err) {
      alert('Error al eliminar el documento: ' + err.message);
    }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`¿Eliminar el asiento "${entry.description || 'sin descripción'}"? Esta acción revertirá los saldos contables.`)) return;
    try {
      await deleteJournalEntry(entry.userId || userIds[0], entry.id, entry.lines || []);
    } catch (err) {
      alert('Error al eliminar el asiento: ' + err.message);
    }
  };

  const handleEdit = (entry) => {
    navigate('/journal-entry', { state: { editEntry: entry } });
  };

  const total = entries.reduce((sum, entry) => {
    let matchesCeco = false;
    if (cecoCode && entry.ceco) {
      const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
      const normValue = String(cecoCode).trim().replace(/^(CEBE|CECO)/i, '');
      matchesCeco = normField.startsWith(normValue);
    }
    let matchesCebe = false;
    if (cebeCode && entry.cebe) {
      const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
      const normValue = String(cebeCode).trim().replace(/^(CEBE|CECO)/i, '');
      matchesCebe = normField.startsWith(normValue);
    }

    const value = Number(entry.total) || 0;
    if (type === 'cebe') return sum + value;
    if (type === 'ceco') return sum + value;
    
    if (matchesCebe && matchesCeco) {
      return sum + value;
    } else if (matchesCebe) {
      return sum + value;
    } else if (matchesCeco) {
      return sum - value; 
    }
    return sum + value;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center bg-[#f0f0f0] p-2 border border-slate-300">
        <span className="text-[11px] font-bold text-slate-700">Total Registros: {entries.length}</span>
        <span className="text-[12px] font-bold text-slate-800">
          {type === 'both' ? 'Resultado Neto (PnL):' : type === 'cebe' ? 'Total Ingresos:' : 'Total Gastos:'}{' '}
          <span className={type === 'both' && total < 0 ? 'text-red-600' : type === 'both' && total > 0 ? 'text-green-600' : 'text-slate-800'}>
            {total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} &euro;
          </span>
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados para esta consulta.</p>
      ) : (
        <div className="overflow-x-auto border border-[#808080]">
          <table className="w-full win-table bg-white">
            <thead className="bg-[#e7e1d3] sticky top-0">
              <tr>
                <th className="text-left p-1.5 w-24 text-[10px]">Fecha</th>
                <th className="text-left p-1.5 text-[10px]">Concepto</th>
                <th className="text-left p-1.5 w-24 text-[10px]">Imputación</th>
                <th className="text-left p-1.5 w-40 text-[10px]">Documento</th>
                <th className="text-right p-1.5 w-24 text-[10px]">Importe</th>
                <th className="w-16 p-1 text-center text-[10px]">Acción</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                let matchesCeco = false;
                if (cecoCode && e.ceco) {
                  const normField = String(e.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                  const normValue = String(cecoCode).trim().replace(/^(CEBE|CECO)/i, '');
                  matchesCeco = normField.startsWith(normValue);
                }
                let matchesCebe = false;
                if (cebeCode && e.cebe) {
                  const normField = String(e.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                  const normValue = String(cebeCode).trim().replace(/^(CEBE|CECO)/i, '');
                  matchesCebe = normField.startsWith(normValue);
                }

                let impDisplay = '';
                if (matchesCebe && matchesCeco) impDisplay = 'CEBE/CECO';
                else if (matchesCebe) impDisplay = `CEBE: ${e.cebe}`;
                else if (matchesCeco) impDisplay = `CECO: ${e.ceco}`;

                const isExpense = matchesCeco && !matchesCebe;

                return (
                  <tr key={e.id} className="border-b border-gray-200 hover:bg-blue-50">
                    <td className="p-1.5 whitespace-nowrap text-[10px]">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="p-1.5 truncate max-w-[200px] text-[10px]" title={e.description}>{e.description}</td>
                    <td className="p-1.5 text-[10px] text-slate-500 font-semibold">{impDisplay}</td>
                    
                    {/* Attached Document cell */}
                    <td className="p-1.5 text-[10px] border-r border-gray-200">
                      <div className="flex items-center gap-1.5">
                        {e.documentUrl ? (
                          <>
                            <button 
                              onClick={() => setPreviewDocument?.({ url: e.documentUrl, name: e.documentName || 'Documento' })} 
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium underline"
                              title="Previsualizar documento"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[120px]" title={e.documentName}>{e.documentName}</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteDoc(e)} 
                              className="text-red-500 hover:text-red-700 ml-auto p-0.5 hover:bg-red-50 rounded"
                              title="Quitar documento"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-blue-600 select-none">
                            {uploadingId === e.id ? (
                              <span className="text-[9px] text-slate-500 animate-pulse">Subiendo...</span>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 shrink-0" />
                                <span className="text-[9px]">Adjuntar doc</span>
                              </>
                            )}
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={(evt) => handleUploadDoc(evt, e)} 
                              disabled={uploadingId === e.id}
                            />
                          </label>
                        )}
                      </div>
                    </td>

                    <td className={`p-1.5 text-right font-mono font-bold text-[10px] ${type === 'both' && isExpense ? 'text-red-600' : 'text-slate-700'}`}>
                      {type === 'both' && isExpense ? '-' : ''}
                      {Number(e.total).toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;
                    </td>
                    <td className="p-1.5 text-center flex justify-center items-center gap-2">
                      <button 
                        onClick={() => handleEdit(e)} 
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded p-0.5" 
                        title="Editar asiento"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(e)} 
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5" 
                        title="Eliminar asiento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

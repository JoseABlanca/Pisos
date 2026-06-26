import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { deleteJournalEntry } from '../services/accounting';
import { Upload, Trash2, Eye, FileText, Plus, Landmark, Calculator, FolderOpen, X, Edit } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function HipotecaTab({ 
  formData, 
  setFormData, 
  user, 
  queryUserIds,
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  cebes = [],
  cecos = []
}) {
  const [activeSubTab, setActiveSubTab] = useState('datos'); // datos, interes, principal, amortizacion

  const calculateAmortization = useMemo(() => {
    const P = parseFloat(formData.loanAmount) || 0;
    const n = parseInt(formData.totalMonths) || 0;
    const isVariable = formData.mortgageType === 'variable';
    const isMixed = formData.mortgageType === 'mixta';
    
    // Simplification for the simulation
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
          onClick={() => setActiveSubTab('datos')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'datos' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Landmark className="w-3 h-3" /> Datos
        </button>
        <button
          onClick={() => setActiveSubTab('interes')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'interes' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <FolderOpen className="w-3 h-3" /> Interés
        </button>
        <button
          onClick={() => setActiveSubTab('principal')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'principal' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <FolderOpen className="w-3 h-3" /> Amortización Principal
        </button>
        <button
          onClick={() => setActiveSubTab('amortizacion')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'amortizacion' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <Calculator className="w-3 h-3" /> Cuadro Amortización
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
                    className="win-input w-full text-right" 
                    value={formData.mortgagePending || ''} 
                    onChange={e => setFormData({ ...formData, mortgagePending: e.target.value })} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Intereses Generados (€):</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="win-input w-full text-right" 
                    value={formData.generatedInterests || ''} 
                    onChange={e => setFormData({ ...formData, generatedInterests: e.target.value })} 
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

        {activeSubTab === 'interes' && (
          <div className="space-y-4 max-w-md">
            <div className="bg-[#f0f0f0] p-2.5 border border-[#a0a0a0] rounded shadow-sm">
              <h4 className="text-[10px] font-bold text-slate-800 uppercase mb-2">Imputación Analítica de Intereses</h4>
              
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CECO:</label>
                  <select 
                    className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                    value={formData.interestCeco || ""} 
                    onChange={(e) => setFormData(prev => ({...prev, interestCeco: e.target.value}))}
                  >
                    <option value="">-- Seleccionar CECO --</option>
                    {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CEBE:</label>
                  <select 
                    className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                    value={formData.interestCebe || ""} 
                    onChange={(e) => setFormData(prev => ({...prev, interestCebe: e.target.value}))}
                  >
                    <option value="">-- Seleccionar CEBE --</option>
                    {cebes.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <HipotecaJournalViewer 
              cecoCode={formData.interestCeco}
              cebeCode={formData.interestCebe}
              userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
              setPreviewDocument={setPreviewDocument}
            />
          </div>
        )}

        {activeSubTab === 'principal' && (
          <div className="space-y-4 max-w-md">
            <div className="bg-[#f0f0f0] p-2.5 border border-[#a0a0a0] rounded shadow-sm">
              <h4 className="text-[10px] font-bold text-slate-800 uppercase mb-2">Imputación Analítica de Amortización Principal</h4>
              
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CECO:</label>
                  <select 
                    className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                    value={formData.principalCeco || ""} 
                    onChange={(e) => setFormData(prev => ({...prev, principalCeco: e.target.value}))}
                  >
                    <option value="">-- Seleccionar CECO --</option>
                    {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CEBE:</label>
                  <select 
                    className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                    value={formData.principalCebe || ""} 
                    onChange={(e) => setFormData(prev => ({...prev, principalCebe: e.target.value}))}
                  >
                    <option value="">-- Seleccionar CEBE --</option>
                    {cebes.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <HipotecaJournalViewer 
              cecoCode={formData.principalCeco}
              cebeCode={formData.principalCebe}
              userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
              setPreviewDocument={setPreviewDocument}
            />
          </div>
        )}

        {activeSubTab === 'amortizacion' && (
          <div className="h-full flex flex-col">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic mb-4">Cuadro de Amortización (Simulado)</h3>
            <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#f0f0f0] grid grid-cols-6 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase text-right">
                <div className="text-center">Mes</div>
                <div className="text-center">Fecha</div>
                <div>Cuota</div>
                <div>Principal</div>
                <div>Intereses</div>
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
                      <div key={idx} className={`grid grid-cols-6 gap-2 px-2 py-1 text-[11px] text-right ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <div className="text-center">{row.month}</div>
                        <div className="text-center">{row.date}</div>
                        <div>{row.payment.toFixed(2)} €</div>
                        <div>{row.principal.toFixed(2)} €</div>
                        <div>{row.interest.toFixed(2)} €</div>
                        <div>{row.balance.toFixed(2)} €</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HipotecaJournalViewer({ cecoCode, cebeCode, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!cecoCode && !cebeCode) {
      setEntries([]);
      return;
    }
    if (!userIds || userIds.length === 0) {
      setEntries([]);
      return;
    }

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

        if (cecoCode && cebeCode) {
          return matchesCeco || matchesCebe;
        } else if (cecoCode) {
          return matchesCeco;
        } else if (cebeCode) {
          return matchesCebe;
        }
        return false;
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [cecoCode, cebeCode, userIds]);

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

  if (!cecoCode && !cebeCode) return null;

  return (
    <div className="mt-4 border-t border-gray-300 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase">Extracto de Asientos Contables</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados para los códigos seleccionados.</p>
      ) : (
        <div className="overflow-x-auto border border-[#808080]">
          <table className="w-full win-table bg-white">
            <thead className="bg-[#e7e1d3] sticky top-0">
              <tr>
                <th className="text-left p-1.5 w-24 text-[10px]">Fecha</th>
                <th className="text-left p-1.5 text-[10px]">Concepto</th>
                <th className="text-left p-1.5 w-40 text-[10px]">Documento</th>
                <th className="text-right p-1.5 w-24 text-[10px]">Importe</th>
                <th className="w-16 p-1 text-center text-[10px]">Acción</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-gray-200 hover:bg-blue-50">
                  <td className="p-1.5 whitespace-nowrap text-[10px]">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="p-1.5 truncate max-w-[200px] text-[10px]" title={e.description}>{e.description}</td>
                  
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

                  <td className="p-1.5 text-right font-mono text-slate-700 font-bold text-[10px]">{Number(e.total).toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

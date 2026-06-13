import React, { useState, useMemo } from 'react';
import { Upload, Trash2, Eye, FileText, Plus, Landmark, Calculator, FolderOpen } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function HipotecaTab({ 
  formData, 
  setFormData, 
  user, 
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading
}) {
  const [activeSubTab, setActiveSubTab] = useState('datos'); // datos, docs, amortizacion

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
          onClick={() => setActiveSubTab('docs')}
          className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'docs' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
        >
          <FolderOpen className="w-3 h-3" /> Expediente Digital
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
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'docs' && (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Expediente Digital</h3>
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

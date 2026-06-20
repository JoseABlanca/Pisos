import React, { useState } from 'react';
import { Plus, Trash2, Upload, Eye, FileText, X } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function ReformasTab({ 
  formData, 
  setFormData, 
  user, 
  isUploading,
  setIsUploading,
  setPreviewDocument
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('gastos'); // 'gastos' or 'pagos'

  const reforms = formData.reforms || [];
  const selectedReform = selectedIndex !== null ? reforms[selectedIndex] : null;
  const owners = formData.owners || [];

  const handleAddReform = () => {
    const newReform = {
      id: Date.now() + Math.random().toString(36).substring(7),
      concept: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      capitalize: false,
      expenses: [],
      payments: []
    };
    setFormData(prev => ({
      ...prev,
      reforms: [...(prev.reforms || []), newReform]
    }));
    setSelectedIndex(reforms.length);
  };

  const updateReformField = (index, field, value) => {
    const newReforms = [...reforms];
    newReforms[index] = { ...newReforms[index], [field]: value };
    setFormData(prev => ({ ...prev, reforms: newReforms }));
  };

  const deleteReform = (index) => {
    if (window.confirm('¿Estás seguro de eliminar esta reforma por completo?')) {
      const newReforms = [...reforms];
      newReforms.splice(index, 1);
      setFormData(prev => ({ ...prev, reforms: newReforms }));
      if (selectedIndex === index) setSelectedIndex(null);
      else if (selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    }
  };

  // Gastos
  const handleAddExpense = () => {
    if (!selectedReform) return;
    const newExpense = {
      id: Date.now() + Math.random().toString(36).substring(7),
      date: new Date().toISOString().split('T')[0],
      concept: '',
      amount: '',
      doc: null
    };
    const newReforms = [...reforms];
    newReforms[selectedIndex].expenses = [...(newReforms[selectedIndex].expenses || []), newExpense];
    setFormData(prev => ({ ...prev, reforms: newReforms }));
  };

  const updateExpense = (expenseIndex, field, value) => {
    const newReforms = [...reforms];
    newReforms[selectedIndex].expenses[expenseIndex] = { 
      ...newReforms[selectedIndex].expenses[expenseIndex], 
      [field]: value 
    };
    setFormData(prev => ({ ...prev, reforms: newReforms }));
  };

  const deleteExpense = (expenseIndex) => {
    if (window.confirm('¿Estás seguro de eliminar este gasto?')) {
      const newReforms = [...reforms];
      newReforms[selectedIndex].expenses.splice(expenseIndex, 1);
      setFormData(prev => ({ ...prev, reforms: newReforms }));
    }
  };

  // Pagos
  const handleAddPayment = () => {
    if (!selectedReform) return;
    const newPayment = {
      id: Date.now() + Math.random().toString(36).substring(7),
      concept: '',
      amount: '',
      ownerId: '',
      doc: null
    };
    const newReforms = [...reforms];
    newReforms[selectedIndex].payments = [...(newReforms[selectedIndex].payments || []), newPayment];
    setFormData(prev => ({ ...prev, reforms: newReforms }));
  };

  const updatePayment = (paymentIndex, field, value) => {
    const newReforms = [...reforms];
    newReforms[selectedIndex].payments[paymentIndex] = { 
      ...newReforms[selectedIndex].payments[paymentIndex], 
      [field]: value 
    };
    setFormData(prev => ({ ...prev, reforms: newReforms }));
  };

  const deletePayment = (paymentIndex) => {
    if (window.confirm('¿Estás seguro de eliminar este pago?')) {
      const newReforms = [...reforms];
      newReforms[selectedIndex].payments.splice(paymentIndex, 1);
      setFormData(prev => ({ ...prev, reforms: newReforms }));
    }
  };

  // Uploads
  const handleDocUpload = async (e, type, itemIndex) => {
    const file = e.target.files[0];
    if (!file || !user || !formData.id) return;
    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, `reforms_${type}`);
      const newDoc = {
        name: file.name,
        url,
        type: file.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString()
      };
      
      const newReforms = [...reforms];
      if (type === 'expense') {
        newReforms[selectedIndex].expenses[itemIndex].doc = newDoc;
      } else {
        newReforms[selectedIndex].payments[itemIndex].doc = newDoc;
      }
      setFormData(prev => ({ ...prev, reforms: newReforms }));
      
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden gap-4 p-4">
      
      {/* TABLA PRINCIPAL DE REFORMAS */}
      <div className="flex-1 min-h-[40%] bg-white border border-[#a0a0a0] flex flex-col shadow-sm rounded-md">
        <div className="p-3 border-b border-[#a0a0a0] bg-slate-100 flex justify-between items-center rounded-t-md">
          <h3 className="text-[12px] font-bold text-[#000080] uppercase">Listado de Reformas</h3>
          <button 
            onClick={handleAddReform}
            className="btn-classic flex items-center space-x-1 px-2 py-1"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] font-bold">Añadir Reforma</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-[#e5e7eb] sticky top-0 border-b border-[#a0a0a0] z-10">
              <tr>
                <th className="p-2 font-bold uppercase w-[150px]">Fecha</th>
                <th className="p-2 font-bold uppercase min-w-[200px]">Concepto</th>
                <th className="p-2 font-bold uppercase w-[120px]">Importe Total (€)</th>
                <th className="p-2 font-bold uppercase w-[100px] text-center">Capitalizar</th>
                <th className="p-2 font-bold uppercase w-[60px] text-center">Borrar</th>
              </tr>
            </thead>
            <tbody>
              {reforms.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center p-8 text-slate-400 italic">No hay reformas registradas. Haz clic en "Añadir Reforma" para empezar.</td>
                </tr>
              ) : (
                reforms.map((reform, idx) => (
                  <tr 
                    key={reform.id} 
                    className={`border-b border-slate-200 cursor-pointer ${selectedIndex === idx ? 'bg-blue-100' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="date" 
                        className="win-input w-full text-[11px]" 
                        value={reform.date || ''}
                        onChange={e => updateReformField(idx, 'date', e.target.value)}
                        onFocus={() => setSelectedIndex(idx)}
                        onClick={() => setSelectedIndex(idx)}
                      />
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="text" 
                        className="win-input w-full text-[11px]" 
                        value={reform.concept || ''}
                        placeholder="Ej. Reforma Baño Principal"
                        onChange={e => updateReformField(idx, 'concept', e.target.value)}
                        onFocus={() => setSelectedIndex(idx)}
                        onClick={() => setSelectedIndex(idx)}
                      />
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="number" 
                        className="win-input w-full text-[11px] text-right" 
                        value={reform.amount || ''}
                        placeholder="0.00"
                        onChange={e => updateReformField(idx, 'amount', e.target.value)}
                        onFocus={() => setSelectedIndex(idx)}
                        onClick={() => setSelectedIndex(idx)}
                      />
                    </td>
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-4 w-4 text-blue-600 rounded cursor-pointer"
                        checked={reform.capitalize || false}
                        onChange={e => updateReformField(idx, 'capitalize', e.target.checked)}
                        onFocus={() => setSelectedIndex(idx)}
                        onClick={() => setSelectedIndex(idx)}
                      />
                    </td>
                    <td className="p-2 flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="p-1 hover:bg-red-100 text-red-600 rounded"
                        onClick={() => deleteReform(idx)}
                        title="Eliminar reforma"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLAS SECUNDARIAS (Sólo si hay reforma seleccionada) */}
      <div className={`flex-1 min-h-[40%] bg-white border border-[#a0a0a0] flex flex-col shadow-sm rounded-md transition-opacity duration-300 ${!selectedReform ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {/* Sub-tabs header */}
        <div className="flex border-b border-[#a0a0a0] bg-slate-100 rounded-t-md">
          <button
            className={`px-4 py-2 text-[11px] font-bold uppercase border-r border-[#a0a0a0] ${activeSubTab === 'gastos' ? 'bg-white text-[#000080] border-t-[3px] border-t-[#000080]' : 'text-slate-600 hover:bg-slate-200'}`}
            onClick={() => setActiveSubTab('gastos')}
          >
            Gastos de la Reforma
          </button>
          <button
            className={`px-4 py-2 text-[11px] font-bold uppercase border-r border-[#a0a0a0] ${activeSubTab === 'pagos' ? 'bg-white text-[#000080] border-t-[3px] border-t-[#000080]' : 'text-slate-600 hover:bg-slate-200'}`}
            onClick={() => setActiveSubTab('pagos')}
          >
            Pagos Propietarios
          </button>
        </div>

        {/* Content Gastos */}
        {activeSubTab === 'gastos' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-slate-200 bg-white flex justify-between items-center">
               <span className="text-[11px] text-slate-500 italic ml-2">Asigna los gastos y sube sus facturas correspondientes.</span>
              <button onClick={handleAddExpense} className="btn-classic flex items-center space-x-1 px-2 py-1">
                <Plus className="w-4 h-4" /> <span className="text-[10px] font-bold">Añadir Gasto</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#f0f0f0] sticky top-0 border-b border-[#808080]">
                  <tr>
                    <th className="p-2 font-bold uppercase w-[120px]">Fecha</th>
                    <th className="p-2 font-bold uppercase min-w-[200px]">Concepto</th>
                    <th className="p-2 font-bold uppercase w-[100px]">Importe (€)</th>
                    <th className="p-2 font-bold uppercase w-[180px]">Documento</th>
                    <th className="p-2 font-bold uppercase w-[60px] text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(!selectedReform?.expenses || selectedReform.expenses.length === 0) ? (
                    <tr><td colSpan="5" className="text-center p-8 text-slate-400 italic">No hay gastos asociados a esta reforma.</td></tr>
                  ) : (
                    selectedReform.expenses.map((exp, idx) => (
                      <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2">
                          <input type="date" className="win-input w-full text-[11px]" value={exp.date || ''} onChange={e => updateExpense(idx, 'date', e.target.value)} />
                        </td>
                        <td className="p-2">
                          <input type="text" className="win-input w-full text-[11px]" placeholder="Ej. Materiales" value={exp.concept || ''} onChange={e => updateExpense(idx, 'concept', e.target.value)} />
                        </td>
                        <td className="p-2">
                          <input type="number" className="win-input w-full text-[11px] text-right" placeholder="0.00" value={exp.amount || ''} onChange={e => updateExpense(idx, 'amount', e.target.value)} />
                        </td>
                        <td className="p-2">
                          {exp.doc ? (
                            <div className="flex items-center space-x-2 bg-blue-50 p-1 rounded border border-blue-100">
                              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                              <span className="truncate flex-1" title={exp.doc.name}>{exp.doc.name}</span>
                              <button onClick={() => setPreviewDocument(exp.doc)} className="text-blue-600 hover:text-blue-800 p-1" title="Previsualizar"><Eye className="w-4 h-4"/></button>
                              <button onClick={() => updateExpense(idx, 'doc', null)} className="text-red-500 hover:text-red-700 p-1" title="Quitar Documento"><X className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input type="file" id={`expense-doc-${idx}`} className="hidden" disabled={isUploading} onChange={(e) => handleDocUpload(e, 'expense', idx)} />
                              <label htmlFor={`expense-doc-${idx}`} className={`btn-classic w-full justify-center flex items-center space-x-1 px-2 py-1 cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                                <Upload className="w-3 h-3" /> <span className="text-[10px]">Subir Factura</span>
                              </label>
                            </div>
                          )}
                        </td>
                        <td className="p-2 flex justify-center">
                          <button onClick={() => deleteExpense(idx)} className="p-1 hover:bg-red-100 text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Content Pagos */}
        {activeSubTab === 'pagos' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-slate-200 bg-white flex justify-between items-center">
              <span className="text-[11px] text-slate-500 italic ml-2">Registra qué propietarios han aportado fondos para la reforma.</span>
              <button onClick={handleAddPayment} className="btn-classic flex items-center space-x-1 px-2 py-1">
                <Plus className="w-4 h-4" /> <span className="text-[10px] font-bold">Añadir Pago</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#f0f0f0] sticky top-0 border-b border-[#808080]">
                  <tr>
                    <th className="p-2 font-bold uppercase min-w-[150px]">Concepto</th>
                    <th className="p-2 font-bold uppercase w-[100px]">Importe (€)</th>
                    <th className="p-2 font-bold uppercase w-[200px]">Pago Propietario</th>
                    <th className="p-2 font-bold uppercase w-[180px]">Documento</th>
                    <th className="p-2 font-bold uppercase w-[60px] text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(!selectedReform?.payments || selectedReform.payments.length === 0) ? (
                    <tr><td colSpan="5" className="text-center p-8 text-slate-400 italic">No hay pagos asociados a esta reforma.</td></tr>
                  ) : (
                    selectedReform.payments.map((pay, idx) => (
                      <tr key={pay.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-2">
                          <input type="text" className="win-input w-full text-[11px]" placeholder="Ej. Aportación inicial" value={pay.concept || ''} onChange={e => updatePayment(idx, 'concept', e.target.value)} />
                        </td>
                        <td className="p-2">
                          <input type="number" className="win-input w-full text-[11px] text-right" placeholder="0.00" value={pay.amount || ''} onChange={e => updatePayment(idx, 'amount', e.target.value)} />
                        </td>
                        <td className="p-2">
                          <select className="win-input w-full text-[11px]" value={pay.ownerId || ''} onChange={e => updatePayment(idx, 'ownerId', e.target.value)}>
                            <option value="">-- Seleccionar Propietario --</option>
                            {owners.map(o => (
                              <option key={o.partnerId} value={o.partnerId}>{o.name} ({o.percentage}%)</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          {pay.doc ? (
                            <div className="flex items-center space-x-2 bg-blue-50 p-1 rounded border border-blue-100">
                              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                              <span className="truncate flex-1" title={pay.doc.name}>{pay.doc.name}</span>
                              <button onClick={() => setPreviewDocument(pay.doc)} className="text-blue-600 hover:text-blue-800 p-1" title="Previsualizar"><Eye className="w-4 h-4"/></button>
                              <button onClick={() => updatePayment(idx, 'doc', null)} className="text-red-500 hover:text-red-700 p-1" title="Quitar Documento"><X className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input type="file" id={`payment-doc-${idx}`} className="hidden" disabled={isUploading} onChange={(e) => handleDocUpload(e, 'payment', idx)} />
                              <label htmlFor={`payment-doc-${idx}`} className={`btn-classic w-full justify-center flex items-center space-x-1 px-2 py-1 cursor-pointer ${isUploading ? 'opacity-50' : ''}`}>
                                <Upload className="w-3 h-3" /> <span className="text-[10px]">Subir Recibo</span>
                              </label>
                            </div>
                          )}
                        </td>
                        <td className="p-2 flex justify-center">
                          <button onClick={() => deletePayment(idx)} className="p-1 hover:bg-red-100 text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

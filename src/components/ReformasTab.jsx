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
  const [activeSubTab, setActiveSubTab] = useState('gastos'); // 'gastos' or 'liquidacion'

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
      expenses: []
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
      ownerId: '',
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

  // Liquidación calculations
  let totalCost = 0;
  let ownerBalances = [];

  if (selectedReform) {
    const expenses = selectedReform.expenses || [];
    // Calculamos el coste basándonos en los gastos reales introducidos
    totalCost = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    
    ownerBalances = owners.map(owner => {
      const percentage = parseFloat(owner.percentage) || 0;
      const owed = totalCost * (percentage / 100);
      
      const paid = expenses
        .reduce((acc, exp) => {
          const amt = parseFloat(exp.amount) || 0;
          if (exp.ownerId === owner.partnerId) {
            return acc + amt;
          } else if (exp.ownerId === 'todos') {
            return acc + (amt * (percentage / 100));
          }
          return acc;
        }, 0);
        
      const balance = paid - owed;
      
      return {
        ...owner,
        owed,
        paid,
        balance
      };
    });
  }

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
                <th className="p-2 font-bold uppercase w-[40px] text-center">Sel.</th>
                <th className="p-2 font-bold uppercase w-[150px]">Fecha</th>
                <th className="p-2 font-bold uppercase min-w-[200px]">Concepto</th>
                <th className="p-2 font-bold uppercase w-[120px]">Total Gastos (€)</th>
                <th className="p-2 font-bold uppercase w-[120px] text-right">Total Cap. (€)</th>
                <th className="p-2 font-bold uppercase w-[60px] text-center">Borrar</th>
              </tr>
            </thead>
            <tbody>
              {reforms.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center p-8 text-slate-400 italic">No hay reformas registradas. Haz clic en "Añadir Reforma" para empezar.</td>
                </tr>
              ) : (
                reforms.map((reform, idx) => (
                  <tr 
                    key={reform.id} 
                    className={`border-b border-slate-200 cursor-pointer ${selectedIndex === idx ? 'bg-blue-100' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <td className="p-2 text-center" onClick={(e) => { e.stopPropagation(); setSelectedIndex(idx); }}>
                      <input 
                        type="radio" 
                        name="selectedReform"
                        className="w-4 h-4 text-blue-600 cursor-pointer"
                        checked={selectedIndex === idx}
                        onChange={() => setSelectedIndex(idx)}
                      />
                    </td>
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
                        className="win-input w-full text-[11px] text-right text-[#000080] font-bold" 
                        value={reform.amount !== undefined && reform.amount !== '' ? reform.amount : (reform.expenses || []).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0)}
                        placeholder="0.00"
                        onChange={e => updateReformField(idx, 'amount', e.target.value)}
                        onFocus={() => setSelectedIndex(idx)}
                        onClick={() => setSelectedIndex(idx)}
                        title="Puedes modificarlo a mano o dejarlo vacío para sumar los gastos automáticamente"
                      />
                    </td>
                    <td className="p-2 text-right text-green-700 font-bold" onClick={(e) => { e.stopPropagation(); setSelectedIndex(idx); }}>
                      {(reform.expenses || []).reduce((acc, curr) => acc + (curr.capitalize ? (parseFloat(curr.amount) || 0) : 0), 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
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
            className={`px-4 py-2 text-[11px] font-bold uppercase border-r border-[#a0a0a0] ${activeSubTab === 'liquidacion' ? 'bg-white text-[#000080] border-t-[3px] border-t-[#000080]' : 'text-slate-600 hover:bg-slate-200'}`}
            onClick={() => setActiveSubTab('liquidacion')}
          >
            Liquidación / Resumen
          </button>
        </div>

        {/* Content Gastos */}
        {activeSubTab === 'gastos' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-2 border-b border-slate-200 bg-white flex justify-between items-center">
               <span className="text-[11px] text-slate-500 italic ml-2">Añade los gastos, adjunta sus facturas e indica qué propietario lo pagó.</span>
              <button onClick={handleAddExpense} className="btn-classic flex items-center space-x-1 px-2 py-1">
                <Plus className="w-4 h-4" /> <span className="text-[10px] font-bold">Añadir Gasto</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#f0f0f0] sticky top-0 border-b border-[#808080]">
                  <tr>
                    <th className="p-2 font-bold uppercase w-[120px]">Fecha</th>
                    <th className="p-2 font-bold uppercase min-w-[150px]">Concepto</th>
                    <th className="p-2 font-bold uppercase w-[100px]">Importe (€)</th>
                    <th className="p-2 font-bold uppercase w-[150px]">Pagado Por</th>
                    <th className="p-2 font-bold uppercase w-[80px] text-center">Capitalizar</th>
                    <th className="p-2 font-bold uppercase w-[150px]">Documento</th>
                    <th className="p-2 font-bold uppercase w-[60px] text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(!selectedReform?.expenses || selectedReform.expenses.length === 0) ? (
                    <tr><td colSpan="6" className="text-center p-8 text-slate-400 italic">No hay gastos asociados a esta reforma.</td></tr>
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
                          <select className="win-input w-full text-[11px]" value={exp.ownerId || ''} onChange={e => updateExpense(idx, 'ownerId', e.target.value)}>
                            <option value="">-- Seleccionar --</option>
                            <option value="todos">Todos (Socio %)</option>
                            {owners.map(o => (
                              <option key={o.partnerId} value={o.partnerId}>{o.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <input 
                            type="checkbox" 
                            className="form-checkbox h-4 w-4 text-blue-600 rounded cursor-pointer"
                            checked={exp.capitalize || false}
                            onChange={e => updateExpense(idx, 'capitalize', e.target.checked)}
                          />
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
                                <Upload className="w-3 h-3" /> <span className="text-[10px]">Subir</span>
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

        {/* Content Liquidación */}
        {activeSubTab === 'liquidacion' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            <div className="p-4 border-b border-[#a0a0a0] bg-white flex items-center justify-between">
              <div>
                <h4 className="text-[14px] font-bold text-slate-800">Coste Real de la Reforma: <span className="text-[#000080]">{totalCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span></h4>
                <p className="text-[11px] text-slate-500 mt-1">Este cálculo se basa en la suma de todos los importes introducidos en la pestaña de Gastos.</p>
              </div>
            </div>
            
            <div className="p-4 flex-1 overflow-auto">
              <table className="w-full text-left text-[12px] bg-white shadow-sm border border-slate-200">
                <thead className="bg-[#f0f0f0] border-b border-[#808080]">
                  <tr>
                    <th className="p-3 font-bold uppercase border-r border-slate-200">Propietario</th>
                    <th className="p-3 font-bold uppercase border-r border-slate-200 text-center">% Propiedad</th>
                    <th className="p-3 font-bold uppercase border-r border-slate-200 text-right">Debería Pagar</th>
                    <th className="p-3 font-bold uppercase border-r border-slate-200 text-right">Ha Pagado</th>
                    <th className="p-3 font-bold uppercase text-right">Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerBalances.length === 0 ? (
                    <tr><td colSpan="5" className="text-center p-8 text-slate-400 italic">No hay propietarios asignados al activo.</td></tr>
                  ) : (
                    ownerBalances.map((ob, idx) => (
                      <tr key={ob.partnerId} className="border-b border-slate-100">
                        <td className="p-3 border-r border-slate-200 font-bold">{ob.name}</td>
                        <td className="p-3 border-r border-slate-200 text-center">{ob.percentage}%</td>
                        <td className="p-3 border-r border-slate-200 text-right text-slate-600">{ob.owed.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="p-3 border-r border-slate-200 text-right font-semibold">{ob.paid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        <td className={`p-3 text-right font-black ${ob.balance > 0 ? 'text-green-600' : ob.balance < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          {ob.balance > 0 ? '+' : ''}{ob.balance.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
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

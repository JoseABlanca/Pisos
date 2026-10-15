import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Upload, Eye, FileText, X, Receipt, Calculator } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useTableFilters } from '../hooks/useTableFilters';

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

  const { 
    activeTableFilters, 
    applyTableFilters, 
    applyTableSort, 
    clearAllFilters, 
    TableHeaderWithFilter, 
    renderFilterMenu 
  } = useTableFilters();

  const toggleSelect = (idx) => {
    setSelectedIndex(prev => (prev === idx ? null : idx));
  };

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

  const updateExpense = (expenseId, field, value) => {
    const newReforms = [...reforms];
    const expList = [...(newReforms[selectedIndex].expenses || [])];
    const idx = expList.findIndex(e => e.id === expenseId);
    if (idx !== -1) {
      expList[idx] = { 
        ...expList[idx], 
        [field]: value 
      };
      newReforms[selectedIndex].expenses = expList;
      setFormData(prev => ({ ...prev, reforms: newReforms }));
    }
  };

  const deleteExpense = (expenseId) => {
    if (window.confirm('¿Estás seguro de eliminar este gasto?')) {
      const newReforms = [...reforms];
      newReforms[selectedIndex].expenses = (newReforms[selectedIndex].expenses || []).filter(e => e.id !== expenseId);
      setFormData(prev => ({ ...prev, reforms: newReforms }));
    }
  };

  // Uploads
  const handleDocUpload = async (e, type, itemIdentifier) => {
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
        const expList = [...(newReforms[selectedIndex].expenses || [])];
        const idx = expList.findIndex(exp => exp.id === itemIdentifier);
        if (idx !== -1) {
          expList[idx] = { ...expList[idx], doc: newDoc };
          newReforms[selectedIndex].expenses = expList;
        }
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
    
    // Gastos sin "Pagado por" seleccionado
    const unassignedExpensesTotal = expenses
      .filter(exp => !exp.ownerId)
      .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

    ownerBalances = owners.map(owner => {
      const percentage = parseFloat(owner.percentage) || 0;
      const owed = totalCost * (percentage / 100);
      
      const directlyPaid = expenses
        .filter(exp => exp.ownerId === owner.partnerId)
        .reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

      // Si un gasto no tiene "pagado por", se computa como pagado en base a su porcentaje de propiedad
      const unassignedPaid = unassignedExpensesTotal * (percentage / 100);
      const paid = directlyPaid + unassignedPaid;
      const rawBalance = paid - owed;
      const balance = Math.abs(rawBalance) < 0.005 ? 0 : rawBalance;
      
      return {
        ...owner,
        owed,
        paid,
        balance
      };
    });
  }

  const processedExpenses = useMemo(() => {
    return (selectedReform?.expenses || []).map(exp => ({
      ...exp,
      Fecha: exp.date || '',
      Concepto: exp.concept || '',
      'Importe (€)': exp.amount !== undefined && exp.amount !== '' ? String(exp.amount) : '',
      'Pagado Por': owners.find(o => o.partnerId === exp.ownerId)?.name || 'Sin asignar',
      Capitalizar: exp.capitalize ? 'Sí' : 'No',
      Documento: exp.doc ? (exp.doc.name || 'Con documento') : 'Sin documento'
    }));
  }, [selectedReform?.expenses, owners]);

  const filteredExpenses = useMemo(() => {
    const filtered = applyTableFilters(processedExpenses, 'gastosReforma');
    return applyTableSort(filtered, 'gastosReforma');
  }, [processedExpenses, applyTableFilters, applyTableSort]);

  const hasActiveFilters = Boolean(
    activeTableFilters['gastosReforma'] && 
    Object.values(activeTableFilters['gastosReforma']).some(v => v !== undefined)
  );

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden gap-4 p-4">
      
      {/* TABLA PRINCIPAL DE REFORMAS */}
      <div className="bg-white flex flex-col shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[12px] font-bold text-black uppercase">Listado de Reformas</h3>
          <button 
            onClick={handleAddReform}
            className="btn-classic flex items-center space-x-1 px-3 py-1"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[11px] font-bold">Añadir Reforma</span>
          </button>
        </div>
        <div className="overflow-x-auto max-h-[250px]">
          <table className="modern-table w-full border-0">
            <thead>
              <tr>
                <th className="w-[45px] text-center text-[10px]">Sel.</th>
                <th className="w-[140px] text-left text-[10px]">Fecha</th>
                <th className="text-left text-[10px]">Concepto</th>
                <th className="w-[140px] text-right text-[10px]">Total Gastos (€)</th>
                <th className="w-[140px] text-right text-[10px]">Total Cap. (€)</th>
                <th className="w-[60px] text-center text-[10px]">Borrar</th>
              </tr>
            </thead>
            <tbody>
              {reforms.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center p-8 text-slate-400 italic">No hay reformas registradas. Haz clic en "Añadir Reforma" para empezar.</td>
                </tr>
              ) : (
                reforms.map((reform, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <tr 
                      key={reform.id} 
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-white' : 'hover:bg-slate-50'}`}
                      onClick={() => toggleSelect(idx)}
                    >
                      <td 
                        className={`py-2 px-2 text-center ${isSelected ? 'border-y-2 border-l-2 border-black' : ''}`} 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          toggleSelect(idx); 
                        }}
                      >
                        <input 
                          type="radio" 
                          name="selectedReform"
                          className="w-4 h-4 text-black cursor-pointer accent-black"
                          checked={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(idx);
                          }}
                          onChange={() => {}}
                        />
                      </td>
                      <td className={`py-1 px-2 ${isSelected ? 'border-y-2 border-black' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="date" 
                          className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-black" 
                          value={reform.date || ''}
                          onChange={e => updateReformField(idx, 'date', e.target.value)}
                          onFocus={() => setSelectedIndex(idx)}
                          onClick={() => setSelectedIndex(idx)}
                        />
                      </td>
                      <td className={`py-1 px-2 ${isSelected ? 'border-y-2 border-black' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="text" 
                          className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-black" 
                          value={reform.concept || ''}
                          placeholder="Ej. Reforma Baño Principal"
                          onChange={e => updateReformField(idx, 'concept', e.target.value)}
                          onFocus={() => setSelectedIndex(idx)}
                          onClick={() => setSelectedIndex(idx)}
                        />
                      </td>
                      <td className={`py-1 px-2 ${isSelected ? 'border-y-2 border-black' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="number" 
                          className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-right text-black" 
                          value={reform.amount !== undefined && reform.amount !== '' ? reform.amount : (reform.expenses || []).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0)}
                          placeholder="0.00"
                          onChange={e => updateReformField(idx, 'amount', e.target.value)}
                          onFocus={() => setSelectedIndex(idx)}
                          onClick={() => setSelectedIndex(idx)}
                          title="Puedes modificarlo a mano o dejarlo vacío para sumar los gastos automáticamente"
                        />
                      </td>
                      <td className={`py-2 px-3 text-right text-black font-bold ${isSelected ? 'border-y-2 border-black' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}>
                        {(reform.expenses || []).reduce((acc, curr) => acc + (curr.capitalize ? (parseFloat(curr.amount) || 0) : 0), 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className={`py-2 px-3 text-center ${isSelected ? 'border-y-2 border-r-2 border-black' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="text-gray-500 hover:text-black transition-colors"
                          onClick={() => deleteReform(idx)}
                          title="Eliminar reforma"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABLAS SECUNDARIAS (Sólo si hay reforma seleccionada) */}
      <div className={`flex-1 min-h-[40%] bg-white flex flex-col transition-opacity duration-300 ${!selectedReform ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        {/* Sub-tabs header exterior con diseño exacto de Foto 2 */}
        <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0 mb-3">
          <button
            type="button"
            onClick={() => setActiveSubTab('gastos')}
            className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'gastos' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
          >
            <Receipt className="w-3.5 h-3.5" /> Gastos de la Reforma
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('liquidacion')}
            className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${activeSubTab === 'liquidacion' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
          >
            <Calculator className="w-3.5 h-3.5" /> Liquidación / Resumen
          </button>
        </div>

        {/* Content Gastos */}
        {activeSubTab === 'gastos' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-end items-center mb-2 gap-2 shrink-0">
              {hasActiveFilters && (
                <button 
                  type="button"
                  onClick={clearAllFilters} 
                  className="btn-classic text-[10px] text-red-600 px-2 py-1 flex items-center gap-1 font-bold"
                  title="Limpiar todos los filtros"
                >
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              )}
              <button onClick={handleAddExpense} className="btn-classic flex items-center space-x-1 px-3 py-1">
                <Plus className="w-4 h-4" /> <span className="text-[11px] font-bold">Añadir Gasto</span>
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="modern-table w-full border-0">
                <thead>
                  <tr>
                    <TableHeaderWithFilter label="Fecha" columnKey="Fecha" data={processedExpenses} tableId="gastosReforma" className="w-[120px] text-left text-[10px] bg-[#fafafa]" />
                    <TableHeaderWithFilter label="Concepto" columnKey="Concepto" data={processedExpenses} tableId="gastosReforma" className="text-left text-[10px] bg-[#fafafa]" />
                    <TableHeaderWithFilter label="Importe (€)" columnKey="Importe (€)" data={processedExpenses} tableId="gastosReforma" className="w-[120px] text-right text-[10px] bg-[#fafafa]" />
                    <TableHeaderWithFilter label="Pagado Por" columnKey="Pagado Por" data={processedExpenses} tableId="gastosReforma" className="w-[150px] text-left text-[10px] bg-[#fafafa]" />
                    <TableHeaderWithFilter label="Capitalizar" columnKey="Capitalizar" data={processedExpenses} tableId="gastosReforma" className="w-[90px] text-center text-[10px] bg-[#fafafa]" />
                    <th className="w-[80px] text-center text-[10px] bg-[#fafafa]">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center p-8 text-slate-400 italic">
                        {hasActiveFilters 
                          ? "No hay gastos que coincidan con los filtros aplicados." 
                          : "No hay gastos asociados a esta reforma."}
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-1 px-2">
                          <input type="date" className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-black" value={exp.date || ''} onChange={e => updateExpense(exp.id, 'date', e.target.value)} />
                        </td>
                        <td className="py-1 px-2">
                          <input type="text" className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-black" placeholder="Ej. Materiales" value={exp.concept || ''} onChange={e => updateExpense(exp.id, 'concept', e.target.value)} />
                        </td>
                        <td className="py-1 px-2">
                          <input type="number" className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-right text-black" placeholder="0.00" value={exp.amount || ''} onChange={e => updateExpense(exp.id, 'amount', e.target.value)} />
                        </td>
                        <td className="py-1 px-2">
                          <select className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-black cursor-pointer" value={exp.ownerId || ''} onChange={e => updateExpense(exp.id, 'ownerId', e.target.value)}>
                            <option value="">-- Seleccionar --</option>
                            {owners.map(o => (
                              <option key={o.partnerId} value={o.partnerId}>{o.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 px-2 text-center">
                          <input 
                            type="checkbox" 
                            className="form-checkbox h-4 w-4 text-black rounded cursor-pointer accent-black"
                            checked={exp.capitalize || false}
                            onChange={e => updateExpense(exp.id, 'capitalize', e.target.checked)}
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex justify-center items-center space-x-3">
                            {exp.doc ? (
                              <div className="flex items-center space-x-1">
                                <button 
                                  type="button"
                                  onClick={() => setPreviewDocument(exp.doc)} 
                                  className="text-[#4560a9] hover:text-blue-800 transition-colors p-0.5" 
                                  title={`Ver documento: ${exp.doc.name}`}
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => updateExpense(exp.id, 'doc', null)} 
                                  className="text-red-500 hover:text-red-700 transition-colors p-0.5" 
                                  title="Quitar documento"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="relative inline-flex items-center">
                                <input 
                                  type="file" 
                                  id={`expense-doc-${exp.id}`} 
                                  className="hidden" 
                                  disabled={isUploading} 
                                  onChange={(e) => handleDocUpload(e, 'expense', exp.id)} 
                                />
                                <label 
                                  htmlFor={`expense-doc-${exp.id}`} 
                                  className={`cursor-pointer text-gray-500 hover:text-black transition-colors p-0.5 ${isUploading ? 'opacity-50' : ''}`}
                                  title="Subir documento"
                                >
                                  <Upload className="w-4 h-4" />
                                </label>
                              </div>
                            )}
                            <button 
                              type="button"
                              onClick={() => deleteExpense(exp.id)} 
                              className="text-gray-500 hover:text-black transition-colors p-0.5"
                              title="Eliminar gasto"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="modern-table w-full border-0">
                <thead>
                  <tr>
                    <th className="text-left text-[10px]">Propietario</th>
                    <th className="w-[120px] text-center text-[10px]">% Propiedad</th>
                    <th className="w-[140px] text-right text-[10px]">Debería Pagar</th>
                    <th className="w-[140px] text-right text-[10px]">Ha Pagado</th>
                    <th className="w-[140px] text-right text-[10px]">Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerBalances.length === 0 ? (
                    <tr><td colSpan="5" className="text-center p-8 text-slate-400 italic">No hay propietarios asignados al activo.</td></tr>
                  ) : (
                    ownerBalances.map((ob) => (
                      <tr key={ob.partnerId}>
                        <td className="py-2 px-3 font-semibold text-black">{ob.name}</td>
                        <td className="py-2 px-3 text-center text-black">{(parseFloat(ob.percentage) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>
                        <td className="py-2 px-3 text-right text-slate-600">{ob.owed.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="py-2 px-3 text-right font-medium text-black">{ob.paid.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        <td className={`py-2 px-3 text-right font-bold ${ob.balance > 0 ? 'text-green-600' : ob.balance < 0 ? 'text-red-600' : 'text-slate-500'}`}>
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
      {renderFilterMenu && renderFilterMenu()}
    </div>
  );
}

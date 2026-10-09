import React, { useState, useMemo } from 'react';
import { FileText, Plus, Trash2, PieChart, Database, BarChart2, Upload, Eye } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function FinanzasTab({ formData, setFormData, rentals, user, setPreviewDocument }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeDeleteMenu, setActiveDeleteMenu] = useState(null);
  
  // Ensure adquisition expenses array exists
  const adquisitionExpenses = Array.isArray(formData.adquisitionExpenses) ? formData.adquisitionExpenses : [];

  const handleAddExpense = () => {
    const newExpense = { date: '', concept: '', amount: '' };
    setFormData(prev => ({
      ...prev,
      adquisitionExpenses: [...(prev.adquisitionExpenses || []), newExpense]
    }));
  };

  const removeExpense = (idx) => {
    setFormData(prev => {
      const newExp = [...(prev.adquisitionExpenses || [])];
      newExp.splice(idx, 1);
      return { ...prev, adquisitionExpenses: newExp };
    });
    setActiveDeleteMenu(null);
  };

  const removeDocument = (idx) => {
    setFormData(prev => {
      const newExp = [...(prev.adquisitionExpenses || [])];
      newExp[idx] = { ...newExp[idx], url: null, name: null };
      return { ...prev, adquisitionExpenses: newExp };
    });
    setActiveDeleteMenu(null);
  };

  const updateExpense = (idx, field, value) => {
    setFormData(prev => {
      const newExp = [...(prev.adquisitionExpenses || [])];
      newExp[idx] = { ...newExp[idx], [field]: value };
      return { ...prev, adquisitionExpenses: newExp };
    });
  };

  const totalAdquisitionExpenses = useMemo(() => {
    return adquisitionExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
  }, [adquisitionExpenses]);

  const totalCapitalizedReforms = useMemo(() => {
    const reforms = formData.reforms || [];
    return reforms.reduce((sum, reform) => {
      const capitalizedExpensesSum = (reform.expenses || []).reduce((expSum, exp) => {
        return expSum + (exp.capitalize ? (parseFloat(exp.amount) || 0) : 0);
      }, 0);
      return sum + capitalizedExpensesSum;
    }, 0);
  }, [formData.reforms]);

  const handleRowFileUpload = async (e, idx) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    if (!formData.id) {
      alert('Debes guardar el inmueble antes de adjuntar un documento.');
      return;
    }
    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'adquisitionExpenses');
      setFormData(prev => {
        const newExp = [...(prev.adquisitionExpenses || [])];
        newExp[idx] = { 
          ...newExp[idx], 
          url, 
          name: newExp[idx].name || file.name 
        };
        return { ...prev, adquisitionExpenses: newExp };
      });
    } catch (error) {
      console.error('Error al subir documento de gasto:', error);
      alert('Error al subir el documento. Por favor, inténtalo de nuevo.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex flex-col gap-4 flex-1 overflow-auto bg-white">
        <div className="space-y-2 w-full">
          <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Datos</h3>
          <div className="border border-[#808080] p-4 bg-white">
            <div className="space-y-4 max-w-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Fecha de compra:</label>
            <input 
              type="date" 
              className="win-input w-full" 
              value={formData.purchaseDate || ''} 
              onChange={e => setFormData({ ...formData, purchaseDate: e.target.value })} 
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">Precio de adquisición:</label>
            <div className="relative">
              <input 
                type="number" 
                className="win-input w-full text-right pr-6" 
                value={formData.acquisitionPrice || ''} 
                onChange={e => setFormData({ ...formData, acquisitionPrice: e.target.value })} 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">Capital aportado:</label>
            <div className="relative">
              <input 
                type="number" 
                className="win-input w-full text-right pr-6" 
                value={formData.investedCapital || ''} 
                onChange={e => setFormData({ ...formData, investedCapital: e.target.value })} 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase" title="Suma automática de las reformas marcadas para capitalizar">Total reformas capitalizable:</label>
            <div className="relative">
              <input 
                type="text" 
                className="win-input w-full text-right pr-6 bg-slate-50 text-slate-500 cursor-not-allowed" 
                value={totalCapitalizedReforms.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                readOnly 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase" title="Suma de Capital Aportado y Reformas Capitalizables. Escribe para sobrescribir manualmente.">Total Inversión:</label>
            <div className="relative">
              <input 
                type={isFocused ? "number" : "text"} 
                step="any"
                className="win-input w-full text-right pr-6 text-black font-bold" 
                value={
                  isFocused
                    ? (formData.totalInversionOverride !== undefined && formData.totalInversionOverride !== null ? formData.totalInversionOverride : ((parseFloat(formData.investedCapital) || 0) + totalCapitalizedReforms).toFixed(2))
                    : (formData.totalInversionOverride !== undefined && formData.totalInversionOverride !== '' && formData.totalInversionOverride !== null
                        ? (parseFloat(formData.totalInversionOverride) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : ((parseFloat(formData.investedCapital) || 0) + totalCapitalizedReforms).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                }
                onChange={e => setFormData({ ...formData, totalInversionOverride: e.target.value })}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              {formData.totalInversionOverride !== undefined && formData.totalInversionOverride !== '' && formData.totalInversionOverride !== null && (
                <button 
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    setFormData({ ...formData, totalInversionOverride: '' });
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-red-500 hover:text-red-700 font-bold bg-white border border-red-200 rounded px-1"
                  title="Restaurar valor autocalculado"
                >
                  RESET
                </button>
              )}
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-black font-bold pointer-events-none">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">Precio teórico de venta:</label>
            <div className="relative">
              <input 
                type="number" 
                className="win-input w-full text-right pr-6" 
                value={formData.theoreticalSalePrice || ''} 
                onChange={e => setFormData({ ...formData, theoreticalSalePrice: e.target.value })} 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase" title="Suma automática de los gastos de adquisición">Gastos adquisición:</label>
            <div className="relative">
              <input 
                type="text" 
                className="win-input w-full text-right pr-6 bg-slate-50 text-slate-500 cursor-not-allowed" 
                value={totalAdquisitionExpenses.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                readOnly 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
            </div>
        </div>
      </div>
        {/* Gastos de Adquisición Table (Full Width) */}
        <div className="space-y-2 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Gastos de Adquisición</h3>
            <button 
              onClick={handleAddExpense}
              className="btn-classic flex items-center space-x-1 px-3 py-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[11px] font-bold">Añadir Gasto</span>
            </button>
          </div>
          
          <div className="border border-[#808080] bg-white overflow-hidden flex flex-col">
            <div className="bg-[#f0f0f0] grid grid-cols-12 gap-0 border-b border-[#808080] text-[10px] font-bold uppercase">
              <div className="col-span-2 p-2">Fecha</div>
              <div className="col-span-5 p-2">Concepto</div>
              <div className="col-span-3 p-2 text-right">Cantidad (€)</div>
              <div className="col-span-2 p-2 text-center">Acción</div>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              {adquisitionExpenses.length === 0 ? (
                <div className="text-center text-slate-400 italic py-8 text-[11px]">No hay gastos añadidos</div>
              ) : (
                adquisitionExpenses.map((exp, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-0 items-center text-[11px] border-b border-slate-100">
                    <div className="col-span-2 p-1">
                      <input 
                        type="date"
                        value={exp.date || ''}
                        onChange={(e) => updateExpense(idx, 'date', e.target.value)}
                        className="w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-400 text-[11px] px-1 outline-none h-[24px]"
                      />
                    </div>
                    <div className="col-span-5 flex items-center truncate p-1">
                      <input 
                        type="text"
                        value={exp.concept || ''}
                        onChange={(e) => updateExpense(idx, 'concept', e.target.value)}
                        className="w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-400 text-[11px] px-1 outline-none h-[24px]"
                        placeholder="Ej. Notaría, ITP..."
                      />
                    </div>
                    <div className="col-span-3 p-1">
                      <input 
                        type="number"
                        value={exp.amount || ''}
                        onChange={(e) => updateExpense(idx, 'amount', e.target.value)}
                        className="w-full text-right bg-transparent border-transparent hover:border-gray-300 focus:bg-white focus:border-blue-400 text-[11px] px-1 outline-none h-[24px]"
                      />
                    </div>
                    <div className="col-span-2 flex justify-center space-x-2 p-1 relative">
                      {exp.url ? (
                        <button
                          onClick={() => setPreviewDocument({ url: exp.url, name: exp.name || exp.concept })}
                          className="p-1 hover:bg-gray-100 text-gray-500 hover:text-black rounded transition-colors"
                          title="Ver documento"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      ) : (
                        <label className="p-1 hover:bg-gray-100 text-gray-500 hover:text-black rounded transition-colors cursor-pointer m-0 flex items-center justify-center" title="Subir documento">
                          <Upload className="w-4 h-4" />
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => handleRowFileUpload(e, idx)}
                            disabled={isUploading}
                          />
                        </label>
                      )}
                      
                      <div className="relative">
                        <button 
                          onClick={() => {
                            if (exp.url) {
                              setActiveDeleteMenu(activeDeleteMenu === idx ? null : idx);
                            } else {
                              if (window.confirm('¿Eliminar este registro?')) {
                                removeExpense(idx);
                              }
                            }
                          }}
                          className="p-1 hover:bg-gray-100 text-gray-500 hover:text-black rounded transition-colors flex items-center justify-center"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {activeDeleteMenu === idx && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveDeleteMenu(null)}></div>
                            <div className="absolute right-0 top-6 bg-white border border-gray-200 shadow-lg rounded-sm py-1 z-50 text-[11px] w-32 whitespace-nowrap flex flex-col">
                              <button 
                                onClick={() => removeDocument(idx)} 
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-slate-700"
                              >
                                Borrar documento
                              </button>
                              <div className="h-px bg-gray-200 w-full my-0.5"></div>
                              <button 
                                onClick={() => removeExpense(idx)} 
                                className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 font-medium"
                              >
                                Borrar registro
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

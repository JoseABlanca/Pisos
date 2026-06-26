import React, { useState, useMemo } from 'react';
import { FileText, Plus, Trash2, PieChart, Database, BarChart2, Upload, Eye } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function FinanzasTab({ formData, setFormData, rentals, user, setPreviewDocument }) {
  const [isUploading, setIsUploading] = useState(false);
  
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
    if (!file || !user || !formData.id) return;
    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, formData.id);
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
      <div className="flex flex-col gap-4 p-4 flex-1 overflow-auto bg-white">
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
            <label className="text-[10px] font-bold text-slate-700 uppercase" title="Suma de Capital Aportado, Gastos de Adquisición y Reformas Capitalizables">Total Inversión:</label>
            <div className="relative">
              <input 
                type="text" 
                className="win-input w-full text-right pr-6 bg-blue-50 text-blue-900 font-bold cursor-not-allowed" 
                value={((parseFloat(formData.investedCapital) || 0) + totalCapitalizedReforms + totalAdquisitionExpenses).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                readOnly 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-blue-900 font-bold">€</span>
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
            <label className="text-[10px] font-bold text-slate-700 uppercase">Honorarios de Agencia:</label>
            <div className="relative">
              <input 
                type="number" 
                className="win-input w-full text-right pr-6" 
                value={formData.agentFees || ''} 
                onChange={e => setFormData({ ...formData, agentFees: e.target.value })} 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">Valor Actual:</label>
            <div className="relative">
              <input 
                type="number" 
                className="win-input w-full text-right pr-6" 
                value={formData.currentValue || ''} 
                onChange={e => setFormData({ ...formData, currentValue: e.target.value })} 
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-500">€</span>
            </div>
          </div>
        </div>

        {/* Gastos de Adquisición Table (Full Width) */}
        <div className="space-y-2 mt-2">
          <h3 className="text-[11px] font-bold text-[#000080] border-b border-[#000080] pb-1 uppercase flex items-center justify-between">
            <div className="flex items-center">
              <Database className="w-4 h-4 mr-1" />
              Gastos de Adquisición
            </div>
            <button 
              onClick={handleAddExpense}
              className="btn-classic px-2 py-0.5 h-[20px] flex items-center text-[10px]"
            >
              <Plus className="w-3 h-3 mr-1" /> Añadir Gasto
            </button>
          </h3>
          
          <div className="bg-white border border-[#808080] shadow-[1px_1px_0px_#000] p-1 h-[300px] flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="clean-table w-full">
                <thead>
                  <tr>
                    <th className="w-28 text-center">Fecha</th>
                    <th>Concepto</th>
                    <th className="w-28 text-right">Cantidad (€)</th>
                    <th className="w-16 text-center">Documento</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {adquisitionExpenses.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-slate-500 py-4 italic text-[11px]">
                        No hay gastos añadidos
                      </td>
                    </tr>
                  ) : (
                    adquisitionExpenses.map((exp, idx) => (
                      <tr key={idx}>
                        <td className="p-0 w-28">
                          <input 
                            type="date"
                            value={exp.date || ''}
                            onChange={(e) => updateExpense(idx, 'date', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] px-1 m-0 h-[22px] text-center"
                          />
                        </td>
                        <td className="p-0">
                          <input 
                            type="text"
                            value={exp.concept || ''}
                            onChange={(e) => updateExpense(idx, 'concept', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] px-1 m-0 h-[22px]"
                            placeholder="Ej: Notaría, ITP..."
                          />
                        </td>
                        <td className="p-0 w-28">
                          <input 
                            type="number"
                            value={exp.amount || ''}
                            onChange={(e) => updateExpense(idx, 'amount', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] text-right px-1 m-0 h-[22px]"
                          />
                        </td>
                        <td className="text-center p-0 w-16 align-middle">
                          {exp.url ? (
                            <button
                              onClick={() => setPreviewDocument({ url: exp.url, name: exp.name || exp.concept })}
                              className="text-blue-600 hover:text-blue-800 p-1 mx-auto flex items-center justify-center"
                              title="Ver documento"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : (
                            <label className="cursor-pointer text-slate-400 hover:text-blue-600 p-1 mx-auto flex items-center justify-center" title="Subir documento">
                              <Upload className="w-4 h-4" />
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleRowFileUpload(e, idx)}
                                disabled={isUploading}
                              />
                            </label>
                          )}
                        </td>
                        <td className="text-center p-0 align-middle">
                          <button 
                            onClick={() => removeExpense(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Eliminar gasto"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-[#808080]">
                    <td colSpan="2" className="text-[11px] text-[#000080] uppercase py-1 text-right pr-4">Total Gastos</td>
                    <td className="text-right text-[11px] text-[#000080] py-1">{totalAdquisitionExpenses.toFixed(2)} €</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { X, Check } from 'lucide-react';

export default function TaxesExtractModal({ isOpen, onClose, property, year, rentals = [] }) {
  const [activeTab, setActiveTab] = useState('Ingresos');

  // Basic calculation logic based on current year
  // Ingresos
  const totalIngresos = useMemo(() => {
    if (!property) return 0;
    const propertyRentals = rentals.filter(r => r.propertyId === property.id);
    let total = 0;
    propertyRentals.forEach(r => {
      total += (parseFloat(r.rentAmount) || 0) * 12; // simplified estimate
    });
    return total;
  }, [property, rentals, year]);

  // Gastos
  const totalGastos = useMemo(() => {
    if (!property) return 0;
    let total = 0;
    if (property.communityFee) total += parseFloat(property.communityFee) * 12;
    return total;
  }, [property, year]);

  // Amortizaciones
  const totalAmortizaciones = useMemo(() => {
    if (!property) return 0;
    const purchasePrice = parseFloat(property.finPurchasePrice) || 0;
    const acquisitionCosts = parseFloat(property.finAcquisitionCosts) || 0;
    const agentFees = parseFloat(property.finAgentFees) || 0;
    const baseValue = purchasePrice + acquisitionCosts + agentFees;
    return baseValue * 0.03;
  }, [property]);

  if (!isOpen || !property) return null;

  const tabs = ['Ingresos', 'Gastos', 'Amortizaciones'];

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-[#f0f0f0] border-2 border-white border-r-gray-400 border-b-gray-400 w-full max-w-3xl flex flex-col font-sans shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0b3b80] to-[#1e5eb0] text-white px-3 py-1.5 flex justify-between items-center cursor-move select-none shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[13px] tracking-wide">
              Extracto Fiscal {year} - {property.name || property.id}
            </span>
          </div>
          <button onClick={onClose} className="hover:bg-red-500 hover:text-white text-gray-200 transition-colors p-0.5 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 px-2 pt-2 bg-[#d4d0c8] border-b border-gray-400 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-[11px] font-bold uppercase transition-all rounded-t-md border border-b-0
                ${activeTab === tab 
                  ? 'bg-white border-gray-400 text-[#0b3b80] shadow-[0_-2px_4px_rgba(0,0,0,0.1)] relative z-10 -mb-[1px]' 
                  : 'bg-[#e4e4e4] border-gray-300 text-gray-600 hover:bg-[#f0f0f0]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white flex-1 p-4 overflow-y-auto min-h-[300px]">
          {activeTab === 'Ingresos' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 border-b pb-1">Ingresos de Alquiler</h3>
              <p className="text-xs text-gray-600 mb-4">Estimación basada en contratos activos.</p>
              
              <table className="clean-table">
                <thead>
                  <tr>
                    <th className="p-2 font-bold uppercase">Concepto</th>
                    <th className="p-2 font-bold uppercase text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2">Rentas facturadas en {year}</td>
                    <td className="p-2 text-right">{totalIngresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className="p-2 text-right">Total Ingresos:</td>
                    <td className="p-2 text-right text-green-700">{totalIngresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Gastos' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 border-b pb-1">Gastos Deducibles</h3>
              
              <table className="clean-table">
                <thead>
                  <tr>
                    <th className="p-2 font-bold uppercase">Concepto</th>
                    <th className="p-2 font-bold uppercase text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2">Comunidad de Propietarios ({year})</td>
                    <td className="p-2 text-right">{totalGastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className="p-2 text-right">Total Gastos:</td>
                    <td className="p-2 text-right text-red-600">{totalGastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Amortizaciones' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800 border-b pb-1">Amortización del Inmueble</h3>
              <p className="text-xs text-gray-600 mb-4">Se aplica un 3% sobre el valor de adquisición estimado.</p>
              
              <table className="clean-table">
                <thead>
                  <tr>
                    <th className="p-2 font-bold uppercase">Concepto</th>
                    <th className="p-2 font-bold uppercase text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2">Amortización anual ({year})</td>
                    <td className="p-2 text-right">{totalAmortizaciones.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className="p-2 text-right">Total Amortización:</td>
                    <td className="p-2 text-right text-blue-700">{totalAmortizaciones.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-[#f0f0f0] border-t border-gray-300 p-3 flex justify-end shrink-0">
          <button 
            className="btn-classic flex items-center space-x-1"
            onClick={onClose}
          >
            <Check className="w-4 h-4" /> <span>Aceptar</span>
          </button>
        </div>

      </div>
    </div>
  );
}

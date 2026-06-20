import { useState, useMemo, useEffect } from 'react';
import Window from './Window';

export default function TaxesExtractModal({ isOpen, onClose, property, year, rentals = [] }) {
  const [activeTab, setActiveTab] = useState('Ingresos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const yearsOwned = useMemo(() => {
    if (year !== 'Todas') return 1;
    if (!property || !property.finAcquisitionDate) return 1;
    const currentYear = new Date().getFullYear();
    const acqYear = parseInt(property.finAcquisitionDate.substring(0, 4), 10);
    if (!isNaN(acqYear) && acqYear <= currentYear) {
      return currentYear - acqYear + 1;
    }
    return 1;
  }, [property, year]);

  // Basic calculation logic based on current year
  // Ingresos
  const totalIngresos = useMemo(() => {
    if (!property) return 0;
    const propertyRentals = rentals.filter(r => r.propertyId === property.id);
    let total = 0;
    propertyRentals.forEach(r => {
      total += (parseFloat(r.rentAmount) || 0) * 12 * yearsOwned; // simplified estimate
    });
    return total;
  }, [property, rentals, year, yearsOwned]);

  // Gastos
  const totalGastos = useMemo(() => {
    if (!property) return 0;
    let total = 0;
    if (property.communityFee) total += parseFloat(property.communityFee) * 12 * yearsOwned;
    return total;
  }, [property, year, yearsOwned]);

  // Amortizaciones
  const totalAmortizaciones = useMemo(() => {
    if (!property) return 0;
    const purchasePrice = parseFloat(property.finPurchasePrice) || 0;
    const acquisitionCosts = parseFloat(property.finAcquisitionCosts) || 0;
    const agentFees = parseFloat(property.finAgentFees) || 0;
    const baseValue = purchasePrice + acquisitionCosts + agentFees;
    return baseValue * 0.03 * yearsOwned;
  }, [property, yearsOwned]);

  if (!isOpen || !property) return null;

  const tabs = ['Ingresos', 'Gastos', 'Amortizaciones'];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <Window 
        title={`Extracto Fiscal ${year} - ${property.name || property.id}`}
        width={isMobile ? "100%" : "1200px"}
        initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
        onClose={onClose}
        onMenuClick={() => setShowSidebar(!showSidebar)}
      >
        <div className="flex h-[800px] bg-[#d4d0c8] relative">
          
          {/* Sidebar */}
          {showSidebar && (
            <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
              <div className="bg-white border border-[#a0a0a0] flex flex-col">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); if (isMobile) setShowSidebar(false); }}
                    className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                      activeTab === tab
                        ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                        : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mobile backdrop to close sidebar */}
          {isMobile && showSidebar && (
            <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowSidebar(false)} />
          )}

          {/* Tab Content Container */}
          <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
            <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
              <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                
                {/* INGRESOS */}
                {activeTab === 'Ingresos' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 border-b border-gray-400 pb-1 mb-4 uppercase">Ingresos de Alquiler</h3>
                    <p className="text-xs text-gray-600 mb-4 font-sans">Estimación basada en contratos activos.</p>
                    
                    <table className="clean-table w-full">
                      <thead>
                        <tr>
                          <th className="p-2 font-bold uppercase text-left">Concepto</th>
                          <th className="p-2 font-bold uppercase text-right w-48">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 font-sans">Rentas facturadas en {year}</td>
                          <td className="p-2 text-right font-sans">{totalIngresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="bg-gray-100 font-bold border-t border-gray-300">
                          <td className="p-2 text-right uppercase">Total Ingresos:</td>
                          <td className="p-2 text-right text-green-700">{totalIngresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* GASTOS */}
                {activeTab === 'Gastos' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 border-b border-gray-400 pb-1 mb-4 uppercase">Gastos Deducibles</h3>
                    
                    <table className="clean-table w-full">
                      <thead>
                        <tr>
                          <th className="p-2 font-bold uppercase text-left">Concepto</th>
                          <th className="p-2 font-bold uppercase text-right w-48">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 font-sans">Comunidad de Propietarios ({year})</td>
                          <td className="p-2 text-right font-sans">{totalGastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="bg-gray-100 font-bold border-t border-gray-300">
                          <td className="p-2 text-right uppercase">Total Gastos:</td>
                          <td className="p-2 text-right text-red-600">{totalGastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* AMORTIZACIONES */}
                {activeTab === 'Amortizaciones' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 border-b border-gray-400 pb-1 mb-4 uppercase">Amortización del Inmueble</h3>
                    <p className="text-xs text-gray-600 mb-4 font-sans">Se aplica un 3% sobre el valor de adquisición estimado.</p>
                    
                    <table className="clean-table w-full">
                      <thead>
                        <tr>
                          <th className="p-2 font-bold uppercase text-left">Concepto</th>
                          <th className="p-2 font-bold uppercase text-right w-48">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 font-sans">Amortización anual ({year})</td>
                          <td className="p-2 text-right font-sans">{totalAmortizaciones.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                        <tr className="bg-gray-100 font-bold border-t border-gray-300">
                          <td className="p-2 text-right uppercase">Total Amortización:</td>
                          <td className="p-2 text-right text-blue-700">{totalAmortizaciones.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
              <button 
                className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" 
                onClick={onClose}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      </Window>
    </div>
  );
}

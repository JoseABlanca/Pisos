import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import TaxesExtractModal from '../components/TaxesExtractModal';

export default function TaxesRealEstate() {
  const { user, queryUserIds } = useAuth();
  const { tableZoom, taxYear } = useOutletContext();
  
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  
  const [showTaxesExtract, setShowTaxesExtract] = useState(false);
  const [taxesExtractYear, setTaxesExtractYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    const unsubProperties = onSnapshot(query(collection(db, 'properties'), where('userId', 'in', qIds)), snap => {
      setProperties(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    
    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('userId', 'in', qIds)), snap => {
      setRentals(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubProperties();
      unsubRentals();
    };
  }, [user, queryUserIds]);

  // Compute values for each property
  const computedProperties = useMemo(() => {
    return properties.map(p => {
      // Calculate years multiplier
      const currentYear = new Date().getFullYear();
      let yearsOwned = 1;
      if (taxYear === 'Todas') {
        if (p.finAcquisitionDate) {
          const acqYear = parseInt(p.finAcquisitionDate.substring(0, 4), 10);
          if (!isNaN(acqYear) && acqYear <= currentYear) {
            yearsOwned = currentYear - acqYear + 1;
          } else {
             yearsOwned = 1; // Fallback
          }
        }
      }

      // Ingresos
      const propertyRentals = rentals.filter(r => r.propertyId === p.id);
      let ingresos = 0;
      propertyRentals.forEach(r => {
        ingresos += (parseFloat(r.rentAmount) || 0) * 12 * yearsOwned;
      });

      // Gastos
      let gastos = 0;
      if (p.communityFee) gastos += parseFloat(p.communityFee) * 12 * yearsOwned;

      // Amortización
      const purchasePrice = parseFloat(p.finPurchasePrice) || 0;
      const acquisitionCosts = parseFloat(p.finAcquisitionCosts) || 0;
      const agentFees = parseFloat(p.finAgentFees) || 0;
      const baseValue = purchasePrice + acquisitionCosts + agentFees;
      const amortizacion = baseValue * 0.03 * yearsOwned;

      // Beneficio Neto
      const beneficioNeto = ingresos - gastos - amortizacion;

      return {
        ...p,
        ingresos,
        gastos,
        amortizacion,
        beneficioNeto
      };
    });
  }, [properties, rentals, taxYear]);

  useEffect(() => {
    const onTaxesExtract = (e) => {
      if (selectedProperty) {
        setTaxesExtractYear(e.detail?.year || new Date().getFullYear());
        setShowTaxesExtract(true);
      } else {
        alert('Por favor, selecciona un activo de la tabla primero.');
      }
    };
    window.addEventListener('taxes:extract', onTaxesExtract);
    return () => window.removeEventListener('taxes:extract', onTaxesExtract);
  }, [selectedProperty]);

  const toggleSelect = (p) => {
    if (selectedProperty?.id === p.id) {
      setSelectedProperty(null);
    } else {
      setSelectedProperty(p);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-1 font-sans">
      <div className="flex-1 flex flex-col bg-white overflow-hidden relative border border-gray-400">
        <div className="flex-1 overflow-auto bg-white p-2">
          <table className="clean-table w-full">
            <thead>
              <tr>
                <th className="p-2 font-bold uppercase w-16 text-center">ID</th>
                <th className="p-2 font-bold uppercase text-left">Nombre del Activo</th>
                <th className="p-2 font-bold uppercase text-right">Ingresos ({taxYear})</th>
                <th className="p-2 font-bold uppercase text-right">Gastos ({taxYear})</th>
                <th className="p-2 font-bold uppercase text-right">Amortización ({taxYear})</th>
                <th className="p-2 font-bold uppercase text-right">Rendimiento Neto</th>
              </tr>
            </thead>
            <tbody>
              {computedProperties.map(p => {
                const isSelected = selectedProperty?.id === p.id;
                return (
                  <tr 
                    key={p.id} 
                    onClick={() => toggleSelect(p)}
                    className={`cursor-pointer border-b border-gray-200 transition-colors
                      ${isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-50/50'}`}
                  >
                    <td className="p-2 text-center text-gray-500">{p.id.slice(0,5)}</td>
                    <td className="p-2">{p.name || p.address}</td>
                    <td className="p-2 text-right">
                      {p.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {p.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {p.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {p.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                  </tr>
                );
              })}
              {computedProperties.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-500 italic">
                    No hay inversiones inmobiliarias registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{computedProperties.length} activos encontrados</div>
      </div>

      <TaxesExtractModal 
        isOpen={showTaxesExtract}
        onClose={() => setShowTaxesExtract(false)}
        property={selectedProperty}
        year={taxesExtractYear}
        rentals={rentals}
      />
    </div>
  );
}

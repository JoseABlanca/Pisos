import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';

export default function TaxesTotal() {
  const { user, queryUserIds } = useAuth();
  const { tableZoom, taxYear } = useOutletContext();
  
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);

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

  // Compute aggregate totals per year
  const computedYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear;
    
    // Find min year based on acquisition date
    properties.forEach(p => {
      if (p.finAcquisitionDate) {
        const y = parseInt(p.finAcquisitionDate.substring(0, 4), 10);
        if (!isNaN(y) && y < minYear) minYear = y;
      }
    });

    const yearsList = [];
    for (let y = minYear; y <= currentYear; y++) {
      yearsList.push(y);
    }
    
    const result = [];
    let totalIngresos = 0;
    let totalGastos = 0;
    let totalAmortizacion = 0;
    let totalNeto = 0;

    yearsList.forEach(year => {
      // Filter if taxYear is specific
      if (taxYear !== 'Todas' && parseInt(taxYear, 10) !== year) return;

      let ingresosYear = 0;
      let gastosYear = 0;
      let amortizacionYear = 0;

      properties.forEach(p => {
        // Check if property was owned in this year
        let owned = true;
        if (p.finAcquisitionDate) {
           const acqY = parseInt(p.finAcquisitionDate.substring(0, 4), 10);
           if (!isNaN(acqY) && acqY > year) owned = false;
        }
        if (!owned) return;

        // Ingresos
        const propertyRentals = rentals.filter(r => r.propertyId === p.id);
        propertyRentals.forEach(r => {
          ingresosYear += (parseFloat(r.rentAmount) || 0) * 12;
        });

        // Gastos
        if (p.communityFee) gastosYear += parseFloat(p.communityFee) * 12;

        // Amortización
        const purchasePrice = parseFloat(p.finPurchasePrice) || 0;
        const acquisitionCosts = parseFloat(p.finAcquisitionCosts) || 0;
        const agentFees = parseFloat(p.finAgentFees) || 0;
        const baseValue = purchasePrice + acquisitionCosts + agentFees;
        amortizacionYear += baseValue * 0.03;
      });

      const beneficioNetoYear = ingresosYear - gastosYear - amortizacionYear;
      
      result.push({
        year,
        ingresos: ingresosYear,
        gastos: gastosYear,
        amortizacion: amortizacionYear,
        beneficioNeto: beneficioNetoYear
      });

      totalIngresos += ingresosYear;
      totalGastos += gastosYear;
      totalAmortizacion += amortizacionYear;
      totalNeto += beneficioNetoYear;
    });

    return { 
      rows: result.sort((a,b) => b.year - a.year), 
      totals: { ingresos: totalIngresos, gastos: totalGastos, amortizacion: totalAmortizacion, beneficioNeto: totalNeto } 
    };
  }, [properties, rentals, taxYear]);

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-1 font-sans">
      <div className="flex-1 flex flex-col bg-white overflow-hidden relative border border-gray-400">
        <div className="flex-1 overflow-auto bg-white p-2">
          <table className="clean-table w-full">
            <thead>
              <tr>
                <th className="p-2 font-bold uppercase w-24 text-center">Año</th>
                <th className="p-2 font-bold uppercase text-right">Ingresos</th>
                <th className="p-2 font-bold uppercase text-right">Gastos</th>
                <th className="p-2 font-bold uppercase text-right">Amortización</th>
                <th className="p-2 font-bold uppercase text-right">Rendimiento Neto</th>
              </tr>
            </thead>
            <tbody>
              {computedYears.rows.map(r => (
                  <tr key={r.year} className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                    <td className="p-2 text-center font-bold text-gray-700">{r.year}</td>
                    <td className="p-2 text-right">
                      {r.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {r.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {r.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="p-2 text-right">
                      {r.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                  </tr>
              ))}
              {computedYears.rows.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500 italic">
                    No hay datos fiscales para el año seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
            {computedYears.rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-400">
                  <td className="p-2 text-center font-bold uppercase text-gray-800">Total</td>
                  <td className="p-2 text-right font-bold text-gray-800">
                    {computedYears.totals.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td className="p-2 text-right font-bold text-gray-800">
                    {computedYears.totals.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td className="p-2 text-right font-bold text-gray-800">
                    {computedYears.totals.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td className="p-2 text-right font-bold text-gray-800">
                    {computedYears.totals.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{computedYears.rows.length} años listados</div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useTableFilters } from '../hooks/useTableFilters';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import ZoomControl from '../components/ZoomControl';
import { handleExportFormat } from '../utils/exportUtils';

export default function TaxesTotal() {
  const { user, queryUserIds } = useAuth();
  const { tableZoom, taxYear } = useOutletContext();
  
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    const unsubProperties = onSnapshot(query(collection(db, 'properties'), where('userId', 'in', qIds)), snap => {
      setProperties(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    
    const unsubRentals = onSnapshot(query(collection(db, 'rentals'), where('userId', 'in', qIds)), snap => {
      setRentals(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    const unsubJournal = onSnapshot(query(collection(db, 'journal_entries'), where('userId', 'in', qIds)), snap => {
      setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubProperties();
      unsubRentals();
      unsubJournal();
    };
  }, [user, queryUserIds]);

  const DEFAULT_COLUMNS = ['year', 'ingresos', 'gastos', 'amortizacion', 'beneficioNeto'];
  const { visibleColumns , columnWidths, updateColumnWidth} = useTableColumns('taxesTotal', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  // Compute aggregate totals per year
  const computedYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear;
    
    // Find min year based on acquisition date
    properties.forEach(p => {
      const acqDate = p.financials?.acquisitionDate || p.finAcquisitionDate;
      if (acqDate) {
        const y = parseInt(acqDate.substring(0, 4), 10);
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

      // Sum of journal entries marked as taxes for this year with CEBE (Ingresos)
      const taxIncomesYear = journalEntries.filter(entry => {
        if (!entry.isImpuesto) return false;
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        if (entryYr !== year.toString()) return false;
        return !!entry.cebe;
      });
      const ingresosYear = taxIncomesYear.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);

      // Sum of journal entries marked as taxes for this year with CECO (Gastos)
      const taxExpensesYear = journalEntries.filter(entry => {
        if (!entry.isImpuesto) return false;
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        if (entryYr !== year.toString()) return false;
        return !!entry.ceco;
      });
      const gastosYear = taxExpensesYear.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);

      // Amortization: 3% of construction base value (80%) for properties rented in this year
      let amortizacionYear = 0;
      properties.forEach(p => {
        let owned = true;
        const acqDate = p.financials?.acquisitionDate || p.finAcquisitionDate;
        if (acqDate) {
           const acqY = parseInt(acqDate.substring(0, 4), 10);
           if (!isNaN(acqY) && acqY > year) owned = false;
        }
        if (!owned) return;

        // Check if property had rental income in this year
        const propertyCebe = String(p.cebe || '').trim();
        if (!propertyCebe) return;

        const propertyIncomesYear = journalEntries.filter(entry => {
          if (!entry.isImpuesto) return false;
          const entryYr = entry.date ? entry.date.substring(0, 4) : '';
          if (entryYr !== year.toString()) return false;
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
          const normalizedPropCebe = propertyCebe.replace(/^(CEBE|CECO)/i, '');
          return entryCebe.startsWith(normalizedPropCebe);
        });

        if (propertyIncomesYear.length === 0) return;

        const purchasePrice = parseFloat(p.financials?.purchasePrice || p.finPurchasePrice) || 0;
        const acquisitionCosts = parseFloat(p.financials?.acquisitionCosts || p.finAcquisitionCosts) || 0;
        const agentFees = parseFloat(p.financials?.agentFees || p.finAgentFees) || 0;
        const acquisitionExpensesSum = (p.financials?.acquisitionExpenses || []).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const baseValue = purchasePrice + acquisitionCosts + agentFees + acquisitionExpensesSum;
        
        amortizacionYear += baseValue * 0.80 * 0.03;
      });

      const beneficioNetoYear = ingresosYear - gastosYear;
      
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
  }, [properties, rentals, journalEntries, taxYear]);

  useEffect(() => {
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      
      const dataToExport = computedYears.rows.map(r => ({
        year: r.year,
        ingresos: r.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        gastos: r.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        amortizacion: r.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        beneficioNeto: r.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
      }));

      if (format === 'pdf') {
        const allColumns = [
          { header: 'Año', dataKey: 'year' },
          { header: 'Ingresos', dataKey: 'ingresos' },
          { header: 'Gastos', dataKey: 'gastos' },
          { header: 'Amortización', dataKey: 'amortizacion' },
          { header: 'Rendimiento Neto', dataKey: 'beneficioNeto' }
        ];
        const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(dataToExport, colsToExport, 'Reporte de Impuestos Totales', 'impuestos_totales.pdf');
      } else {
        handleExportFormat(dataToExport, 'Impuestos Totales', format);
      }
    };
    window.addEventListener('taxes-total:export', onExport);
    return () => window.removeEventListener('taxes-total:export', onExport);
  }, [computedYears, visibleColumns]);

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-1 font-sans">
      <div className="flex-1 flex flex-col bg-white overflow-hidden relative border border-gray-200">
        <div className="flex-1 overflow-auto bg-white p-2">
          <table style={{ zoom: tableZoom }} className="clean-table w-full">
            <thead>
              <tr>
                
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'year': return (<TableHeaderWithFilter key="year" label="Año" columnKey="year" data={computedYears.rows} tableId="taxesTotal" />);
                    case 'ingresos': return (<TableHeaderWithFilter key="ingresos" label="Ingresos" columnKey="ingresos" data={computedYears.rows} tableId="taxesTotal" />);
                    case 'gastos': return (<TableHeaderWithFilter key="gastos" label="Gastos" columnKey="gastos" data={computedYears.rows} tableId="taxesTotal" />);
                    case 'amortizacion': return (<TableHeaderWithFilter key="amortizacion" label="Amortización" columnKey="amortizacion" data={computedYears.rows} tableId="taxesTotal" />);
                    case 'beneficioNeto': return (<TableHeaderWithFilter key="beneficioNeto" label="Rendimiento Neto" columnKey="beneficioNeto" data={computedYears.rows} tableId="taxesTotal" />);
                    default: return null;
                    }
                  })}
    
              </tr>
            </thead>
            <tbody>
              {computedYears.rows.map(r => (
                  <tr key={r.year} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'year': return (<td
 key="year" className="p-2 text-center font-bold text-gray-700">{r.year}</td>);
                    case 'ingresos': return (<td
 key="ingresos" className="p-2 text-right">
                        {r.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'gastos': return (<td
 key="gastos" className="p-2 text-right">
                        {r.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'amortizacion': return (<td
 key="amortizacion" className="p-2 text-right">
                        {r.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'beneficioNeto': return (<td
 key="beneficioNeto" className="p-2 text-right">
                        {r.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    default: return null;
                    }
                  })}
    
                  </tr>
              ))}
              {computedYears.rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-8 text-center text-gray-500 italic">
                    No hay datos fiscales para el año seleccionado.
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>
      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{computedYears.rows.length} años listados</div>
        <ZoomControl />
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useTableFilters } from '../hooks/useTableFilters';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import TaxesExtractModal from '../components/TaxesExtractModal';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';

export default function TaxesRealEstate() {
  const { user, queryUserIds } = useAuth();
  const { tableZoom, taxYear } = useOutletContext();
  
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [cecos, setCecos] = useState([]);
  
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

    const unsubJournal = onSnapshot(query(collection(db, 'journal_entries'), where('userId', 'in', qIds)), snap => {
      setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    const unsubCecos = onSnapshot(query(collection(db, 'analytical_centers'), where('userId', 'in', qIds), where('type', '==', 'ceco')), snap => {
      setCecos(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    return () => {
      unsubProperties();
      unsubRentals();
      unsubJournal();
      unsubCecos();
    };
  }, [user, queryUserIds]);

  const DEFAULT_COLUMNS = ['id', 'name', 'ingresos', 'gastos', 'amortizacion', 'beneficioNeto'];
  const { visibleColumns , columnWidths, updateColumnWidth} = useTableColumns('taxesRealEstate', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  // Compute values for each property
  const computedProperties = useMemo(() => {
    return properties.map(p => {
      const propertyCebe = String(p.cebe || '').trim();
      const taxIncomeCecos = p.taxIncomeCecos || [];
      const taxExpenseCecos = p.taxExpenseCecos || [];

      // Ingresos (Tax Incomes) - accounts starting with 7
      let ingresos = 0;
      const normalizedPropCebe = propertyCebe ? propertyCebe.replace(/^(CEBE|CECO)/i, '') : '';
      const normalizedIncomeCecos = taxIncomeCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));
      
      journalEntries.forEach(entry => {
        if (!entry.isImpuesto) return;
        if (taxYear !== 'Todas') {
          const entryYr = entry.date ? entry.date.substring(0, 4) : '';
          if (entryYr !== taxYear.toString()) return;
        }
        
        let entryIngresos = 0;
        let hasLineMatch = false;

        if (entry.lines) {
          entry.lines.forEach(l => {
            const accCode = String(l.accountCode || '');
            if (!accCode.startsWith('7')) return;

            // Must match CEBE
            let matchCebe = false;
            if (l.cebe && normalizedPropCebe) {
              const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              if (lineCebe.startsWith(normalizedPropCebe)) {
                matchCebe = true;
              }
            } else if (!l.cebe && normalizedPropCebe) {
              // Fallback to entry-level cebe
              const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
              if (entryCebe.startsWith(normalizedPropCebe)) {
                matchCebe = true;
              }
            }

            // Must match Income CECO if any are selected
            let matchCeco = false;
            if (normalizedIncomeCecos.length > 0) {
              if (l.ceco) {
                const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                if (normalizedIncomeCecos.some(c => lineCeco.startsWith(c))) {
                  matchCeco = true;
                }
              } else if (!l.ceco) {
                const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
                if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) {
                  matchCeco = true;
                }
              }
            } else {
              matchCeco = true;
            }

            if (matchCebe && matchCeco) {
              entryIngresos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              hasLineMatch = true;
            }
          });
        }

        // Fallback for global match
        if (!hasLineMatch) {
          let globalCebe = false;
          if (normalizedPropCebe && entry.cebe) {
            const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (entryCebe.startsWith(normalizedPropCebe)) {
              globalCebe = true;
            }
          }
          
          let globalCeco = false;
          if (normalizedIncomeCecos.length > 0) {
            if (entry.ceco) {
              const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) {
                globalCeco = true;
              }
            }
          } else {
            globalCeco = true;
          }

          if (globalCebe && globalCeco) {
            entryIngresos = parseFloat(entry.total) || 0;
          }
        }

        ingresos += entryIngresos;
      });

      // Gastos (Tax Expenses) - accounts starting with 6
      let gastos = 0;
      const normalizedExpenseCecos = taxExpenseCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));
      
      journalEntries.forEach(entry => {
        if (!entry.isImpuesto) return;
        if (taxYear !== 'Todas') {
          const entryYr = entry.date ? entry.date.substring(0, 4) : '';
          if (entryYr !== taxYear.toString()) return;
        }

        let entryGastos = 0;
        let hasLineMatch = false;

        if (entry.lines) {
          entry.lines.forEach(l => {
            const accCode = String(l.accountCode || '');
            if (!accCode.startsWith('6')) return;

            // Must match CEBE if the line or entry has one
            let matchCebe = true;
            if (l.cebe && normalizedPropCebe) {
              const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              matchCebe = lineCebe.startsWith(normalizedPropCebe);
            } else if (!l.cebe && entry.cebe && normalizedPropCebe) {
              const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              matchCebe = entryCebe.startsWith(normalizedPropCebe);
            }

            // Must match Expense CECO if any are selected
            let matchCeco = false;
            if (normalizedExpenseCecos.length > 0) {
              if (l.ceco) {
                const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                if (normalizedExpenseCecos.some(c => lineCeco.startsWith(c))) {
                  matchCeco = true;
                }
              } else if (!l.ceco) {
                const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
                if (normalizedExpenseCecos.some(c => entryCeco.startsWith(c))) {
                  matchCeco = true;
                }
              }
            } else {
              matchCeco = true;
            }

            if (matchCebe && matchCeco) {
              entryGastos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              hasLineMatch = true;
            }
          });
        }

        // Fallback for global match
        if (!hasLineMatch) {
          let globalCebe = true;
          if (entry.cebe && normalizedPropCebe) {
            const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            globalCebe = entryCebe.startsWith(normalizedPropCebe);
          }
          
          let globalCeco = false;
          if (normalizedExpenseCecos.length > 0) {
            if (entry.ceco) {
              const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normalizedExpenseCecos.some(c => entryCeco.startsWith(c))) {
                globalCeco = true;
              }
            }
          } else {
            globalCeco = true;
          }

          if (globalCebe && globalCeco) {
            entryGastos = parseFloat(entry.total) || 0;
          }
        }

        gastos += entryGastos;
      });

      // Amortización (Amortization)
      let amortizacion = 0;
      const purchasePrice = parseFloat(p.financials?.purchasePrice || p.finPurchasePrice) || 0;
      const acquisitionCosts = parseFloat(p.financials?.acquisitionCosts || p.finAcquisitionCosts) || 0;
      const agentFees = parseFloat(p.financials?.agentFees || p.finAgentFees) || 0;
      const acquisitionExpensesSum = (p.financials?.acquisitionExpenses || []).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
      const baseValue = purchasePrice + acquisitionCosts + agentFees + acquisitionExpensesSum;

      if (taxYear === 'Todas') {
        // Find years with rental income
        const yearsWithIncome = new Set();
        if (propertyCebe) {
          const normalizedPropCebe = propertyCebe.replace(/^(CEBE|CECO)/i, '');
          const normalizedIncomeCecos = taxIncomeCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));
          journalEntries.forEach(entry => {
            if (!entry.isImpuesto) return;
            let match = false;
            if (entry.lines) {
              entry.lines.forEach(l => {
                const accCode = String(l.accountCode || '');
                if (!accCode.startsWith('7')) return;

                let lineCebeMatch = false;
                if (l.cebe) {
                  const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                  if (lineCebe.startsWith(normalizedPropCebe)) lineCebeMatch = true;
                } else {
                  const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
                  if (entryCebe.startsWith(normalizedPropCebe)) lineCebeMatch = true;
                }

                let lineCecoMatch = false;
                if (normalizedIncomeCecos.length > 0) {
                  if (l.ceco) {
                    const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                    if (normalizedIncomeCecos.some(c => lineCeco.startsWith(c))) lineCecoMatch = true;
                  } else {
                    const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
                    if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) lineCecoMatch = true;
                  }
                } else {
                  lineCecoMatch = true;
                }

                if (lineCebeMatch && lineCecoMatch) match = true;
              });
            }
            if (!match) {
              let globalCebe = false;
              if (entry.cebe) {
                const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                if (entryCebe.startsWith(normalizedPropCebe)) globalCebe = true;
              }
              let globalCeco = false;
              if (normalizedIncomeCecos.length > 0) {
                if (entry.ceco) {
                  const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
                  if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) globalCeco = true;
                }
              } else {
                globalCeco = true;
              }
              if (globalCebe && globalCeco) match = true;
            }
            if (match) {
              const yr = entry.date ? entry.date.substring(0, 4) : '';
              if (yr) yearsWithIncome.add(yr);
            }
          });
        }
        
        yearsWithIncome.forEach(yrStr => {
          const yr = parseInt(yrStr, 10);
          let owned = true;
          if (p.financials?.acquisitionDate) {
            const acqYear = parseInt(p.financials.acquisitionDate.substring(0, 4), 10);
            if (!isNaN(acqYear) && acqYear > yr) {
              owned = false;
            }
          }
          if (owned) {
            amortizacion += baseValue * 0.80 * 0.03;
          }
        });
      } else {
        const targetYear = parseInt(taxYear, 10);
        let owned = true;
        if (p.financials?.acquisitionDate) {
          const acqYear = parseInt(p.financials.acquisitionDate.substring(0, 4), 10);
          if (!isNaN(acqYear) && acqYear > targetYear) {
            owned = false;
          }
        }
        if (owned && ingresos > 0) {
          amortizacion = baseValue * 0.80 * 0.03;
        }
      }

      // Beneficio Neto (Rendimiento Neto = Ingresos - Gastos)
      const beneficioNeto = ingresos - gastos;

      return {
        ...p,
        ingresos,
        gastos,
        amortizacion,
        beneficioNeto
      };
    });
  }, [properties, journalEntries, taxYear]);

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

  useEffect(() => {
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      
      const dataToExport = computedProperties.map(p => ({
        id: p.id,
        name: p.name || p.address || p.id,
        ingresos: p.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        gastos: p.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        amortizacion: p.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
        beneficioNeto: p.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
      }));

      if (format === 'pdf') {
        const allColumns = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre del Activo', dataKey: 'name' },
          { header: 'Ingresos', dataKey: 'ingresos' },
          { header: 'Gastos', dataKey: 'gastos' },
          { header: 'Amortización', dataKey: 'amortizacion' },
          { header: 'Rendimiento Neto', dataKey: 'beneficioNeto' }
        ];
        const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(dataToExport, colsToExport, 'Reporte de Impuestos por Activo', 'impuestos_activos.pdf');
      } else {
        handleExportFormat(dataToExport, 'Impuestos por Activo', format);
      }
    };
    window.addEventListener('taxes-re:export', onExport);
    return () => window.removeEventListener('taxes-re:export', onExport);
  }, [computedProperties, visibleColumns]);

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
          <table style={{ zoom: tableZoom }} className="clean-table w-full">
            <thead>
              <tr>
                
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<TableHeaderWithFilter key="id" label="ID" columnKey="id" data={computedProperties} tableId="taxesRealEstate" />);
                    case 'name': return (<TableHeaderWithFilter key="name" label="Nombre del Activo" columnKey="name" data={computedProperties} tableId="taxesRealEstate" />);
                    case 'ingresos': return (<TableHeaderWithFilter key="ingresos" label="Ingresos" columnKey="ingresos" data={computedProperties} tableId="taxesRealEstate" />);
                    case 'gastos': return (<TableHeaderWithFilter key="gastos" label="Gastos" columnKey="gastos" data={computedProperties} tableId="taxesRealEstate" />);
                    case 'amortizacion': return (<TableHeaderWithFilter key="amortizacion" label="Amortización" columnKey="amortizacion" data={computedProperties} tableId="taxesRealEstate" />);
                    case 'beneficioNeto': return (<TableHeaderWithFilter key="beneficioNeto" label="Rendimiento Neto" columnKey="beneficioNeto" data={computedProperties} tableId="taxesRealEstate" />);
                    default: return null;
                    }
                  })}
    
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
                    
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<td
 key="id" className="p-2 text-center text-gray-500">{p.id.slice(0,5)}</td>);
                    case 'name': return (<td
 key="name" className="p-2">{p.name || p.address}</td>);
                    case 'ingresos': return (<td
 key="ingresos" className="p-2 text-right">
                        {p.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'gastos': return (<td
 key="gastos" className="p-2 text-right">
                        {p.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'amortizacion': return (<td
 key="amortizacion" className="p-2 text-right">
                        {p.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    case 'beneficioNeto': return (<td
 key="beneficioNeto" className="p-2 text-right">
                        {p.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>);
                    default: return null;
                    }
                  })}
    
                  </tr>
                );
              })}
              {computedProperties.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="p-8 text-center text-gray-500 italic">
                    No hay inversiones inmobiliarias registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>



      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] shrink-0">
        <div>{computedProperties.length} activos encontrados</div>
        <ZoomControl />
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

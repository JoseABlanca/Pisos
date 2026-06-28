import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOutletContext } from 'react-router-dom';
import TaxesExtractModal from '../components/TaxesExtractModal';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import { handleExportFormat } from '../utils/exportUtils';

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
  
  const [selectedIncomeCecos, setSelectedIncomeCecos] = useState([]);
  const [selectedExpenseCecos, setSelectedExpenseCecos] = useState([]);

  useEffect(() => {
    if (selectedProperty) {
      const latest = properties.find(p => p.id === selectedProperty.id);
      setSelectedIncomeCecos(latest?.taxIncomeCecos || []);
      setSelectedExpenseCecos(latest?.taxExpenseCecos || []);
    } else {
      setSelectedIncomeCecos([]);
      setSelectedExpenseCecos([]);
    }
  }, [selectedProperty, properties]);

  const handleSaveCecos = async () => {
    if (!selectedProperty) return;
    try {
      const docRef = doc(db, 'properties', selectedProperty.id);
      await updateDoc(docRef, {
        taxIncomeCecos: selectedIncomeCecos,
        taxExpenseCecos: selectedExpenseCecos
      });
      alert('Configuración de CECOs guardada correctamente.');
    } catch (err) {
      console.error("Error al guardar CECOs de impuestos:", err);
      alert("Error al guardar configuración: " + err.message);
    }
  };

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
  const { visibleColumns } = useTableColumns('taxesRealEstate', DEFAULT_COLUMNS);

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

            let matches = false;
            if (l.cebe && normalizedPropCebe) {
              const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              if (lineCebe.startsWith(normalizedPropCebe)) {
                matches = true;
              }
            }
            if (!matches && l.ceco && normalizedIncomeCecos.length > 0) {
              const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normalizedIncomeCecos.some(c => lineCeco.startsWith(c))) {
                matches = true;
              }
            }

            if (matches) {
              entryIngresos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              hasLineMatch = true;
            }
          });
        }

        // Fallback for global match
        if (!hasLineMatch) {
          let globalMatch = false;
          if (normalizedPropCebe && entry.cebe) {
            const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (entryCebe.startsWith(normalizedPropCebe)) {
              globalMatch = true;
            }
          }
          if (!globalMatch && normalizedIncomeCecos.length > 0 && entry.ceco) {
            const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) {
              globalMatch = true;
            }
          }

          if (globalMatch) {
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

            if (l.ceco && normalizedExpenseCecos.length > 0) {
              const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
              if (normalizedExpenseCecos.some(c => lineCeco.startsWith(c))) {
                entryGastos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
                hasLineMatch = true;
              }
            }
          });
        }

        // Fallback for global match
        if (!hasLineMatch && normalizedExpenseCecos.length > 0 && entry.ceco) {
          const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
          if (normalizedExpenseCecos.some(c => entryCeco.startsWith(c))) {
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
          journalEntries.forEach(entry => {
            if (!entry.isImpuesto) return;
            let match = false;
            if (entry.lines) {
              entry.lines.forEach(l => {
                if (l.cebe) {
                  const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
                  if (lineCebe.startsWith(normalizedPropCebe)) match = true;
                }
              });
            }
            if (!match && entry.cebe) {
              const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
              if (entryCebe.startsWith(normalizedPropCebe)) match = true;
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
          <table className="clean-table w-full">
            <thead>
              <tr>
                {visibleColumns.includes('id') && <th className="p-2 font-bold uppercase w-16 text-center">ID</th>}
                {visibleColumns.includes('name') && <th className="p-2 font-bold uppercase text-left">Nombre del Activo</th>}
                {visibleColumns.includes('ingresos') && <th className="p-2 font-bold uppercase text-right">Ingresos ({taxYear})</th>}
                {visibleColumns.includes('gastos') && <th className="p-2 font-bold uppercase text-right">Gastos ({taxYear})</th>}
                {visibleColumns.includes('amortizacion') && <th className="p-2 font-bold uppercase text-right">Amortización ({taxYear})</th>}
                {visibleColumns.includes('beneficioNeto') && <th className="p-2 font-bold uppercase text-right">Rendimiento Neto</th>}
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
                    {visibleColumns.includes('id') && <td className="p-2 text-center text-gray-500">{p.id.slice(0,5)}</td>}
                    {visibleColumns.includes('name') && <td className="p-2">{p.name || p.address}</td>}
                    {visibleColumns.includes('ingresos') && (
                      <td className="p-2 text-right">
                        {p.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    )}
                    {visibleColumns.includes('gastos') && (
                      <td className="p-2 text-right">
                        {p.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    )}
                    {visibleColumns.includes('amortizacion') && (
                      <td className="p-2 text-right">
                        {p.amortizacion.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    )}
                    {visibleColumns.includes('beneficioNeto') && (
                      <td className="p-2 text-right">
                        {p.beneficioNeto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    )}
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

      {/* CECO Configuration Panel */}
      {selectedProperty && (
        <div className="bg-[#f0f0f0] border border-gray-400 m-2 p-3 win-bevel flex flex-col gap-2 shrink-0 text-left">
          <div className="flex justify-between items-center border-b border-gray-400 pb-1.5">
            <h4 className="text-[11px] font-bold text-slate-800 uppercase italic">
              Configuración de CECOs para Impuestos: {selectedProperty.name || selectedProperty.address || selectedProperty.id}
            </h4>
            <button 
              type="button" 
              onClick={handleSaveCecos}
              className="px-4 py-1 bg-[#2e7d32] hover:bg-[#1b5e20] text-white text-[10px] font-bold uppercase shadow-sm cursor-pointer border border-green-800 rounded"
            >
              Guardar Configuración
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Income CECOs Selection */}
            <div className="bg-white border border-gray-400 p-2 max-h-[120px] overflow-y-auto">
              <div className="text-[9px] font-bold text-slate-600 uppercase border-b border-gray-200 pb-0.5 mb-1.5">
                CECOs para Ingresos (Multielección)
              </div>
              <div className="flex flex-col gap-1">
                {cecos.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic">No hay CECOs registrados</span>
                ) : (
                  cecos.sort((a,b) => a.code.localeCompare(b.code)).map(c => {
                    const isChecked = selectedIncomeCecos.includes(c.code);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-slate-50 select-none">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            setSelectedIncomeCecos(prev => 
                              prev.includes(c.code) ? prev.filter(code => code !== c.code) : [...prev, c.code]
                            );
                          }}
                          className="w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-mono font-bold text-slate-800">{c.code}</span>
                        <span className="text-gray-500 font-sans">- {c.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Expense CECOs Selection */}
            <div className="bg-white border border-gray-400 p-2 max-h-[120px] overflow-y-auto">
              <div className="text-[9px] font-bold text-slate-600 uppercase border-b border-gray-200 pb-0.5 mb-1.5">
                CECOs para Gastos (Multielección)
              </div>
              <div className="flex flex-col gap-1">
                {cecos.length === 0 ? (
                  <span className="text-[10px] text-slate-400 italic">No hay CECOs registrados</span>
                ) : (
                  cecos.sort((a,b) => a.code.localeCompare(b.code)).map(c => {
                    const isChecked = selectedExpenseCecos.includes(c.code);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-slate-50 select-none">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            setSelectedExpenseCecos(prev => 
                              prev.includes(c.code) ? prev.filter(code => code !== c.code) : [...prev, c.code]
                            );
                          }}
                          className="w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-mono font-bold text-slate-800">{c.code}</span>
                        <span className="text-gray-500 font-sans">- {c.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] shrink-0">
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

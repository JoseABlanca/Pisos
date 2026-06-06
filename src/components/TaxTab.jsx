import { useState, useMemo } from 'react';
import { Plus, Trash2, FileText, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Receipt, Upload } from 'lucide-react';
import { db } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';

const INCOME_TYPES = [
  'Larga temporada (>1 año)',
  'Media temporada (1-12 meses)',
  'Corta temporada (<1 mes)',
  'Arrendamiento vacacional',
  'Subarrendamiento',
  'Otros ingresos',
];

const EXPENSE_TYPES = [
  'IBI',
  'Comunidad de propietarios',
  'Seguro de hogar',
  'Seguro de impago',
  'Reparaciones y mantenimiento',
  'Reformas',
  'Intereses hipotecarios',
  'Amortización del inmueble',
  'Gastos de gestión / Inmobiliaria',
  'Suministros (luz, agua, gas)',
  'Tasas y tributos municipales',
  'Gastos de formalización',
  'Otros gastos',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

function EntryRow({ entry, index, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files);
    const newDocs = files.map(f => ({
      name: f.name,
      url: URL.createObjectURL(f),
      date: new Date().toISOString().split('T')[0],
    }));
    onUpdate(index, { ...entry, docs: [...(entry.docs || []), ...newDocs] });
  };

  const removeDoc = (di) => {
    const docs = (entry.docs || []).filter((_, i) => i !== di);
    onUpdate(index, { ...entry, docs });
  };

  const isIncome = entry.kind === 'income';
  const rowColor = isIncome
    ? 'bg-green-50 border-green-200'
    : 'bg-red-50 border-red-200';
  const badgeColor = isIncome
    ? 'bg-green-100 text-green-700 border-green-300'
    : 'bg-red-100 text-red-700 border-red-300';

  return (
    <>
      <tr className={`border-b ${rowColor} text-[10px]`}>
        <td className="px-1 py-1 w-6">
          <button
            className="p-0.5 hover:bg-slate-200 rounded"
            onClick={() => setExpanded(v => !v)}
            title="Ver documentos"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        </td>
        <td className="px-1 py-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${badgeColor}`}>
            {isIncome ? 'INGRESO' : 'GASTO'}
          </span>
        </td>
        <td className="px-1 py-0.5">
          <div className="relative flex items-center w-full">
            <input
              type="text"
              className={`win-input w-full text-[10px] ${entry.isSyncedRental ? 'pr-14 font-bold bg-blue-50/30' : ''}`}
              value={entry.concept || ''}
              placeholder="Concepto..."
              onChange={e => onUpdate(index, { ...entry, concept: e.target.value })}
            />
            {entry.isSyncedRental && (
              <span className="absolute right-1 text-[7px] leading-none text-blue-600 bg-blue-100 border border-blue-200 px-1 py-0.5 rounded uppercase font-bold pointer-events-none select-none">
                Alquiler
              </span>
            )}
          </div>
        </td>
        <td className="px-1 py-0.5">
          <select
            className="win-input w-full text-[10px]"
            value={entry.type || ''}
            onChange={e => onUpdate(index, { ...entry, type: e.target.value })}
          >
            <option value="">— Tipo —</option>
            {(isIncome ? INCOME_TYPES : EXPENSE_TYPES).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </td>
        <td className="px-1 py-0.5 w-28">
          <input
            type="number"
            className="win-input w-full text-right font-mono text-[10px]"
            placeholder="0.00"
            value={entry.amount || ''}
            onChange={e => onUpdate(index, { ...entry, amount: e.target.value })}
          />
        </td>
        <td className="px-1 py-0.5 w-20">
          <input
            type="date"
            className="win-input w-full text-[10px]"
            value={entry.date || ''}
            onChange={e => onUpdate(index, { ...entry, date: e.target.value })}
          />
        </td>
        {!isIncome && (
          <td className="px-1 py-0.5 text-center w-16">
            <label className="flex items-center justify-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                className="w-3 h-3"
                checked={!!entry.deductible}
                onChange={e => onUpdate(index, { ...entry, deductible: e.target.checked })}
              />
              <span className={`text-[9px] font-bold ${entry.deductible ? 'text-green-700' : 'text-slate-400'}`}>
                {entry.deductible ? 'Sí' : 'No'}
              </span>
            </label>
          </td>
        )}
        {isIncome && <td className="w-16" />}
        <td className="px-1 py-0.5 text-center w-8">
          <span className="text-[9px] text-slate-500 font-mono">{(entry.docs || []).length}</span>
          <FileText className="w-3 h-3 inline ml-1 text-slate-400" />
        </td>
        <td className="px-1 py-0.5 text-center w-8">
          <button
            className="p-1 hover:bg-red-600 hover:text-white rounded transition-colors"
            onClick={() => onDelete(index)}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className={`border-b ${rowColor}`}>
          <td colSpan={9} className="px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-600 uppercase">Documentos:</span>
              <label className="btn-classic px-2 py-0.5 text-[10px] flex items-center gap-1 cursor-pointer">
                <Upload className="w-3 h-3" /> Adjuntar
                <input type="file" multiple className="hidden" onChange={handleDocUpload} />
              </label>
              <div className="flex flex-wrap gap-1 ml-2">
                {(entry.docs || []).length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">Sin documentos adjuntos</span>
                )}
                {(entry.docs || []).map((d, di) => (
                  <div key={di} className="flex items-center gap-1 bg-white border border-[#808080] px-2 py-0.5 text-[10px]">
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-700 underline max-w-[120px] truncate">{d.name}</a>
                    <button onClick={() => removeDoc(di)} className="text-red-500 hover:text-red-700 ml-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function TaxTab({ formData, setFormData, rentals = [] }) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [activeKind, setActiveKind] = useState('all'); // 'all' | 'income' | 'expense'

  // Dynamically consolidate manual and synced rental taxes in real-time
  const taxes = useMemo(() => {
    if (!formData || !formData.id) {
      console.log("TaxTab: formData or formData.id is missing:", formData);
      return [];
    }
    
    // 1. Get manually created taxes on the property (filter out any synced rental flags to be safe)
    const manualTaxes = (formData.taxes || []).filter(t => !t.isSyncedRental);
    
    // 2. Extract synced taxes from all rentals of this property
    const propertyRentals = rentals.filter(r => r.propertyId === formData.id);
    const rentalTaxes = [];
    
    console.log("TaxTab Consolidation:", {
      propertyId: formData.id,
      propertyName: formData.name,
      totalRentals: rentals.length,
      propertyRentalsCount: propertyRentals.length,
      manualTaxesCount: manualTaxes.length
    });
    
    propertyRentals.forEach(rental => {
      const tenantName = (rental.tenants || []).map(t => t.name).join(', ') || '(Sin inquilino)';
      const rentalName = rental.name || `Alquiler - ${tenantName}`;
      
      if (Array.isArray(rental.incomeItems)) {
        rental.incomeItems.forEach((item, idx) => {
          if (item.isTax) {
            const docObj = item.doc && Array.isArray(rental.documents)
              ? rental.documents.find(d => d.name === item.doc)
              : null;
            
            rentalTaxes.push({
              id: item.taxId || `tax-inc-${rental.id}-${idx}`,
              kind: 'income',
              concept: item.name || 'Ingreso por alquiler',
              type: 'Otros ingresos',
              amount: parseFloat(item.amount) || 0,
              date: item.date || '',
              deductible: undefined,
              docs: item.doc ? [{ name: item.doc, date: item.date || '', url: docObj ? docObj.url : undefined }] : [],
              isSyncedRental: true,
              rentalId: rental.id
            });
          }
        });
      }
      
      if (Array.isArray(rental.expenseItems)) {
        rental.expenseItems.forEach((item, idx) => {
          if (item.isTax) {
            const docObj = item.doc && Array.isArray(rental.documents)
              ? rental.documents.find(d => d.name === item.doc)
              : null;

            rentalTaxes.push({
              id: item.taxId || `tax-exp-${rental.id}-${idx}`,
              kind: 'expense',
              concept: item.name || 'Gasto por alquiler',
              type: 'Otros gastos',
              amount: parseFloat(item.amount) || 0,
              date: item.date || '',
              deductible: true,
              docs: item.doc ? [{ name: item.doc, date: item.date || '', url: docObj ? docObj.url : undefined }] : [],
              isSyncedRental: true,
              rentalId: rental.id
            });
          }
        });
      }
    });
    
    console.log("TaxTab Resulting consolidated taxes:", {
      totalTaxes: manualTaxes.length + rentalTaxes.length,
      rentalTaxesCount: rentalTaxes.length
    });
    
    return [...manualTaxes, ...rentalTaxes];
  }, [formData.taxes, rentals, formData.id]);

  const updateEntry = async (index, updated) => {
    const originalEntry = taxes[index];
    if (originalEntry && originalEntry.isSyncedRental) {
      const rental = rentals.find(r => r.id === originalEntry.rentalId);
      if (!rental) return;

      const isIncome = originalEntry.kind === 'income';
      const itemsField = isIncome ? 'incomeItems' : 'expenseItems';
      const items = [...(rental[itemsField] || [])];
      
      const itemIdx = items.findIndex(item => item.taxId === originalEntry.id);
      if (itemIdx === -1) return;

      // Handle document updates/uploads from the Taxes tab
      let updatedDocName = items[itemIdx].doc || null;
      let updatedRentalDocs = rental.documents || [];
      if (updated.docs && updated.docs.length > (originalEntry.docs || []).length) {
        const newDocs = updated.docs.filter(d => !(originalEntry.docs || []).some(od => od.name === d.name));
        if (newDocs.length > 0) {
          const newDoc = newDocs[0];
          updatedDocName = newDoc.name;
          const isDocDuplicate = updatedRentalDocs.some(d => d.name === newDoc.name);
          if (!isDocDuplicate) {
            updatedRentalDocs = [...updatedRentalDocs, {
              name: newDoc.name,
              date: newDoc.date || new Date().toISOString().split('T')[0],
              size: '0.0 KB',
              url: newDoc.url,
              type: 'application/octet-stream'
            }];
          }
        }
      } else if (updated.docs && updated.docs.length < (originalEntry.docs || []).length) {
        updatedDocName = null;
      }

      items[itemIdx] = {
        ...items[itemIdx],
        name: updated.concept,
        amount: parseFloat(updated.amount) || 0,
        date: updated.date,
        doc: updatedDocName,
        taxType: updated.type || '',
        deductible: updated.deductible !== undefined ? !!updated.deductible : true,
        isTax: true,
        taxId: originalEntry.id
      };

      try {
        await setDoc(doc(db, 'rentals', rental.id), { ...rental, [itemsField]: items, documents: updatedRentalDocs }, { merge: true });
      } catch (err) {
        console.error("Error updating synced rental from Taxes tab:", err);
      }
      return;
    }

    const manualTaxes = formData.taxes || [];
    const newTaxes = manualTaxes.map(t => {
      if (t.id && originalEntry.id && t.id === originalEntry.id) {
        return updated;
      }
      if (t.concept === originalEntry.concept && t.date === originalEntry.date) {
        return updated;
      }
      return t;
    });
    setFormData({ ...formData, taxes: newTaxes });
  };

  const deleteEntry = async (index) => {
    const originalEntry = taxes[index];
    if (!window.confirm('¿Eliminar este registro de impuestos?')) return;

    if (originalEntry && originalEntry.isSyncedRental) {
      const rental = rentals.find(r => r.id === originalEntry.rentalId);
      if (!rental) return;

      const isIncome = originalEntry.kind === 'income';
      const itemsField = isIncome ? 'incomeItems' : 'expenseItems';
      const items = [...(rental[itemsField] || [])];
      
      const itemIdx = items.findIndex(item => item.taxId === originalEntry.id);
      if (itemIdx === -1) return;

      items[itemIdx].isTax = false;
      items[itemIdx].taxId = null;

      try {
        await setDoc(doc(db, 'rentals', rental.id), { ...rental, [itemsField]: items }, { merge: true });
      } catch (err) {
        console.error("Error removing synced rental tax from Taxes tab:", err);
      }
      return;
    }

    const manualTaxes = formData.taxes || [];
    const newTaxes = manualTaxes.filter(t => {
      if (t.id && originalEntry.id) {
        return t.id !== originalEntry.id;
      }
      return !(t.concept === originalEntry.concept && t.date === originalEntry.date);
    });
    setFormData({ ...formData, taxes: newTaxes });
  };

  const addEntry = (kind) => {
    const newEntry = {
      id: `tax-man-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      kind,
      concept: '',
      type: '',
      amount: '',
      date: `${selectedYear}-01-01`,
      deductible: kind === 'expense' ? true : undefined,
      docs: [],
    };
    const manualTaxes = formData.taxes || [];
    setFormData({ ...formData, taxes: [...manualTaxes, newEntry] });
  };

  // Filter by year (from date field) and kind
  const filteredEntries = taxes.map((e, i) => ({ ...e, _idx: i })).filter(e => {
    const year = e.date ? parseInt(e.date.split('-')[0]) : null;
    const yearMatch = year === selectedYear;
    const kindMatch = activeKind === 'all' || e.kind === activeKind;
    return yearMatch && kindMatch;
  });

  // Yearly summary across all years
  const yearlySummary = useMemo(() => {
    const map = {};
    taxes.forEach(e => {
      const year = e.date ? parseInt(e.date.split('-')[0]) : null;
      if (!year) return;
      if (!map[year]) map[year] = { income: 0, expense: 0, deductibleExpense: 0 };
      const amount = parseFloat(e.amount) || 0;
      if (e.kind === 'income') {
        map[year].income += amount;
      } else {
        map[year].expense += amount;
        if (e.deductible) map[year].deductibleExpense += amount;
      }
    });
    return Object.entries(map).sort((a, b) => b[0] - a[0]).map(([year, vals]) => ({
      year,
      ...vals,
      netDeclare: vals.income - vals.deductibleExpense,
      netTotal: vals.income - vals.expense,
    }));
  }, [taxes]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-[#d4d0c8] border border-[#808080] p-1">
          <span className="text-[10px] font-bold uppercase text-slate-600">Año:</span>
          <select
            className="win-input w-24 text-[10px]"
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
          >
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex bg-[#d4d0c8] border border-[#808080] p-0.5 gap-0.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'income', label: 'Ingresos' },
            { id: 'expense', label: 'Gastos' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setActiveKind(opt.id)}
              className={`px-3 py-1 text-[9px] font-bold uppercase transition-colors ${
                activeKind === opt.id ? 'bg-[#000080] text-white' : 'hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 ml-auto">
          <button
            className="btn-classic px-3 h-7 flex items-center gap-1 text-[10px]"
            onClick={() => addEntry('income')}
          >
            <TrendingUp className="w-3.5 h-3.5 text-green-700" />
            <span className="font-bold">+ Ingreso</span>
          </button>
          <button
            className="btn-classic px-3 h-7 flex items-center gap-1 text-[10px]"
            onClick={() => addEntry('expense')}
          >
            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
            <span className="font-bold">+ Gasto</span>
          </button>
        </div>
      </div>

      {/* Entries table */}
      <div className="border border-[#808080] bg-white overflow-auto max-h-[300px]">
        <table className="win-table w-full text-[10px]">
          <thead>
            <tr className="sticky top-0 z-10">
              <th className="w-6"></th>
              <th className="w-16">Tipo</th>
              <th>Concepto</th>
              <th className="w-40">Categoría</th>
              <th className="w-28 text-right">Importe (€)</th>
              <th className="w-24">Fecha</th>
              <th className="w-16 text-center">Deducible</th>
              <th className="w-10 text-center">Docs</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-400 italic text-[11px]">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No hay registros fiscales para {selectedYear}
                </td>
              </tr>
            ) : (
              filteredEntries.map(entry => (
                <EntryRow
                  key={entry._idx}
                  entry={entry}
                  index={entry._idx}
                  onUpdate={updateEntry}
                  onDelete={deleteEntry}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Yearly summary */}
      <div className="border border-[#808080] bg-[#f8f8f8]">
        <div className="bg-[#4a69bd] text-white text-[10px] px-2 py-1 font-bold uppercase tracking-wide flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" />
          Resumen Fiscal por Año
        </div>
        {yearlySummary.length === 0 ? (
          <div className="py-6 text-center text-slate-400 italic text-[11px]">
            Sin datos fiscales registrados
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="win-table w-full text-[10px]">
              <thead>
                <tr>
                  <th>Año</th>
                  <th className="text-right text-green-800">Ingresos</th>
                  <th className="text-right text-red-700">Gastos Totales</th>
                  <th className="text-right text-orange-700">Gastos Deducibles</th>
                  <th className="text-right text-blue-900 font-bold">Base a Declarar</th>
                  <th className="text-right text-slate-600">Resultado Neto</th>
                </tr>
              </thead>
              <tbody>
                {yearlySummary.map(({ year, income, expense, deductibleExpense, netDeclare, netTotal }) => (
                  <tr key={year} className="border-b border-[#e0e0e0] hover:bg-blue-50">
                    <td className="font-bold text-slate-700">{year}</td>
                    <td className="text-right font-mono text-green-700">
                      {income.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="text-right font-mono text-red-600">
                      -{expense.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className="text-right font-mono text-orange-600">
                      -{deductibleExpense.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className={`text-right font-mono font-bold text-[11px] ${netDeclare >= 0 ? 'text-blue-900' : 'text-green-700'}`}>
                      {netDeclare.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                    <td className={`text-right font-mono ${netTotal >= 0 ? 'text-slate-700' : 'text-green-700'}`}>
                      {netTotal.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#e8e8e8] font-bold border-t-2 border-[#808080]">
                  <td className="text-[9px] uppercase italic">TOTAL GLOBAL</td>
                  <td className="text-right font-mono text-green-800">
                    {yearlySummary.reduce((s, r) => s + r.income, 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="text-right font-mono text-red-700">
                    -{yearlySummary.reduce((s, r) => s + r.expense, 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="text-right font-mono text-orange-700">
                    -{yearlySummary.reduce((s, r) => s + r.deductibleExpense, 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="text-right font-mono text-blue-900">
                    {yearlySummary.reduce((s, r) => s + r.netDeclare, 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                  <td className="text-right font-mono text-slate-700">
                    {yearlySummary.reduce((s, r) => s + r.netTotal, 0).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {/* Legend */}
        <div className="px-3 py-1.5 border-t border-[#d0d0d0] flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-[9px] text-slate-500 italic">
            <strong className="text-blue-900">Base a declarar</strong> = Ingresos − Gastos Deducibles
          </span>
          <span className="text-[9px] text-slate-500 italic">
            <strong>Resultado neto</strong> = Ingresos − Todos los gastos
          </span>
        </div>
      </div>
    </div>
  );
}

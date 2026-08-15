import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, addDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { registerJournalEntry, deleteJournalEntry } from '../services/accounting';
import { Calculator, Play, RotateCcw, AlertTriangle, CheckCircle, Info, RefreshCw, Layers } from 'lucide-react';

export default function ClosingModule() {
  const { user, queryUserIds } = useAuth();
  const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user ? user.uid : ''];

  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // UI state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // 1. Fetch live accounts and journal entries
  useEffect(() => {
    if (!user) return;

    const unsubAcc = onSnapshot(query(collection(db, 'accounts'), where('userId', 'in', targetUserIds)), snap => {
      setAccounts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    const unsubJournal = onSnapshot(query(collection(db, 'journal_entries'), where('userId', 'in', targetUserIds)), snap => {
      setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    // Assume loaded after first snapshot
    const timer = setTimeout(() => setLoadingData(false), 800);

    return () => {
      unsubAcc();
      unsubJournal();
      clearTimeout(timer);
    };
  }, [user, queryUserIds]);

  // 2. Determine closing status for the selected year
  // We check if there are system closing/opening entries in the database for the selected year
  const systemEntries = useMemo(() => {
    return journalEntries.filter(entry => 
      entry.closingYear === selectedYear && 
      entry.isClosingSystemEntry === true
    );
  }, [journalEntries, selectedYear]);

  const isClosed = systemEntries.length > 0;

  // 3. Available years dropdown (based on actual journal entries)
  const availableYears = useMemo(() => {
    const yearsSet = new Set([new Date().getFullYear() - 1, new Date().getFullYear()]);
    journalEntries.forEach(entry => {
      if (entry.date) {
        const y = new Date(entry.date).getFullYear();
        if (!isNaN(y)) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [journalEntries]);

  // 4. Calculate estimated metrics for the selected year (before closing)
  const estimatedMetrics = useMemo(() => {
    const startLimit = `${selectedYear}-01-01`;
    const endLimit = `${selectedYear}-12-31`;

    let revenues = 0;
    let expenses = 0;

    // Filter journal entries inside the selected year, excluding system closing entries
    journalEntries.forEach(entry => {
      if (entry.date && entry.date >= startLimit && entry.date <= endLimit && !entry.isClosingSystemEntry) {
        if (entry.lines) {
          entry.lines.forEach(line => {
            const acc = accounts.find(a => a.id === line.accountId || a.code === line.accountCode);
            if (!acc) return;
            const debit = parseFloat(line.debit) || 0;
            const credit = parseFloat(line.credit) || 0;
            
            if (acc.type === 'Ingreso') {
              revenues += (credit - debit);
            } else if (acc.type === 'Gasto') {
              expenses += (debit - credit);
            }
          });
        }
      }
    });

    return {
      revenues,
      expenses,
      result: revenues - expenses
    };
  }, [journalEntries, accounts, selectedYear]);

  // 5. Generate Closing and Opening Seats
  const handleGenerate = async () => {
    if (!user) return;
    if (isClosed) {
      alert("El ejercicio ya se encuentra cerrado.");
      return;
    }

    const confirmMsg = `¿Estás seguro de que deseas realizar el cierre contable del ejercicio ${selectedYear}?\n\n` +
      `Se generarán automáticamente 3 asientos:\n` +
      `1. Asiento de Regularización (Grupo 6 y 7 a la cuenta 129)\n` +
      `2. Asiento de Cierre (Cierre de cuentas de balance)\n` +
      `3. Asiento de Apertura (Apertura del ejercicio siguiente en fecha ${selectedYear + 1}-01-01)\n\n` +
      `Este proceso actualizará los saldos de tus cuentas. Podrás revertirlo en cualquier momento.`;

    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    setStatusMessage("Verificando catálogo de cuentas...");

    try {
      // Step A: Ensure regularization account '129 - Resultado del ejercicio' exists
      let account129 = accounts.find(a => String(a.code) === '129');
      if (!account129) {
        setStatusMessage("Creando cuenta '129 - Resultado del ejercicio'...");
        // Find parent of group 1
        const group1Acc = accounts.find(a => String(a.code) === '1');
        const parentId = group1Acc ? group1Acc.id : null;

        const newAccRef = await addDoc(collection(db, 'accounts'), {
          code: '129',
          name: 'Resultado del ejercicio',
          parentId,
          type: 'Patrimonio',
          userId: user.uid,
          balance_actual: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          order: Date.now()
        });
        
        // Populate local object for subsequent steps
        account129 = {
          id: newAccRef.id,
          code: '129',
          name: 'Resultado del ejercicio',
          type: 'Patrimonio'
        };
        setStatusMessage("Cuenta 129 creada con éxito.");
      }

      // Step B: Calculate final balances of all accounts as of the closing date
      setStatusMessage("Calculando saldos de cierre...");
      const finalBalances = {};
      accounts.forEach(acc => {
        finalBalances[acc.id] = 0;
      });
      if (account129.id) {
        finalBalances[account129.id] = 0;
      }

      // Sum all journal entries up to selectedYear-12-31, EXCLUDING system entries
      const startLimit = `${selectedYear}-01-01`;
      const endLimit = `${selectedYear}-12-31`;

      journalEntries.forEach(entry => {
        if (!entry.date || entry.date > endLimit || entry.isClosingSystemEntry) return;

        const entryYear = new Date(entry.date).getFullYear();

        if (entry.lines) {
          entry.lines.forEach(line => {
            const acc = accounts.find(a => a.id === line.accountId || a.code === line.accountCode);
            if (!acc) return;

            // Income/Expense are year-bound, Balance sheet accounts are all-time cumulative
            const isIncomeExpense = ['Ingreso', 'Gasto'].includes(acc.type);
            if (isIncomeExpense && entryYear !== selectedYear) return;

            const debit = parseFloat(line.debit) || 0;
            const credit = parseFloat(line.credit) || 0;
            const isAssetOrExpense = ['Activo', 'Gasto'].includes(acc.type);
            const change = isAssetOrExpense ? (debit - credit) : (credit - debit);

            finalBalances[acc.id] = (finalBalances[acc.id] || 0) + change;
          });
        }
      });

      // Step C: Regularization Entry (Revenues and Expenses to 129)
      setStatusMessage("Generando asiento de Regularización...");
      const regLines = [];
      let totalRegDebit = 0;
      let totalRegCredit = 0;

      accounts.forEach(acc => {
        const bal = finalBalances[acc.id] || 0;
        if (Math.abs(bal) < 0.01) return;

        if (acc.type === 'Ingreso') {
          // Revenues increase on Credit. To close them, we Debit them
          regLines.push({
            accountId: acc.id,
            accountCode: acc.code,
            debit: Math.abs(bal),
            credit: 0,
            description: `Regularización: Cierre de ${acc.name}`
          });
          totalRegDebit += Math.abs(bal);
        } else if (acc.type === 'Gasto') {
          // Expenses increase on Debit. To close them, we Credit them
          regLines.push({
            accountId: acc.id,
            accountCode: acc.code,
            debit: 0,
            credit: Math.abs(bal),
            description: `Regularización: Cierre de ${acc.name}`
          });
          totalRegCredit += Math.abs(bal);
        }
      });

      if (regLines.length > 0) {
        // Calculate result and post to 129
        const result = totalRegDebit - totalRegCredit; // (Revenues Debited - Expenses Credited)
        if (result > 0) {
          // Loss: Debit 129
          regLines.push({
            accountId: account129.id,
            accountCode: '129',
            debit: result,
            credit: 0,
            description: `Pérdidas y ganancias - Ejercicio ${selectedYear}`
          });
          finalBalances[account129.id] = (finalBalances[account129.id] || 0) - result;
        } else if (result < 0) {
          // Profit: Credit 129
          regLines.push({
            accountId: account129.id,
            accountCode: '129',
            debit: 0,
            credit: Math.abs(result),
            description: `Pérdidas y ganancias - Ejercicio ${selectedYear}`
          });
          finalBalances[account129.id] = (finalBalances[account129.id] || 0) + Math.abs(result);
        }

        // Register Regularization Entry
        const regRes = await registerJournalEntry(
          user.uid,
          `Regularización de pérdidas y ganancias - Ejercicio ${selectedYear}`,
          regLines,
          `${selectedYear}-12-31`,
          null
        );

        // Add custom metadata
        const regDocRef = doc(db, 'journal_entries', regRes.id);
        const batch = writeBatch(db);
        batch.update(regDocRef, {
          closingYear: selectedYear,
          closingType: 'regularization',
          isClosingSystemEntry: true
        });
        await batch.commit();
      }

      // Step D: Closing Entry (Asset, Liability, Equity to 0)
      setStatusMessage("Generando asiento de Cierre...");
      const closeLines = [];
      let totalCloseDebit = 0;
      let totalCloseCredit = 0;

      // Group 1-5 accounts, including 129
      const balanceAccounts = accounts.filter(a => ['Activo', 'Pasivo', 'Patrimonio'].includes(a.type));
      if (!balanceAccounts.some(a => a.id === account129.id)) {
        balanceAccounts.push(account129);
      }

      balanceAccounts.forEach(acc => {
        const bal = finalBalances[acc.id] || 0;
        if (Math.abs(bal) < 0.01) return;

        const isAsset = acc.type === 'Activo';
        
        if (isAsset) {
          // Assets have Debit balance. To close, we Credit them.
          if (bal > 0) {
            closeLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: 0,
              credit: bal,
              description: `Cierre de cuenta: ${acc.name}`
            });
            totalCloseCredit += bal;
          } else {
            closeLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: Math.abs(bal),
              credit: 0,
              description: `Cierre de cuenta: ${acc.name}`
            });
            totalCloseDebit += Math.abs(bal);
          }
        } else {
          // Liabilities & Equity have Credit balance. To close, we Debit them.
          if (bal > 0) {
            closeLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: bal,
              credit: 0,
              description: `Cierre de cuenta: ${acc.name}`
            });
            totalCloseDebit += bal;
          } else {
            closeLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: 0,
              credit: Math.abs(bal),
              description: `Cierre de cuenta: ${acc.name}`
            });
            totalCloseCredit += Math.abs(bal);
          }
        }
      });

      if (closeLines.length > 0) {
        // Balance the entry just in case of rounding
        const diff = Math.abs(totalCloseDebit - totalCloseCredit);
        if (diff > 0.005) {
          console.warn(`Cierre entry off by: ${diff}`);
        }

        const closeRes = await registerJournalEntry(
          user.uid,
          `Asiento de cierre de cuentas - Ejercicio ${selectedYear}`,
          closeLines,
          `${selectedYear}-12-31`,
          null
        );

        const closeDocRef = doc(db, 'journal_entries', closeRes.id);
        const batch = writeBatch(db);
        batch.update(closeDocRef, {
          closingYear: selectedYear,
          closingType: 'close',
          isClosingSystemEntry: true
        });
        await batch.commit();
      }

      // Step E: Opening Entry (Apertura next year)
      setStatusMessage("Generando asiento de Apertura...");
      const openLines = [];
      let totalOpenDebit = 0;
      let totalOpenCredit = 0;

      balanceAccounts.forEach(acc => {
        const bal = finalBalances[acc.id] || 0;
        if (Math.abs(bal) < 0.01) return;

        const isAsset = acc.type === 'Activo';

        if (isAsset) {
          // Opening: Debit Assets
          if (bal > 0) {
            openLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: bal,
              credit: 0,
              description: `Apertura de cuenta: ${acc.name}`
            });
            totalOpenDebit += bal;
          } else {
            openLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: 0,
              credit: Math.abs(bal),
              description: `Apertura de cuenta: ${acc.name}`
            });
            totalOpenCredit += Math.abs(bal);
          }
        } else {
          // Opening: Credit Liabilities/Equity
          if (bal > 0) {
            openLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: 0,
              credit: bal,
              description: `Apertura de cuenta: ${acc.name}`
            });
            totalOpenCredit += bal;
          } else {
            openLines.push({
              accountId: acc.id,
              accountCode: acc.code,
              debit: Math.abs(bal),
              credit: 0,
              description: `Apertura de cuenta: ${acc.name}`
            });
            totalOpenDebit += Math.abs(bal);
          }
        }
      });

      if (openLines.length > 0) {
        const openRes = await registerJournalEntry(
          user.uid,
          `Asiento de apertura de cuentas - Ejercicio ${selectedYear + 1}`,
          openLines,
          `${selectedYear + 1}-01-01`,
          null
        );

        const openDocRef = doc(db, 'journal_entries', openRes.id);
        const batch = writeBatch(db);
        batch.update(openDocRef, {
          closingYear: selectedYear,
          closingType: 'open',
          isClosingSystemEntry: true
        });
        await batch.commit();
      }

      setStatusMessage('');
      alert(`El cierre del ejercicio ${selectedYear} y la apertura del ejercicio ${selectedYear + 1} se han realizado con éxito.`);
    } catch (e) {
      console.error(e);
      alert("Error durante la generación de cierre y apertura: " + e.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  // 6. Rollback (Delete Closing and Opening entries)
  const handleRollback = async () => {
    if (!user) return;
    if (!isClosed) return;

    if (!window.confirm(`¿Estás seguro de que deseas eliminar el cierre y la apertura del ejercicio ${selectedYear}?\n\nEsto restaurará los saldos de tus cuentas a su estado anterior y eliminará los 3 asientos del diario.`)) {
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Revirtiendo cierre y apertura...");

    try {
      // Sort entries by type so we delete Apertura first, then Cierre, then Regularización
      const sortedSystemEntries = [...systemEntries].sort((a, b) => {
        const order = { 'open': 1, 'close': 2, 'regularization': 3 };
        return (order[a.closingType] || 4) - (order[b.closingType] || 4);
      });

      for (const entry of sortedSystemEntries) {
        setStatusMessage(`Eliminando asiento de ${entry.closingType}...`);
        await deleteJournalEntry(user.uid, entry.id, entry.lines || []);
      }

      alert("Cierre y apertura eliminados con éxito. Se han restaurado todos los saldos contables.");
    } catch (e) {
      console.error(e);
      alert("Error al revertir el cierre: " + e.message);
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] space-y-4">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <span className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Cargando datos contables...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-surface-lowest rounded-xl border border-outline-variant shadow-ambient">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-4">
        <div className="flex items-center space-x-3">
          <Layers className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-base font-black text-on-surface uppercase tracking-tight">Cierre de Ejercicio Contable</h2>
            <p className="text-xs text-on-surface-variant font-medium">Cierra el año fiscal y genera el asiento de apertura del siguiente año.</p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center space-x-2">
          <label className="text-[10px] font-black text-outline uppercase">Ejercicio:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            disabled={isProcessing}
            className="bg-surface-low border border-outline-variant/60 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:border-primary cursor-pointer"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isProcessing ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <span className="text-sm font-black text-primary uppercase tracking-widest animate-pulse">{statusMessage}</span>
        </div>
      ) : isClosed ? (
        <div className="space-y-6">
          
          {/* Closed State Banner */}
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 flex items-start space-x-4">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-black text-emerald-700 uppercase tracking-wider">Ejercicio Cerrado</h3>
              <p className="text-xs text-on-surface-variant">
                El ejercicio {selectedYear} ha sido cerrado correctamente. Los asientos de regularización, cierre y la apertura del {selectedYear + 1} están registrados en el diario.
              </p>
            </div>
          </div>

          {/* System Entries List */}
          <div className="bg-surface-low/50 rounded-xl border border-outline-variant p-4 space-y-4">
            <h4 className="text-[10px] font-black uppercase text-outline tracking-wider">Asientos Generados por el Cierre</h4>
            <div className="space-y-2">
              {systemEntries.map(entry => (
                <div key={entry.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 text-xs">
                  <div className="flex items-center space-x-3">
                    <div className="px-2 py-1 bg-slate-100 rounded text-[9px] font-bold uppercase text-slate-500 tracking-wider">
                      {entry.closingType}
                    </div>
                    <div className="font-bold text-slate-800">{entry.description}</div>
                  </div>
                  <div className="flex items-center space-x-4 font-mono text-slate-500 text-[10px]">
                    <span>Número: #{entry.number}</span>
                    <span>Fecha: {entry.date}</span>
                    <span className="font-bold text-slate-700">{(entry.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rollback Action */}
          <div className="flex justify-between items-center bg-red-500/5 border border-red-500/20 p-4 rounded-xl">
            <div className="flex items-start space-x-3 max-w-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-600 uppercase">¿Deseas reabrir el ejercicio?</h4>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Esta acción eliminará de forma segura los asientos de regularización, cierre y apertura para volver a modificar las cuentas.
                </p>
              </div>
            </div>
            <button
              onClick={handleRollback}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
            >
              Deshacer Cierre y Apertura
            </button>
          </div>

        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Estimated Metrics Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface-low p-5 rounded-xl border border-outline-variant/60">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-outline uppercase tracking-wider">Ingresos Estimados</span>
              <p className="text-xl font-bold text-slate-800">{estimatedMetrics.revenues.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-outline uppercase tracking-wider">Gastos Estimados</span>
              <p className="text-xl font-bold text-slate-800">{estimatedMetrics.expenses.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-outline uppercase tracking-wider">Resultado (129)</span>
              <p className={`text-xl font-black ${estimatedMetrics.result >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {estimatedMetrics.result >= 0 ? 'Beneficio: ' : 'Pérdida: '}
                {Math.abs(estimatedMetrics.result).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </p>
            </div>
          </div>

          {/* Warning Alert */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 flex items-start space-x-4">
            <Info className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-black text-amber-700 uppercase tracking-wider">Información Importante</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Asegúrate de que todos los asientos del ejercicio {selectedYear} hayan sido introducidos antes de proceder. 
                Al generar el cierre, las cuentas del grupo 6 y 7 serán saldadas a cero a fecha 31 de diciembre. Los saldos de activos, pasivos y patrimonio neto se transferirán al asiento de apertura a fecha 1 de enero de {selectedYear + 1}.
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              className="flex items-center space-x-2 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg text-xs font-black uppercase tracking-widest shadow-md transition-all"
            >
              <Play className="w-4 h-4" />
              <span>Generar Cierre y Apertura</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
}

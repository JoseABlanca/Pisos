import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { recalculateAllBalances } from '../services/accounting';
import ZoomControl from '../components/ZoomControl';
import { RefreshCw, Maximize2, X, PanelLeft, Scale, CalendarDays, Table, FileText, Search } from 'lucide-react';

export default function TrialBalance() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, balance: 0 });
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedQuickFilter, setSelectedQuickFilter] = useState(null);

  // Filters state
  const [filterFechaType, setFilterFechaType] = useState('Hasta este mes');
  const [filterTrimestre, setFilterTrimestre] = useState('Primer Trimestre');
  const [filterDateDesde, setFilterDateDesde] = useState('Apertura');
  const [filterDateHasta, setFilterDateHasta] = useState('Cierre');
  const [showSidebar, setShowSidebar] = useState(true);

  const [filterCuentaType, setFilterCuentaType] = useState('Todas');
  const [filterCuentaDesde, setFilterCuentaDesde] = useState('000.0.0.00');
  const [filterCuentaHasta, setFilterCuentaHasta] = useState('999.9.9.99');
  
  const [verOficiales, setVerOficiales] = useState(true);
  const [verAuxiliares, setVerAuxiliares] = useState(true);
  const [mostrarSinSaldo, setMostrarSinSaldo] = useState(false);

  const [filterDiario, setFilterDiario] = useState('Todos');

  const [rawAccounts, setRawAccounts] = useState([]);
  const [rawTransactions, setRawTransactions] = useState([]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    // Listen to accounts
    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubAcc = onSnapshot(qAcc, 
      (snap) => {
        setRawAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => console.error("TrialBalance Error (accounts):", err)
    );

    // Listen to transactions
    const qTx = query(collection(db, 'transactions'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubTx = onSnapshot(qTx, 
      (snap) => {
        setRawTransactions(snap.docs.map(doc => doc.data()));
      },
      (err) => console.error("TrialBalance Error (tx):", err)
    );

    return () => {
      unsubAcc();
      unsubTx();
    };
  }, [user, queryUserIds]);

  // Derived state: filtered and calculated data
  useMemo(() => {
    if (rawAccounts.length === 0) {
      setData([]);
      setTotals({ debit: 0, credit: 0, balance: 0 });
      return;
    }

    // 1. Filter Transactions (Date & Diario)
    let filteredTx = rawTransactions;
    if (selectedQuickFilter) {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthIndex = months.indexOf(selectedQuickFilter);
      if (monthIndex !== -1) {
        filteredTx = rawTransactions.filter(tx => {
          if (!tx.date) return false;
          const txMonth = parseInt(tx.date.split('-')[1], 10);
          return txMonth === (monthIndex + 1);
        });
      } else {
        const quarters = {
          '1T': [1, 2, 3],
          '2T': [4, 5, 6],
          '3T': [7, 8, 9],
          '4T': [10, 11, 12]
        };
        const targetMonths = quarters[selectedQuickFilter];
        if (targetMonths) {
          filteredTx = rawTransactions.filter(tx => {
            if (!tx.date) return false;
            const txMonth = parseInt(tx.date.split('-')[1], 10);
            return targetMonths.includes(txMonth);
          });
        }
      }
    } else if (filterFechaType === 'Este mes') {
        const currentMonth = new Date().getMonth() + 1;
        filteredTx = rawTransactions.filter(tx => {
            if (!tx.date) return false;
            const txMonth = parseInt(tx.date.split('-')[1], 10);
            return txMonth === currentMonth;
        });
    }

    // 2. Aggregate sums per account code (aux accounts: code.length > 4)
    const accountsMap = {};
    rawAccounts.forEach(a => {
      accountsMap[a.code] = { ...a, sumDebit: 0, sumCredit: 0 };
    });

    // Apply transactions to aux accounts (direct match)
    filteredTx.forEach(tx => {
      const acc = Object.values(accountsMap).find(a => a.id === tx.accountId || a.code === tx.accountId);
      if (acc) {
        acc.sumDebit += (parseFloat(tx.debit) || 0);
        acc.sumCredit += (parseFloat(tx.credit) || 0);
      }
    });

    const accountsWithSums = Object.values(accountsMap);

    // 2.5 Aggregate sums up the hierarchy: official PGC accounts (code.length <= 4)
    // aggregate from their auxiliary children (code.length > parent code.length)
    accountsWithSums
      .filter(a => a.code && a.code.length <= 4)
      .sort((a, b) => b.code.length - a.code.length) // longest first so sub-groups aggregate to groups
      .forEach(parentAcc => {
        const children = accountsWithSums.filter(
          child => child.code && child.code !== parentAcc.code &&
          child.code.startsWith(parentAcc.code)
        );
        // Only aggregate from direct aux accounts (not other official accounts to avoid double-counting)
        const auxChildren = children.filter(child => child.code.length > 4);
        parentAcc.sumDebit += auxChildren.reduce((sum, child) => sum + child.sumDebit, 0);
        parentAcc.sumCredit += auxChildren.reduce((sum, child) => sum + child.sumCredit, 0);
      });

    // 3. Filter Accounts
    let finalAccounts = accountsWithSums.filter(acc => {
      const balance = (acc.sumDebit - acc.sumCredit);

      // Hide accounts with no activity (unless mostrarSinSaldo)
      if (!mostrarSinSaldo) {
        if (acc.sumDebit === 0 && acc.sumCredit === 0 && Math.abs(parseFloat(acc.balance_actual) || 0) < 0.01) {
          return false;
        }
      }

      // verOficiales = show PGC accounts (code.length <= 4)
      // verAuxiliares = show user-created aux accounts (code.length > 4)
      const isOfficial = acc.code && acc.code.length <= 4;
      const isAux = acc.code && acc.code.length > 4;

      if (isOfficial && !verOficiales) return false;
      if (isAux && !verAuxiliares) return false;

      if (filterCuentaType === 'De la 100 a la 199') {
          if (!acc.code || !acc.code.startsWith('1')) return false;
      }
      if (filterCuentaType === 'De la 600 a la 799') {
          if (!acc.code || !(acc.code.startsWith('6') || acc.code.startsWith('7'))) return false;
      }
      if (filterCuentaType === 'De la 800 a la 999') {
          if (!acc.code || !(acc.code.startsWith('8') || acc.code.startsWith('9'))) return false;
      }
      if (filterCuentaType === 'DesdeHasta') {
          if (acc.code < filterCuentaDesde || acc.code > filterCuentaHasta) return false;
      }

      return true;
    });

    finalAccounts.sort((a, b) => (a.code || "").localeCompare(b.code || ""));

    // Calculate Totals
    const newTotals = finalAccounts.reduce((acc, curr) => ({
      debit: acc.debit + curr.sumDebit,
      credit: acc.credit + curr.sumCredit,
      balance: acc.balance + (curr.sumDebit - curr.sumCredit)
    }), { debit: 0, credit: 0, balance: 0 });

    setData(finalAccounts);
    setTotals(newTotals);

  }, [rawAccounts, rawTransactions, selectedQuickFilter, filterFechaType, filterTrimestre, filterDateDesde, filterDateHasta, filterCuentaType, filterCuentaDesde, filterCuentaHasta, verOficiales, verAuxiliares, mostrarSinSaldo, filterDiario]);

  const handleFullRecalculate = async () => {
    if (!user) return;
    if (!window.confirm('¿Desea reconstruir todos los saldos y transacciones desde cero? Esto corregirá cualquier desajuste visual.')) return;
    
    setIsRecalculating(true);
    try {
      await recalculateAllBalances(user.uid);
      alert('Saldos recalculados correctamente.');
    } catch (error) {
      alert('Error al recalcular: ' + error.message);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleQuickMonth = (month) => {
     // TODO: Implement quick month filter
     setFilterFechaType('DesdeHasta');
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] font-sans text-[11px] text-slate-800">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Filters */}
        {showSidebar && (
        <div className="w-[200px] border-r border-gray-300 bg-[#f8f9fa] flex flex-col shrink-0 overflow-y-auto">
           {/* Fechas */}
           <div className="border-b border-gray-300">
              <div className="bg-[#e9ecef] px-2 py-1 font-semibold text-[10px] text-gray-700">Fechas</div>
              <div className="p-2 space-y-1">
                 <label className="flex items-center gap-2"><input type="radio" name="fecha" checked={filterFechaType === 'Este mes'} onChange={() => setFilterFechaType('Este mes')} /> Este mes</label>
                 <label className="flex items-center gap-2"><input type="radio" name="fecha" checked={filterFechaType === 'Hasta este mes'} onChange={() => setFilterFechaType('Hasta este mes')} /> Hasta este mes</label>
                 <label className="flex items-center gap-2">
                    <input type="radio" name="fecha" checked={filterFechaType === 'Trimestre'} onChange={() => setFilterFechaType('Trimestre')} /> Trimestre:
                    <select className="border border-gray-300 px-1 ml-1 w-20 text-[10px]" disabled={filterFechaType !== 'Trimestre'} value={filterTrimestre} onChange={(e) => setFilterTrimestre(e.target.value)}>
                       <option>Primer Trimestre</option>
                       <option>Segundo Trimestre</option>
                       <option>Tercer Trimestre</option>
                       <option>Cuarto Trimestre</option>
                    </select>
                 </label>
                 <label className="flex items-center gap-2">
                    <input type="radio" name="fecha" checked={filterFechaType === 'DesdeHasta'} onChange={() => setFilterFechaType('DesdeHasta')} /> Desde:
                    <select className="border border-gray-300 px-1 ml-1 text-[10px] w-16" value={filterDateDesde} onChange={(e) => setFilterDateDesde(e.target.value)}>
                      {['Apertura', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Regularización', 'Cierre'].map(opt => (
                        <option key={opt}>{opt}</option>
                      ))}
                    </select>
                 </label>
                 <div className="flex items-center gap-2 pl-6">
                    Hasta:
                    <select className="border border-gray-300 px-1 ml-1 text-[10px] w-16" value={filterDateHasta} onChange={(e) => setFilterDateHasta(e.target.value)}>
                      {['Apertura', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'Regularización', 'Cierre'].map(opt => (
                        <option key={opt}>{opt}</option>
                      ))}
                    </select>
                 </div>
              </div>
           </div>

           {/* Cuenta */}
           <div className="border-b border-gray-300">
              <div className="bg-[#e9ecef] px-2 py-1 font-semibold text-[10px] text-gray-700">Cuenta</div>
              <div className="p-2 space-y-1">
                 <label className="flex items-center gap-2"><input type="radio" name="cuenta" checked={filterCuentaType === 'Todas'} onChange={() => setFilterCuentaType('Todas')} /> Todas</label>
                 <label className="flex items-center gap-2"><input type="radio" name="cuenta" checked={filterCuentaType === 'De la 100 a la 199'} onChange={() => setFilterCuentaType('De la 100 a la 199')} /> De la 100 a la 199</label>
                 <label className="flex items-center gap-2"><input type="radio" name="cuenta" checked={filterCuentaType === 'De la 600 a la 799'} onChange={() => setFilterCuentaType('De la 600 a la 799')} /> De la 600 a la 799</label>
                 <label className="flex items-center gap-2"><input type="radio" name="cuenta" checked={filterCuentaType === 'De la 800 a la 999'} onChange={() => setFilterCuentaType('De la 800 a la 999')} /> De la 800 a la 999</label>
                 <label className="flex items-center gap-2">
                    <input type="radio" name="cuenta" checked={filterCuentaType === 'DesdeHasta'} onChange={() => setFilterCuentaType('DesdeHasta')} /> Desde:
                    <input type="text" className="border border-gray-300 px-1 w-16 text-[10px]" value={filterCuentaDesde} onChange={e => setFilterCuentaDesde(e.target.value)} disabled={filterCuentaType !== 'DesdeHasta'} />
                 </label>
                 <div className="flex items-center gap-2 pl-6">
                    Hasta:
                    <input type="text" className="border border-gray-300 px-1 w-16 text-[10px]" value={filterCuentaHasta} onChange={e => setFilterCuentaHasta(e.target.value)} disabled={filterCuentaType !== 'DesdeHasta'} />
                 </div>
              </div>
              <div className="p-2 pt-0 space-y-1">
                 <label className="flex items-center gap-2"><input type="checkbox" checked={verOficiales} onChange={e => setVerOficiales(e.target.checked)} /> Ver cuentas oficiales</label>
                 <label className="flex items-center gap-2"><input type="checkbox" checked={verAuxiliares} onChange={e => setVerAuxiliares(e.target.checked)} /> Ver cuentas auxiliares</label>
                 <label className="flex items-center gap-2"><input type="checkbox" checked={mostrarSinSaldo} onChange={e => setMostrarSinSaldo(e.target.checked)} /> Mostrar cuentas sin saldo</label>
              </div>
           </div>

           {/* Diario */}
           <div className="border-b border-gray-300">
              <div className="bg-[#e9ecef] px-2 py-1 font-semibold text-[10px] text-gray-700">Diario</div>
              <div className="p-2 text-center">
                 <select className="border border-gray-300 px-2 py-1 w-full text-[10px]" value={filterDiario} onChange={e => setFilterDiario(e.target.value)}>
                    <option>Todos</option>
                 </select>
                 <button className="mt-2 border border-gray-400 bg-gray-100 hover:bg-gray-200 px-4 py-1 text-[10px]">Ver</button>
              </div>
           </div>
           
           <div className="mt-auto flex border-t border-gray-300">
             <div className="flex-1 text-center py-1 border-r border-gray-300 bg-[#e9ecef] cursor-pointer hover:bg-gray-200">Diario</div>
             <div className="flex-1 text-center py-1 bg-[#e9ecef] cursor-pointer hover:bg-gray-200">Consultas</div>
           </div>
        </div>
        )}

        {/* Quick Month Filter Bar */}
        <div className="w-8 border-r border-gray-300 bg-white flex flex-col items-center py-2 shrink-0">
           {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => (
              <button 
                key={m} 
                onClick={() => setSelectedQuickFilter(selectedQuickFilter === m ? null : m)}
                className={`text-[10px] w-full text-center hover:font-bold ${selectedQuickFilter === m ? 'text-blue-600 font-bold bg-blue-50' : 'text-[#0d2a63] hover:text-blue-600'} mb-1`}
              >
                {m}
              </button>
           ))}
           <div className="h-2"></div>
           {['1T', '2T', '3T', '4T'].map(t => (
              <button 
                key={t} 
                onClick={() => setSelectedQuickFilter(selectedQuickFilter === t ? null : t)}
                className={`text-[10px] w-full text-center hover:font-bold ${selectedQuickFilter === t ? 'text-blue-600 font-bold bg-blue-50' : 'text-[#0d2a63] hover:text-blue-600'} mb-1`}
              >
                {t}
              </button>
           ))}
        </div>

        {/* Main Table Area */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
           <div className="flex bg-[#f3f4f6] border-b border-gray-300 px-2 py-0.5 justify-between items-center text-[10px]">
             <div className="text-gray-500 font-semibold">Consultas</div>
             <button 
               onClick={() => setShowSidebar(!showSidebar)} 
               className="p-1 hover:bg-black/10 rounded transition-colors"
               title="Mostrar/Ocultar Filtros"
             >
               <PanelLeft className="w-4 h-4 text-slate-700" />
             </button>
           </div>
           <div className="flex-1 overflow-auto">
             <table className="w-full text-left border-collapse whitespace-nowrap" style={{ zoom: tableZoom }}>
                <thead className="sticky top-0 bg-white shadow-sm z-10 border-b border-gray-300">
                   <tr>
                      <th className="px-2 py-1 font-normal border-r border-gray-200 w-24">CUENTA</th>
                      <th className="px-2 py-1 font-normal border-r border-gray-200">TÍTULO</th>
                      <th className="px-2 py-1 font-normal border-r border-gray-200 text-right w-32">DEBE</th>
                      <th className="px-2 py-1 font-normal border-r border-gray-200 text-right w-32">HABER</th>
                      <th className="px-2 py-1 font-normal text-right w-32">SALDO</th>
                   </tr>
                </thead>
                <tbody>
                   {loading ? (
                     <tr><td colSpan="5" className="text-center py-10">Cargando...</td></tr>
                   ) : data.length === 0 ? (
                     <tr><td colSpan="5" className="text-center py-10">No hay datos para mostrar</td></tr>
                   ) : (
                     data.map((acc, index) => {
                       const balance = (acc.sumDebit || 0) - (acc.sumCredit || 0);
                       const isAlternatingRow = index % 2 === 1;
                       const isSelected = selectedAccount?.id === acc.id;
                       return (
                         <tr 
                           key={acc.id} 
                           onClick={() => setSelectedAccount(acc)}
                           className={`cursor-pointer hover:bg-blue-50 ${isSelected ? 'bg-blue-100' : (isAlternatingRow ? 'bg-[#fffdf0]' : 'bg-white')}`}
                         >
                            <td className="px-2 py-1 border-r border-gray-100">{acc.code}</td>
                            <td className="px-2 py-1 border-r border-gray-100 truncate max-w-[300px]" title={acc.name}>{acc.name}</td>
                            <td className="px-2 py-1 border-r border-gray-100 text-right">{acc.sumDebit ? acc.sumDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00'}</td>
                            <td className="px-2 py-1 border-r border-gray-100 text-right">{acc.sumCredit ? acc.sumCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00'}</td>
                            <td className="px-2 py-1 text-right">{balance ? (balance > 0 ? balance.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : `- ${Math.abs(balance).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`) : '0,00'}</td>
                         </tr>
                       );
                     })
                   )}
                </tbody>
             </table>
           </div>
           
           {/* Footer Totals */}
             <div className="bg-white border-t border-gray-300 p-2 flex flex-col text-[10px]">
                {/* Top row: selected account label + zoom always visible */}
                <div className="flex items-center justify-between mb-1">
                   <div className="text-[#0d2a63] font-semibold flex flex-col text-[11px] leading-tight">
                     {selectedAccount ? (
                       <>
                         <span className="text-[10px] text-gray-500 font-normal">C.C.</span>
                         <span className="font-bold">{selectedAccount.name?.toUpperCase()}</span>
                       </>
                     ) : (
                       <span className="text-transparent">_</span>
                     )}
                   </div>
                   {/* Zoom always on the right */}
                   <div className="border-l pl-2 border-gray-300">
                      <ZoomControl />
                   </div>
                </div>
                {/* Totals row */}
                <div className="flex items-center overflow-x-auto">
                   <div className="flex items-center space-x-2 mx-auto">
                      <div className="text-right font-semibold pr-2 whitespace-nowrap">Total:</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63]">{totals.debit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63] px-2">{totals.credit.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63]">{totals.balance >= 0 ? totals.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : `(${Math.abs(totals.balance).toLocaleString('es-ES', { minimumFractionDigits: 2 })})`}</div>
                   </div>
                </div>
                {/* Sub-total row */}
                <div className="flex items-center overflow-x-auto mt-0.5">
                   <div className="flex items-center space-x-2 mx-auto">
                      <div className="text-right font-semibold pr-2 whitespace-nowrap">Total hasta la cuenta seleccionada:</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63]">0,00</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63] px-2">0,00</div>
                      <div className="w-28 text-center font-bold text-[#0d2a63]">0,00</div>
                   </div>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
}

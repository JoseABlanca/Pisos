import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import ZoomControl from '../components/ZoomControl';
import { 
  Landmark, ArrowRightLeft, Search, Activity, 
  Printer, Download, Filter, BookOpen, RefreshCw,
  ChevronRight, ChevronDown, Folder, FileText, PanelLeft, History,
  X
} from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import Accounts from './Accounts';

export default function Ledger({ initialMode }) {
  const { user, queryUserIds } = useAuth();
  const [viewMode, setViewMode] = useState(initialMode || 'summary'); // 'summary' (Hierarchical Balance) or 'detail' (Mayor)
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState({});
  
  // Filters
  const [showSidebar, setShowSidebar] = useState(true);
  const [dateFilter, setDateFilter] = useState('Todos');
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [showZeroBalance, setShowZeroBalance] = useState(true);
  const [showAccountsOverlay, setShowAccountsOverlay] = useState(false);
  const [isDatesCollapsed, setIsDatesCollapsed] = useState(true);
  const [maxDigits, setMaxDigits] = useState(10);

  // Sync with prop
  useEffect(() => {
    if (initialMode) {
      setViewMode(initialMode);
    } else {
      setViewMode('summary');
    }
  }, [initialMode]);

  // 1. Load accounts
  useEffect(() => {
    if (!user) return;
    
    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(qAcc, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = docs.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setAccounts(sorted);
      
      if (sorted.length > 0 && !selectedAccountId) {
        setSelectedAccountId(sorted[0].id);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Load all journal entries (the source of truth for history)
  useEffect(() => {
    if (!user) return;

    const qJournal = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])
    );

    const unsubscribe = onSnapshot(qJournal, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournalEntries(docs);
    });

    return () => unsubscribe();
  }, [user]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  const handleAccountSelect = (code, name) => {
    const acc = accounts.find(a => a.code === code);
    if (acc) {
      setSelectedAccountId(acc.id);
    }
    setShowAccountsOverlay(false);
  };

  const handlePrevAccount = () => {
    if (accounts.length === 0) return;
    const currentIndex = accounts.findIndex(a => a.id === selectedAccountId);
    if (currentIndex > 0) {
      setSelectedAccountId(accounts[currentIndex - 1].id);
    } else {
      setSelectedAccountId(accounts[accounts.length - 1].id);
    }
  };

  const handleNextAccount = () => {
    if (accounts.length === 0) return;
    const currentIndex = accounts.findIndex(a => a.id === selectedAccountId);
    if (currentIndex >= 0 && currentIndex < accounts.length - 1) {
      setSelectedAccountId(accounts[currentIndex + 1].id);
    } else {
      setSelectedAccountId(accounts[0].id);
    }
  };

  // Dynamic balance aggregation per account based on filters
  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(acc => {
      balances[acc.id] = 0;
    });

    journalEntries.forEach(entry => {
      const d = new Date(entry.date);
      const today = new Date();
      
      if (dateFilter !== 'Todos') {
        if (dateFilter === 'Hoy') {
          if (d.toDateString() !== today.toDateString()) return;
        } else if (dateFilter === 'Última semana') {
          const lastWeek = new Date(today);
          lastWeek.setDate(today.getDate() - 7);
          if (d < lastWeek) return;
        } else if (dateFilter === 'Último mes') {
          const lastMonth = new Date(today);
          lastMonth.setMonth(today.getMonth() - 1);
          if (d < lastMonth) return;
        }
      }

      const y = d.getFullYear();
      const mVal = d.getMonth();
      const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

      if (selectedYears.length > 0) {
        if (!selectedYears.includes(String(y))) return;
      }

      if (selectedMonths.length > 0 || selectedQuarters.length > 0) {
        const matchMonth = selectedMonths.includes(months[mVal]);
        const matchQuarter = selectedQuarters.some(q => {
          if (q === '1T') return mVal >= 0 && mVal <= 2;
          if (q === '2T') return mVal >= 3 && mVal <= 5;
          if (q === '3T') return mVal >= 6 && mVal <= 8;
          if (q === '4T') return mVal >= 9 && mVal <= 11;
          return false;
        });
        if (!matchMonth && !matchQuarter) return;
      }

      const lines = entry.lines || [];
      lines.forEach(line => {
        const accId = String(line.accountId || '');
        if (accId && balances[accId] !== undefined) {
          const debit = parseFloat(line.debit || 0);
          const credit = parseFloat(line.credit || 0);
          balances[accId] += (debit - credit);
        }
      });
    });

    return balances;
  }, [journalEntries, accounts, dateFilter, selectedYears, selectedMonths, selectedQuarters]);

  // 3. Build Hierarchical Tree and Calculate Totals
  const buildTree = (allAccounts) => {
    if (allAccounts.length === 0) return [];
    
    // Dictionary of nodes
    const nodes = {};
    allAccounts.forEach(acc => {
      nodes[acc.id] = { ...acc, children: [] };
    });

    const roots = [];
    allAccounts.forEach(acc => {
      if (acc.parentId && nodes[acc.parentId]) {
        nodes[acc.parentId].children.push(nodes[acc.id]);
      } else {
        roots.push(nodes[acc.id]);
      }
    });

    // Helper to calculate recursive totals
    const calculateRecursiveBalance = (node) => {
      let childSum = 0;
      node.children.forEach(child => {
        childSum += calculateRecursiveBalance(child);
      });
      const isAsset = ['Activo', 'Gasto'].includes(node.type);
      const rawBalance = accountBalances[node.id] !== undefined ? accountBalances[node.id] : (node.balance_actual || 0);
      const nodeOwnBalance = isAsset ? rawBalance : -rawBalance;
      node.totalBalance = nodeOwnBalance + childSum;
      return node.totalBalance;
    };

    roots.forEach(r => calculateRecursiveBalance(r));
    return roots;
  };

  const treeData = useMemo(() => {
    return buildTree(accounts);
  }, [accounts, accountBalances]);

  // 4. Flatten tree for rendering (with indentation and depth limit filter)
  const flattenTree = (nodes, depth = 0, results = []) => {
    nodes.forEach(node => {
      if (!node.code || node.code.length <= maxDigits) {
        results.push({ ...node, depth });
        if (expandedNodes[node.id] !== false) { // Default expanded for this report
          flattenTree(node.children, depth + 1, results);
        }
      }
    });
    return results;
  };

  const visibleSummary = useMemo(() => {
    return flattenTree(treeData);
  }, [treeData, expandedNodes, maxDigits]);

  const toggleNode = (id) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 5. Filter movements for the selected account using Journal Entries (including all descendants)
  // useMemo ensures this only recalculates when journalEntries or selectedAccount change
  // 3. Recursive account aggregation logic
  const movements = useMemo(() => {
    if (!selectedAccountId || !accounts.length || !journalEntries.length) return [];
    
    // 1. Map for fast account lookups
    const accountMap = accounts.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});
    
    // 2. Find selected account and all its descendants (ensuring string IDs)
    const getDescendants = (id) => {
      let ids = [String(id)];
      accounts.forEach(a => {
        if (String(a.parentId) === String(id)) {
          ids = [...ids, ...getDescendants(a.id)];
        }
      });
      return [...new Set(ids)]; // Unique strings
    };

    const targetAccountIds = getDescendants(selectedAccountId);
    const isAsset = ['Activo', 'Gasto'].includes(selectedAccount?.type);
    
    let currentBalance = 0;
    const results = [];

    // 3. Scan all journal entries with string conversion safety
    journalEntries.forEach(entry => {
      const lines = entry.lines || [];
      lines.forEach((line, index) => {
        const lineId = String(line.accountId || '');
        if (targetAccountIds.includes(lineId)) {
          const accInfo = accountMap[lineId];

          // Find contrapartida (offsetting account)
          let contrapartida = '';
          const otherLines = lines.filter((_, idx) => idx !== index);
          if (otherLines.length > 0) {
            let offsetLine;
            if (parseFloat(line.debit || 0) > 0) {
              offsetLine = otherLines.find(l => parseFloat(l.credit || 0) > 0);
            } else if (parseFloat(line.credit || 0) > 0) {
              offsetLine = otherLines.find(l => parseFloat(l.debit || 0) > 0);
            }
            if (!offsetLine) {
              offsetLine = otherLines[0];
            }
            if (offsetLine && offsetLine.accountId) {
              const offsetAcc = accountMap[String(offsetLine.accountId)];
              if (offsetAcc) {
                contrapartida = offsetAcc.code;
              }
            }
          }

          results.push({
            id: `${entry.id}-${index}`,
            date: entry.date,
            number: entry.number || (entry.id || '').toUpperCase().slice(-6),
            accountCode: accInfo ? accInfo.code : '?',
            accountName: accInfo ? accInfo.name : 'Desconocida',
            description: entry.description || 'Movimiento contable',
            debit: parseFloat(line.debit || 0),
            credit: parseFloat(line.credit || 0),
            contrapartida: contrapartida || '—'
          });
        }
      });
    });

    // 4. Sort
    results.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 5. Apply Time Filters (dateFilter & timelineFilter)
    const filteredResults = results.filter(item => {
      const d = new Date(item.date);
      const today = new Date();
      
      // Sidebar Date Filters
      if (dateFilter !== 'Todos') {
        if (dateFilter === 'Hoy') {
          if (d.toDateString() !== today.toDateString()) return false;
        } else if (dateFilter === 'Última semana') {
          const lastWeek = new Date(today);
          lastWeek.setDate(today.getDate() - 7);
          if (d < lastWeek) return false;
        } else if (dateFilter === 'Último mes') {
          const lastMonth = new Date(today);
          lastMonth.setMonth(today.getMonth() - 1);
          if (d < lastMonth) return false;
        }
      }

      // Timeline Filter (Multi-selection)
      const y = d.getFullYear();
      const mVal = d.getMonth();
      const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

      if (selectedYears.length > 0) {
        if (!selectedYears.includes(String(y))) return false;
      }

      if (selectedMonths.length > 0 || selectedQuarters.length > 0) {
        const matchMonth = selectedMonths.includes(months[mVal]);
        const matchQuarter = selectedQuarters.some(q => {
          if (q === '1T') return mVal >= 0 && mVal <= 2;
          if (q === '2T') return mVal >= 3 && mVal <= 5;
          if (q === '3T') return mVal >= 6 && mVal <= 8;
          if (q === '4T') return mVal >= 9 && mVal <= 11;
          return false;
        });
        if (!matchMonth && !matchQuarter) return false;
      }
      return true;
    });

    // 6. Calculate Running Balance
    return filteredResults.map(m => {
      const change = isAsset ? (m.debit - m.credit) : (m.credit - m.debit);
      currentBalance += change;
      return { ...m, runningBalance: currentBalance };
    });
  }, [selectedAccountId, journalEntries, accounts, selectedAccount, dateFilter, selectedYears, selectedMonths, selectedQuarters]);

  const handleExport = () => {
    const data = viewMode === 'summary' ? visibleSummary : movements;
    const name = viewMode === 'summary' ? 'Balance_Situacion' : `Extracto_${selectedAccount?.code || 'Cuenta'}`;
    exportToCSV(data, name);
  };

  const renderDateFilters = () => {
    return (
      <div className="p-2 border-b border-gray-300">
        <div 
          className="bg-gray-200 px-2 py-1 mb-2 font-bold flex justify-between items-center cursor-pointer select-none hover:bg-gray-300 transition-colors"
          onClick={() => setIsDatesCollapsed(!isDatesCollapsed)}
        >
          <span>FECHAS</span>
          <span className="text-[9px]">{isDatesCollapsed ? '▶' : '▼'}</span>
        </div>
        {!isDatesCollapsed && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-y-1.5 px-2">
              <label className="flex items-center space-x-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="dateFilter" 
                  checked={dateFilter === 'Todos'} 
                  onChange={() => setDateFilter('Todos')} 
                  className="w-3 h-3 text-blue-600" 
                />
                <span>TODOS</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="dateFilter" 
                  checked={dateFilter === 'Última semana'} 
                  onChange={() => setDateFilter('Última semana')} 
                  className="w-3 h-3 text-blue-600" 
                />
                <span>ÚLTIMA SEMANA</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="dateFilter" 
                  checked={dateFilter === 'Hoy'} 
                  onChange={() => setDateFilter('Hoy')} 
                  className="w-3 h-3 text-blue-600" 
                />
                <span>HOY</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="dateFilter" 
                  checked={dateFilter === 'Último mes'} 
                  onChange={() => setDateFilter('Último mes')} 
                  className="w-3 h-3 text-blue-600" 
                />
                <span>ÚLTIMO MES</span>
              </label>
            </div>
            
            {/* Additional Date options */}
            <div className="space-y-1.5 px-2 mt-2 pt-2 border-t border-gray-200/50">
              <div className="flex items-center space-x-1 opacity-60">
                <input type="radio" name="dateFilter" disabled className="w-3 h-3 text-blue-600" />
                <span className="w-16">TRIMESTRE:</span>
                <select disabled className="flex-1 border border-gray-300 px-1 py-0.5 text-[10px] outline-none">
                  <option>PRIMER TRIMESTR</option>
                </select>
              </div>
              <div className="flex items-center space-x-1 opacity-60">
                <input type="radio" name="dateFilter" disabled className="w-3 h-3 text-blue-600" />
                <span className="w-16">ENTRE:</span>
                <input type="date" disabled className="flex-1 border border-gray-300 px-1 py-0.5 text-[10px] outline-none" />
              </div>
              <div className="flex items-center space-x-1 pl-4 opacity-60">
                <span className="w-13">HASTA:</span>
                <input type="date" disabled className="flex-1 border border-gray-300 px-1 py-0.5 text-[10px] outline-none" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Calculate Totals for Footer
  const totalDebit = movements.reduce((s, m) => s + m.debit, 0);
  const totalCredit = movements.reduce((s, m) => s + m.credit, 0);
  const isAsset = ['Activo', 'Gasto'].includes(selectedAccount?.type);
  const endBalance = isAsset ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

  if (viewMode === 'detail') {
    return (
      <div className="flex h-full bg-white relative uppercase font-sans">
        {/* Header title inside the view */}
        <div className="absolute top-0 left-0 w-full h-8 bg-white border-b border-gray-200 flex items-center px-4 z-20">
          <h2 className="text-sm font-normal text-gray-800 tracking-wide">EXTRACTOS DE MOVIMIENTOS</h2>
          <div className="ml-auto flex items-center space-x-2">
             <button 
               onClick={() => setShowSidebar(!showSidebar)}
               className="text-gray-500 hover:text-blue-600 p-1 rounded hover:bg-gray-100 transition-colors"
               title={showSidebar ? 'Ocultar Filtros' : 'Mostrar Filtros'}
             >
               <PanelLeft className="w-4 h-4" />
             </button>
             <button className="text-gray-400 hover:text-blue-600"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex w-full pt-8">
          {/* Left Sidebar */}
          {showSidebar && (
            <div className="w-64 border-r border-gray-300 bg-[#f3f4f6] flex flex-col shrink-0 text-[11px] text-gray-800">
              <div className="flex-1 overflow-y-auto space-y-4">
                {renderDateFilters()}

                {/* Cuenta */}
                <div className="p-2">
                  <div className="bg-gray-200 px-2 py-1 mb-2 font-bold">CUENTA</div>
                  <div className="px-2 space-y-2">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setShowAccountsOverlay(true)}
                        onDoubleClick={() => setShowAccountsOverlay(true)}
                        className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded shadow-sm cursor-pointer"
                        title="Haz clic para elegir cuenta"
                      >
                        CUENTA
                      </button>
                      <select 
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        onDoubleClick={() => setShowAccountsOverlay(true)}
                        className="flex-1 border border-gray-300 px-1 py-0.5 outline-none cursor-pointer"
                        title="Doble clic para elegir cuenta"
                      >
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.code}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center space-x-1.5 cursor-pointer pt-1">
                      <input type="checkbox" checked={showZeroBalance} onChange={() => setShowZeroBalance(!showZeroBalance)} className="w-3 h-3 text-blue-600" />
                      <span>MOSTRAR CUENTAS SIN SALDO</span>
                    </label>
                    <div className="flex justify-between pt-1">
                      <button 
                        onClick={handlePrevAccount}
                        className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-0.5 rounded shadow-sm w-20 cursor-pointer"
                      >
                        ANTERIOR
                      </button>
                      <button 
                        onClick={handleNextAccount}
                        className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-0.5 rounded shadow-sm w-20 cursor-pointer"
                      >
                        SIGUIENTE
                      </button>
                    </div>
                  </div>
                </div>

                {/* Otros Filtros */}
                <div className="p-2">
                  <div className="bg-gray-200 px-2 py-1 mb-2 font-bold">OTROS FILTROS</div>
                  <div className="flex items-center space-x-2 px-2">
                    <span>NATURALEZA:</span>
                    <select className="flex-1 border border-gray-300 px-1 py-0.5 outline-none">
                      <option>SIN FILTRO</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Timeline column */}
          {showSidebar && (
            <div className="w-8 border-r border-gray-300 bg-white flex flex-col items-center py-2 space-y-2 text-[10px] font-bold text-gray-600 overflow-y-auto shrink-0 select-none">
              {['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'].map(m => (
                 <span 
                   key={m} 
                   onClick={() => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                   className={`hover:text-blue-600 cursor-pointer p-0.5 w-full text-center ${selectedMonths.includes(m) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
                 >
                   {m}
                 </span>
              ))}
              <span 
                onClick={() => setSelectedQuarters(prev => prev.includes('1T') ? prev.filter(x => x !== '1T') : [...prev, '1T'])}
                className={`mt-2 pt-2 border-t border-gray-300 w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('1T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
              >1T</span>
              <span 
                onClick={() => setSelectedQuarters(prev => prev.includes('2T') ? prev.filter(x => x !== '2T') : [...prev, '2T'])}
                className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('2T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
              >2T</span>
              <span 
                onClick={() => setSelectedQuarters(prev => prev.includes('3T') ? prev.filter(x => x !== '3T') : [...prev, '3T'])}
                className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('3T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
              >3T</span>
              <span 
                onClick={() => setSelectedQuarters(prev => prev.includes('4T') ? prev.filter(x => x !== '4T') : [...prev, '4T'])}
                className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('4T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
              >4T</span>
              {['2024', '2025', '2026', '2027'].map((yr, idx) => (
                <span 
                  key={yr}
                  onClick={() => setSelectedYears(prev => prev.includes(yr) ? prev.filter(x => x !== yr) : [...prev, yr])}
                  className={`w-full text-center hover:text-blue-600 cursor-pointer ${idx === 0 ? 'mt-2 pt-2 border-t border-gray-300' : ''} ${selectedYears.includes(yr) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
                >
                  {yr}
                </span>
              ))}
            </div>
          )}

          {/* Table View */}
          <div className="flex-1 overflow-auto bg-white flex flex-col">
            <table className="w-full text-left border-collapse text-[11px] font-sans">
              <thead className="bg-white sticky top-0 z-10 border-b border-gray-300 text-gray-800">
                <tr>
                  <th className="px-2 py-1.5 font-normal w-24">FECHA</th>
                  <th className="px-2 py-1.5 font-normal w-12 text-center">ASI.</th>
                  <th className="px-2 py-1.5 font-normal w-12 text-center">ORD.</th>
                  <th className="px-2 py-1.5 font-normal w-12 text-center">DIA.</th>
                  <th className="px-2 py-1.5 font-normal flex-1 min-w-[150px]">CONCEPTO</th>
                  <th className="px-2 py-1.5 font-normal w-24">DOCUM.</th>
                  <th className="px-2 py-1.5 font-normal w-24 text-right">DEBE</th>
                  <th className="px-2 py-1.5 font-normal w-24 text-right">HABER</th>
                  <th className="px-2 py-1.5 font-normal w-24 text-right">SALDO</th>
                  <th className="px-2 py-1.5 font-normal w-8 text-center">P</th>
                  <th className="px-2 py-1.5 font-normal w-8 text-center">!</th>
                  <th className="px-2 py-1.5 font-normal w-32">CONTRAPARTIDA</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {/* Saldo arrastrado row */}
                <tr className="border-b border-gray-200 text-gray-600 italic">
                  <td colSpan="5"></td>
                  <td className="px-2 py-1 text-right">SALDO ARRASTRADO</td>
                  <td className="px-2 py-1 text-right">0,00</td>
                  <td className="px-2 py-1 text-right">0,00</td>
                  <td className="px-2 py-1 text-right">0,00</td>
                  <td colSpan="3"></td>
                </tr>

                {movements.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="text-center italic py-10 text-slate-400">
                      NO HAY ASIENTOS REGISTRADOS PARA MOSTRAR
                    </td>
                  </tr>
                ) : (
                  movements.map((m, idx) => (
                    <tr key={idx} className="hover:bg-gray-100 cursor-pointer">
                      <td className="px-2 py-1">{new Date(m.date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: '2-digit'})}</td>
                      <td className="px-2 py-1 text-center">{m.number || '1'}</td>
                      <td className="px-2 py-1 text-center font-bold">{idx + 1}</td>
                      <td className="px-2 py-1 text-center">1</td>
                      <td className="px-2 py-1 truncate max-w-[150px]" title={m.description}>{m.description}</td>
                      <td className="px-2 py-1"></td>
                      <td className="px-2 py-1 text-right">{m.debit > 0 ? m.debit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : ''}</td>
                      <td className="px-2 py-1 text-right">{m.credit > 0 ? m.credit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : ''}</td>
                      <td className="px-2 py-1 text-right">{m.runningBalance.toLocaleString('es-ES', {minimumFractionDigits: 2})} {m.runningBalance < 0 ? '-' : ''}</td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" className="w-3 h-3 cursor-pointer" />
                      </td>
                      <td className="px-2 py-1 text-center"></td>
                      <td className="px-2 py-1 font-mono font-semibold text-slate-700">{m.contrapartida}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            
            {/* Totals Footer */}
            <div className="mt-auto bg-white pt-2 border-t border-gray-300">
              <table className="w-full text-[10px] font-sans text-gray-800">
                <tbody>
                  <tr>
                    <td className="w-16 align-bottom px-2 font-bold">{selectedAccount?.name}</td>
                    <td>
                      <div className="flex justify-center space-x-16 py-1">
                        <div className="text-right space-y-0.5">
                          <div>TOTAL:</div>
                          <div>SALDO PUNTEADO:</div>
                          <div>SALDO SIN PUNTEAR:</div>
                        </div>
                        <div className="text-right space-y-0.5 text-red-600 font-bold">
                          <div>{totalDebit.toLocaleString('es-ES', {minimumFractionDigits: 2})}</div>
                          <div>0,00</div>
                          <div>0,00</div>
                        </div>
                        <div className="text-right space-y-0.5 text-red-600 font-bold">
                          <div>{totalCredit.toLocaleString('es-ES', {minimumFractionDigits: 2})}</div>
                          <div>0,00</div>
                          <div>{totalCredit.toLocaleString('es-ES', {minimumFractionDigits: 2})}</div>
                        </div>
                        <div className="text-right space-y-0.5 text-red-600 font-bold">
                          <div>{endBalance.toLocaleString('es-ES', {minimumFractionDigits: 2})}{endBalance < 0 ? '-' : ''}</div>
                          <div>0,00</div>
                          <div>{endBalance.toLocaleString('es-ES', {minimumFractionDigits: 2})}{endBalance < 0 ? '-' : ''}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-gray-300">
                    <td className="px-2 py-1 text-gray-500 font-bold">EURO</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Accounts Overlay Modal */}
        {showAccountsOverlay && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9998] p-4">
            <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[92vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
              <div className="flex justify-between items-center px-4 py-2 bg-[#4a69bd] text-white select-none shrink-0">
                <h2 className="font-bold text-[13px] tracking-wide">CONFIGURACIÓN DE CUENTAS</h2>
                <button onClick={() => setShowAccountsOverlay(false)} className="hover:bg-white/20 p-1 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <Accounts isModal={true} onAccountSelect={handleAccountSelect} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Summary View
  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      {/* Ribbon Bar */}
      <div className="flex items-center justify-end p-1 bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#808080] mb-1 space-x-2">
        <div className="flex space-x-1">
          <button className="btn-classic px-2 h-6 flex items-center" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5 text-slate-600" />
          </button>
          <button className="btn-classic px-2 h-6 flex items-center space-x-1" onClick={handleExport}>
            <Download className="w-3.5 h-3.5 text-green-700" />
            <span className="text-[10px] font-bold uppercase">Exportar</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden border border-[#808080] bg-white">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-300 bg-[#f3f4f6] flex flex-col shrink-0 text-[11px] text-gray-800">
          <div className="flex-1 overflow-y-auto space-y-4">
            {renderDateFilters()}
            
            {/* Profundidad de Cuentas */}
            <div className="p-2 border-b border-gray-300">
              <div className="bg-gray-200 px-2 py-1 mb-2 font-bold uppercase">PROFUNDIDAD</div>
              <div className="px-2">
                <select 
                  value={maxDigits} 
                  onChange={(e) => setMaxDigits(parseInt(e.target.value))}
                  className="w-full border border-gray-300 px-1 py-1 outline-none cursor-pointer text-[11px]"
                >
                  <option value={10}>TODOS (MAX)</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(d => (
                    <option key={d} value={d}>{d} {d === 1 ? 'dígito' : 'dígitos'}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Acciones */}
            <div className="p-2">
              <div className="bg-gray-200 px-2 py-1 mb-2 font-bold uppercase">ACCIONES</div>
              <div className="px-2 space-y-2">
                <button 
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded shadow-sm w-full font-bold text-[10px] uppercase cursor-pointer"
                  onClick={() => {
                    const newExpanded = {};
                    accounts.forEach(acc => {
                      newExpanded[acc.id] = true;
                    });
                    setExpandedNodes(newExpanded);
                  }}
                >
                  Expandir Todo
                </button>
                <button 
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded shadow-sm w-full font-bold text-[10px] uppercase cursor-pointer"
                  onClick={() => setExpandedNodes({})}
                >
                  Contraer Todo
                </button>
              </div>
            </div>
          </div>

          <div className="p-1 bg-[#23272a] text-white text-[8px] font-bold text-center uppercase tracking-widest border-t border-[#808080]">
            ACTIVE SYSTEM
          </div>
        </div>

        {/* Main Content View */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
          <div className="bg-[#4a69bd] text-white text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider flex justify-between">
            <span>Balance de Situación</span>
            <span className="opacity-70">{new Date().toLocaleDateString('es-ES')}</span>
          </div>

          <div className="flex-1 overflow-auto bg-white border border-inset border-[#808080]">
            <table className="win-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="w-auto">Concepto Contable</th>
                  <th className="w-32 text-right">Saldo Actual (€)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="2" className="text-center py-20 italic">Procesando árbol contable...</td></tr>
                ) : visibleSummary.map((node, idx) => {
                  const isParent = node.children && node.children.length > 0;
                  const level = node.depth;
                  
                  // Style determination
                  let rowBaseStyle = "group cursor-default transition-colors";
                  let hoverStyle = "hover:bg-[#000080] hover:text-white";
                  let selectedStyle = selectedAccountId === node.id ? "bg-[#000080] text-white" : "";
                  
                  let textStyle = "text-[11px]";
                  if (level === 0) {
                    textStyle = "text-[12px] font-bold uppercase tracking-tight";
                  }

                  return (
                    <tr 
                      key={node.id} 
                      className={`${rowBaseStyle} ${hoverStyle} ${selectedStyle}`}
                      onClick={() => setSelectedAccountId(node.id)}
                    >
                      <td className="relative py-[2px] border-transparent">
                        <div className="flex items-center" style={{ paddingLeft: `${level * 20}px` }}>
                          <div className="flex items-center justify-center w-5 mr-1">
                            {isParent ? (
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }} 
                                className="p-0.5 hover:bg-white/20 rounded"
                              >
                                {expandedNodes[node.id] === false ? 
                                  <ChevronRight className="w-3 h-3" /> : 
                                  <ChevronDown className="w-3 h-3" />
                                }
                              </button>
                            ) : (
                              <div className="w-1 h-1 rounded-full bg-slate-300 ml-1"></div>
                            )}
                          </div>
                          
                          <span className={`${textStyle} truncate`}>
                            {node.code && (
                              <span className={`font-mono mr-2 transition-colors ${
                                selectedAccountId === node.id ? 'text-white/80' : 'text-blue-800 opacity-60 group-hover:text-white/80'
                              }`}>
                                {node.code}
                              </span>
                            )}
                            {node.name}
                          </span>
                        </div>
                      </td>
                      <td className={`text-right font-mono font-bold pr-4 ${textStyle} border-transparent`}>
                        <span className={selectedAccountId === node.id || node.totalBalance < 0 ? '' : 'text-blue-900 group-hover:text-white'}>
                          {node.totalBalance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-800 text-white font-bold h-8">
                  <td className="pl-4 uppercase italic">Total Consolidado Patrimonio</td>
                  <td className="text-right pr-4 font-mono">
                    {treeData.reduce((s, n) => s + (['Activo', 'Gasto'].includes(n.type) ? n.totalBalance : -n.totalBalance), 0).toLocaleString('es-ES')}€
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div className="flex space-x-4 items-center">
          <div className="flex items-center space-x-1 px-2 border-r border-[#808080]">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="font-bold">CONECTADO</span>
          </div>
          <span>Cuentas: {accounts.length}</span>
        </div>
        <div className="flex items-center space-x-2 pr-2">
          <ZoomControl />
        </div>
      </div>

      {/* Accounts Overlay Modal */}
      {showAccountsOverlay && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9998] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[92vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4a69bd] text-white select-none shrink-0">
              <h2 className="font-bold text-[13px] tracking-wide">CONFIGURACIÓN DE CUENTAS</h2>
              <button onClick={() => setShowAccountsOverlay(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <Accounts isModal={true} onAccountSelect={handleAccountSelect} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

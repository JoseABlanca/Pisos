import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { Search, ChevronRight, ChevronDown, Layers, Table, X } from 'lucide-react';
import ZoomControl from '../components/ZoomControl';

// Spanish General Accounting Plan Descriptions
const PGC_DESCRIPTIONS = {
  '1': 'Financiación básica',
  '10': 'Capital',
  '100': 'Capital social',
  '11': 'Reservas',
  '12': 'Resultados pendientes de aplicación',
  '129': 'Resultado del ejercicio',
  '2': 'Activo no corriente',
  '20': 'Inmovilizado intangible',
  '21': 'Inmovilizado material',
  '28': 'Amortización acumulada del inmovilizado',
  '3': 'Existencias',
  '4': 'Acreedores y deudores por operaciones comerciales',
  '40': 'Proveedores',
  '41': 'Acreedores varios',
  '43': 'Clientes',
  '47': 'Administraciones públicas',
  '472': 'Hacienda Pública, IVA soportado',
  '477': 'Hacienda Pública, IVA repercutido',
  '5': 'Cuentas financieras',
  '57': 'Tesorería',
  '570': 'Caja',
  '572': 'Bancos e instituciones de crédito',
  '6': 'Compras y gastos',
  '60': 'Compras',
  '62': 'Servicios exteriores',
  '621': 'Arrendamientos y cánones',
  '628': 'Suministros',
  '629': 'Otros servicios',
  '64': 'Gastos de personal',
  '640': 'Sueldos y salarios',
  '642': 'Seguridad Social a cargo de la empresa',
  '7': 'Ventas e ingresos',
  '70': 'Ventas de mercaderías y servicios',
  '700': 'Ventas de mercaderías',
  '705': 'Prestación de servicios'
};

const getAccountDescription = (code, rawAccounts = []) => {
  const dbAcc = rawAccounts.find(x => x.code === code);
  if (dbAcc) return dbAcc.name;
  if (PGC_DESCRIPTIONS[code]) return PGC_DESCRIPTIONS[code];
  
  // Suffix matching fallback
  for (let len = code.length; len > 0; len--) {
    const prefix = code.substring(0, len);
    if (PGC_DESCRIPTIONS[prefix]) return PGC_DESCRIPTIONS[prefix];
  }
  return `Cuenta contable ${code}`;
};

export default function Analitica() {
  const { user, queryUserIds } = useAuth();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') || 'asignacion'; // 'asignacion' | 'desviacion'

  // Data states
  const [rawAccounts, setRawAccounts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterQuery, setFilterQuery] = useState('');
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [selectedCode, setSelectedCode] = useState(null);
  
  // UI states
  const [collapsedKeys, setCollapsedKeys] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [accountSelectorQuery, setAccountSelectorQuery] = useState('');

  // Form states
  const [formAccount, setFormAccount] = useState(null); // { id, code, name }
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formTotal, setFormTotal] = useState(0);
  const [formMonths, setFormMonths] = useState({
    0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
  });

  // Table columns definition
  const DEFAULT_COLUMNS = ['code', 'description', 'total', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('Analítica', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  const searchInputRef = useRef(null);

  // 1. Fetch Accounts, Budgets, and Transactions from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', targetUserIds));
    const unsubAcc = onSnapshot(qAcc, (snap) => {
      setRawAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qBud = query(collection(db, 'budgets'), where('userId', 'in', targetUserIds));
    const unsubBud = onSnapshot(qBud, (snap) => {
      setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const qTx = query(collection(db, 'transactions'), where('userId', 'in', targetUserIds));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAcc();
      unsubBud();
      unsubTx();
    };
  }, [user, queryUserIds]);

  // Handle ribbon button triggers
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedCode) {
        // Find existing budget doc for selected code and year
        const budget = budgets.find(b => b.accountCode === selectedCode && b.year === selectedYear);
        const acc = rawAccounts.find(a => a.code === selectedCode);
        if (budget) {
          handleEdit(budget);
        } else if (acc) {
          // Initialize a new budget form for this account
          setFormAccount(acc);
          setFormYear(selectedYear);
          setFormTotal(0);
          setFormMonths({
            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
          });
          setIsEditing(false);
          setShowForm(true);
        } else {
          alert('Por favor, selecciona una cuenta contable de la lista para presupuestar.');
        }
      } else {
        handleNew();
      }
    };
    const onDelete = () => {
      if (selectedCode) {
        const budget = budgets.find(b => b.accountCode === selectedCode && b.year === selectedYear);
        if (budget) {
          handleDelete(budget);
        } else {
          alert('No existe un presupuesto asignado para esta cuenta en el año seleccionado.');
        }
      } else {
        alert('Selecciona una cuenta con presupuesto asignado para eliminar.');
      }
    };
    const onGenSublevels = () => {
      if (!selectedCode) {
        alert('Selecciona una cuenta superior con presupuesto asignado para generar el de las subcuentas.');
        return;
      }
      const parentBudget = budgets.find(b => b.accountCode === selectedCode && b.year === selectedYear);
      if (!parentBudget) {
        alert('La cuenta seleccionada no tiene un presupuesto directo asignado.');
        return;
      }
      // Find children
      const children = rawAccounts.filter(a => a.code && a.code !== selectedCode && a.code.startsWith(selectedCode) && a.code.length > selectedCode.length);
      // Filter direct children (no other account code is between parent and child)
      const directChildren = children.filter(child => {
        const otherIntermediaries = children.filter(other => other.code.length < child.code.length && child.code.startsWith(other.code));
        return otherIntermediaries.length === 0;
      });

      if (directChildren.length === 0) {
        alert('No se encontraron subcuentas directas en la base de datos para esta cuenta.');
        return;
      }

      if (!window.confirm(`¿Desea repartir el presupuesto de la cuenta superior "${selectedCode}" (${parentBudget.total} €) entre sus ${directChildren.length} subcuentas de forma proporcional y equitativa?`)) {
        return;
      }

      const numChildren = directChildren.length;
      const childTotal = parseFloat((parentBudget.total / numChildren).toFixed(2));
      const childMonths = {};
      for (let m = 0; m < 12; m++) {
        childMonths[m] = parseFloat(((parentBudget.months?.[m] || 0) / numChildren).toFixed(2));
      }

      const batchSave = async () => {
        for (const child of directChildren) {
          const docId = `${user.uid}_${selectedYear}_${child.id}`;
          const docRef = doc(db, 'budgets', docId);
          await setDoc(docRef, {
            id: docId,
            accountId: child.id,
            accountCode: child.code,
            accountName: child.name,
            year: selectedYear,
            total: childTotal,
            months: childMonths,
            userId: user.uid,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
        alert('Presupuestos para subcuentas generados correctamente.');
      };
      batchSave();
    };

    const onSearch = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    };

    const onColumns = (e) => {
      const { columnId } = e.detail || {};
      if (columnId) toggleColumn(columnId);
    };

    const onResetColumns = () => {
      // Force columns back to defaults
    };

    window.addEventListener('analitica:new', onNew);
    window.addEventListener('analitica:edit', onEdit);
    window.addEventListener('analitica:delete', onDelete);
    window.addEventListener('analitica:gen-sublevels', onGenSublevels);
    window.addEventListener('analitica:search', onSearch);
    window.addEventListener('analitica:columns', onColumns);
    window.addEventListener('analitica:reset-columns', onResetColumns);

    return () => {
      window.removeEventListener('analitica:new', onNew);
      window.removeEventListener('analitica:edit', onEdit);
      window.removeEventListener('analitica:delete', onDelete);
      window.removeEventListener('analitica:gen-sublevels', onGenSublevels);
      window.removeEventListener('analitica:search', onSearch);
      window.removeEventListener('analitica:columns', onColumns);
      window.removeEventListener('analitica:reset-columns', onResetColumns);
    };
  }, [selectedCode, selectedYear, budgets, rawAccounts, user]);

  // 2. Filter & Process Budgets for selected year
  const budgetsForYear = useMemo(() => {
    return budgets.filter(b => b.year === selectedYear);
  }, [budgets, selectedYear]);

  // Aggregate monthly actual balances from transactions
  const actualsForYear = useMemo(() => {
    const map = {}; // { accountCode: { total: X, months: { 0: Y, 1: Z... } } }
    
    // Sort transactions into months for selected year
    const yearTxs = transactions.filter(tx => {
      if (!tx.date) return false;
      const txYear = parseInt(tx.date.split('-')[0], 10);
      return txYear === selectedYear;
    });

    // Populate direct transactional monthly totals
    yearTxs.forEach(tx => {
      // Find account code
      const acc = rawAccounts.find(a => a.id === tx.accountId || a.code === tx.accountId);
      if (!acc || !acc.code) return;
      
      const month = new Date(tx.date).getMonth(); // 0 to 11
      const debit = parseFloat(tx.debit) || 0;
      const credit = parseFloat(tx.credit) || 0;

      if (!map[acc.code]) {
        map[acc.code] = {
          debitTotal: 0,
          creditTotal: 0,
          debitMonths: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 },
          creditMonths: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 }
        };
      }
      map[acc.code].debitTotal += debit;
      map[acc.code].creditTotal += credit;
      map[acc.code].debitMonths[month] += debit;
      map[acc.code].creditMonths[month] += credit;
    });

    return map;
  }, [transactions, rawAccounts, selectedYear]);

  // 3. Compute unique account codes to display
  const processedTreeRows = useMemo(() => {
    // Collect all codes in database
    const allCodes = new Set(rawAccounts.map(a => a.code).filter(Boolean));
    
    // Collect all codes that have direct budgets
    const budgetedCodes = new Set(budgetsForYear.map(b => b.accountCode).filter(Boolean));

    // Also identify which codes actually have budgets or have child codes with budgets
    const budgetedAndParents = new Set();
    budgetedCodes.forEach(code => {
      budgetedAndParents.add(code);
      // Add all proper prefix parent codes (e.g. '705' -> '70', '7')
      for (let len = 1; len < code.length; len++) {
        budgetedAndParents.add(code.substring(0, len));
      }
    });

    // Determine target codes list based on showAllAccounts toggle
    const codesToUse = showAllAccounts ? Array.from(allCodes) : Array.from(budgetedAndParents);

    // If showing all accounts, we also want to make sure prefix parents are in the list
    if (showAllAccounts) {
      const parentsTemp = new Set();
      codesToUse.forEach(code => {
        for (let len = 1; len < code.length; len++) {
          parentsTemp.add(code.substring(0, len));
        }
      });
      parentsTemp.forEach(p => {
        if (!codesToUse.includes(p)) {
          codesToUse.push(p);
        }
      });
    }

    // Sort alphabetically
    codesToUse.sort((a, b) => a.localeCompare(b));

    // Check account type helper
    const getAccountType = (code) => {
      const dbAcc = rawAccounts.find(x => x.code === code);
      if (dbAcc && dbAcc.type) return dbAcc.type;
      
      // Fallback logic
      if (code.startsWith('7')) return 'Ingreso';
      if (code.startsWith('6')) return 'Gasto';
      if (code.startsWith('1')) return 'Patrimonio';
      if (code.startsWith('2') || code.startsWith('3') || code.startsWith('5') || code.startsWith('43')) return 'Activo';
      return 'Pasivo';
    };

    // Calculate hierarchical rollups for each code in our list
    const rows = codesToUse.map(code => {
      const name = getAccountDescription(code, rawAccounts);
      const accType = getAccountType(code);

      // Roll up BUDGET values (prefix matching direct budgets)
      const directBuds = budgetsForYear.filter(b => b.accountCode.startsWith(code));
      const budgetTotal = directBuds.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
      const budgetMonths = {};
      for (let m = 0; m < 12; m++) {
        budgetMonths[m] = directBuds.reduce((sum, b) => sum + (parseFloat(b.months?.[m]) || 0), 0);
      }

      // Roll up ACTUAL values from transaction debit/credits
      const actualMonths = {};
      let actualTotal = 0;
      
      // Accumulate debits/credits from all accounts that match the prefix
      for (let m = 0; m < 12; m++) {
        let sumDebit = 0;
        let sumCredit = 0;
        
        Object.keys(actualsForYear).forEach(actCode => {
          if (actCode.startsWith(code)) {
            sumDebit += actualsForYear[actCode].debitMonths[m];
            sumCredit += actualsForYear[actCode].creditMonths[m];
          }
        });
        
        // Calculate net monthly actual change based on account type
        if (accType === 'Ingreso' || accType === 'Pasivo' || accType === 'Patrimonio') {
          actualMonths[m] = sumCredit - sumDebit;
        } else {
          actualMonths[m] = sumDebit - sumCredit;
        }
        actualTotal += actualMonths[m];
      }

      // Calculate monthly deviations
      const deviationMonths = {};
      let deviationTotal = actualTotal - budgetTotal;
      for (let m = 0; m < 12; m++) {
        deviationMonths[m] = actualMonths[m] - budgetMonths[m];
      }

      // Determine indentation depth
      let depth = 0;
      if (code.length === 2) depth = 1;
      else if (code.length === 3) depth = 2;
      else if (code.length === 4) depth = 3;
      else if (code.length > 4) depth = 4;

      // Determine parent code
      let parentCode = null;
      for (let len = code.length - 1; len > 0; len--) {
        const testPrefix = code.substring(0, len);
        if (codesToUse.includes(testPrefix)) {
          parentCode = testPrefix;
          break;
        }
      }

      // Check if it has children in the tree list
      const hasChildren = codesToUse.some(other => other !== code && other.startsWith(code));

      return {
        code,
        name,
        type: accType,
        depth,
        parentCode,
        hasChildren,
        budget: { total: budgetTotal, months: budgetMonths },
        actual: { total: actualTotal, months: actualMonths },
        deviation: { total: deviationTotal, months: deviationMonths }
      };
    });

    return rows;
  }, [rawAccounts, budgetsForYear, actualsForYear, showAllAccounts]);

  // Apply search query filter
  const filteredTreeRows = useMemo(() => {
    let rows = processedTreeRows;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      // Keep nodes that match or have matching descendants
      rows = processedTreeRows.filter(row => {
        const matchesSelf = row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
        const matchesDescendant = processedTreeRows.some(other => other.code.startsWith(row.code) && (other.code.toLowerCase().includes(q) || other.name.toLowerCase().includes(q)));
        return matchesSelf || matchesDescendant;
      });
    }

    // Apply expand/collapse logic
    return rows.filter(row => {
      // Check if any proper ancestor code is collapsed
      for (let len = 1; len < row.code.length; len++) {
        const prefix = row.code.substring(0, len);
        if (collapsedKeys[prefix]) return false;
      }
      return true;
    });
  }, [processedTreeRows, filterQuery, collapsedKeys]);

  // Create new budget sheet modal
  const handleNew = () => {
    setFormAccount(null);
    setFormYear(selectedYear);
    setFormTotal(0);
    setFormMonths({
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
    });
    setIsEditing(false);
    setShowForm(true);
  };

  // Edit existing budget sheet modal
  const handleEdit = (budget) => {
    const acc = rawAccounts.find(a => a.id === budget.accountId || a.code === budget.accountCode);
    setFormAccount(acc || { id: budget.accountId, code: budget.accountCode, name: budget.accountName });
    setFormYear(budget.year);
    setFormTotal(budget.total);
    setFormMonths({ ...budget.months });
    setIsEditing(true);
    setShowForm(true);
  };

  // Save budget sheet modal
  const handleSave = async () => {
    if (!formAccount) {
      alert('Debes elegir una cuenta contable');
      return;
    }
    const docId = `${user.uid}_${formYear}_${formAccount.id}`;
    const docRef = doc(db, 'budgets', docId);

    const totalSum = Object.values(formMonths).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

    await setDoc(docRef, {
      id: docId,
      accountId: formAccount.id,
      accountCode: formAccount.code,
      accountName: formAccount.name,
      year: parseInt(formYear, 10),
      total: parseFloat(totalSum.toFixed(2)),
      months: formMonths,
      userId: user.uid,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    setShowForm(false);
  };

  // Delete budget confirmation
  const handleDelete = async (budget) => {
    if (!window.confirm(`¿Desea eliminar el presupuesto de la cuenta "${budget.accountCode} - ${budget.accountName}" para el año ${budget.year}?`)) return;
    await deleteDoc(doc(db, 'budgets', budget.id));
    if (selectedCode === budget.accountCode) setSelectedCode(null);
  };

  // Distribute proportionally
  const handleDistributeProportionally = () => {
    const totalVal = parseFloat(formTotal) || 0;
    const splitVal = parseFloat((totalVal / 12).toFixed(2));
    const newMonths = {};
    for (let m = 0; m < 12; m++) {
      newMonths[m] = splitVal;
    }
    setFormMonths(newMonths);
  };

  // Update total based on months
  const handleMonthChange = (monthIdx, value) => {
    const val = parseFloat(value) || 0;
    const updatedMonths = { ...formMonths, [monthIdx]: val };
    setFormMonths(updatedMonths);
    const sum = Object.values(updatedMonths).reduce((acc, v) => acc + v, 0);
    setFormTotal(parseFloat(sum.toFixed(2)));
  };

  const toggleCollapsed = (code, e) => {
    e.stopPropagation();
    setCollapsedKeys(prev => ({ ...prev, [code]: !prev[code] }));
  };

  // Filtered account selector accounts list
  const filteredSelectorAccounts = useMemo(() => {
    if (!accountSelectorQuery) return rawAccounts;
    const q = accountSelectorQuery.toLowerCase();
    return rawAccounts.filter(a =>
      (a.code || '').toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q)
    );
  }, [rawAccounts, accountSelectorQuery]);

  const selectAccountForForm = (acc) => {
    setFormAccount(acc);
    setShowAccountSelector(false);
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const formatDeviation = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    const sign = val > 0 ? '+' : '';
    return sign + val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const getDeviationColor = (val, type) => {
    if (Math.abs(val) < 0.01) return 'text-gray-700';
    if (type === 'Gasto') {
      // Spending less than budget is positive (green)
      return val < 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold';
    } else {
      // Earning more than budget is positive (green)
      return val > 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold';
    }
  };

  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans select-none">
      {/* Top Toolbar */}
      <div className="bg-[#d4d0c8] flex flex-row items-center justify-between px-3 py-1.5 border-b border-[#808080] shrink-0 gap-4">
        <div className="flex flex-row items-center gap-3">
          <div className="flex items-center gap-1.5 bg-[#f0f0f0] border border-gray-400 px-2 py-0.5 shadow-inner">
            <span className="text-[11px] font-bold text-slate-600 uppercase">AÑO:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
              className="text-[12px] bg-white border border-gray-400 outline-none px-1 py-0.5"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2028}>2028</option>
            </select>
          </div>
          
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 bg-gray-100 hover:bg-gray-200 border border-gray-400 px-3 py-1 shadow-sm uppercase">
            <input
              type="checkbox"
              checked={showAllAccounts}
              onChange={e => setShowAllAccounts(e.target.checked)}
              className="accent-slate-600"
            />
            Mostrar todas las cuentas
          </label>
        </div>

        <div className="relative flex items-center">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar cuenta..."
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-white"
          />
          <Search className="w-4 h-4 absolute right-1 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* Main content table area */}
      <div className="flex-1 overflow-auto bg-white border border-[#808080] relative mt-1" onClick={() => setSelectedCode(null)}>
        <table className="clean-table border-collapse w-full min-w-[1200px]">
          <thead>
            <tr className="sticky top-0 z-10 bg-[#e0dcd4]">
              {visibleColumns.includes('code') && <th style={{ width: columnWidths.code }}>Cuenta</th>}
              {visibleColumns.includes('description') && <th style={{ width: columnWidths.description }}>Descripción</th>}
              {visibleColumns.includes('total') && <th style={{ width: columnWidths.total }} className="text-right">Presupuesto</th>}
              {monthNames.map((m, idx) => {
                const colId = m.toLowerCase();
                return visibleColumns.includes(colId) && (
                  <th key={colId} style={{ width: columnWidths[colId] }} className="text-right">{m}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredTreeRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                  No hay presupuestos asignados para el año {selectedYear}. Haz clic en "Nuevo" para asignar uno.
                </td>
              </tr>
            ) : (
              filteredTreeRows.map(row => {
                const isSelected = selectedCode === row.code;
                const isCollapsed = collapsedKeys[row.code];
                const displayType = row.type;

                return (
                  <tr
                    key={row.code}
                    className={`cursor-pointer transition-colors ${isSelected ? 'selected' : 'hover:bg-slate-50'}`}
                    onClick={e => { e.stopPropagation(); setSelectedCode(row.code); }}
                    onDoubleClick={() => {
                      const budget = budgets.find(b => b.accountCode === row.code && b.year === selectedYear);
                      if (budget) handleEdit(budget);
                      else {
                        const acc = rawAccounts.find(a => a.code === row.code);
                        if (acc) {
                          setFormAccount(acc);
                          setFormYear(selectedYear);
                          setFormTotal(0);
                          setFormMonths({
                            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
                          });
                          setIsEditing(false);
                          setShowForm(true);
                        }
                      }
                    }}
                  >
                    {/* Account Code Cell */}
                    {visibleColumns.includes('code') && (
                      <td className="font-mono text-[12px] flex flex-row items-center" style={{ paddingLeft: `${row.depth * 16 + 8}px` }}>
                        {row.hasChildren ? (
                          <button
                            onClick={(e) => toggleCollapsed(row.code, e)}
                            className="p-0.5 hover:bg-gray-200 border border-transparent rounded mr-1 shrink-0"
                          >
                            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />}
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}
                        <span className={row.hasChildren ? 'font-bold' : ''}>{row.code}</span>
                      </td>
                    )}

                    {/* Description Cell */}
                    {visibleColumns.includes('description') && (
                      <td className={`text-[12px] ${row.hasChildren ? 'font-bold' : ''}`}>{row.name}</td>
                    )}

                    {/* Budget Total Column */}
                    {visibleColumns.includes('total') && (
                      <td className={`text-right font-mono text-[12px] ${row.hasChildren ? 'font-bold' : ''}`}>
                        {viewMode === 'asignacion' ? (
                          formatCurrency(row.budget.total)
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className={getDeviationColor(row.deviation.total, displayType)}>
                              {formatDeviation(row.deviation.total)}
                            </span>
                            <span className="text-[9px] text-gray-500">
                              P: {row.budget.total.toLocaleString()} / R: {row.actual.total.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </td>
                    )}

                    {/* Monthly Values */}
                    {monthNames.map((m, idx) => {
                      const colId = m.toLowerCase();
                      if (!visibleColumns.includes(colId)) return null;

                      return (
                        <td key={colId} className={`text-right font-mono text-[12px] ${row.hasChildren ? 'font-bold' : ''}`}>
                          {viewMode === 'asignacion' ? (
                            formatCurrency(row.budget.months[idx])
                          ) : (
                            <div className="flex flex-col items-end">
                              <span className={getDeviationColor(row.deviation.months[idx], displayType)}>
                                {formatDeviation(row.deviation.months[idx])}
                              </span>
                              <span className="text-[9px] text-gray-500">
                                P: {row.budget.months[idx].toLocaleString()} / R: {row.actual.months[idx].toLocaleString()}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Zoom Control bevel border footer */}
      <div className="bg-[#d4d0c8] py-1 px-3 border-t border-white shadow-[inset_0_1px_0_#fff] flex justify-between items-center shrink-0">
        <div className="text-[10px] text-slate-500 font-bold uppercase">
          Módulo de Presupuestos Analíticos
        </div>
        <ZoomControl />
      </div>

      {/* Annual Budget Form Dialog (Ficha de presupuesto anual) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Window
            title={isEditing ? 'Editar ficha de presupuesto anual' : 'Nueva ficha de presupuesto anual'}
            width="600px"
            height="460px"
            initialPos={{ x: 150, y: 80 }}
            onClose={() => setShowForm(false)}
          >
            <div className="flex-1 bg-[#d4d0c8] flex flex-col relative p-3 overflow-hidden">
              <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 flex-1 overflow-auto flex flex-col gap-4">
                
                {/* Account Selection and Year */}
                <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-3 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0">Cuenta:</span>
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={formAccount ? `${formAccount.code} - ${formAccount.name}` : ''}
                        placeholder="Clic en buscar para seleccionar cuenta..."
                        className="flex-1 border border-gray-400 px-2 py-1 text-[12px] bg-white cursor-pointer"
                        onClick={() => setShowAccountSelector(true)}
                      />
                      <button
                        onClick={() => setShowAccountSelector(true)}
                        className="px-3 py-1 bg-[#e0dcd4] border border-gray-400 hover:bg-[#d0ccc4] shadow-sm text-[11px] font-bold uppercase"
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0">Año:</span>
                      <select
                        value={formYear}
                        onChange={e => setFormYear(parseInt(e.target.value, 10))}
                        className="flex-1 border border-gray-400 px-2 py-1 text-[12px] bg-white outline-none"
                      >
                        <option value={2024}>2024</option>
                        <option value={2025}>2025</option>
                        <option value={2026}>2026</option>
                        <option value={2027}>2027</option>
                        <option value={2028}>2028</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0">Total Anual:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formTotal}
                        onChange={e => setFormTotal(parseFloat(e.target.value) || 0)}
                        className="flex-1 border border-gray-400 px-2 py-1 text-[12px] bg-white text-right"
                      />
                      <button
                        onClick={handleDistributeProportionally}
                        className="px-2 py-1 bg-slate-100 border border-gray-400 hover:bg-slate-200 shadow-sm text-[10px] font-bold uppercase shrink-0"
                        title="Repartir proporcionalmente entre los 12 meses"
                      >
                        Repartir
                      </button>
                    </div>
                  </div>
                </div>

                {/* 12 Months Grid */}
                <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-3 flex-1">
                  <div className="text-[10px] font-bold uppercase text-slate-500 mb-2 border-b border-[#c0c0c0] pb-1">Distribucción mensual</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {monthNames.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <label className="w-12 text-[11px] font-bold text-slate-600 uppercase">{m}:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formMonths[idx] !== undefined ? formMonths[idx] : 0}
                          onChange={e => handleMonthChange(idx, e.target.value)}
                          className="flex-1 border border-gray-400 px-2 py-0.5 text-[12px] bg-white text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Form Action buttons */}
              <div className="flex justify-end gap-2 shrink-0 pt-2 pb-0.5 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                <button
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase"
                  onClick={handleSave}
                >
                  Aceptar
                </button>
                <button
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}

      {/* Account Selector Dialog Modal */}
      {showAccountSelector && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]">
          <Window
            title="Seleccionar Cuenta Contable"
            width="500px"
            height="400px"
            initialPos={{ x: 200, y: 100 }}
            onClose={() => setShowAccountSelector(false)}
          >
            <div className="flex-1 bg-[#d4d0c8] flex flex-col p-3 overflow-hidden">
              <div className="flex items-center relative mb-2">
                <input
                  type="text"
                  placeholder="Buscar cuenta por código o nombre..."
                  value={accountSelectorQuery}
                  onChange={e => setAccountSelectorQuery(e.target.value)}
                  className="w-full pl-2 pr-8 py-1.5 border border-gray-400 text-[12px] bg-white outline-none"
                />
                <Search className="w-4 h-4 absolute right-2 text-gray-500 pointer-events-none" />
              </div>

              <div className="flex-1 overflow-auto bg-white border border-[#808080]">
                <table className="clean-table w-full">
                  <thead>
                    <tr className="sticky top-0 bg-[#e0dcd4]">
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSelectorAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-gray-400 text-[12px]">
                          No se encontraron cuentas contables.
                        </td>
                      </tr>
                    ) : (
                      filteredSelectorAccounts.map(acc => (
                        <tr
                          key={acc.id}
                          className="cursor-pointer hover:bg-slate-100 text-[12px]"
                          onClick={() => selectAccountForForm(acc)}
                          onDoubleClick={() => selectAccountForForm(acc)}
                        >
                          <td className="font-mono">{acc.code}</td>
                          <td>{acc.name}</td>
                          <td>{acc.type}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 shrink-0 pt-2 pr-1 bg-[#d4d0c8]">
                <button
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase"
                  onClick={() => setShowAccountSelector(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

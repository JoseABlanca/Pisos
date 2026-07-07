import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { Search, ChevronRight, ChevronDown, Plus, Edit2, Trash2, ArrowUp, ArrowDown, FolderOpen, Folder, X } from 'lucide-react';
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
  const [filterQuery, setFilterQuery] = useState('');
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [selectedCode, setSelectedCode] = useState(null);

  // Left Sidebar Filter States (Photo 5 style)
  const [selectedYearFilter, setSelectedYearFilter] = useState('2026'); // Radio button year
  const [selectedGroupsFilter, setSelectedGroupsFilter] = useState(['ALL']); // 'ALL' or specific prefixes e.g. ['7', '6']

  // UI states
  const [collapsedKeys, setCollapsedKeys] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Selector Modal States (Photo 4 style)
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [selectorGroupFilter, setSelectorGroupFilter] = useState('ALL'); // 'ALL' or '0'..'9'
  const [showPgcAccounts, setShowPgcAccounts] = useState(true);
  const [showAuxAccounts, setShowAuxAccounts] = useState(true);
  const [showObsoleteAccounts, setShowObsoleteAccounts] = useState(false);
  const [accountSelectorQuery, setAccountSelectorQuery] = useState('');
  const [collapsedSelectorKeys, setCollapsedSelectorKeys] = useState({});
  const [selectedSelectorCode, setSelectedSelectorCode] = useState(null);

  // Form states (Photo 3 style)
  const [formAccount, setFormAccount] = useState(null); // { id, code, name }
  const [formYear, setFormYear] = useState(2026);
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
        const yearInt = parseInt(selectedYearFilter, 10);
        const budget = budgets.find(b => b.accountCode === selectedCode && b.year === yearInt);
        const acc = rawAccounts.find(a => a.code === selectedCode);
        if (budget) {
          handleEdit(budget);
        } else if (acc) {
          setFormAccount(acc);
          setFormYear(yearInt);
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
        const yearInt = parseInt(selectedYearFilter, 10);
        const budget = budgets.find(b => b.accountCode === selectedCode && b.year === yearInt);
        if (budget) {
          handleDelete(budget);
        } else {
          alert('No existe un presupuesto asignado para esta cuenta en el año seleccionado.');
        }
      } else {
        alert('Selecciona una cuenta con presupuesto asignado para eliminar.');
      }
    };

    const onColumns = (e) => {
      const { columnId } = e.detail || {};
      if (columnId) toggleColumn(columnId);
    };

    window.addEventListener('analitica:new', onNew);
    window.addEventListener('analitica:edit', onEdit);
    window.addEventListener('analitica:delete', onDelete);
    window.addEventListener('analitica:columns', onColumns);

    return () => {
      window.removeEventListener('analitica:new', onNew);
      window.removeEventListener('analitica:edit', onEdit);
      window.removeEventListener('analitica:delete', onDelete);
      window.removeEventListener('analitica:columns', onColumns);
    };
  }, [selectedCode, selectedYearFilter, budgets, rawAccounts, user]);

  // 2. Filter & Process Budgets for selected year
  const budgetsForYear = useMemo(() => {
    const yearInt = parseInt(selectedYearFilter, 10);
    return budgets.filter(b => b.year === yearInt);
  }, [budgets, selectedYearFilter]);

  // Aggregate monthly actual balances from transactions
  const actualsForYear = useMemo(() => {
    const map = {};
    const yearInt = parseInt(selectedYearFilter, 10);
    
    const yearTxs = transactions.filter(tx => {
      if (!tx.date) return false;
      const txYear = parseInt(tx.date.split('-')[0], 10);
      return txYear === yearInt;
    });

    yearTxs.forEach(tx => {
      const acc = rawAccounts.find(a => a.id === tx.accountId || a.code === tx.accountId);
      if (!acc || !acc.code) return;
      
      const month = new Date(tx.date).getMonth();
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
  }, [transactions, rawAccounts, selectedYearFilter]);

  // 3. Compute unique account codes to display
  const processedTreeRows = useMemo(() => {
    const allCodes = new Set(rawAccounts.map(a => a.code).filter(Boolean));
    const budgetedCodes = new Set(budgetsForYear.map(b => b.accountCode).filter(Boolean));

    const budgetedAndParents = new Set();
    budgetedCodes.forEach(code => {
      budgetedAndParents.add(code);
      for (let len = 1; len < code.length; len++) {
        budgetedAndParents.add(code.substring(0, len));
      }
    });

    let codesToUse = showAllAccounts ? Array.from(allCodes) : Array.from(budgetedAndParents);

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

    // Apply Left Sidebar Group filters (from photo 5)
    if (!selectedGroupsFilter.includes('ALL')) {
      codesToUse = codesToUse.filter(code =>
        selectedGroupsFilter.some(gPrefix => code.startsWith(gPrefix))
      );
    }

    codesToUse.sort((a, b) => a.localeCompare(b));

    const getAccountType = (code) => {
      const dbAcc = rawAccounts.find(x => x.code === code);
      if (dbAcc && dbAcc.type) return dbAcc.type;
      if (code.startsWith('7')) return 'Ingreso';
      if (code.startsWith('6')) return 'Gasto';
      if (code.startsWith('1')) return 'Patrimonio';
      if (code.startsWith('2') || code.startsWith('3') || code.startsWith('5') || code.startsWith('43')) return 'Activo';
      return 'Pasivo';
    };

    return codesToUse.map(code => {
      const name = getAccountDescription(code, rawAccounts);
      const accType = getAccountType(code);

      // Roll up budgets
      const directBuds = budgetsForYear.filter(b => b.accountCode.startsWith(code));
      const budgetTotal = directBuds.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
      const budgetMonths = {};
      for (let m = 0; m < 12; m++) {
        budgetMonths[m] = directBuds.reduce((sum, b) => sum + (parseFloat(b.months?.[m]) || 0), 0);
      }

      // Roll up actuals
      const actualMonths = {};
      let actualTotal = 0;
      for (let m = 0; m < 12; m++) {
        let sumDebit = 0;
        let sumCredit = 0;
        Object.keys(actualsForYear).forEach(actCode => {
          if (actCode.startsWith(code)) {
            sumDebit += actualsForYear[actCode].debitMonths[m];
            sumCredit += actualsForYear[actCode].creditMonths[m];
          }
        });
        if (accType === 'Ingreso' || accType === 'Pasivo' || accType === 'Patrimonio') {
          actualMonths[m] = sumCredit - sumDebit;
        } else {
          actualMonths[m] = sumDebit - sumCredit;
        }
        actualTotal += actualMonths[m];
      }

      // Roll up deviations
      const deviationMonths = {};
      let deviationTotal = actualTotal - budgetTotal;
      for (let m = 0; m < 12; m++) {
        deviationMonths[m] = actualMonths[m] - budgetMonths[m];
      }

      let depth = 0;
      if (code.length === 2) depth = 1;
      else if (code.length === 3) depth = 2;
      else if (code.length === 4) depth = 3;
      else if (code.length > 4) depth = 4;

      let parentCode = null;
      for (let len = code.length - 1; len > 0; len--) {
        const testPrefix = code.substring(0, len);
        if (codesToUse.includes(testPrefix)) {
          parentCode = testPrefix;
          break;
        }
      }

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
  }, [rawAccounts, budgetsForYear, actualsForYear, showAllAccounts, selectedGroupsFilter]);

  // Filter tree rows by search query and collapsed state
  const filteredTreeRows = useMemo(() => {
    let rows = processedTreeRows;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      rows = processedTreeRows.filter(row => {
        const matchesSelf = row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
        const matchesDescendant = processedTreeRows.some(other => other.code.startsWith(row.code) && (other.code.toLowerCase().includes(q) || other.name.toLowerCase().includes(q)));
        return matchesSelf || matchesDescendant;
      });
    }

    return rows.filter(row => {
      for (let len = 1; len < row.code.length; len++) {
        const prefix = row.code.substring(0, len);
        if (collapsedKeys[prefix]) return false;
      }
      return true;
    });
  }, [processedTreeRows, filterQuery, collapsedKeys]);

  // Form modal triggers
  const handleNew = () => {
    setFormAccount(null);
    setFormYear(parseInt(selectedYearFilter, 10));
    setFormTotal(0);
    setFormMonths({
      0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0
    });
    setIsEditing(false);
    setShowForm(true);
  };

  const handleEdit = (budget) => {
    const acc = rawAccounts.find(a => a.id === budget.accountId || a.code === budget.accountCode);
    setFormAccount(acc || { id: budget.accountId, code: budget.accountCode, name: budget.accountName });
    setFormYear(budget.year);
    setFormTotal(budget.total);
    setFormMonths({ ...budget.months });
    setIsEditing(true);
    setShowForm(true);
  };

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

  const handleDelete = async (budget) => {
    if (!window.confirm(`¿Desea eliminar el presupuesto de la cuenta "${budget.accountCode} - ${budget.accountName}" para el año ${budget.year}?`)) return;
    await deleteDoc(doc(db, 'budgets', budget.id));
    if (selectedCode === budget.accountCode) setSelectedCode(null);
  };

  const handleDistributeProportionally = () => {
    const totalVal = parseFloat(formTotal) || 0;
    const splitVal = parseFloat((totalVal / 12).toFixed(2));
    const newMonths = {};
    for (let m = 0; m < 12; m++) {
      newMonths[m] = splitVal;
    }
    setFormMonths(newMonths);
  };

  const handleMonthChange = (monthIdx, value) => {
    const val = parseFloat(value) || 0;
    const updatedMonths = { ...formMonths, [monthIdx]: val };
    setFormMonths(updatedMonths);
    const sum = Object.values(updatedMonths).reduce((acc, v) => acc + v, 0);
    setFormTotal(parseFloat(sum.toFixed(2)));
  };

  // Toggle tree collapse
  const toggleCollapsed = (code, e) => {
    e.stopPropagation();
    setCollapsedKeys(prev => ({ ...prev, [code]: !prev[code] }));
  };

  // Sidebar Group Checklist Filter handlers (Photo 5 style)
  const toggleGroupFilter = (prefix) => {
    if (prefix === 'ALL') {
      setSelectedGroupsFilter(['ALL']);
      return;
    }
    let newFilters = selectedGroupsFilter.filter(x => x !== 'ALL');
    if (newFilters.includes(prefix)) {
      newFilters = newFilters.filter(x => x !== prefix);
      if (newFilters.length === 0) newFilters = ['ALL'];
    } else {
      newFilters.push(prefix);
    }
    setSelectedGroupsFilter(newFilters);
  };

  // Account Selector Modal Tree construction (Photo 4 style)
  const selectorTreeAccounts = useMemo(() => {
    // Generate parent nodes that might not exist in database
    const allDatabaseCodes = new Set(rawAccounts.map(a => a.code).filter(Boolean));
    const codesList = Array.from(allDatabaseCodes);
    
    // Add all proper prefixes
    const allGenerated = new Set();
    codesList.forEach(code => {
      allGenerated.add(code);
      for (let len = 1; len < code.length; len++) {
        allGenerated.add(code.substring(0, len));
      }
    });

    let targetCodes = Array.from(allGenerated);

    // Apply sidebar radios group filter (Photo 4 left group filter)
    if (selectorGroupFilter !== 'ALL') {
      targetCodes = targetCodes.filter(c => c.startsWith(selectorGroupFilter));
    }

    // Apply sidebar checkboxes (Cuentas PGC / Cuentas auxiliares)
    targetCodes = targetCodes.filter(c => {
      const isPgc = c.length <= 4;
      const isAux = c.length > 4;
      if (isPgc && !showPgcAccounts) return false;
      if (isAux && !showAuxAccounts) return false;
      return true;
    });

    // Apply search filter
    if (accountSelectorQuery) {
      const q = accountSelectorQuery.toLowerCase();
      targetCodes = targetCodes.filter(c => {
        const name = getAccountDescription(c, rawAccounts);
        const matchesSelf = c.toLowerCase().includes(q) || name.toLowerCase().includes(q);
        const matchesDescendant = Array.from(allGenerated).some(o => o.startsWith(c) && o !== c && (o.toLowerCase().includes(q) || getAccountDescription(o, rawAccounts).toLowerCase().includes(q)));
        return matchesSelf || matchesDescendant;
      });
    }

    targetCodes.sort((a, b) => a.localeCompare(b));

    return targetCodes.map(code => {
      const dbAcc = rawAccounts.find(x => x.code === code);
      const name = dbAcc ? dbAcc.name : (PGC_DESCRIPTIONS[code] || `Grupo/Cuenta ${code}`);
      const type = dbAcc ? dbAcc.type : (code.startsWith('7') ? 'Ingreso' : code.startsWith('6') ? 'Gasto' : 'Activo');
      
      let depth = 0;
      if (code.length === 2) depth = 1;
      else if (code.length === 3) depth = 2;
      else if (code.length === 4) depth = 3;
      else if (code.length > 4) depth = 4;

      const hasChildren = Array.from(allGenerated).some(o => o !== code && o.startsWith(code));

      return {
        id: dbAcc ? dbAcc.id : `pgc_${code}`,
        code,
        name,
        type,
        depth,
        hasChildren
      };
    });
  }, [rawAccounts, selectorGroupFilter, showPgcAccounts, showAuxAccounts, accountSelectorQuery]);

  const visibleSelectorAccounts = useMemo(() => {
    return selectorTreeAccounts.filter(row => {
      for (let len = 1; len < row.code.length; len++) {
        const prefix = row.code.substring(0, len);
        if (collapsedSelectorKeys[prefix]) return false;
      }
      return true;
    });
  }, [selectorTreeAccounts, collapsedSelectorKeys]);

  const selectAccountForForm = (row) => {
    setFormAccount({
      id: row.id.startsWith('pgc_') ? row.code : row.id,
      code: row.code,
      name: row.name
    });
    setShowAccountSelector(false);
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00 €';
    return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const formatDeviation = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00 €';
    const sign = val > 0 ? '+' : '';
    return sign + val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };

  const getDeviationColor = (val, type) => {
    if (Math.abs(val) < 0.01) return 'text-gray-700';
    if (type === 'Gasto') {
      return val < 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold';
    } else {
      return val > 0 ? 'text-green-700 font-bold' : 'text-red-700 font-bold';
    }
  };

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const monthAbbrs = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-row p-1 overflow-hidden font-sans select-none relative">
      
      {/* LEFT SIDEBAR: Year and Account checklist filters (Photo 5 style) */}
      <div className="w-56 bg-[#f0f0f0] border-r border-[#808080] overflow-y-auto p-3 flex flex-col gap-4 shrink-0 shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)]">
        
        {/* Years Filter Section */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 mb-2 border-b border-[#c0c0c0] pb-0.5 uppercase">
            Ejercicios (Año)
          </div>
          <div className="flex flex-col gap-1.5 pl-1">
            {['2024', '2025', '2026', '2027', '2028'].map(yr => (
              <label key={yr} className="flex items-center gap-2 text-[12px] cursor-pointer text-slate-700 font-medium">
                <input
                  type="radio"
                  name="sidebar-year"
                  checked={selectedYearFilter === yr}
                  onChange={() => setSelectedYearFilter(yr)}
                  className="accent-slate-600 scale-95"
                />
                Año {yr}
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-[#a0a0a0] my-1" />

        {/* Groups Filter Section */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 mb-2 border-b border-[#c0c0c0] pb-0.5 uppercase">
            Cuentas (Grupos)
          </div>
          <div className="flex flex-col gap-1.5 pl-1">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer text-slate-700 font-semibold">
              <input
                type="checkbox"
                checked={selectedGroupsFilter.includes('ALL')}
                onChange={() => toggleGroupFilter('ALL')}
                className="accent-slate-600 scale-95"
              />
              Todos los grupos
            </label>
            {[
              { code: '1', name: 'Grupo 1 - Financiación' },
              { code: '2', name: 'Grupo 2 - Inmovilizado' },
              { code: '3', name: 'Grupo 3 - Existencias' },
              { code: '4', name: 'Grupo 4 - Acreed./Deud.' },
              { code: '5', name: 'Grupo 5 - Cuentas Finan.' },
              { code: '6', name: 'Grupo 6 - Compras/Gastos' },
              { code: '7', name: 'Grupo 7 - Ventas/Ingresos' }
            ].map(gp => (
              <label key={gp.code} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600 pl-1">
                <input
                  type="checkbox"
                  checked={selectedGroupsFilter.includes(gp.code)}
                  onChange={() => toggleGroupFilter(gp.code)}
                  disabled={selectedGroupsFilter.includes('ALL')}
                  className="accent-slate-600 scale-90"
                />
                {gp.name}
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-[#a0a0a0] my-1" />

        {/* View Options */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 mb-2 border-b border-[#c0c0c0] pb-0.5 uppercase">
            Opciones Vista
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 pl-1 uppercase">
            <input
              type="checkbox"
              checked={showAllAccounts}
              onChange={e => setShowAllAccounts(e.target.checked)}
              className="accent-slate-600"
            />
            Mostrar todas
          </label>
        </div>

      </div>

      {/* RIGHT PANEL: Toolbar & Main Table */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        
        {/* Main table top Toolbar */}
        <div className="bg-[#d4d0c8] flex flex-row items-center justify-between px-3 py-1.5 border-b border-[#808080] shrink-0">
          <div className="text-[12px] font-bold text-slate-700">
            Vista: <span className="text-blue-700 capitalize font-extrabold">{viewMode}</span> ({selectedYearFilter})
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

        {/* Hierarchical Table */}
        <div className="flex-1 overflow-auto bg-white relative" onClick={() => setSelectedCode(null)}>
          <table className="clean-table border-collapse w-full min-w-[1200px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#e0dcd4]">
                {visibleColumns.includes('code') && <th style={{ width: columnWidths.code }}>Cuenta</th>}
                {visibleColumns.includes('description') && <th style={{ width: columnWidths.description }}>Descripción</th>}
                {visibleColumns.includes('total') && <th style={{ width: columnWidths.total }} className="text-right">Presupuesto</th>}
                {monthAbbrs.map((m, idx) => {
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
                    No hay presupuestos que coincidan para el año {selectedYearFilter}.
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
                        const budget = budgets.find(b => b.accountCode === row.code && b.year === parseInt(selectedYearFilter, 10));
                        if (budget) handleEdit(budget);
                        else {
                          const acc = rawAccounts.find(a => a.code === row.code);
                          if (acc) {
                            setFormAccount(acc);
                            setFormYear(parseInt(selectedYearFilter, 10));
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

                      {visibleColumns.includes('description') && (
                        <td className={`text-[12px] ${row.hasChildren ? 'font-bold' : ''}`}>{row.name}</td>
                      )}

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

                      {monthAbbrs.map((m, idx) => {
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

        {/* Status bar */}
        <div className="bg-[#d4d0c8] py-1 px-3 border-t border-white shadow-[inset_0_1px_0_#fff] flex justify-between items-center shrink-0">
          <div className="text-[10px] text-slate-500 font-bold uppercase">
            Presupuestos Analíticos Nexo
          </div>
          <ZoomControl />
        </div>

      </div>

      {/* ANNUAL BUDGET DIALOG MODAL (Photo 3 design) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Window
            title={isEditing ? 'Editar ficha de presupuesto anual' : 'Nueva ficha de presupuesto anual'}
            width="620px"
            height="460px"
            initialPos={{ x: 120, y: 50 }}
            onClose={() => setShowForm(false)}
          >
            <div className="flex-1 bg-[#d4d0c8] flex flex-col relative p-3 overflow-hidden">
              
              {/* Photo 3 Header Layout */}
              <div className="flex items-center gap-4 bg-[#f0f0f0] border border-[#808080] p-3 mb-3">
                <div className="w-14 h-14 border border-gray-400 bg-white flex items-center justify-center shrink-0">
                  <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M 6 3 L 20 3 L 26 9 L 26 27 L 6 27 Z" fill="white" stroke="#444" strokeWidth="1.5"/>
                    <path d="M 20 3 L 20 9 L 26 9" fill="white" stroke="#444" strokeWidth="1.5"/>
                    <rect x="9" y="7" width="8" height="3" fill="#16a34a"/>
                  </svg>
                </div>
                <div className="text-[14px] font-bold text-slate-800 uppercase tracking-tight">Ficha de presupuesto anual</div>
              </div>

              {/* Input Form Fields */}
              <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-4 flex-1 overflow-auto flex flex-col gap-3">
                
                {/* Cuenta Row (Photo 3 style) */}
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0 w-24">Cuenta:</span>
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="text"
                      readOnly
                      value={formAccount ? formAccount.code : ''}
                      placeholder="666.6"
                      onClick={() => setShowAccountSelector(true)}
                      className="w-28 border border-gray-400 px-2 py-1 text-[12px] bg-white cursor-pointer outline-none"
                    />
                    <button
                      onClick={() => setShowAccountSelector(true)}
                      className="px-2.5 py-1 bg-[#e0dcd4] border border-gray-400 hover:bg-[#d0ccc4] shadow-sm text-[11px] font-bold uppercase shrink-0"
                    >
                      ...
                    </button>
                    <span className="text-[12px] font-bold text-slate-700 truncate flex-1">
                      {formAccount ? formAccount.name : '(Ninguna cuenta seleccionada)'}
                    </span>
                  </div>
                </div>

                {/* Año and Presupuesto anual row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0 w-24">Año:</span>
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
                    <span className="text-[11px] font-bold text-slate-600 uppercase shrink-0">Presupuesto anual:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formTotal}
                      onChange={e => setFormTotal(parseFloat(e.target.value) || 0)}
                      className="w-24 border border-gray-400 px-2 py-1 text-[12px] bg-white text-right"
                    />
                    <button
                      onClick={handleDistributeProportionally}
                      className="px-2 py-1 bg-slate-100 border border-gray-400 hover:bg-slate-200 shadow-sm text-[10px] font-bold uppercase shrink-0"
                    >
                      Repartir proporcionalmente
                    </button>
                  </div>
                </div>

                {/* 12 Months Columns Grid (Leaves semesters & quarters out!) */}
                <div className="border-t border-[#c0c0c0] pt-3 mt-1">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    {monthNames.map((m, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <label className="w-24 text-[12px] text-slate-700 bg-slate-200/60 border border-transparent px-2 py-0.5 rounded font-medium">{m}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formMonths[idx] !== undefined ? formMonths[idx] : 0}
                          onChange={e => handleMonthChange(idx, e.target.value)}
                          className="w-28 border border-gray-400 px-2 py-0.5 text-[12px] bg-white text-right font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Form buttons */}
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

      {/* ACCOUNT SELECTOR WINDOW (Photo 4 design) */}
      {showAccountSelector && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]">
          <Window
            title="SELECCIÓN DE CUENTA"
            width="820px"
            height="550px"
            initialPos={{ x: 80, y: 40 }}
            onClose={() => setShowAccountSelector(false)}
          >
            <div className="flex-1 bg-[#d4d0c8] flex flex-col overflow-hidden relative">
              
              {/* Photo 4 Ribbon Top Header */}
              <div className="bg-[#f0f0f0] border-b border-[#808080] p-1.5 flex flex-row items-center gap-4 shrink-0">
                <div className="flex flex-row items-center gap-3">
                  <button className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded">
                    <Plus className="w-5 h-5 text-green-700" />
                    <span className="text-[10px] text-slate-700 font-bold">Nuevo</span>
                  </button>
                  <button className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded">
                    <Edit2 className="w-5 h-5 text-blue-600" />
                    <span className="text-[10px] text-slate-700 font-bold">Modificar</span>
                  </button>
                  <button className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    <span className="text-[10px] text-slate-700 font-bold">Eliminar</span>
                  </button>
                </div>
                <div className="h-8 border-l border-gray-400" />
                <div className="flex flex-row items-center gap-3">
                  <button className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded">
                    <ArrowUp className="w-5 h-5 text-gray-700" />
                    <span className="text-[10px] text-slate-700 font-bold">Subir</span>
                  </button>
                  <button className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded">
                    <ArrowDown className="w-5 h-5 text-gray-700" />
                    <span className="text-[10px] text-slate-700 font-bold">Bajar</span>
                  </button>
                </div>
                <div className="h-8 border-l border-gray-400" />
                <div className="flex flex-row items-center gap-3">
                  <button
                    onClick={() => setCollapsedSelectorKeys({})}
                    className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded"
                  >
                    <FolderOpen className="w-5 h-5 text-yellow-600" />
                    <span className="text-[10px] text-slate-700 font-bold">Expandir</span>
                  </button>
                  <button
                    onClick={() => {
                      const allKeys = {};
                      selectorTreeAccounts.forEach(r => { if (r.hasChildren) allKeys[r.code] = true; });
                      setCollapsedSelectorKeys(allKeys);
                    }}
                    className="flex flex-col items-center p-1 hover:bg-[#c0c0c0] border border-transparent hover:border-[#808080] rounded"
                  >
                    <Folder className="w-5 h-5 text-yellow-700" />
                    <span className="text-[10px] text-slate-700 font-bold">Colapsar</span>
                  </button>
                </div>
              </div>

              {/* Photo 4 Sidebar + Account Tree List */}
              <div className="flex-1 flex flex-row overflow-hidden">
                
                {/* Selector Sidebar (Left) */}
                <div className="w-[190px] bg-[#f0f0f0] border-r border-[#808080] overflow-y-auto p-2.5 flex flex-col gap-3 shrink-0">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase border-b border-gray-300 pb-0.5">Lista actual</div>
                    <div className="flex flex-col gap-1 pl-0.5">
                      <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700">
                        <input
                          type="radio"
                          name="sel-gp"
                          checked={selectorGroupFilter === 'ALL'}
                          onChange={() => setSelectorGroupFilter('ALL')}
                          className="scale-90"
                        />
                        Todos los grupos
                      </label>
                      {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(gpNum => (
                        <label key={gpNum} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600 pl-0.5">
                          <input
                            type="radio"
                            name="sel-gp"
                            checked={selectorGroupFilter === gpNum}
                            onChange={() => setSelectorGroupFilter(gpNum)}
                            className="scale-90"
                          />
                          Mostrar grupo {gpNum}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#c0c0c0] my-1" />

                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input
                        type="checkbox"
                        checked={showPgcAccounts}
                        onChange={e => setShowPgcAccounts(e.target.checked)}
                        className="scale-90"
                      />
                      Mostrar cuentas del PGC
                    </label>
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input
                        type="checkbox"
                        checked={showAuxAccounts}
                        onChange={e => setShowAuxAccounts(e.target.checked)}
                        className="scale-90"
                      />
                      Mostrar cuentas auxiliares
                    </label>
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input
                        type="checkbox"
                        checked={showObsoleteAccounts}
                        onChange={e => setShowObsoleteAccounts(e.target.checked)}
                        className="scale-90"
                      />
                      Mostrar obsoletas
                    </label>
                  </div>
                </div>

                {/* Right panel: Search & Tree list */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  
                  {/* Selector search */}
                  <div className="p-2 border-b border-gray-200 bg-[#f8f8f8] flex justify-end shrink-0">
                    <div className="relative w-64 flex items-center">
                      <input
                        type="text"
                        placeholder="Buscar en el fichero..."
                        value={accountSelectorQuery}
                        onChange={e => setAccountSelectorQuery(e.target.value)}
                        className="w-full pl-2 pr-8 py-1 text-[11px] border border-gray-400 bg-white outline-none"
                      />
                      <Search className="w-3.5 h-3.5 absolute right-2 text-gray-500" />
                    </div>
                  </div>

                  {/* Selector Table Tree */}
                  <div className="flex-1 overflow-auto">
                    <table className="clean-table border-collapse w-full">
                      <thead>
                        <tr className="sticky top-0 bg-[#e0dcd4]">
                          <th className="text-left w-24">CUENTA</th>
                          <th className="text-left">DESCRIPCIÓN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSelectorAccounts.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="text-center py-8 text-gray-400 text-[12px]">
                              No se encontraron cuentas contables que coincidan.
                            </td>
                          </tr>
                        ) : (
                          visibleSelectorAccounts.map(row => {
                            const isSelected = selectedSelectorCode === row.code;
                            const isCollapsed = collapsedSelectorKeys[row.code];
                            return (
                              <tr
                                key={row.code}
                                className={`cursor-pointer text-[12px] hover:bg-slate-100 ${isSelected ? 'bg-blue-100 text-blue-900 font-semibold' : ''}`}
                                onClick={() => setSelectedSelectorCode(row.code)}
                                onDoubleClick={() => selectAccountForForm(row)}
                              >
                                <td
                                  className="font-mono flex flex-row items-center"
                                  style={{ paddingLeft: `${row.depth * 14 + 6}px` }}
                                >
                                  {row.hasChildren ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCollapsedSelectorKeys(p => ({ ...p, [row.code]: !p[row.code] }));
                                      }}
                                      className="mr-1 p-0.5 hover:bg-gray-200/80 rounded"
                                    >
                                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                                    </button>
                                  ) : (
                                    <span className="w-4 shrink-0" />
                                  )}
                                  <span>{row.code}</span>
                                </td>
                                <td>{row.name}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>

              {/* Selector Footer */}
              <div className="flex justify-end gap-2 shrink-0 p-2.5 bg-[#d4d0c8] border-t border-[#808080]">
                <button
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase"
                  disabled={!selectedSelectorCode}
                  onClick={() => {
                    const row = visibleSelectorAccounts.find(r => r.code === selectedSelectorCode);
                    if (row) selectAccountForForm(row);
                  }}
                >
                  Aceptar
                </button>
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

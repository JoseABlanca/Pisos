import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';
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

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const monthAbbrs = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Custom SVG Icons for Toolbar
const IconNuevo = () => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2v20h12V8l-6-6H4z" fill="white" stroke="#666" strokeWidth="1" />
    <path d="M10 2v6h6" stroke="#666" strokeWidth="1" />
    <path d="M7 15h6M10 12v6" stroke="#16a34a" strokeWidth="2" />
  </svg>
);
const IconModificar = () => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2v20h12V8l-6-6H4z" fill="white" stroke="#666" strokeWidth="1" />
    <path d="M10 2v6h6" stroke="#666" strokeWidth="1" />
    <path d="M8 16l3-3 3 3-2 2-4-2z" fill="#2563eb" />
  </svg>
);
const IconEliminar = () => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2v20h12V8l-6-6H4z" fill="white" stroke="#666" strokeWidth="1" />
    <path d="M10 2v6h6" stroke="#666" strokeWidth="1" />
    <path d="M8 13l4 4M12 13l-4 4" stroke="#dc2626" strokeWidth="1.5" />
  </svg>
);
const IconSubir = () => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="#666" strokeWidth="1">
    <path d="M10 18V6M6 10l4-4 4 4" />
  </svg>
);
const IconBajar = () => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="#666" strokeWidth="1">
    <path d="M10 6v12M6 14l4 4 4-4" />
  </svg>
);
const IconExpandir = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8v11h16V10H11l-2-2H4z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
    <path d="M10 13h4M12 11v4" stroke="#16a34a" strokeWidth="1.5" />
  </svg>
);
const IconColapsar = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8v11h16V10H11l-2-2H4z" fill="#fef08a" stroke="#ca8a04" strokeWidth="1" />
    <path d="M10 15h4" stroke="#dc2626" strokeWidth="1.5" />
  </svg>
);

export default function Analitica() {
  const { user, queryUserIds } = useAuth();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get('view') || 'asignacion';

  // Data states
  const [rawAccounts, setRawAccounts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState(null);

  // Left Sidebar Filter States
  const [selectedYearFilter, setSelectedYearFilter] = useState('2026');
  const [selectedGroupsFilter, setSelectedGroupsFilter] = useState(['ALL']); 
  const [mainShowPgcAccounts, setMainShowPgcAccounts] = useState(false);
  const [mainShowAuxAccounts, setMainShowAuxAccounts] = useState(true);
  const [mainShowObsoleteAccounts, setMainShowObsoleteAccounts] = useState(false);

  // UI states
  const [collapsedKeys, setCollapsedKeys] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Desviación Modal States
  const [showDesviacionModal, setShowDesviacionModal] = useState(false);
  const [desviacionAccount, setDesviacionAccount] = useState(null);

  // Selector Modal States
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [accountSelectorTarget, setAccountSelectorTarget] = useState('budget');
  const [selectorGroupFilter, setSelectorGroupFilter] = useState('ALL');
  const [showPgcAccounts, setShowPgcAccounts] = useState(false);
  const [showAuxAccounts, setShowAuxAccounts] = useState(true);
  const [showObsoleteAccounts, setShowObsoleteAccounts] = useState(false);
  const [accountSelectorQuery, setAccountSelectorQuery] = useState('');
  const [collapsedSelectorKeys, setCollapsedSelectorKeys] = useState({});
  const [selectedSelectorCode, setSelectedSelectorCode] = useState(null);

  // Form states
  const [formAccount, setFormAccount] = useState(null);
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

  useEffect(() => {
    const onOpenDesviacionModal = () => {
      if (selectedCode) {
        const acc = rawAccounts.find(a => a.code === selectedCode);
        if (acc) {
          setDesviacionAccount(acc);
        } else {
          setDesviacionAccount({ id: selectedCode, code: selectedCode, name: getAccountDescription(selectedCode, rawAccounts) });
        }
      } else {
        setDesviacionAccount(null);
      }
      setShowDesviacionModal(true);
    };

    window.addEventListener('analitica:open-desviacion-modal', onOpenDesviacionModal);
    return () => {
      window.removeEventListener('analitica:open-desviacion-modal', onOpenDesviacionModal);
    };
  }, [selectedCode, rawAccounts]);

  const budgetsForYear = useMemo(() => {
    const yearInt = parseInt(selectedYearFilter, 10);
    return budgets.filter(b => b.year === yearInt);
  }, [budgets, selectedYearFilter]);

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

    // We will show all accounts that match the filters, not just budgeted ones, to match the "Cuentas contables" view
    let codesToUse = Array.from(allCodes);
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

    if (!selectedGroupsFilter.includes('ALL')) {
      codesToUse = codesToUse.filter(code =>
        selectedGroupsFilter.some(gPrefix => code.startsWith(gPrefix))
      );
    }

    codesToUse = codesToUse.filter(c => {
      const isPgc = c.length <= 4;
      const isAux = c.length > 4;
      if (isPgc && !mainShowPgcAccounts) return false;
      if (isAux && !mainShowAuxAccounts) return false;
      return true;
    });

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

      const directBuds = budgetsForYear.filter(b => b.accountCode.startsWith(code));
      const budgetTotal = directBuds.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
      const budgetMonths = {};
      for (let m = 0; m < 12; m++) {
        budgetMonths[m] = directBuds.reduce((sum, b) => sum + (parseFloat(b.months?.[m]) || 0), 0);
      }

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
  }, [rawAccounts, budgetsForYear, actualsForYear, selectedGroupsFilter, mainShowPgcAccounts, mainShowAuxAccounts]);

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

  const onEditSelected = () => {
    if (!selectedCode) return;
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
    }
  };

  const onDeleteSelected = () => {
    if (!selectedCode) return;
    const yearInt = parseInt(selectedYearFilter, 10);
    const budget = budgets.find(b => b.accountCode === selectedCode && b.year === yearInt);
    if (budget) {
      handleDelete(budget);
    } else {
      alert('No existe un presupuesto asignado para esta cuenta en el año seleccionado.');
    }
  };

  const onMoveUp = () => {
    alert('El orden de las cuentas contables es automático y viene determinado por el código del Plan General Contable.');
  };

  const onMoveDown = () => {
    alert('El orden de las cuentas contables es automático y viene determinado por el código del Plan General Contable.');
  };

  const onExpandAll = () => {
    setCollapsedKeys({});
  };

  const onCollapseAll = () => {
    const allParentKeys = {};
    processedTreeRows.forEach(row => {
      if (row.hasChildren) {
        allParentKeys[row.code] = true;
      }
    });
    setCollapsedKeys(allParentKeys);
  };

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

  const toggleCollapsed = (code, e) => {
    e.stopPropagation();
    setCollapsedKeys(prev => ({ ...prev, [code]: !prev[code] }));
  };

  const openAccountSelectorFor = (target) => {
    setAccountSelectorTarget(target);
    setSelectedSelectorCode(null);
    setShowAccountSelector(true);
  };

  const selectorTreeAccounts = useMemo(() => {
    const allDatabaseCodes = new Set(rawAccounts.map(a => a.code).filter(Boolean));
    const codesList = Array.from(allDatabaseCodes);
    
    const allGenerated = new Set();
    codesList.forEach(code => {
      allGenerated.add(code);
      for (let len = 1; len < code.length; len++) {
        allGenerated.add(code.substring(0, len));
      }
    });

    let targetCodes = Array.from(allGenerated);

    if (selectorGroupFilter !== 'ALL') {
      targetCodes = targetCodes.filter(c => c.startsWith(selectorGroupFilter));
    }

    targetCodes = targetCodes.filter(c => {
      const isPgc = c.length <= 4;
      const isAux = c.length > 4;
      if (isPgc && !showPgcAccounts) return false;
      if (isAux && !showAuxAccounts) return false;
      return true;
    });

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

  const selectAccountForTarget = (row) => {
    const acc = {
      id: row.id.startsWith('pgc_') ? row.code : row.id,
      code: row.code,
      name: row.name
    };
    if (accountSelectorTarget === 'budget') {
      setFormAccount(acc);
    } else {
      setDesviacionAccount(acc);
    }
    setShowAccountSelector(false);
  };

  const desviacionModalRows = useMemo(() => {
    if (!desviacionAccount || !desviacionAccount.code) return [];
    
    const code = desviacionAccount.code;
    const dbAcc = rawAccounts.find(x => x.code === code);
    const accType = dbAcc?.type || (code.startsWith('7') ? 'Ingreso' : code.startsWith('6') ? 'Gasto' : 'Activo');

    const directBuds = budgetsForYear.filter(b => b.accountCode.startsWith(code));
    const budgetMonths = {};
    for (let m = 0; m < 12; m++) {
      budgetMonths[m] = directBuds.reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
    }

    const actualMonths = {};
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
    }

    const rows = [];
    let cumBudget = 0;
    let cumActual = 0;

    for (let m = 0; m < 12; m++) {
      const b = budgetMonths[m] || 0;
      const a = actualMonths[m] || 0;
      const dev = a - b;
      
      let pctDev = 0;
      if (b !== 0) {
        pctDev = (dev / b) * 100;
      } else if (a !== 0) {
        pctDev = dev > 0 ? 100 : -100;
      }

      cumBudget += b;
      cumActual += a;
      const cumDev = cumActual - cumBudget;
      
      let pctCumDev = 0;
      if (cumBudget !== 0) {
        pctCumDev = (cumDev / cumBudget) * 100;
      } else if (cumActual !== 0) {
        pctCumDev = cumDev > 0 ? 100 : -100;
      }

      rows.push({
        monthName: monthNames[m],
        budget: b,
        actual: a,
        deviation: dev,
        pctDeviation: pctDev,
        pctCumDeviation: pctCumDev
      });
    }
    return rows;
  }, [desviacionAccount, rawAccounts, budgetsForYear, actualsForYear]);

  const selectSelectorAccount = (row) => {
    setSelectedSelectorCode(row.code);
  };

  const formatCurrency = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00';
    return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDeviation = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0,00';
    const sign = val > 0 ? '+' : val < 0 ? '- ' : '';
    return sign + Math.abs(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col font-sans relative">
      
      {/* TOOLBAR (Foto 3) */}
      <div className="bg-[#f0f0f0] border-b border-gray-300 p-1 flex flex-row items-center gap-2 shrink-0">
        <div className="flex flex-row items-center gap-1">
          <button onClick={handleNew} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
            <IconNuevo />
            <span className="text-[10px] text-slate-700 mt-1">Nuevo</span>
          </button>
          <button onClick={onEditSelected} disabled={!selectedCode} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded disabled:opacity-50">
            <IconModificar />
            <span className="text-[10px] text-slate-700 mt-1">Modificar</span>
          </button>
          <button onClick={onDeleteSelected} disabled={!selectedCode} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded disabled:opacity-50">
            <IconEliminar />
            <span className="text-[10px] text-slate-700 mt-1">Eliminar</span>
          </button>
        </div>
        
        <div className="h-10 border-l border-gray-300 mx-1" />
        
        <div className="flex flex-row items-center gap-1">
          <button onClick={onMoveUp} disabled={!selectedCode} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded disabled:opacity-50">
            <IconSubir />
            <span className="text-[10px] text-slate-700 mt-1">Subir</span>
          </button>
          <button onClick={onMoveDown} disabled={!selectedCode} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded disabled:opacity-50">
            <IconBajar />
            <span className="text-[10px] text-slate-700 mt-1">Bajar</span>
          </button>
        </div>
        
        <div className="h-10 border-l border-gray-300 mx-1" />
        
        <div className="flex flex-row items-center gap-1">
          <button onClick={onExpandAll} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
            <IconExpandir />
            <span className="text-[10px] text-slate-700 mt-1">Expandir</span>
          </button>
          <button onClick={onCollapseAll} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
            <IconColapsar />
            <span className="text-[10px] text-slate-700 mt-1">Colapsar</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR (Foto 3 style) */}
        <div className="w-[200px] bg-[#f0f0f0] border-r border-gray-300 overflow-y-auto p-2.5 flex flex-col gap-3 shrink-0">
          <div>
            <div className="text-[10px] font-bold text-slate-600 mb-1.5 border-b border-gray-300 pb-0.5">Lista actual</div>
            <div className="flex flex-col gap-1 pl-0.5">
              <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700">
                <input type="radio" checked={selectedGroupsFilter.includes('ALL')} onChange={() => setSelectedGroupsFilter(['ALL'])} className="scale-90" />
                <span className={selectedGroupsFilter.includes('ALL') ? 'text-blue-700 font-semibold' : ''}>Todos los grupos</span>
              </label>
              {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(gp => (
                <label key={gp} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600 pl-0.5">
                  <input type="radio" checked={selectedGroupsFilter.includes(gp) && selectedGroupsFilter.length === 1} onChange={() => setSelectedGroupsFilter([gp])} className="scale-90" />
                  <span className={selectedGroupsFilter.includes(gp) && selectedGroupsFilter.length === 1 ? 'text-blue-700 font-semibold' : ''}>Mostrar grupo {gp}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-300 my-1" />
          <div className="flex flex-col gap-1.5 pl-0.5">
            <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
              <input type="checkbox" checked={mainShowPgcAccounts} onChange={e => setMainShowPgcAccounts(e.target.checked)} className="scale-90" />
              <span className={mainShowPgcAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar cuentas del PGC</span>
            </label>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
              <input type="checkbox" checked={mainShowAuxAccounts} onChange={e => setMainShowAuxAccounts(e.target.checked)} className="scale-90" />
              <span className={mainShowAuxAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar cuentas auxiliares</span>
            </label>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
              <input type="checkbox" checked={mainShowObsoleteAccounts} onChange={e => setMainShowObsoleteAccounts(e.target.checked)} className="scale-90" />
              <span className={mainShowObsoleteAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar cuentas obsoletas</span>
            </label>
          </div>
        </div>

        {/* RIGHT PANEL: Search & Main Table */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative">
          {/* Top Search bar inside right panel */}
          <div className="bg-white border-b border-gray-200 p-2 flex justify-end shrink-0">
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar en el fichero (Alt+B)"
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                className="pl-2 pr-8 py-1 text-[11px] w-64 border-b border-gray-400 outline-none text-right"
              />
              <Search className="w-3 h-3 absolute right-2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex-1 overflow-auto relative" onClick={() => setSelectedCode(null)}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb] z-10">
                  {visibleColumns.includes('code') && <th className="text-left text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200 w-32 uppercase tracking-wide">Cuenta</th>}
                  {visibleColumns.includes('description') && <th className="text-left text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200 uppercase tracking-wide">Descripción</th>}
                  {visibleColumns.includes('total') && <th className="text-right text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200 w-24 uppercase tracking-wide">Presupuesto</th>}
                  {monthAbbrs.map((m, idx) => {
                    const colId = m.toLowerCase();
                    return visibleColumns.includes(colId) && (
                      <th key={colId} className="text-right text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200 w-20 uppercase tracking-wide">{m}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredTreeRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 text-[12px]">
                      No hay datos.
                    </td>
                  </tr>
                ) : (
                  filteredTreeRows.map(row => {
                    const isSelected = selectedCode === row.code;
                    const isCollapsed = collapsedKeys[row.code];
                    const hasBudget = row.budget.total > 0;

                    return (
                      <tr
                        key={row.code}
                        className={`cursor-pointer border-b border-gray-100 ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
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
                          <td className="text-[11px] py-1 px-2 border-r border-gray-100 flex items-center" style={{ paddingLeft: `${row.depth * 12 + 8}px` }}>
                            {row.hasChildren ? (
                              <button onClick={(e) => toggleCollapsed(row.code, e)} className="mr-1 hover:bg-gray-200 rounded p-0.5">
                                {isCollapsed ? <ChevronRight className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <span className={hasBudget ? 'font-semibold text-blue-800' : 'text-gray-600'}>{row.code}</span>
                          </td>
                        )}

                        {visibleColumns.includes('description') && (
                          <td className={`text-[11px] py-1 px-2 border-r border-gray-100 uppercase ${hasBudget ? 'font-semibold text-blue-900' : 'text-gray-700'}`}>{row.name}</td>
                        )}

                        {visibleColumns.includes('total') && (
                          <td className={`text-right text-[11px] py-1 px-2 border-r border-gray-100 ${hasBudget ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
                            {formatCurrency(row.budget.total)}
                          </td>
                        )}

                        {monthAbbrs.map((m, idx) => {
                          const colId = m.toLowerCase();
                          if (!visibleColumns.includes(colId)) return null;
                          const val = row.budget.months[idx];
                          return (
                            <td key={colId} className={`text-right text-[11px] py-1 px-2 border-r border-gray-100 ${val > 0 ? 'text-gray-800' : 'text-transparent'}`}>
                              {val > 0 ? formatCurrency(val) : '-'}
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
        </div>
      </div>

      {/* DESVIACIÓN DIALOG MODAL (Foto 1 design) */}
      {showDesviacionModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Window title="Desviación de presupuestos" width="750px" height="520px" initialPos={{ x: 100, y: 50 }} onClose={() => setShowDesviacionModal(false)}>
            <div className="flex-1 bg-white flex flex-col relative p-4 overflow-hidden font-sans">
              
              <div className="flex mb-4">
                <div className="w-20 h-14 border border-gray-300 bg-gray-50 flex items-center justify-center shrink-0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1">
                    <rect x="4" y="4" width="16" height="16" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <span className="text-[12px] text-black border border-gray-300 py-0.5 px-2 bg-white">Cuenta:</span>
                <input
                  type="text"
                  readOnly
                  value={desviacionAccount ? desviacionAccount.code : ''}
                  onClick={() => openAccountSelectorFor('desviacion')}
                  className="w-24 border border-gray-400 px-2 py-0.5 text-[12px] outline-none cursor-pointer text-black"
                />
                <span className="text-[12px] text-black uppercase">{desviacionAccount ? desviacionAccount.name : ''}</span>
              </div>

              <div className="flex-1 overflow-auto border border-gray-400 mb-2 relative bg-white">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_0_#aaa]">
                    <tr>
                      <th className="text-left font-normal py-1.5 px-2 border-r border-gray-300">MES</th>
                      <th className="text-right font-normal py-1.5 px-2 border-r border-gray-300">PRESUPUESTO</th>
                      <th className="text-right font-normal py-1.5 px-2 border-r border-gray-300">SALDO</th>
                      <th className="text-right font-normal py-1.5 px-2 border-r border-gray-300">DESVIACIÓN</th>
                      <th className="text-right font-normal py-1.5 px-2 border-r border-gray-300">% DESVIACIÓN</th>
                      <th className="text-right font-normal py-1.5 px-2">% DESV.ARRAST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desviacionModalRows.map((r, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="py-1.5 px-2 border-r border-gray-200 bg-gray-50">{r.monthName}</td>
                        <td className={`py-1.5 px-2 border-r border-gray-200 text-right ${idx === 0 ? 'bg-gray-200' : ''}`}>{formatCurrency(r.budget)}</td>
                        <td className={`py-1.5 px-2 border-r border-gray-200 text-right ${idx === 0 ? 'bg-gray-200' : ''}`}>{formatCurrency(r.actual)}</td>
                        <td className={`py-1.5 px-2 border-r border-gray-200 text-right ${idx === 0 ? 'bg-gray-200' : ''}`}>{formatDeviation(r.deviation)}</td>
                        <td className={`py-1.5 px-2 border-r border-gray-200 text-right ${idx === 0 ? 'bg-gray-200' : ''}`}>{formatDeviation(r.pctDeviation)}</td>
                        <td className={`py-1.5 px-2 text-right ${idx === 0 ? 'bg-gray-200' : ''}`}>{formatDeviation(r.pctCumDeviation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-4 mb-3 text-[11px] underline cursor-pointer text-black">
                <span>Ver en vista previa</span>
                <span>Copiar al portapapeles</span>
              </div>

              <div className="flex justify-end gap-3 mt-1">
                <button className="px-4 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100">
                  Ver en contramoneda
                </button>
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100 font-bold" onClick={() => alert('Calculado')}>
                  Proceder
                </button>
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100" onClick={() => setShowDesviacionModal(false)}>
                  Salir
                </button>
              </div>

            </div>
          </Window>
        </div>
      )}

      {/* ANNUAL BUDGET DIALOG MODAL (Foto 2 design) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <Window title={isEditing ? 'Ficha de presupuesto anual' : 'Ficha de presupuesto anual'} width="500px" height="400px" initialPos={{ x: 120, y: 50 }} onClose={() => setShowForm(false)}>
            <div className="flex-1 bg-white flex flex-col relative p-4 overflow-hidden font-sans">
              
              <div className="flex mb-4">
                <div className="w-20 h-14 border border-gray-300 bg-gray-50 flex items-center justify-center shrink-0">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1">
                    <rect x="4" y="4" width="16" height="16" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mb-5 pl-2">
                <span className="text-[12px] text-black w-28 text-right border border-gray-300 py-0.5 px-2 bg-white">Cuenta:</span>
                <input type="text" readOnly value={formAccount ? formAccount.code : ''} onClick={() => openAccountSelectorFor('budget')} className="w-24 border border-gray-400 px-2 py-0.5 text-[12px] outline-none cursor-pointer" />
                <span className="text-[12px] text-black uppercase">{formAccount ? formAccount.name : ''}</span>
              </div>

              <div className="flex items-center gap-3 mb-5 pl-2">
                <span className="text-[12px] font-bold text-black w-28 text-right">Presupuesto anual:</span>
                <input type="number" step="0.01" value={formTotal} onChange={e => setFormTotal(parseFloat(e.target.value) || 0)} className="w-24 border border-blue-500 bg-blue-50 text-blue-900 px-2 py-0.5 text-[12px] outline-none text-right font-bold" />
                <button onClick={handleDistributeProportionally} className="ml-1 px-3 py-1 bg-white border border-gray-400 text-[11px] text-black hover:bg-gray-100">
                  Repartir proporcionalmente
                </button>
              </div>

              <div className="flex-1 overflow-auto pl-2">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 max-w-[420px]">
                  {monthNames.map((m, idx) => (
                    <div key={idx} className="flex items-center">
                      <label className="w-24 text-[12px] text-black text-center bg-gray-100 border border-transparent py-0.5">{m}</label>
                      <input type="number" step="0.01" value={formMonths[idx] !== undefined ? formMonths[idx] : 0} onChange={e => handleMonthChange(idx, e.target.value)} className="w-24 border border-gray-300 px-2 py-0.5 text-[12px] outline-none text-right ml-1" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-3 bg-gray-50 -mx-4 -mb-4 px-4 pb-4 border-t border-gray-200">
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100" onClick={handleSave}>
                  Aceptar
                </button>
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100" onClick={() => setShowForm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}

      {/* ACCOUNT SELECTOR WINDOW */}
      {showAccountSelector && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[60]">
          <Window title="SELECCIÓN DE CUENTA" width="820px" height="550px" initialPos={{ x: 80, y: 40 }} onClose={() => setShowAccountSelector(false)}>
            <div className="flex-1 bg-white flex flex-col overflow-hidden relative font-sans">
              
              <div className="bg-[#f0f0f0] border-b border-gray-300 p-1 flex flex-row items-center gap-2 shrink-0">
                <div className="flex flex-row items-center gap-1">
                  <button className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconNuevo />
                    <span className="text-[10px] text-slate-700 mt-1">Nuevo</span>
                  </button>
                  <button className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconModificar />
                    <span className="text-[10px] text-slate-700 mt-1">Modificar</span>
                  </button>
                  <button className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconEliminar />
                    <span className="text-[10px] text-slate-700 mt-1">Eliminar</span>
                  </button>
                </div>
                <div className="h-10 border-l border-gray-300 mx-1" />
                <div className="flex flex-row items-center gap-1">
                  <button className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconSubir />
                    <span className="text-[10px] text-slate-700 mt-1">Subir</span>
                  </button>
                  <button className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconBajar />
                    <span className="text-[10px] text-slate-700 mt-1">Bajar</span>
                  </button>
                </div>
                <div className="h-10 border-l border-gray-300 mx-1" />
                <div className="flex flex-row items-center gap-1">
                  <button onClick={() => setCollapsedSelectorKeys({})} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconExpandir />
                    <span className="text-[10px] text-slate-700 mt-1">Expandir</span>
                  </button>
                  <button onClick={() => {
                    const allKeys = {};
                    selectorTreeAccounts.forEach(r => { if (r.hasChildren) allKeys[r.code] = true; });
                    setCollapsedSelectorKeys(allKeys);
                  }} className="flex flex-col items-center px-2 py-1 hover:bg-[#e0e0e0] border border-transparent rounded">
                    <IconColapsar />
                    <span className="text-[10px] text-slate-700 mt-1">Colapsar</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-row overflow-hidden">
                <div className="w-[190px] bg-[#f0f0f0] border-r border-gray-300 overflow-y-auto p-2.5 flex flex-col gap-3 shrink-0">
                  <div>
                    <div className="text-[10px] font-bold text-slate-600 mb-1.5 uppercase border-b border-gray-300 pb-0.5">Lista actual</div>
                    <div className="flex flex-col gap-1 pl-0.5">
                      <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700">
                        <input type="radio" checked={selectorGroupFilter === 'ALL'} onChange={() => setSelectorGroupFilter('ALL')} className="scale-90" />
                        <span className={selectorGroupFilter === 'ALL' ? 'text-blue-700 font-semibold' : ''}>Todos los grupos</span>
                      </label>
                      {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(gpNum => (
                        <label key={gpNum} className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600 pl-0.5">
                          <input type="radio" checked={selectorGroupFilter === gpNum} onChange={() => setSelectorGroupFilter(gpNum)} className="scale-90" />
                          <span className={selectorGroupFilter === gpNum ? 'text-blue-700 font-semibold' : ''}>Mostrar grupo {gpNum}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#c0c0c0] my-1" />

                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input type="checkbox" checked={showPgcAccounts} onChange={e => setShowPgcAccounts(e.target.checked)} className="scale-90" />
                      <span className={showPgcAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar cuentas del PGC</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input type="checkbox" checked={showAuxAccounts} onChange={e => setShowAuxAccounts(e.target.checked)} className="scale-90" />
                      <span className={showAuxAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar cuentas auxiliares</span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-600">
                      <input type="checkbox" checked={showObsoleteAccounts} onChange={e => setShowObsoleteAccounts(e.target.checked)} className="scale-90" />
                      <span className={showObsoleteAccounts ? 'text-blue-700 font-semibold' : ''}>Mostrar obsoletas</span>
                    </label>
                  </div>
                </div>

                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                  <div className="bg-white border-b border-gray-200 p-2 flex justify-end shrink-0">
                    <div className="relative flex items-center">
                      <input type="text" placeholder="Buscar en el fichero (Alt+B)" value={accountSelectorQuery} onChange={e => setAccountSelectorQuery(e.target.value)} className="w-64 pl-2 pr-8 py-1 text-[11px] border-b border-gray-400 outline-none text-right" />
                      <Search className="w-3.5 h-3.5 absolute right-2 text-gray-400" />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-white shadow-[0_1px_0_#e5e7eb] z-10">
                          <th className="text-left text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200 w-24">CUENTA</th>
                          <th className="text-left text-[11px] font-normal text-gray-500 py-2 px-2 border-r border-gray-200">DESCRIPCIÓN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSelectorAccounts.length === 0 ? (
                          <tr><td colSpan={2} className="text-center py-8 text-gray-400 text-[12px]">No se encontraron cuentas contables que coincidan.</td></tr>
                        ) : (
                          visibleSelectorAccounts.map(row => {
                            const isSelected = selectedSelectorCode === row.code;
                            const isCollapsed = collapsedSelectorKeys[row.code];
                            return (
                              <tr
                                key={row.code}
                                className={`cursor-pointer text-[11px] hover:bg-gray-50 border-b border-gray-100 ${isSelected ? 'bg-blue-50 font-semibold' : ''}`}
                                onClick={() => selectSelectorAccount(row)}
                                onDoubleClick={() => selectAccountForTarget(row)}
                              >
                                <td className="py-1 px-2 border-r border-gray-100 flex items-center" style={{ paddingLeft: `${row.depth * 14 + 6}px` }}>
                                  {row.hasChildren ? (
                                    <button onClick={(e) => { e.stopPropagation(); setCollapsedSelectorKeys(p => ({ ...p, [row.code]: !p[row.code] })); }} className="mr-1 p-0.5 hover:bg-gray-200 rounded">
                                      {isCollapsed ? <ChevronRight className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                                    </button>
                                  ) : (<span className="w-4 shrink-0" />)}
                                  <span>{row.code}</span>
                                </td>
                                <td className="py-1 px-2 uppercase text-gray-700">{row.name}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-3 bg-gray-50 px-4 pb-4 border-t border-gray-200">
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100" disabled={!selectedSelectorCode} onClick={() => {
                  const row = visibleSelectorAccounts.find(r => r.code === selectedSelectorCode);
                  if (row) selectAccountForTarget(row);
                }}>
                  Aceptar
                </button>
                <button className="px-6 py-1 bg-white border border-gray-400 text-[12px] text-black hover:bg-gray-100" onClick={() => setShowAccountSelector(false)}>
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

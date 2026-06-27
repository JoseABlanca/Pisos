import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  FileText, 
  PieChart, 
  Activity, 
  Columns,
  Mail,
  Calendar,
  Layers,
  Sliders,
  ChevronDown
} from 'lucide-react';

export default function FinancialReports() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, queryUserIds } = useAuth();
  
  // Tab State (sync with URL parameter)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'balance'); 
  
  // Database States
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Period Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(0); // 0-11
  const [endMonth, setEndMonth] = useState(11); // 0-11

  // Sidebar Filter States
  const [showSidebar, setShowSidebar] = useState(true);
  const [detailLevel, setDetailLevel] = useState(4); // 0: Masas, 1: Submasas, 2: 2-dígitos, 3: 3-dígitos, 4: 4-dígitos
  
  // Section visibility states
  const [showActivo, setShowActivo] = useState(true);
  const [showPasivo, setShowPasivo] = useState(true);
  const [showPatrimonio, setShowPatrimonio] = useState(true);
  const [showCorriente, setShowCorriente] = useState(true);
  const [showNoCorriente, setShowNoCorriente] = useState(true);
  
  const [showIngreso, setShowIngreso] = useState(true);
  const [showGasto, setShowGasto] = useState(true);

  const [showExplotacion, setShowExplotacion] = useState(true);
  const [showInversion, setShowInversion] = useState(true);
  const [showFinanciacion, setShowFinanciacion] = useState(true);

  // Sync activeTab when searchParams change (from ribbon click)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['balance', 'income', 'cashflow', 'dates', 'informe'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Firestore Subscriptions
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    const qAccs = query(collection(db, 'accounts'), where('userId', 'in', userIds));
    const unsubAccs = onSnapshot(qAccs, (snap) => {
      const accs = snap.docs.map(doc => {
        const data = doc.data();
        const code = data.code || '';
        
        let parentId = data.parentId !== undefined ? data.parentId : data.parent_id;
        if (parentId === undefined) parentId = null;

        let type = data.type;
        if (!type && code) {
          const first = code.charAt(0);
          if (['2', '3', '4', '5'].includes(first)) type = 'Activo';
          else if (first === '6' || first === '8') type = 'Gasto';
          else if (first === '7' || first === '9') type = 'Ingreso';
          else if (first === '1') {
            if (code.startsWith('10') || code.startsWith('11') || code.startsWith('12')) type = 'Patrimonio';
            else type = 'Pasivo';
          }
        }

        return { 
          id: doc.id, 
          ...data,
          parentId,
          type: type || 'Activo'
        };
      });
      setAccounts(accs);
    });

    const qEntries = query(collection(db, 'journal_entries'), where('userId', 'in', userIds));
    const unsubEntries = onSnapshot(qEntries, (snap) => {
      const ents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEntries(ents);
      setLoading(false);
    });

    return () => {
      unsubAccs();
      unsubEntries();
    };
  }, [user, queryUserIds]);

  // Handle Email sending
  const handleSendReport = async () => {
    setSending(true);
    try {
      const sendEmail = httpsCallable(functions, 'sendFinancialReport');
      await sendEmail({ reportType: activeTab, year: selectedYear, startMonth, endMonth });
      alert('Reporte enviado correctamente a la lista de correos configurada.');
    } catch (error) {
      console.error(error);
      alert('Error al enviar el reporte. Asegúrese de haber configurado el SMTP en Herramientas → Configuración.');
    }
    setSending(false);
  };

  // Helper for PGC standard names
  const getPrefixName = (code, dbAccounts) => {
    const found = dbAccounts.find(a => a.code === code);
    if (found) return found.name;
    
    const pgcNames = {
      '10': 'Capital',
      '11': 'Reservas',
      '12': 'Resultados del ejercicio',
      '13': 'Subvenciones y legados',
      '14': 'Provisiones a largo plazo',
      '17': 'Deudas a largo plazo con entidades de crédito',
      '20': 'Inmovilizado intangible',
      '21': 'Inmovilizado material',
      '22': 'Inversiones inmobiliarias',
      '28': 'Amortización acumulada del inmovilizado',
      '30': 'Existencias mercaderías',
      '40': 'Proveedores',
      '41': 'Acreedores varios',
      '43': 'Clientes',
      '44': 'Deudores varios',
      '47': 'Administraciones públicas',
      '52': 'Deudas a corto plazo',
      '57': 'Tesorería (Caja y Bancos)',
      '60': 'Compras y aprovisionamientos',
      '62': 'Servicios exteriores',
      '63': 'Tributos',
      '64': 'Gastos de personal',
      '65': 'Otros gastos de gestión',
      '66': 'Gastos financieros',
      '68': 'Amortizaciones',
      '70': 'Ventas e ingresos de explotación',
      '75': 'Otros ingresos de gestión',
      '76': 'Ingresos financieros',
      '570': 'Caja',
      '572': 'Bancos c/c',
      '211': 'Terrenos y bienes naturales',
      '218': 'Equipos para procesos de información',
      '430': 'Clientes',
      '400': 'Proveedores'
    };
    return pgcNames[code] || `Grupo ${code}`;
  };

  // Subgroup Classification for Assets/Liabilities
  const getSubGroup = (account) => {
    const code = account.code || '';
    if (account.type === 'Activo') {
      if (code.startsWith('2')) return 'Activo No Corriente';
      return 'Activo Corriente';
    }
    if (account.type === 'Pasivo') {
      if (code.startsWith('1')) return 'Pasivo No Corriente';
      return 'Pasivo Corriente';
    }
    return account.type;
  };

  // Compute period balance of accounts
  const computedBalances = useMemo(() => {
    const bMap = {};
    const startLimit = new Date(selectedYear, startMonth, 1);
    const endLimit = new Date(selectedYear, endMonth + 1, 0, 23, 59, 59);

    const calc = (id) => {
      if (bMap[id] !== undefined) return bMap[id];
      const account = accounts.find(a => a.id === id);
      if (!account) return 0;

      let movementSum = 0;
      entries.forEach(entry => {
        const entryDate = new Date(entry.date);
        const isIncomeExpense = ['Ingreso', 'Gasto'].includes(account.type);
        const isInRange = isIncomeExpense 
          ? (entryDate >= startLimit && entryDate <= endLimit)
          : (entryDate <= endLimit);

        if (isInRange && entry.lines) {
          entry.lines.forEach(line => {
            if (line.accountId === id) {
              const debit = parseFloat(line.debit) || 0;
              const credit = parseFloat(line.credit) || 0;
              const isAssetOrExpense = ['Activo', 'Gasto'].includes(account.type);
              movementSum += isAssetOrExpense ? (debit - credit) : (credit - debit);
            }
          });
        }
      });

      let sum = movementSum;
      const children = accounts.filter(a => String(a.parentId) === String(id));
      for (const child of children) {
        sum += calc(child.id);
      }
      bMap[id] = sum;
      return sum;
    };

    accounts.forEach(a => calc(a.id));
    return bMap;
  }, [accounts, entries, selectedYear, startMonth, endMonth]);

  // Hierarchical rows generator for a list of accounts
  const getAccountRowsForList = (accountList) => {
    const activeLeafs = accountList.filter(acc => Math.abs(computedBalances[acc.id] || 0) > 0.01);
    const nodeMap = {};

    activeLeafs.forEach(acc => {
      const code = acc.code || '';
      
      const prefixes = [];
      if (code.length >= 2) prefixes.push(code.substring(0, 2));
      if (code.length >= 3) prefixes.push(code.substring(0, 3));
      if (code.length >= 4) prefixes.push(code);

      prefixes.forEach((pref, idx) => {
        const level = idx + 2; // level 2, 3, 4
        if (!nodeMap[pref]) {
          nodeMap[pref] = {
            code: pref,
            name: getPrefixName(pref, accounts),
            value: 0,
            level: level
          };
        }
      });
    });

    Object.keys(nodeMap).forEach(pref => {
      nodeMap[pref].value = activeLeafs
        .filter(acc => (acc.code || '').startsWith(pref))
        .reduce((sum, acc) => sum + (computedBalances[acc.id] || 0), 0);
    });

    return Object.values(nodeMap)
      .filter(node => node.level <= detailLevel)
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  // Get account rows for specific Balance Sheet categories
  const getAccountRowsForSubGroup = (subGroupName) => {
    let list = [];
    if (subGroupName === 'Activo No Corriente') {
      list = accounts.filter(a => a.type === 'Activo' && (a.code || '').startsWith('2'));
    } else if (subGroupName === 'Activo Corriente') {
      list = accounts.filter(a => a.type === 'Activo' && !(a.code || '').startsWith('2'));
    } else if (subGroupName === 'Pasivo No Corriente') {
      list = accounts.filter(a => a.type === 'Pasivo' && (a.code || '').startsWith('1'));
    } else if (subGroupName === 'Pasivo Corriente') {
      list = accounts.filter(a => a.type === 'Pasivo' && !(a.code || '').startsWith('1'));
    } else if (subGroupName === 'Patrimonio Neto') {
      list = accounts.filter(a => a.type === 'Patrimonio' || (a.type === 'Pasivo' && ((a.code || '').startsWith('10') || (a.code || '').startsWith('11') || (a.code || '').startsWith('12') || (a.code || '').startsWith('13'))));
    }
    return getAccountRowsForList(list);
  };

  const getSubGroupTotal = (subGroupName) => {
    const rows = getAccountRowsForSubGroup(subGroupName);
    // Sum level 2 rows to get the correct sub-total
    return rows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
  };

  // Build Balance Sheet rows
  const getBalanceSheetRows = () => {
    const rows = [];
    
    // 1. ACTIVO
    if (showActivo) {
      rows.push({ type: 'header', label: 'I. ACTIVO', level: 0 });
      
      if (showNoCorriente) {
        const ancRows = getAccountRowsForSubGroup('Activo No Corriente');
        const ancTotal = ancRows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
        rows.push({ type: 'subheader', label: 'A) ACTIVO NO CORRIENTE', level: 1 });
        rows.push(...ancRows);
        rows.push({ type: 'total', label: 'Total Activo No Corriente', value: ancTotal, level: 1 });
      }
      
      if (showCorriente) {
        const acRows = getAccountRowsForSubGroup('Activo Corriente');
        const acTotal = acRows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
        rows.push({ type: 'subheader', label: 'B) ACTIVO CORRIENTE', level: 1 });
        rows.push(...acRows);
        rows.push({ type: 'total', label: 'Total Activo Corriente', value: acTotal, level: 1 });
      }
      
      const totalAssets = (showNoCorriente ? getSubGroupTotal('Activo No Corriente') : 0) + 
                          (showCorriente ? getSubGroupTotal('Activo Corriente') : 0);
      rows.push({ type: 'total', label: 'Total Activo', value: totalAssets, level: 0, hasDoubleLine: true });
    }

    // 2. PASIVO
    if (showPasivo) {
      rows.push({ type: 'header', label: 'II. PASIVO', level: 0 });
      
      if (showNoCorriente) {
        const pncRows = getAccountRowsForSubGroup('Pasivo No Corriente');
        const pncTotal = pncRows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
        rows.push({ type: 'subheader', label: 'A) PASIVO NO CORRIENTE', level: 1 });
        rows.push(...pncRows);
        rows.push({ type: 'total', label: 'Total Pasivo No Corriente', value: pncTotal, level: 1 });
      }
      
      if (showCorriente) {
        const pcRows = getAccountRowsForSubGroup('Pasivo Corriente');
        const pcTotal = pcRows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
        rows.push({ type: 'subheader', label: 'B) PASIVO CORRIENTE', level: 1 });
        rows.push(...pcRows);
        rows.push({ type: 'total', label: 'Total Pasivo Corriente', value: pcTotal, level: 1 });
      }
      
      const totalLiabilities = (showNoCorriente ? getSubGroupTotal('Pasivo No Corriente') : 0) + 
                               (showCorriente ? getSubGroupTotal('Pasivo Corriente') : 0);
      rows.push({ type: 'total', label: 'Total Pasivo', value: totalLiabilities, level: 0, hasDoubleLine: true });
    }

    // 3. PATRIMONIO NETO
    if (showPatrimonio) {
      rows.push({ type: 'header', label: 'III. PATRIMONIO NETO', level: 0 });
      const pnRows = getAccountRowsForSubGroup('Patrimonio Neto');
      const pnTotal = pnRows.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
      rows.push(...pnRows);
      rows.push({ type: 'total', label: 'Total Patrimonio Neto', value: pnTotal, level: 0, hasDoubleLine: true });
    }

    return rows;
  };

  // Build Income Statement rows
  const getIncomeStatementRows = (type) => {
    const list = accounts.filter(a => a.type === type);
    const nodes = getAccountRowsForList(list);
    const total = nodes.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
    return [
      ...nodes,
      { type: 'total', label: `Total ${type === 'Ingreso' ? 'Ingresos' : 'Gastos'}`, value: total, level: 1 }
    ];
  };

  const getIncomeStatementTotal = (type) => {
    const list = accounts.filter(a => a.type === type);
    const nodes = getAccountRowsForList(list);
    return nodes.reduce((sum, r) => r.level === 2 ? sum + r.value : sum, 0);
  };

  // Cash Flow Calculations helper (returns balance up to a date for Group 57)
  const getCashBalance = (untilDate) => {
    let balance = 0;
    entries.forEach(entry => {
      const entryDate = new Date(entry.date);
      if (entryDate < untilDate && entry.lines) {
        entry.lines.forEach(line => {
          const account = accounts.find(a => a.id === line.accountId);
          if (account && account.code && account.code.startsWith('57')) {
            const debit = parseFloat(line.debit) || 0;
            const credit = parseFloat(line.credit) || 0;
            balance += (debit - credit);
          }
        });
      }
    });
    return balance;
  };

  // Direct Method Cash Flow calculations categorizer
  const cashFlowCategories = useMemo(() => {
    const cats = {
      explotacion: {
        title: '1. FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE EXPLOTACIÓN',
        items: [
          { key: 'explotacion_cobros', label: '(+) Cobros de clientes y arrendamientos', val: 0, accounts: {} },
          { key: 'explotacion_pagos_prov', label: '(-) Pagos a proveedores y acreedores por gastos', val: 0, accounts: {} },
          { key: 'explotacion_pagos_pers', label: '(-) Pagos al personal y tributos', val: 0, accounts: {} },
          { key: 'explotacion_otros', label: '(+/-) Otros cobros/pagos de explotación', val: 0, accounts: {} }
        ],
        total: 0
      },
      inversion: {
        title: '2. FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE INVERSIÓN',
        items: [
          { key: 'inversion_cobros', label: '(+) Cobros por desinversiones (venta de activos)', val: 0, accounts: {} },
          { key: 'inversion_pagos', label: '(-) Pagos por inversiones (adquisición de activos)', val: 0, accounts: {} }
        ],
        total: 0
      },
      financiacion: {
        title: '3. FLUJOS DE EFECTIVO DE LAS ACTIVIDADES DE FINANCIACIÓN',
        items: [
          { key: 'financiacion_cobros', label: '(+) Cobros por financiación (préstamos, capital)', val: 0, accounts: {} },
          { key: 'financiacion_pagos', label: '(-) Pagos por devolución de deudas e intereses', val: 0, accounts: {} }
        ],
        total: 0
      }
    };

    const startLimit = new Date(selectedYear, startMonth, 1);
    const endLimit = new Date(selectedYear, endMonth + 1, 0, 23, 59, 59);

    const periodEntries = entries.filter(e => {
      const entryDate = new Date(e.date);
      return entryDate >= startLimit && entryDate <= endLimit;
    });

    periodEntries.forEach(entry => {
      if (!entry.lines) return;

      let cashDebit = 0;
      let cashCredit = 0;
      const cashLines = entry.lines.filter(l => {
        const account = accounts.find(a => a.id === l.accountId);
        return account && account.code && account.code.startsWith('57');
      });

      if (cashLines.length === 0) return;

      cashLines.forEach(l => {
        cashDebit += parseFloat(l.debit) || 0;
        cashCredit += parseFloat(l.credit) || 0;
      });

      const netCashMove = cashDebit - cashCredit;
      if (Math.abs(netCashMove) < 0.01) return;

      let cpLine = null;
      let maxCpVal = -1;
      entry.lines.forEach(l => {
        const account = accounts.find(a => a.id === l.accountId);
        const isCash = account && account.code && account.code.startsWith('57');
        if (!isCash) {
          const val = Math.max(parseFloat(l.debit) || 0, parseFloat(l.credit) || 0);
          if (val > maxCpVal) {
            maxCpVal = val;
            cpLine = l;
          }
        }
      });

      const cpAccount = cpLine ? accounts.find(a => a.id === cpLine.accountId) : null;
      const cpCode = cpAccount?.code || '';

      let catKey = '';
      if (netCashMove > 0) { // Inflow
        if (cpCode.startsWith('7') || cpCode.startsWith('43') || cpCode.startsWith('44') || entry.description?.toLowerCase().includes('alquiler') || entry.description?.toLowerCase().includes('renta')) {
          catKey = 'explotacion_cobros';
        } else if (cpCode.startsWith('2')) {
          catKey = 'inversion_cobros';
        } else if (cpCode.startsWith('10') || cpCode.startsWith('17') || cpCode.startsWith('52')) {
          catKey = 'financiacion_cobros';
        } else {
          catKey = 'explotacion_otros';
        }
      } else { // Outflow
        if (cpCode.startsWith('60') || cpCode.startsWith('62') || cpCode.startsWith('40') || cpCode.startsWith('41')) {
          catKey = 'explotacion_pagos_prov';
        } else if (cpCode.startsWith('64') || cpCode.startsWith('63') || cpCode.startsWith('47')) {
          catKey = 'explotacion_pagos_pers';
        } else if (cpCode.startsWith('2')) {
          catKey = 'inversion_pagos';
        } else if (cpCode.startsWith('17') || cpCode.startsWith('52') || cpCode.startsWith('66')) {
          catKey = 'financiacion_pagos';
        } else {
          catKey = 'explotacion_otros';
        }
      }

      const absMove = Math.abs(netCashMove);
      for (const groupName in cats) {
        const group = cats[groupName];
        const item = group.items.find(it => it.key === catKey);
        if (item) {
          item.val += absMove;
          if (cpAccount) {
            if (!item.accounts[cpAccount.id]) {
              item.accounts[cpAccount.id] = { account: cpAccount, val: 0 };
            }
            item.accounts[cpAccount.id].val += absMove;
          }
          break;
        }
      }
    });

    cats.explotacion.total = cats.explotacion.items.reduce((sum, it) => {
      const sign = it.label.startsWith('(-)') ? -1 : 1;
      return sum + (sign * it.val);
    }, 0);

    cats.inversion.total = cats.inversion.items.reduce((sum, it) => {
      const sign = it.label.startsWith('(-)') ? -1 : 1;
      return sum + (sign * it.val);
    }, 0);

    cats.financiacion.total = cats.financiacion.items.reduce((sum, it) => {
      const sign = it.label.startsWith('(-)') ? -1 : 1;
      return sum + (sign * it.val);
    }, 0);

    return cats;
  }, [entries, accounts, selectedYear, startMonth, endMonth]);

  // Aggregate counterparts helper for Cash Flow
  const getCounterpartRows = (itemsMap) => {
    if (detailLevel <= 1) return []; // Hide if Masa or Submasa is chosen
    
    const nodeMap = {};
    const list = Object.values(itemsMap);
    
    list.forEach(item => {
      const code = item.account.code || '';
      const prefixes = [];
      if (code.length >= 2) prefixes.push(code.substring(0, 2));
      if (code.length >= 3) prefixes.push(code.substring(0, 3));
      if (code.length >= 4) prefixes.push(code);
      
      prefixes.forEach((pref, idx) => {
        const level = idx + 2;
        if (!nodeMap[pref]) {
          nodeMap[pref] = {
            code: pref,
            name: getPrefixName(pref, accounts),
            value: 0,
            level: level
          };
        }
      });
    });
    
    Object.keys(nodeMap).forEach(pref => {
      nodeMap[pref].value = list
        .filter(item => (item.account.code || '').startsWith(pref))
        .reduce((sum, item) => sum + item.val, 0);
    });
    
    return Object.values(nodeMap)
      .filter(node => node.level <= detailLevel)
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  const formatCurrency = (amount) => {
    const formatted = Math.abs(amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return amount < 0 ? `(${formatted}) €` : `${formatted} €`;
  };

  // Row Renderer
  const ReportRow = ({ label, value, isTotal = false, indent = 0, isHeader = false, isSubHeader = false, hasTopLine = false, hasBottomLine = false }) => {
    const paddingMap = {
      0: 'pl-0',
      1: 'pl-3',
      2: 'pl-6',
      3: 'pl-9',
      4: 'pl-12',
    };
    const paddingClass = paddingMap[indent] || 'pl-0';

    return (
      <div className={`flex justify-between py-1.5 ${isHeader ? 'mb-2 mt-4 text-[#4a69bd] border-b border-[#4a69bd]' : ''} ${isSubHeader ? 'font-bold italic mt-2 text-slate-800' : ''} ${isTotal ? 'mt-1 font-bold pt-2' : ''} ${hasTopLine ? 'border-t border-black pt-2' : ''} ${hasBottomLine ? 'border-b-2 border-black pb-2' : ''}`}>
        <span className={`${paddingClass} ${isHeader ? 'font-bold text-lg' : 'text-[13px]'} ${!isHeader && !isSubHeader && !isTotal ? 'text-slate-800' : ''}`}>
          {label}
        </span>
        {!isHeader && !isSubHeader && (
          <span className={`font-mono text-[13px] ${isTotal ? 'font-bold' : 'text-slate-700'}`}>
            {formatCurrency(value)}
          </span>
        )}
      </div>
    );
  };

  const renderBalanceSheet = () => {
    const rows = getBalanceSheetRows();
    
    if (rows.length === 0) {
      return (
        <div className="max-w-4xl mx-auto bg-white p-8 text-center text-slate-400 italic font-sans border border-dashed border-slate-200">
          No hay cuentas con saldo para mostrar en este informe.
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto bg-white p-10 text-black font-sans shadow-sm border border-slate-100">
        <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-8">
          <span className="font-bold text-lg uppercase tracking-tight text-slate-850">BALANCE DE SITUACIÓN</span>
          <span className="font-mono text-xs text-slate-500">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="grid grid-cols-1 gap-10">
          {rows.map((row, idx) => {
            if (row.type === 'header') {
              return (
                <div key={idx} className="text-[#3b6bb8] py-1 font-bold uppercase tracking-wider text-md border-b border-[#3b6bb8]">
                  {row.label}
                </div>
              );
            }
            if (row.type === 'subheader') {
              return (
                <ReportRow key={idx} label={row.label} isSubHeader />
              );
            }
            return (
              <ReportRow 
                key={idx} 
                label={row.type === 'total' ? row.label : `${row.code} - ${row.name}`} 
                value={row.value} 
                indent={row.level} 
                isTotal={row.type === 'total'} 
                hasTopLine={row.type === 'total'} 
                hasBottomLine={row.hasDoubleLine} 
              />
            );
          })}
        </div>
      </div>
    );
  };

  const renderIncomeStatement = () => {
    const totalIncomes = getIncomeStatementTotal('Ingreso');
    const totalExpenses = getIncomeStatementTotal('Gasto');
    const result = totalIncomes - totalExpenses;

    if (Math.abs(totalIncomes) < 0.01 && Math.abs(totalExpenses) < 0.01) {
      return (
        <div className="max-w-4xl mx-auto bg-white p-8 text-center text-slate-400 italic font-sans border border-dashed border-slate-200">
          No hay movimientos de ingresos o gastos para mostrar en este informe.
        </div>
      );
    }

    const incomeRows = getIncomeStatementRows('Ingreso');
    const expenseRows = getIncomeStatementRows('Gasto');

    return (
      <div className="max-w-4xl mx-auto bg-white p-10 text-black font-sans shadow-sm border border-slate-100">
        <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-8">
          <span className="font-bold text-lg uppercase tracking-tight text-slate-850">CUENTA DE PÉRDIDAS Y GANANCIAS</span>
          <span className="font-mono text-xs text-slate-500">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {showIngreso && (
            <section>
              <ReportRow label="INGRESOS DE EXPLOTACIÓN" isHeader />
              <div className="mb-4 pl-4">
                {incomeRows.map((r, idx) => (
                  <ReportRow 
                    key={idx} 
                    label={r.type === 'total' ? r.label : `${r.code} - ${r.name}`} 
                    value={r.value} 
                    indent={r.level} 
                    isTotal={r.type === 'total'} 
                    hasTopLine={r.type === 'total'} 
                  />
                ))}
              </div>
            </section>
          )}
          
          {showGasto && (
            <section className="mt-4">
              <ReportRow label="GASTOS DE EXPLOTACIÓN" isHeader />
              <div className="mb-4 pl-4">
                {expenseRows.map((r, idx) => (
                  <ReportRow 
                    key={idx} 
                    label={r.type === 'total' ? r.label : `${r.code} - ${r.name}`} 
                    value={r.value} 
                    indent={r.level} 
                    isTotal={r.type === 'total'} 
                    hasTopLine={r.type === 'total'} 
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 pt-4 border-t-2 border-black">
            <ReportRow label="RESULTADO DEL EJERCICIO (Pérdidas o Ganancias)" value={result} isTotal />
          </section>
        </div>
      </div>
    );
  };

  const renderCashFlow = () => {
    const cats = cashFlowCategories;
    const initialCash = getCashBalance(new Date(selectedYear, startMonth, 1));
    const netIncrease = (showExplotacion ? cats.explotacion.total : 0) + 
                        (showInversion ? cats.inversion.total : 0) + 
                        (showFinanciacion ? cats.financiacion.total : 0);
    const finalCash = initialCash + netIncrease;

    return (
      <div className="max-w-4xl mx-auto bg-white p-10 text-black font-sans shadow-sm border border-slate-100">
        <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-8">
          <span className="font-bold text-lg uppercase tracking-tight text-slate-850">ESTADO DE FLUJOS DE EFECTIVO</span>
          <span className="font-mono text-xs text-slate-500">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="flex flex-col gap-6">
          {/* A. ACTIVIDADES DE EXPLOTACIÓN */}
          {showExplotacion && (
            <section>
              <div className="text-blue-900 font-bold uppercase tracking-wider text-xs border-b border-blue-100 pb-1 mb-2">
                {cats.explotacion.title}
              </div>
              <div className="pl-4">
                {cats.explotacion.items.map(it => {
                  const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                  const cPartRows = getCounterpartRows(it.accounts);
                  
                  // If we are at level 0/1 (no account detail) or no counterpart matches, just render parent row
                  if (it.val < 0.01) return null;
                  
                  return (
                    <div key={it.key} className="mb-2">
                      <ReportRow label={it.label} value={itemSign * it.val} isTotal={cPartRows.length > 0} />
                      {cPartRows.map((node, nIdx) => (
                        <ReportRow 
                          key={nIdx} 
                          label={`${node.code} - ${node.name}`} 
                          value={itemSign * node.value} 
                          indent={node.level} 
                        />
                      ))}
                    </div>
                  );
                })}
                <ReportRow label="Flujo de Efectivo Neto de Actividades de Explotación" value={cats.explotacion.total} isTotal hasTopLine />
              </div>
            </section>
          )}

          {/* B. ACTIVIDADES DE INVERSIÓN */}
          {showInversion && (
            <section className="mt-4">
              <div className="text-blue-900 font-bold uppercase tracking-wider text-xs border-b border-blue-100 pb-1 mb-2">
                {cats.inversion.title}
              </div>
              <div className="pl-4">
                {cats.inversion.items.map(it => {
                  const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                  const cPartRows = getCounterpartRows(it.accounts);
                  if (it.val < 0.01) return null;
                  
                  return (
                    <div key={it.key} className="mb-2">
                      <ReportRow label={it.label} value={itemSign * it.val} isTotal={cPartRows.length > 0} />
                      {cPartRows.map((node, nIdx) => (
                        <ReportRow 
                          key={nIdx} 
                          label={`${node.code} - ${node.name}`} 
                          value={itemSign * node.value} 
                          indent={node.level} 
                        />
                      ))}
                    </div>
                  );
                })}
                <ReportRow label="Flujo de Efectivo Neto de Actividades de Inversión" value={cats.inversion.total} isTotal hasTopLine />
              </div>
            </section>
          )}

          {/* C. ACTIVIDADES DE FINANCIACIÓN */}
          {showFinanciacion && (
            <section className="mt-4">
              <div className="text-blue-900 font-bold uppercase tracking-wider text-xs border-b border-blue-100 pb-1 mb-2">
                {cats.financiacion.title}
              </div>
              <div className="pl-4">
                {cats.financiacion.items.map(it => {
                  const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                  const cPartRows = getCounterpartRows(it.accounts);
                  if (it.val < 0.01) return null;
                  
                  return (
                    <div key={it.key} className="mb-2">
                      <ReportRow label={it.label} value={itemSign * it.val} isTotal={cPartRows.length > 0} />
                      {cPartRows.map((node, nIdx) => (
                        <ReportRow 
                          key={nIdx} 
                          label={`${node.code} - ${node.name}`} 
                          value={itemSign * node.value} 
                          indent={node.level} 
                        />
                      ))}
                    </div>
                  );
                })}
                <ReportRow label="Flujo de Efectivo Neto de Actividades de Financiación" value={cats.financiacion.total} isTotal hasTopLine />
              </div>
            </section>
          )}

          {/* TOTALS */}
          <section className="mt-8 pt-4 border-t-2 border-slate-800">
            <ReportRow label="INCREMENTO (DISMINUCIÓN) NETO DEL EFECTIVO" value={netIncrease} isTotal />
            <ReportRow label="Efectivo al inicio del ejercicio (Saldo anterior)" value={initialCash} />
            <ReportRow label="Efectivo al final del ejercicio (Saldo actual)" value={finalCash} isTotal hasBottomLine />
          </section>
        </div>
      </div>
    );
  };

  const renderDateSettings = () => {
    const years = [...new Set(entries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
    if (years.length === 0) years.push(new Date().getFullYear());

    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return (
      <div className="max-w-4xl mx-auto bg-white p-6 md:p-12 shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3 mb-8 border-b pb-4">
          <Calendar className="w-6 h-6 text-blue-800" />
          <h2 className="text-xl font-bold uppercase tracking-tight text-slate-800">Configuración de Periodo</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Año de Ejercicio</label>
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Mes Inicial</label>
            <select 
              value={startMonth}
              onChange={(e) => setStartMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {months.map((m, i) => <option key={i} value={i} disabled={i > endMonth}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Mes Final</label>
            <select 
              value={endMonth}
              onChange={(e) => setEndMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all"
            >
              {months.map((m, i) => <option key={i} value={i} disabled={i < startMonth}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-12 p-6 bg-blue-50 border border-blue-100 flex items-start space-x-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <Activity className="w-5 h-5 text-blue-800" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-900 uppercase mb-1">Impacto en los Reportes</h3>
            <p className="text-xs text-blue-800/70 leading-relaxed">
              Los cambios realizados aquí filtrarán inmediatamente los datos de <span className="font-bold">Balance</span>, <span className="font-bold">Resultados</span> y <span className="font-bold">Caja</span>. 
              El balance mostrará la situación acumulada hasta el fin del periodo seleccionado.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  return (
    <div className="flex min-h-screen bg-slate-100 p-4 md:p-6 gap-6 font-sans">
      
      {/* Sidebar Filter Panel (Foto 2 style) */}
      {showSidebar && (
        <aside className="w-72 shrink-0 bg-[#f8fafc] border border-slate-200 p-5 rounded shadow-sm self-start flex flex-col gap-6 select-none animate-in slide-in-from-left duration-200">
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Nivel de Detalle</span>
            </h3>
            <div className="flex flex-col gap-2.5 pl-1">
              {[
                { level: 0, label: 'Masas monetarias' },
                { level: 1, label: 'Submasas monetarias' },
                { level: 2, label: 'Cuentas (2 dígitos)' },
                { level: 3, label: 'Cuentas (3 dígitos)' },
                { level: 4, label: 'Cuentas (4 dígitos)' }
              ].map(opt => (
                <label key={opt.level} className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name="detailLevel"
                    checked={detailLevel === opt.level}
                    onChange={() => setDetailLevel(opt.level)}
                    className="mr-2 h-3.5 w-3.5 text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section Filter Checkboxes */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Mostrar Secciones</span>
            </h3>
            <div className="flex flex-col gap-2.5 pl-1">
              {activeTab === 'balance' && (
                <>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showActivo} onChange={e => setShowActivo(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>Activos (I)</span>
                  </label>
                  {showActivo && (
                    <div className="pl-6 flex flex-col gap-2">
                      <label className="flex items-center text-xs font-medium text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={showNoCorriente} onChange={e => setShowNoCorriente(e.target.checked)} className="mr-2 h-3 w-3 rounded text-blue-600 border-slate-350" />
                        <span>Activo No Corriente</span>
                      </label>
                      <label className="flex items-center text-xs font-medium text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={showCorriente} onChange={e => setShowCorriente(e.target.checked)} className="mr-2 h-3 w-3 rounded text-blue-600 border-slate-350" />
                        <span>Activo Corriente</span>
                      </label>
                    </div>
                  )}
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showPasivo} onChange={e => setShowPasivo(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>Pasivos (II)</span>
                  </label>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showPatrimonio} onChange={e => setShowPatrimonio(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>Patrimonio Neto (III)</span>
                  </label>
                </>
              )}

              {activeTab === 'income' && (
                <>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showIngreso} onChange={e => setShowIngreso(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>Ingresos de Explotación</span>
                  </label>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showGasto} onChange={e => setShowGasto(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>Gastos de Explotación</span>
                  </label>
                </>
              )}

              {activeTab === 'cashflow' && (
                <>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showExplotacion} onChange={e => setShowExplotacion(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>1. Actividades Explotación</span>
                  </label>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showInversion} onChange={e => setShowInversion(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>2. Actividades Inversión</span>
                  </label>
                  <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showFinanciacion} onChange={e => setShowFinanciacion(e.target.checked)} className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" />
                    <span>3. Actividades Financiación</span>
                  </label>
                </>
              )}
            </div>
          </div>

          <hr className="border-slate-200 mt-auto" />

          {/* Email button in sidebar */}
          <button 
            onClick={handleSendReport}
            disabled={sending}
            className="w-full bg-slate-900 text-white hover:bg-black transition-all rounded shadow-md h-11 flex items-center justify-center space-x-2 uppercase tracking-wider text-[10px] font-black"
          >
            {sending ? <Activity className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
            <span>Enviar por Email</span>
          </button>
        </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        
        {/* Toggle Button & Upper Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            {/* Foto 3 Toggle Icon */}
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-2 border rounded bg-white shadow-sm transition-all hover:bg-slate-50 border-slate-300 flex items-center justify-center shrink-0`}
              title={showSidebar ? "Ocultar panel de filtros" : "Mostrar panel de filtros"}
            >
              <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>

            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tighter italic flex items-center gap-2">
                <FileText className="text-slate-800 w-6 h-6" />
                <span>INFORMES CONTABLES</span>
              </h1>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-slate-200/50 px-1.5 py-0.5 border border-slate-300 inline-block rounded">
                Normativa PGC Español: {months[startMonth]} - {months[endMonth]} {selectedYear}
              </p>
            </div>
          </div>

          {/* Quick Year Selector */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Ejercicio:</span>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-all shadow-sm"
            >
              {[...new Set([new Date().getFullYear(), ...entries.map(e => e.date ? new Date(e.date).getFullYear() : null)])]
                .filter(Boolean)
                .sort((a,b) => b-a)
                .map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))
              }
            </select>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="overflow-x-auto mb-6 scrollbar-hide">
          <div className="flex min-w-max space-x-px bg-slate-300 p-0.5 shadow-sm rounded">
            {[
              { id: 'balance', label: 'Balance de Situación', icon: Columns },
              { id: 'income', label: 'Resultados (P&G)', icon: PieChart },
              { id: 'cashflow', label: 'Flujo de Caja', icon: Activity },
              { id: 'dates', label: 'Período', icon: Calendar }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  navigate(`/reports?tab=${tab.id}`);
                }}
                className={`flex items-center space-x-2 px-6 py-2.5 transition-all font-black uppercase text-[10px] tracking-widest ${
                  activeTab === tab.id 
                  ? 'bg-white text-slate-900 shadow-sm rounded-sm' 
                  : 'bg-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Sheet Area */}
        <div className="pb-20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 space-y-4">
              <Activity className="w-12 h-12 text-blue-900 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Analizando balances contables...</p>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              {activeTab === 'balance' && renderBalanceSheet()}
              {activeTab === 'income' && renderIncomeStatement()}
              {activeTab === 'cashflow' && renderCashFlow()}
              {activeTab === 'dates' && renderDateSettings()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

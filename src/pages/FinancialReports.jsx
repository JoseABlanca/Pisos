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
  Sliders
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

  const maxAccountDigits = useMemo(() => {
    let maxLen = 4;
    accounts.forEach(a => {
      if (a.code && a.code.length > maxLen) {
        maxLen = a.code.length;
      }
    });
    return maxLen;
  }, [accounts]);


  // Period Filters
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(0); // 0-11
  const [endMonth, setEndMonth] = useState(11); // 0-11

  // Sidebar Filter States
  const [showSidebar, setShowSidebar] = useState(true);
  const [detailLevel, setDetailLevel] = useState(4); // 0: Masas, 1: Submasas, 2: 2-dígitos, 3: 3-dígitos, 4: 4-dígitos
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  
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

  // Compute direct movements and aggregated balances of accounts
  const accountBalances = useMemo(() => {
    const directMap = {};
    const aggregatedMap = {};
    
    const startLimit = new Date(selectedYear, startMonth, 1);
    const endLimit = new Date(selectedYear, endMonth + 1, 0, 23, 59, 59);

    // 1. Calculate direct movements
    accounts.forEach(account => {
      let movementSum = 0;
      entries.forEach(entry => {
        const entryDate = new Date(entry.date);
        const isIncomeExpense = ['Ingreso', 'Gasto'].includes(account.type);
        const isInRange = isIncomeExpense 
          ? (entryDate >= startLimit && entryDate <= endLimit)
          : (entryDate <= endLimit);

        if (isInRange && entry.lines) {
          entry.lines.forEach(line => {
            if (line.accountId === account.id) {
              const debit = parseFloat(line.debit) || 0;
              const credit = parseFloat(line.credit) || 0;
              const isAssetOrExpense = ['Activo', 'Gasto'].includes(account.type);
              movementSum += isAssetOrExpense ? (debit - credit) : (credit - debit);
            }
          });
        }
      });
      directMap[account.id] = movementSum;
    });

    // 2. Calculate aggregated balances
    const calcAggregated = (id) => {
      if (aggregatedMap[id] !== undefined) return aggregatedMap[id];
      let sum = directMap[id] || 0;
      const children = accounts.filter(a => String(a.parentId) === String(id));
      for (const child of children) {
        sum += calcAggregated(child.id);
      }
      aggregatedMap[id] = sum;
      return sum;
    };

    accounts.forEach(a => calcAggregated(a.id));

    return { direct: directMap, aggregated: aggregatedMap };
  }, [accounts, entries, selectedYear, startMonth, endMonth]);

  // Maintain computedBalances reference for compatibility
  const computedBalances = useMemo(() => accountBalances.aggregated, [accountBalances]);


  // General PGC Taxonomy for Balance Sheet
  const balanceSheetTaxonomy = useMemo(() => {
    return {
      activo: {
        label: 'ACTIVO',
        subgroups: {
          no_corriente: {
            label: 'A) ACTIVO NO CORRIENTE',
            visible: showNoCorriente,
            groups: [
              { label: 'I. Inmovilizado intangible.', prefix: '20' },
              { label: 'II. Inmovilizado material.', prefix: '21' },
              { label: 'III. Inversiones inmobiliarias.', prefix: '22' },
              { label: 'IV. Inversiones en empresas del grupo y asociadas LP.', prefix: '24' },
              { label: 'V. Inversiones financieras a largo plazo.', prefix: '25' },
              { label: 'VI. Activos por impuesto diferido.', prefix: '474' },
              { label: 'VII. Deudores comerciales no corrientes.', prefix: '43' }
            ]
          },
          corriente: {
            label: 'B) ACTIVO CORRIENTE',
            visible: showCorriente,
            groups: [
              { label: 'I. Existencias.', prefix: '3' },
              { label: 'II. Deudores comerciales y otras cuentas a cobrar.', prefixes: ['43', '44', '470', '471', '472'] },
              { label: 'III. Inversiones financieras a corto plazo.', prefixes: ['53', '54', '55', '56'] },
              { label: 'IV. Periodificaciones a corto plazo.', prefixes: ['480', '567'] },
              { label: 'V. Efectivo y otros activos líquidos equivalentes.', prefix: '57' }
            ]
          }
        }
      },
      pasivo: {
        label: 'PASIVO',
        subgroups: {
          no_corriente: {
            label: 'A) PASIVO NO CORRIENTE',
            visible: showNoCorriente,
            groups: [
              { label: 'I. Provisiones a largo plazo.', prefix: '14' },
              { label: 'II. Deudas a largo plazo.', prefixes: ['17', '18'] },
              { label: 'III. Deudas con empresas del grupo y asociadas LP.', prefix: '16' }
            ]
          },
          corriente: {
            label: 'B) PASIVO CORRIENTE',
            visible: showCorriente,
            groups: [
              { label: 'I. Provisiones a corto plazo.', prefix: '529' },
              { label: 'II. Deudas a corto plazo.', prefixes: ['50', '51', '52'], exclude: ['529'] },
              { label: 'III. Deudas con empresas del grupo y asociadas CP.', prefix: '55' },
              { label: 'V. Acreedores comerciales y otras cuentas a pagar.', prefixes: ['40', '41', '475', '476', '477'] }
            ]
          }
        }
      },
      patrimonio: {
        label: 'PATRIMONIO NETO',
        subgroups: {
          fondos_propios: {
            label: 'A-1) Fondos propios.',
            visible: true,
            groups: [
              { label: 'I. Capital.', prefix: '10' },
              { label: 'II. Prima de emisión.', prefix: '110' },
              { label: 'III. Reservas.', prefixes: ['111', '112', '113', '114', '115', '116', '117', '118', '119'] },
              { label: 'V. Resultados de ejercicios anteriores.', prefix: '12' },
              { label: 'VII. Resultado del ejercicio.', isProfitLoss: true }
            ]
          }
        }
      }
    };
  }, [showNoCorriente, showCorriente]);

  // General PGC Taxonomy for Income Statement
  const incomeStatementTaxonomy = useMemo(() => {
    return {
      ingresos: {
        label: 'I. INGRESOS DE EXPLOTACIÓN',
        groups: [
          { label: '1. Importe neto de la cifra de negocios.', prefix: '70' },
          { label: '2. Variación de existencias de productos terminados.', prefix: '71' },
          { label: '3. Trabajos realizados por la empresa para su activo.', prefix: '73' },
          { label: '4. Aprovisionamientos (devoluciones/ingresos).', prefix: '708' },
          { label: '5. Otros ingresos de explotación.', prefixes: ['74', '75'] },
          { label: '6. Ingresos financieros.', prefix: '76' }
        ]
      },
      gastos: {
        label: 'II. GASTOS DE EXPLOTACIÓN',
        groups: [
          { label: '1. Aprovisionamientos.', prefix: '60' },
          { label: '2. Gastos de personal.', prefix: '64' },
          { label: '3. Servicios exteriores.', prefix: '62' },
          { label: '4. Tributos.', prefix: '63' },
          { label: '5. Pérdidas, deterioro y variación de provisiones comerciales.', prefix: '65' },
          { label: '6. Otros gastos corrientes de gestión.', prefix: '65', exclude: ['650', '651'] },
          { label: '7. Amortización del inmovilizado.', prefix: '68' },
          { label: '8. Gastos financieros.', prefix: '66' }
        ]
      }
    };
  }, []);

  // Filter accounts belonging to a taxonomy group
  const getAccountsForGroup = (groupObj, categoryKey) => {
    if (groupObj.isProfitLoss) {
      return accounts.filter(a => ['Ingreso', 'Gasto'].includes(a.type));
    }

    const prefixes = groupObj.prefixes || (groupObj.prefix ? [groupObj.prefix] : []);
    const excludes = groupObj.exclude || [];

    return accounts.filter(a => {
      const code = a.code || '';
      
      // Strict category classification checks
      if (categoryKey === 'activo') {
        const isAsset = a.type === 'Activo';
        if (!isAsset) return false;
      }
      if (categoryKey === 'pasivo') {
        const isLiability = a.type === 'Pasivo' && !((a.code || '').startsWith('10') || (a.code || '').startsWith('11') || (a.code || '').startsWith('12') || (a.code || '').startsWith('13'));
        if (!isLiability) return false;
      }
      if (categoryKey === 'patrimonio') {
        const isEquity = a.type === 'Patrimonio' || (a.type === 'Pasivo' && ((a.code || '').startsWith('10') || (a.code || '').startsWith('11') || (a.code || '').startsWith('12') || (a.code || '').startsWith('13')));
        if (!isEquity) return false;
      }

      const matchesPrefix = prefixes.some(p => code.startsWith(p));
      const matchesExclude = excludes.some(e => code.startsWith(e));
      return matchesPrefix && !matchesExclude;
    });
  };

  // Get the sum of a taxonomy group
  const getGroupValue = (groupObj, categoryKey) => {
    if (groupObj.isProfitLoss) {
      const revenues = accounts.filter(a => a.type === 'Ingreso').reduce((sum, a) => sum + (accountBalances.direct[a.id] || 0), 0);
      const expenses = accounts.filter(a => a.type === 'Gasto').reduce((sum, a) => sum + (accountBalances.direct[a.id] || 0), 0);
      return revenues - expenses;
    }

    const groupAccounts = getAccountsForGroup(groupObj, categoryKey);
    return groupAccounts.reduce((sum, a) => sum + (accountBalances.direct[a.id] || 0), 0);
  };

  // Get database hierarchical depth for a given account
  const getAccountDepth = (acc, allAccounts) => {
    let depth = 0;
    let current = acc;
    const visited = new Set();
    while (current && current.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      depth++;
      current = allAccounts.find(a => a.id === current.parentId);
    }
    return depth;
  };

  // Build the list of child accounts/sub-accounts inside a group
  const getGroupDetailRows = (groupObj, categoryKey) => {
    if (groupObj.isProfitLoss) return [];
    const groupAccounts = getAccountsForGroup(groupObj, categoryKey);
    const prefixes = groupObj.prefixes || (groupObj.prefix ? [groupObj.prefix] : []);
    return getAccountRowsForList(groupAccounts).filter(node => !prefixes.includes(node.code));
  };

  // Calculate Subgroup values
  const getSubGroupValue = (subGroupObj, categoryKey) => {
    return subGroupObj.groups.reduce((sum, g) => sum + getGroupValue(g, categoryKey), 0);
  };

  // Calculate Masa values
  const getMasaValue = (masaObj, categoryKey) => {
    return Object.values(masaObj.subgroups)
      .filter(sg => sg.visible)
      .reduce((sum, sg) => sum + getSubGroupValue(sg, categoryKey), 0);
  };

  // Hierarchical list builder for accounts (renders ONLY accounts present in the database configuration)
  const getAccountRowsForList = (accountList) => {
    return accountList
      .map(acc => {
        const depth = getAccountDepth(acc, accounts);
        return {
          code: acc.code,
          name: acc.name,
          value: accountBalances.aggregated[acc.id] || 0,
          level: depth + 2, // offset by 2 to align with group header indentation (indent = 2)
          codeLength: (acc.code || '').length
        };
      })
      .filter(node => node.codeLength <= detailLevel)
      .filter(node => !hideZeroBalances || Math.abs(node.value) >= 0.01)
      .sort((a, b) => a.code.localeCompare(b.code));
  };

  // Direct Method Cash Flow calculations
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
          { key: 'inversion_cobros', label: '(+) Cobros por desinversiones (venta de inmovilizado)', val: 0, accounts: {} },
          { key: 'inversion_pagos', label: '(-) Pagos por inversiones (adquisición de inmovilizado)', val: 0, accounts: {} }
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
    if (detailLevel <= 1) return []; // Hide detailed accounts if level is 0 or 1
    
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
    return amount < 0 ? `${formatted}-` : `${formatted}\u00a0`;
  };

  const formatAccountName = (name) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  // Clean Typography Row Renderer (NO borders, inline header totals, NO italics)
  const ReportRow = ({ label, value, isHeader = false, isSubHeader = false, isGroupHeader = false, indent = 0 }) => {
    const paddingMap = {
      0: 'pl-0',
      1: 'pl-3',
      2: 'pl-6',
      3: 'pl-9',
      4: 'pl-12',
      5: 'pl-16',
      6: 'pl-20',
      7: 'pl-24',
      8: 'pl-28'
    };
    const paddingClass = paddingMap[indent] || 'pl-0';

    const fontClass = isHeader 
      ? 'font-bold text-blue-900 text-sm uppercase tracking-wider' 
      : isSubHeader 
        ? 'font-bold text-slate-800 text-xs uppercase mt-4' 
        : isGroupHeader 
          ? 'font-bold text-slate-700 text-xs mt-2' 
          : 'text-slate-650 text-[10px]';

    return (
      <div className={`flex justify-between py-1 hover:bg-slate-50 transition-colors ${fontClass}`}>
        <span className={`${paddingClass}`}>
          {label}
        </span>
        <span className="font-sans tabular-nums text-right shrink-0 pl-4">
          {formatCurrency(value)}
        </span>
      </div>
    );
  };

  const renderBalanceSheet = () => {
    const tax = balanceSheetTaxonomy;
    
    // Masa values
    const activoVal = getMasaValue(tax.activo, 'activo');
    const pasivoVal = getMasaValue(tax.pasivo, 'pasivo');
    const patrimonioVal = getMasaValue(tax.patrimonio, 'patrimonio');

    return (
      <div className="max-w-4xl mx-auto bg-white p-10 text-black font-sans shadow-sm border border-slate-100">
        <div className="flex justify-between border-b border-slate-300 pb-2 mb-6">
          <span className="font-bold text-md uppercase tracking-wide text-slate-800">BALANCE DE SITUACIÓN</span>
          <span className="font-mono text-xs text-slate-400">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="flex flex-col gap-6">
          {/* I. ACTIVO */}
          {showActivo && (!hideZeroBalances || Math.abs(activoVal) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={tax.activo.label} value={activoVal} isHeader indent={0} />
              
              {/* Activo No Corriente */}
              {showNoCorriente && (!hideZeroBalances || Math.abs(getSubGroupValue(tax.activo.subgroups.no_corriente, 'activo')) >= 0.01) && (
                <div className="flex flex-col">
                  <ReportRow label={tax.activo.subgroups.no_corriente.label} value={getSubGroupValue(tax.activo.subgroups.no_corriente, 'activo')} isSubHeader indent={1} />
                  {tax.activo.subgroups.no_corriente.groups.map((group, idx) => {
                    const groupVal = getGroupValue(group, 'activo');
                    if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                    const details = getGroupDetailRows(group, 'activo');
                    return (
                      <div key={idx} className="flex flex-col">
                        <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                        {details.map((node, nIdx) => {
                          if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                          return (
                            <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Activo Corriente */}
              {showCorriente && (!hideZeroBalances || Math.abs(getSubGroupValue(tax.activo.subgroups.corriente, 'activo')) >= 0.01) && (
                <div className="flex flex-col">
                  <ReportRow label={tax.activo.subgroups.corriente.label} value={getSubGroupValue(tax.activo.subgroups.corriente, 'activo')} isSubHeader indent={1} />
                  {tax.activo.subgroups.corriente.groups.map((group, idx) => {
                    const groupVal = getGroupValue(group, 'activo');
                    if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                    const details = getGroupDetailRows(group, 'activo');
                    return (
                      <div key={idx} className="flex flex-col">
                        <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                        {details.map((node, nIdx) => {
                          if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                          return (
                            <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* II. PASIVO */}
          {showPasivo && (!hideZeroBalances || Math.abs(pasivoVal) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={tax.pasivo.label} value={pasivoVal} isHeader indent={0} />
              
              {/* Pasivo No Corriente */}
              {showNoCorriente && (!hideZeroBalances || Math.abs(getSubGroupValue(tax.pasivo.subgroups.no_corriente, 'pasivo')) >= 0.01) && (
                <div className="flex flex-col">
                  <ReportRow label={tax.pasivo.subgroups.no_corriente.label} value={getSubGroupValue(tax.pasivo.subgroups.no_corriente, 'pasivo')} isSubHeader indent={1} />
                  {tax.pasivo.subgroups.no_corriente.groups.map((group, idx) => {
                    const groupVal = getGroupValue(group, 'pasivo');
                    if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                    const details = getGroupDetailRows(group, 'pasivo');
                    return (
                      <div key={idx} className="flex flex-col">
                        <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                        {details.map((node, nIdx) => {
                          if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                          return (
                            <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pasivo Corriente */}
              {showCorriente && (!hideZeroBalances || Math.abs(getSubGroupValue(tax.pasivo.subgroups.corriente, 'pasivo')) >= 0.01) && (
                <div className="flex flex-col">
                  <ReportRow label={tax.pasivo.subgroups.corriente.label} value={getSubGroupValue(tax.pasivo.subgroups.corriente, 'pasivo')} isSubHeader indent={1} />
                  {tax.pasivo.subgroups.corriente.groups.map((group, idx) => {
                    const groupVal = getGroupValue(group, 'pasivo');
                    if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                    const details = getGroupDetailRows(group, 'pasivo');
                    return (
                      <div key={idx} className="flex flex-col">
                        <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                        {details.map((node, nIdx) => {
                          if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                          return (
                            <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* III. PATRIMONIO NETO */}
          {showPatrimonio && (!hideZeroBalances || Math.abs(patrimonioVal) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={tax.patrimonio.label} value={patrimonioVal} isHeader indent={0} />
              
              {/* Fondos Propios */}
              {(!hideZeroBalances || Math.abs(getSubGroupValue(tax.patrimonio.subgroups.fondos_propios, 'patrimonio')) >= 0.01) && (
                <div className="flex flex-col">
                  <ReportRow label={tax.patrimonio.subgroups.fondos_propios.label} value={getSubGroupValue(tax.patrimonio.subgroups.fondos_propios, 'patrimonio')} isSubHeader indent={1} />
                  {tax.patrimonio.subgroups.fondos_propios.groups.map((group, idx) => {
                    const groupVal = getGroupValue(group, 'patrimonio');
                    if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                    const details = getGroupDetailRows(group, 'patrimonio');
                    return (
                      <div key={idx} className="flex flex-col">
                        <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                        {details.map((node, nIdx) => {
                          if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                          return (
                            <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };


  const renderIncomeStatement = () => {
    const tax = incomeStatementTaxonomy;
    
    // Sum Revenues
    const totalRevenues = tax.ingresos.groups.reduce((sum, g) => sum + getGroupValue(g, 'ingreso'), 0);
    // Sum Expenses
    const totalExpenses = tax.gastos.groups.reduce((sum, g) => sum + getGroupValue(g, 'gasto'), 0);
    const result = totalRevenues - totalExpenses;

    return (
      <div className="max-w-4xl mx-auto bg-white p-10 text-black font-sans shadow-sm border border-slate-100">
        <div className="flex justify-between border-b border-slate-300 pb-2 mb-6">
          <span className="font-bold text-md uppercase tracking-wide text-slate-800">CUENTA DE PÉRDIDAS Y GANANCIAS</span>
          <span className="font-mono text-xs text-slate-400">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="flex flex-col gap-6">
          {/* I. INGRESOS DE EXPLOTACIÓN */}
          {showIngreso && (!hideZeroBalances || Math.abs(totalRevenues) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={tax.ingresos.label} value={totalRevenues} isHeader indent={0} />
              {tax.ingresos.groups.map((group, idx) => {
                const groupVal = getGroupValue(group, 'ingreso');
                if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                const details = getGroupDetailRows(group, 'ingreso');
                return (
                  <div key={idx} className="flex flex-col">
                    <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                    {details.map((node, nIdx) => {
                      if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                      return (
                        <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* II. GASTOS DE EXPLOTACIÓN */}
          {showGasto && (!hideZeroBalances || Math.abs(totalExpenses) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={tax.gastos.label} value={totalExpenses} isHeader indent={0} />
              {tax.gastos.groups.map((group, idx) => {
                const groupVal = getGroupValue(group, 'gasto');
                if (hideZeroBalances && Math.abs(groupVal) < 0.01) return null;
                const details = getGroupDetailRows(group, 'gasto');
                return (
                  <div key={idx} className="flex flex-col">
                    <ReportRow label={group.label} value={groupVal} isGroupHeader indent={2} />
                    {details.map((node, nIdx) => {
                      if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                      return (
                        <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={node.value} indent={node.level} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* RESULTADO FINAL */}
          {(!hideZeroBalances || Math.abs(result) >= 0.01) && (
            <div className="flex flex-col mt-4">
              <ReportRow label="RESULTADO DEL EJERCICIO (Pérdidas o Ganancias)" value={result} isHeader indent={0} />
            </div>
          )}
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
        <div className="flex justify-between border-b border-slate-300 pb-2 mb-6">
          <span className="font-bold text-md uppercase tracking-wide text-slate-800">ESTADO DE FLUJOS DE EFECTIVO</span>
          <span className="font-mono text-xs text-slate-400">Emitido: {new Date().toLocaleDateString()}</span>
        </div>

        <div className="flex flex-col gap-6">
          {/* A. ACTIVIDADES DE EXPLOTACIÓN */}
          {showExplotacion && (!hideZeroBalances || Math.abs(cats.explotacion.total) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={cats.explotacion.title} value={cats.explotacion.total} isHeader indent={0} />
              {cats.explotacion.items.map(it => {
                const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                const cPartRows = getCounterpartRows(it.accounts);
                if (it.val < 0.01) return null;
                
                return (
                  <div key={it.key} className="flex flex-col">
                    <ReportRow label={it.label} value={itemSign * it.val} isGroupHeader indent={2} />
                    {cPartRows.map((node, nIdx) => {
                      if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                      return (
                        <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={itemSign * node.value} indent={node.level} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* B. ACTIVIDADES DE INVERSIÓN */}
          {showInversion && (!hideZeroBalances || Math.abs(cats.inversion.total) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={cats.inversion.title} value={cats.inversion.total} isHeader indent={0} />
              {cats.inversion.items.map(it => {
                const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                const cPartRows = getCounterpartRows(it.accounts);
                if (it.val < 0.01) return null;
                
                return (
                  <div key={it.key} className="flex flex-col">
                    <ReportRow label={it.label} value={itemSign * it.val} isGroupHeader indent={2} />
                    {cPartRows.map((node, nIdx) => {
                      if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                      return (
                        <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={itemSign * node.value} indent={node.level} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* C. ACTIVIDADES DE FINANCIACIÓN */}
          {showFinanciacion && (!hideZeroBalances || Math.abs(cats.financiacion.total) >= 0.01) && (
            <div className="flex flex-col">
              <ReportRow label={cats.financiacion.title} value={cats.financiacion.total} isHeader indent={0} />
              {cats.financiacion.items.map(it => {
                const itemSign = it.label.startsWith('(-)') ? -1 : 1;
                const cPartRows = getCounterpartRows(it.accounts);
                if (it.val < 0.01) return null;
                
                return (
                  <div key={it.key} className="flex flex-col">
                    <ReportRow label={it.label} value={itemSign * it.val} isGroupHeader indent={2} />
                    {cPartRows.map((node, nIdx) => {
                      if (hideZeroBalances && Math.abs(node.value) < 0.01) return null;
                      return (
                        <ReportRow key={nIdx} label={`${node.code} - ${formatAccountName(node.name)}`} value={itemSign * node.value} indent={node.level} />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}


          {/* TOTALS */}
          <div className="flex flex-col mt-4 pt-4 border-t border-slate-300">
            <ReportRow label="INCREMENTO (DISMINUCIÓN) NETO DEL EFECTIVO" value={netIncrease} isHeader indent={0} />
            <ReportRow label="Efectivo al inicio del ejercicio (Saldo anterior)" value={initialCash} isGroupHeader indent={2} />
            <ReportRow label="Efectivo al final del ejercicio (Saldo actual)" value={finalCash} isHeader indent={0} />
          </div>
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
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Mes Inicial</label>
            <select 
              value={startMonth}
              onChange={(e) => setStartMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer"
            >
              {months.map((m, i) => <option key={i} value={i} disabled={i > endMonth}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">Mes Final</label>
            <select 
              value={endMonth}
              onChange={(e) => setEndMonth(parseInt(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-4 py-3 font-bold text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer"
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
              <span>Dígitos de Cuentas</span>
            </h3>
            <div className="pl-1">
              <select
                value={detailLevel}
                onChange={e => setDetailLevel(parseInt(e.target.value))}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-all shadow-sm cursor-pointer"
              >
                {Array.from({ length: maxAccountDigits }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>Mostrar hasta {num} {num === 1 ? 'dígito' : 'dígitos'}</option>
                ))}
              </select>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Ejercicio Contable Year Selector */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Ejercicio Contable</span>
            </h3>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-all shadow-sm cursor-pointer"
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

          {/* Rango de Meses Filter */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Rango de Meses</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Desde</label>
                <select 
                  value={startMonth}
                  onChange={(e) => setStartMonth(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer"
                >
                  {months.map((m, i) => <option key={i} value={i} disabled={i > endMonth}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hasta</label>
                <select 
                  value={endMonth}
                  onChange={(e) => setEndMonth(parseInt(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 transition-all cursor-pointer"
                >
                  {months.map((m, i) => <option key={i} value={i} disabled={i < startMonth}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Opciones de Visualización */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Opciones</span>
            </h3>
            <div className="flex flex-col gap-2.5 pl-1">
              <label className="flex items-center text-xs font-semibold text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hideZeroBalances} 
                  onChange={e => setHideZeroBalances(e.target.checked)} 
                  className="mr-2 h-3.5 w-3.5 rounded text-blue-600 border-slate-300" 
                />
                <span>Ocultar saldos a 0</span>
              </label>
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
        
        {/* Toggle Button for Sidebar */}
        <div className="flex items-center mb-6">
          {/* Toggle Icon */}
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2.5 border rounded bg-white shadow-sm transition-all hover:bg-slate-50 border-slate-300 flex items-center justify-center shrink-0"
            title={showSidebar ? "Ocultar panel de filtros" : "Mostrar panel de filtros"}
          >
            <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
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

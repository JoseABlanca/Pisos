import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { 
  Printer, 
  BookOpen, 
  FileText, 
  Columns, 
  Building2, 
  Key, 
  Users, 
  Calendar, 
  RefreshCw, 
  CheckCircle,
  TrendingUp,
  Landmark,
  Scale,
  FileSpreadsheet,
  LayoutGrid,
  Sliders
} from 'lucide-react';

const SpanishAccountingNames = {
  '1': 'Financiación Básica',
  '2': 'Activo no Corriente',
  '3': 'Existencias',
  '4': 'Acreedores y Deudores',
  '5': 'Cuentas Financieras',
  '6': 'Compras y Gastos',
  '7': 'Ventas e Ingresos',
  
  '10': 'Capital',
  '17': 'Deudas a Largo Plazo',
  '21': 'Inmovilizaciones Materiales',
  '25': 'Otras Inversiones Financieras',
  '40': 'Proveedores',
  '41': 'Acreedores Varios',
  '43': 'Clientes / Inquilinos',
  '47': 'Administraciones Públicas',
  '57': 'Tesorería (Bancos/Caja)',
  '62': 'Servicios Exteriores',
  '629': 'Otros Servicios (Comunidad/Reformas)',
  '75': 'Otros Ingresos de Gestión',
  '752': 'Ingresos por Arrendamientos'
};

const getSelectableAccounts = (accountsList) => {
  const map = new Map();
  
  accountsList.forEach(a => {
    if (a.code) {
      const trimmedCode = String(a.code).trim();
      map.set(trimmedCode, { code: trimmedCode, name: a.name, isDetail: true });
    }
  });
  
  accountsList.forEach(a => {
    if (!a.code) return;
    const str = String(a.code).trim();
    
    [1, 2, 3].forEach(len => {
      if (str.length > len) {
        const prefix = str.substring(0, len);
        if (!map.has(prefix)) {
          const standardName = SpanishAccountingNames[prefix] || `Grupo/Subgrupo ${prefix}`;
          map.set(prefix, { code: prefix, name: standardName, isDetail: false });
        }
      }
    });
  });
  
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
};

const isAccountMatched = (accountCodeOrId, selectedAccounts, accountsList) => {
  if (!selectedAccounts || selectedAccounts.length === 0) return true;
  let code = accountCodeOrId;
  const acct = accountsList.find(a => a.id === code || String(a.code).trim() === String(code).trim());
  if (acct) {
    code = String(acct.code).trim();
  }
  if (!code) return false;
  code = String(code).trim();
  return selectedAccounts.some(sel => {
    return code.startsWith(String(sel).trim());
  });
};

// Spanish capital-gains tax brackets (IRPF savings base 2024)
const TAX_BRACKETS = [
  { up: 6000,    rate: 0.19 },
  { up: 50000,   rate: 0.21 },
  { up: 200000,  rate: 0.23 },
  { up: 300000,  rate: 0.27 },
  { up: Infinity, rate: 0.28 },
];

function calcTax(gain) {
  if (gain <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of TAX_BRACKETS) {
    const slice = Math.min(gain - prev, bracket.up - prev);
    if (slice <= 0) break;
    tax += slice * bracket.rate;
    prev = bracket.up;
    if (gain <= bracket.up) break;
  }
  return tax;
}

// App name variable — change here to update it everywhere in reports
const APP_NAME = 'Nexo Finance';

const templatesByCategory = {
  contabilidad_libros: [
    { id: 'diario', name: 'Diario de Movimientos', icon: BookOpen },
    { id: 'mayor', name: 'Libro Mayor', icon: FileText },
    { id: 'sumas_saldos', name: 'Sumas y Saldos', icon: Columns }
  ],
  contabilidad_anuales: [
    { id: 'balance_situacion', name: 'Balance de Situación', icon: FileSpreadsheet },
    { id: 'cuenta_resultados', name: 'Cuenta de Resultados', icon: FileSpreadsheet },
    { id: 'flujo_caja', name: 'Estado de Flujos de Caja', icon: FileSpreadsheet }
  ],
  inversiones: [
    { id: 'activos', name: 'Inventario de Activos', icon: Building2 },
    { id: 'alquileres', name: 'Contratos de Alquiler', icon: Key },
    { id: 'clientes', name: 'Fichero de Clientes', icon: Users }
  ],
  renta_variable: [
    { id: 'rv_portfolio', name: 'Cartera Consolidada', icon: TrendingUp },
    { id: 'rv_transactions', name: 'Transacciones RV', icon: BookOpen }
  ],
  crowdfunding: [
    { id: 'cf_portfolio', name: 'Cartera Consolidada', icon: Landmark },
    { id: 'cf_transactions', name: 'Transacciones CF', icon: BookOpen }
  ],
  impuestos: [
    { id: 'taxes_total', name: 'Resumen Fiscal General', icon: Scale },
    { id: 'taxes_real_estate', name: 'Fiscalidad Inmobiliaria', icon: Building2 },
    { id: 'taxes_rv', name: 'Fiscalidad Renta Variable', icon: TrendingUp },
    { id: 'taxes_cf', name: 'Fiscalidad Crowdfunding', icon: Landmark }
  ]
};

export default function PrintPage() {
  const { user, queryUserIds } = useAuth();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') || 'contabilidad';
  const subcategory = searchParams.get('subcategory');

  const categoryKey = useMemo(() => {
    if (activeCategory === 'contabilidad') {
      return subcategory === 'anuales' ? 'contabilidad_anuales' : 'contabilidad_libros';
    }
    return activeCategory;
  }, [activeCategory, subcategory]);

  const templatesList = useMemo(() => {
    return templatesByCategory[categoryKey] || templatesByCategory.contabilidad_libros;
  }, [categoryKey]);

  // Panel visibility states
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  // States for selected report template and filter
  const [selectedTemplate, setSelectedTemplate] = useState('diario'); // diario, mayor, sumas_saldos, activos, alquileres, clientes
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [selectedCebes, setSelectedCebes] = useState([]);
  const [selectedCecos, setSelectedCecos] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [filterImpuesto, setFilterImpuesto] = useState(false);
  const [maxDigits, setMaxDigits] = useState(10);
  const [isDatesCollapsed, setIsDatesCollapsed] = useState(true);
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [showVerticalPercentage, setShowVerticalPercentage] = useState(false);
  const [displayMode, setDisplayMode] = useState('euros'); // euros, percent
  const [selectedComparisonYears, setSelectedComparisonYears] = useState([]); // list of comparative years
  const [accountsDropdownOpen, setAccountsDropdownOpen] = useState(false);
  const [cebeDropdownOpen, setCebeDropdownOpen] = useState(false);
  const [cecoDropdownOpen, setCecoDropdownOpen] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);

  const [accountsSearch, setAccountsSearch] = useState('');
  const [cebeSearch, setCebeSearch] = useState('');
  const [cecoSearch, setCecoSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');

  const accountsDropdownRef = useRef(null);
  const cebeDropdownRef = useRef(null);
  const cecoDropdownRef = useRef(null);
  const docDropdownRef = useRef(null);

  // Sync category parameter
  useEffect(() => {
    if (!searchParams.get('category')) {
      setSearchParams({ category: 'contabilidad' }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Sync selected template on category change or url parameter change
  useEffect(() => {
    const urlTemplate = searchParams.get('template');
    if (urlTemplate) {
      setSelectedTemplate(urlTemplate);
    } else if (templatesList.length > 0) {
      setSelectedTemplate(templatesList[0].id);
    }
  }, [templatesList, searchParams]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (accountsDropdownRef.current && !accountsDropdownRef.current.contains(e.target)) {
        setAccountsDropdownOpen(false);
        setAccountsSearch('');
      }
      if (cebeDropdownRef.current && !cebeDropdownRef.current.contains(e.target)) {
        setCebeDropdownOpen(false);
        setCebeSearch('');
      }
      if (cecoDropdownRef.current && !cecoDropdownRef.current.contains(e.target)) {
        setCecoDropdownOpen(false);
        setCecoSearch('');
      }
      if (docDropdownRef.current && !docDropdownRef.current.contains(e.target)) {
        setDocDropdownOpen(false);
        setDocSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);
  
  // Database collections states
  const [accounts, setAccounts] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);

  // Renta Variable and Crowdfunding states
  const [rvAssets, setRvAssets] = useState([]);
  const [rvTransactions, setRvTransactions] = useState([]);
  const [rvBrokers, setRvBrokers] = useState([]);
  const [cfProjects, setCfProjects] = useState([]);
  const [cfPlatforms, setCfPlatforms] = useState([]);
  const [cfTransactions, setCfTransactions] = useState([]);
  const [cfInvestments, setCfInvestments] = useState([]);

  const [loading, setLoading] = useState(true);

  // Subscriptions to Firestore
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    setLoading(true);
    
    const unsubAccounts = onSnapshot(
      query(collection(db, 'accounts'), where('userId', 'in', userIds)),
      (snap) => {
        setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubEntries = onSnapshot(
      query(collection(db, 'journal_entries'), where('userId', 'in', userIds)),
      (snap) => {
        setJournalEntries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubProperties = onSnapshot(
      query(collection(db, 'properties'), where('userId', 'in', userIds)),
      (snap) => {
        setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubRentals = onSnapshot(
      query(collection(db, 'rentals'), where('userId', 'in', userIds)),
      (snap) => {
        setRentals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('userId', 'in', userIds)),
      (snap) => {
        setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCebes = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', userIds), where('type', '==', 'cebe')),
      (snap) => {
        setCebes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCecos = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', userIds), where('type', '==', 'ceco')),
      (snap) => {
        setCecos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // RV & CF subscriptions
    const unsubRvAssets = onSnapshot(
      query(collection(db, 'rv_assets'), where('userId', 'in', userIds)),
      (snap) => setRvAssets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubRvTransactions = onSnapshot(
      query(collection(db, 'rv_transactions'), where('userId', 'in', userIds)),
      (snap) => setRvTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubRvBrokers = onSnapshot(
      query(collection(db, 'rv_brokers'), where('userId', 'in', userIds)),
      (snap) => setRvBrokers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubCfProjects = onSnapshot(
      query(collection(db, 'cf_projects'), where('userId', 'in', userIds)),
      (snap) => setCfProjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubCfPlatforms = onSnapshot(
      query(collection(db, 'cf_platforms'), where('userId', 'in', userIds)),
      (snap) => setCfPlatforms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubCfTransactions = onSnapshot(
      query(collection(db, 'cf_transactions'), where('userId', 'in', userIds)),
      (snap) => setCfTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    const unsubCfInvestments = onSnapshot(
      query(collection(db, 'cf_investments'), where('userId', 'in', userIds)),
      (snap) => setCfInvestments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

    // Let loading finish after some time or when main data is retrieved
    const timer = setTimeout(() => setLoading(false), 800);

    return () => {
      unsubAccounts();
      unsubEntries();
      unsubProperties();
      unsubRentals();
      unsubCustomers();
      unsubCebes();
      unsubCecos();
      unsubRvAssets();
      unsubRvTransactions();
      unsubRvBrokers();
      unsubCfProjects();
      unsubCfPlatforms();
      unsubCfTransactions();
      unsubCfInvestments();
      clearTimeout(timer);
    };
  }, [user, queryUserIds]);

  // Extract unique years from journal entries
  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    journalEntries.forEach(entry => {
      if (entry.date) {
        const y = new Date(entry.date).getFullYear();
        if (y) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [journalEntries]);

  const activeYearsFilter = useMemo(() => {
    if (selectedYears.length > 0) return selectedYears.map(Number);
    return [selectedYear];
  }, [selectedYears, selectedYear]);

  // Hierarchical selectable accounts list
  const selectableAccountsList = useMemo(() => {
    return getSelectableAccounts(accounts);
  }, [accounts]);
  const filteredSelectableAccountsList = useMemo(() => {
    if (!accountsSearch) return selectableAccountsList;
    const query = accountsSearch.toLowerCase();
    return selectableAccountsList.filter(acc => 
      acc.code.toLowerCase().includes(query) || 
      acc.name.toLowerCase().includes(query)
    );
  }, [selectableAccountsList, accountsSearch]);

  // Compute Renta Variable holdings
  const computedRvHoldings = useMemo(() => {
    const rates = {
      EUR: 1.0,
      USD: 1.08,
      GBP: 0.85,
      CHF: 0.95,
      JPY: 130.0
    };

    rvAssets.forEach(a => {
      if (a.type && a.type.toLowerCase() === 'divisa') {
        const price = parseFloat(a.currentPrice);
        if (price > 0) {
          const id = String(a.id).toUpperCase();
          const name = String(a.name).toUpperCase();
          if (id === 'USD' || id === 'GBP' || id === 'CHF' || id === 'JPY') {
            rates[id] = price;
          } else if (id.includes('EURUSD') || name.includes('EUR/USD') || name.includes('EURUSD')) {
            rates['USD'] = price;
          } else if (id.includes('EURGBP') || name.includes('EUR/GBP') || name.includes('EURGBP')) {
            rates['GBP'] = price;
          } else if (id.includes('EURCHF') || name.includes('EUR/CHF') || name.includes('EURCHF')) {
            rates['CHF'] = price;
          } else if (id.includes('EURJPY') || name.includes('EUR/JPY') || name.includes('EURJPY')) {
            rates['JPY'] = price;
          } else if (id.startsWith('EUR') && id.length >= 6) {
            const currencyCode = id.substring(3, 6);
            rates[currencyCode] = price;
          }
        }
      }
    });

    const assetsMap = new Map(rvAssets.map(a => [a.id, a]));
    const brokersMap = new Map(rvBrokers.map(b => [b.id, b]));
    const chronTx = [...rvTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const positions = {};
    let totalDividendsEUR = 0;

    chronTx.forEach(tx => {
      const asset = assetsMap.get(tx.assetId);
      const broker = brokersMap.get(tx.brokerId);
      const key = `${tx.assetId}_${tx.brokerId}`;
      const rate = tx.exchangeRate || 1.0;

      if (tx.type === 'Dividendo') {
        const divEUR = (parseFloat(tx.quantity) * parseFloat(tx.price) - (parseFloat(tx.fee) || 0)) / rate;
        totalDividendsEUR += divEUR;
        return;
      }

      if (!positions[key]) {
        positions[key] = {
          symbol: tx.assetId,
          name: asset?.name || tx.assetId,
          type: asset?.type || 'Acción',
          sector: asset?.sector || 'Otros',
          currency: asset?.currency || 'EUR',
          brokerId: tx.brokerId,
          brokerName: broker?.name || tx.brokerId,
          quantity: 0,
          costBasisEUR: 0,
          pmcEUR: 0
        };
      }

      const pos = positions[key];
      const q = parseFloat(tx.quantity) || 0;
      const p = parseFloat(tx.price) || 0;
      const f = parseFloat(tx.fee) || 0;

      if (tx.type === 'Compra') {
        const costEUR = (q * p + f) / rate;
        pos.costBasisEUR += costEUR;
        pos.quantity += q;
        pos.pmcEUR = pos.quantity > 0 ? pos.costBasisEUR / pos.quantity : 0;
      } else if (tx.type === 'Venta') {
        const costReductionEUR = q * pos.pmcEUR;
        pos.costBasisEUR = Math.max(0, pos.costBasisEUR - costReductionEUR);
        pos.quantity = Math.max(0, pos.quantity - q);
        if (pos.quantity === 0) {
          pos.costBasisEUR = 0;
          pos.pmcEUR = 0;
        }
      }
    });

    const finalHoldings = Object.values(positions)
      .filter(pos => pos.quantity > 0)
      .map(pos => {
        const asset = assetsMap.get(pos.symbol);
        const currentPriceRaw = asset ? parseFloat(asset.currentPrice) || 0 : 0;
        const assetRate = rates[pos.currency] || 1.0;

        const totalCostEUR = pos.costBasisEUR;
        const currentValueEUR = (pos.quantity * currentPriceRaw) / assetRate;
        const pnlEUR = currentValueEUR - totalCostEUR;
        const pnlPercent = totalCostEUR > 0 ? (pnlEUR / totalCostEUR) * 100 : 0;

        return {
          ...pos,
          pmc: pos.pmcEUR,
          currentPrice: currentPriceRaw / assetRate,
          totalCost: totalCostEUR,
          currentValue: currentValueEUR,
          pnl: pnlEUR,
          pnlPercent
        };
      });

    const totalCostEUR = finalHoldings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalMarketValueEUR = finalHoldings.reduce((sum, h) => sum + h.currentValue, 0);
    const totalPnLEUR = totalMarketValueEUR - totalCostEUR;
    const totalPnLPercent = totalCostEUR > 0 ? (totalPnLEUR / totalCostEUR) * 100 : 0;

    const totalCashEUR = rvBrokers.reduce((sum, b) => {
      const brokerRate = rates[b.currency] || 1.0;
      return sum + (parseFloat(b.cashBalance) || 0) / brokerRate;
    }, 0);

    return {
      holdings: finalHoldings,
      summary: {
        totalCost: totalCostEUR,
        totalValue: totalMarketValueEUR,
        pnl: totalPnLEUR,
        pnlPercent: totalPnLPercent,
        dividends: totalDividendsEUR,
        cash: totalCashEUR,
        grandTotal: totalMarketValueEUR + totalCashEUR
      }
    };
  }, [rvTransactions, rvAssets, rvBrokers]);

  // Compute Crowdfunding holdings
  const computedCfHoldings = useMemo(() => {
    const activeProjectIds = new Set(cfProjects.map(p => p.id));
    const projectInvestments = {};
    const platformInvestments = {};

    cfTransactions.forEach(tx => {
      const pId = tx.projectId;
      const platId = tx.platformId;
      const amt = parseFloat(tx.amount) || 0;
      const isPurchase = tx.type === 'Compra';

      if (pId && activeProjectIds.has(pId)) {
        if (!projectInvestments[pId]) projectInvestments[pId] = 0;
        projectInvestments[pId] += isPurchase ? amt : -amt;

        if (platId) {
          if (!platformInvestments[platId]) platformInvestments[platId] = 0;
          platformInvestments[platId] += isPurchase ? amt : -amt;
        }
      }
    });

    const projectRents = {};
    cfProjects.forEach(p => {
      const pId = p.id;
      const incomeCebe = String(p.incomeCebeId || '').trim().replace(/^(CEBE|CECO)/i, '');
      const expenseCeco = String(p.expenseCecoId || '').trim().replace(/^(CEBE|CECO)/i, '');

      let gross = 0;
      let expenses = 0;

      journalEntries.forEach(entry => {
        if (incomeCebe) {
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCebe && entryCebe.startsWith(incomeCebe)) {
            gross += parseFloat(entry.total) || 0;
          }
        }
        if (expenseCeco) {
          const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCeco && entryCeco.startsWith(expenseCeco)) {
            expenses += parseFloat(entry.total) || 0;
          }
        }
      });

      projectRents[pId] = { gross, expenses, net: gross - expenses };
    });

    const rows = [];
    cfProjects.forEach(p => {
      const pId = p.id;
      const pName = p.name || pId;
      const platform = cfPlatforms.find(pl => pl.id === p.platformId);
      const platformName = platform ? platform.name : (p.platformId || '-');

      const investment = projectInvestments[pId] || 0;
      const rents = projectRents[pId] || { gross: 0, expenses: 0, net: 0 };
      const gross = rents.gross;
      const expenses = rents.expenses;
      const netRents = rents.net;
      const totalGross = investment + gross;
      const totalNet = investment + netRents;
      const yieldGross = investment > 0 ? (gross / investment) * 100 : 0;
      const yieldNet = investment > 0 ? (netRents / investment) * 100 : 0;

      if (investment !== 0 || gross !== 0 || expenses !== 0) {
        rows.push({
          id: pId,
          groupName: `${pName} (${platformName})`,
          investment,
          grossRents: gross,
          expenses,
          netRents,
          totalGross,
          totalNet,
          yieldGross,
          yieldNet,
          status: p.status || 'activo'
        });
      }
    });

    let totalInvested = 0;
    let totalRentasBrutas = 0;
    let totalGastos = 0;

    cfProjects.forEach(p => {
      totalInvested += projectInvestments[p.id] || 0;
      const rents = projectRents[p.id] || { gross: 0, expenses: 0, net: 0 };
      totalRentasBrutas += rents.gross;
      totalGastos += rents.expenses;
    });

    const totalRentasNetas = totalRentasBrutas - totalGastos;
    const totalCurrentValueGross = totalInvested + totalRentasBrutas;
    const totalCurrentValueNet = totalInvested + totalRentasNetas;
    const avgReturnGross = totalInvested > 0 ? (totalRentasBrutas / totalInvested) * 100 : 0;
    const avgReturnNet = totalInvested > 0 ? (totalRentasNetas / totalInvested) * 100 : 0;

    return {
      rows,
      summary: {
        totalInvested,
        totalCurrentValueGross,
        totalCurrentValueNet,
        totalReturnGross: totalRentasBrutas,
        totalReturnNet: totalRentasNetas,
        avgReturnGross,
        avgReturnNet
      }
    };
  }, [cfProjects, cfPlatforms, cfTransactions, journalEntries]);

  // Compute Taxes
  const taxesData = useMemo(() => {
    // 1. Real Estate
    const reTaxes = properties.map(p => {
      const propertyCebe = String(p.cebe || '').trim();
      const taxIncomeCecos = p.taxIncomeCecos || [];
      const taxExpenseCecos = p.taxExpenseCecos || [];

      let ingresos = 0;
      let gastos = 0;
      
      const normalizedPropCebe = propertyCebe ? propertyCebe.replace(/^(CEBE|CECO)/i, '') : '';
      const normalizedIncomeCecos = taxIncomeCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));
      const normalizedExpenseCecos = taxExpenseCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));

      journalEntries.forEach(entry => {
        if (!entry.isImpuesto) return;
        const entryYr = entry.date ? parseInt(entry.date.substring(0, 4), 10) : null;
        if (entryYr && !activeYearsFilter.includes(entryYr)) return;

        // Income match
        let isIncome = false;
        if (entry.lines) {
          entry.lines.forEach(l => {
            const accCode = String(l.accountCode || '');
            if (!accCode.startsWith('7')) return;
            let matchCebe = false;
            if (l.cebe && normalizedPropCebe && String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe)) matchCebe = true;
            else if (!l.cebe && normalizedPropCebe && String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe)) matchCebe = true;
            
            let matchCeco = normalizedIncomeCecos.length === 0;
            if (normalizedIncomeCecos.length > 0 && l.ceco && normalizedIncomeCecos.some(c => String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').startsWith(c))) matchCeco = true;

            if (matchCebe && matchCeco) {
              ingresos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              isIncome = true;
            }
          });
        }
        if (!isIncome && normalizedPropCebe && entry.cebe && String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe)) {
          let matchCeco = normalizedIncomeCecos.length === 0;
          if (normalizedIncomeCecos.length > 0 && entry.ceco && normalizedIncomeCecos.some(c => String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').startsWith(c))) matchCeco = true;
          if (matchCeco) ingresos += parseFloat(entry.total) || 0;
        }

        // Expense match
        let isExpense = false;
        if (entry.lines) {
          entry.lines.forEach(l => {
            const accCode = String(l.accountCode || '');
            if (!accCode.startsWith('6')) return;
            let matchCebe = true;
            if (l.cebe && normalizedPropCebe) matchCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe);
            else if (!l.cebe && entry.cebe && normalizedPropCebe) matchCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe);
            
            let matchCeco = normalizedExpenseCecos.length === 0;
            if (normalizedExpenseCecos.length > 0 && l.ceco && normalizedExpenseCecos.some(c => String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').startsWith(c))) matchCeco = true;

            if (matchCebe && matchCeco) {
              gastos += (Number(l.debit) || 0) + (Number(l.credit) || 0);
              isExpense = true;
            }
          });
        }
        if (!isExpense && entry.cebe && normalizedPropCebe && String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').startsWith(normalizedPropCebe)) {
          let matchCeco = normalizedExpenseCecos.length === 0;
          if (normalizedExpenseCecos.length > 0 && entry.ceco && normalizedExpenseCecos.some(c => String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').startsWith(c))) matchCeco = true;
          if (matchCeco) gastos += parseFloat(entry.total) || 0;
        }
      });

      const purchasePrice = parseFloat(p.financials?.purchasePrice || p.finPurchasePrice) || 0;
      const acquisitionCosts = parseFloat(p.financials?.acquisitionCosts || p.finAcquisitionCosts) || 0;
      const agentFees = parseFloat(p.financials?.agentFees || p.finAgentFees) || 0;
      const acquisitionExpensesSum = (p.financials?.acquisitionExpenses || []).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
      const baseValue = purchasePrice + acquisitionCosts + agentFees + acquisitionExpensesSum;
      const amortizacion = baseValue * 0.80 * 0.03;

      return {
        id: p.id,
        name: p.name,
        ingresos,
        gastos,
        amortizacion: ingresos > 0 ? amortizacion : 0,
        beneficioNeto: ingresos - gastos - (ingresos > 0 ? amortizacion : 0)
      };
    });

    // 2. Renta Variable FIFO Capital gains
    const assetMap = {};
    rvTransactions.forEach(tx => {
      if (!['Compra', 'Venta'].includes(tx.type)) return;
      const key = tx.assetId || tx.asset || '';
      if (!assetMap[key]) assetMap[key] = { buys: [], sells: [] };
      if (tx.type === 'Compra') assetMap[key].buys.push({ ...tx });
      if (tx.type === 'Venta') assetMap[key].sells.push({ ...tx });
    });

    const rvGains = [];
    Object.entries(assetMap).forEach(([assetId, { buys, sells }]) => {
      const asset = rvAssets.find(a => a.id === assetId);
      buys.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      sells.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const queue = buys.map(b => ({
        qty: parseFloat(b.quantity) || 0,
        priceEUR: parseFloat(b.priceEUR || b.price) || 0,
        fee: parseFloat(b.fee) || 0,
      }));

      sells.forEach(sell => {
        const year = sell.date ? parseInt(sell.date.substring(0, 4), 10) : null;
        if (activeYearsFilter.length > 0 && (!year || !activeYearsFilter.includes(year))) return;

        let qtyToSell = parseFloat(sell.quantity) || 0;
        const sellPriceEUR = parseFloat(sell.priceEUR || sell.price) || 0;
        const sellFee = parseFloat(sell.fee) || 0;
        const sellTotal = qtyToSell * sellPriceEUR - sellFee;

        let costBasis = 0;
        let remaining = qtyToSell;

        while (remaining > 0 && queue.length > 0) {
          const lot = queue[0];
          const take = Math.min(lot.qty, remaining);
          const lotCost = (lot.priceEUR + lot.fee / lot.qty) * take;
          costBasis += lotCost;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty < 0.0001) queue.shift();
        }

        const gain = sellTotal - costBasis;
        const tax = calcTax(gain);

        rvGains.push({
          assetId,
          assetName: asset?.name || assetId,
          date: sell.date,
          year,
          qty: qtyToSell,
          sellPriceEUR,
          sellTotal,
          costBasis,
          gain,
          tax
        });
      });
    });

    const rvDividends = rvTransactions
      .filter(tx => tx.type === 'Dividendo')
      .filter(tx => {
        const year = tx.date ? parseInt(tx.date.substring(0, 4), 10) : null;
        return activeYearsFilter.includes(year);
      })
      .map(tx => {
        const asset = rvAssets.find(a => a.id === (tx.assetId || tx.asset));
        const gross = parseFloat(tx.totalAmountEUR || tx.totalAmount) || 0;
        const withholding = parseFloat(tx.withholding || tx.fee) || 0;
        const net = gross - withholding;
        const tax = calcTax(gross);
        return {
          assetId: tx.assetId || tx.asset || '',
          assetName: asset?.name || tx.assetId || '',
          date: tx.date,
          gross,
          withholding,
          net,
          tax,
        };
      });

    // 3. Crowdfunding
    const cfRendimientos = cfInvestments
      .filter(inv => {
        if (inv.status === 'activo') return false;
        const endYear = inv.endDate ? parseInt(inv.endDate.substring(0, 4), 10) : null;
        return activeYearsFilter.includes(endYear);
      })
      .map(inv => {
        const platform = cfPlatforms.find(p => p.id === inv.platformId);
        const project  = cfProjects.find(p => p.id === inv.projectId);
        const invested = parseFloat(inv.amount) || 0;
        const received = parseFloat(inv.currentValue) || invested;
        const gain     = received - invested;
        const rate     = parseFloat(inv.returnRate) || (invested > 0 ? (gain / invested) * 100 : 0);
        const tax      = calcTax(gain);
        return {
          id: inv.id,
          projectName: project?.name || inv.projectId || '—',
          platformName: platform?.name || inv.platformId || '—',
          type: inv.type || '—',
          endDate: inv.endDate || '—',
          invested,
          received,
          gain,
          rate,
          tax,
        };
      });

    const cfActivas = cfInvestments
      .filter(inv => {
        if (inv.status !== 'activo') return false;
        const startYear = inv.startDate ? parseInt(inv.startDate.substring(0, 4), 10) : null;
        return activeYearsFilter.includes(startYear);
      })
      .map(inv => {
        const platform = cfPlatforms.find(p => p.id === inv.platformId);
        const project  = cfProjects.find(p => p.id === inv.projectId);
        const invested = parseFloat(inv.amount) || 0;
        const rate     = parseFloat(inv.returnRate) || 0;
        const expectedGain = invested * (rate / 100);
        const expectedTax  = calcTax(expectedGain);
        return {
          id: inv.id,
          projectName: project?.name || inv.projectId || '—',
          platformName: platform?.name || inv.platformId || '—',
          invested,
          rate,
          expectedGain,
          expectedTax,
        };
      });

    // Overview
    const yearlyOverview = [];
    const minYearOverall = 2020;
    const currentYr = new Date().getFullYear();
    for (let yr = minYearOverall; yr <= currentYr + 1; yr++) {
      const taxIncomesYear = journalEntries.filter(entry => {
        if (!entry.isImpuesto) return false;
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        return entryYr === yr.toString() && !!entry.cebe;
      });
      const reIngresos = taxIncomesYear.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);

      const taxExpensesYear = journalEntries.filter(entry => {
        if (!entry.isImpuesto) return false;
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        return entryYr === yr.toString() && !!entry.ceco;
      });
      const reGastos = taxExpensesYear.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);

      let reAmortizacion = 0;
      properties.forEach(p => {
        let owned = true;
        const acqDate = p.financials?.acquisitionDate || p.finAcquisitionDate;
        if (acqDate) {
          const acqY = parseInt(acqDate.substring(0, 4), 10);
          if (!isNaN(acqY) && acqY > yr) owned = false;
        }
        if (!owned) return;
        const propertyCebe = String(p.cebe || '').trim();
        if (!propertyCebe) return;

        const propertyIncomesYear = journalEntries.filter(entry => {
          if (!entry.isImpuesto) return false;
          const entryYr = entry.date ? entry.date.substring(0, 4) : '';
          if (entryYr !== yr.toString()) return false;
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
          const normalizedPropCebe = propertyCebe.replace(/^(CEBE|CECO)/i, '');
          return entryCebe.startsWith(normalizedPropCebe);
        });

        if (propertyIncomesYear.length === 0) return;
        const purchasePrice = parseFloat(p.financials?.purchasePrice || p.finPurchasePrice) || 0;
        const acquisitionCosts = parseFloat(p.financials?.acquisitionCosts || p.finAcquisitionCosts) || 0;
        const agentFees = parseFloat(p.financials?.agentFees || p.finAgentFees) || 0;
        const acquisitionExpensesSum = (p.financials?.acquisitionExpenses || []).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const baseValue = purchasePrice + acquisitionCosts + agentFees + acquisitionExpensesSum;
        reAmortizacion += baseValue * 0.80 * 0.03;
      });

      const reNeto = reIngresos - reGastos - reAmortizacion;

      const rvGainTotal = rvGains.filter(g => g.year === yr).reduce((s, r) => s + r.gain, 0);
      const rvDivTotal = rvDividends.filter(d => d.year === yr).reduce((s, r) => s + r.gross, 0);

      const cfGainTotal = cfRendimientos.filter(r => {
        const endYear = r.endDate ? parseInt(r.endDate.substring(0, 4), 10) : null;
        return endYear === yr;
      }).reduce((s, r) => s + r.gain, 0);

      const baseImponible = (reNeto > 0 ? reNeto : 0) + rvGainTotal + rvDivTotal + cfGainTotal;
      const impuestoEstimado = calcTax(baseImponible);

      if (reIngresos > 0 || reGastos > 0 || rvGainTotal !== 0 || rvDivTotal > 0 || cfGainTotal !== 0) {
        yearlyOverview.push({
          year: yr,
          reIngresos,
          reGastos,
          reAmortizacion,
          reNeto,
          rvGains: rvGainTotal,
          rvDividends: rvDivTotal,
          cfGains: cfGainTotal,
          baseImponible,
          impuestoEstimado
        });
      }
    }

    return {
      reTaxes,
      rvGains,
      rvDividends,
      cfRendimientos,
      cfActivas,
      yearlyOverview: yearlyOverview.sort((a, b) => b.year - a.year)
    };
  }, [properties, rentals, journalEntries, rvTransactions, rvAssets, cfInvestments, cfPlatforms, cfProjects, activeYearsFilter]);

  // Compute Annual Accounts (Balance, Income Statement, Cash Flow)
  const computedAnnualAccounts = useMemo(() => {
    const directMap = {};
    const aggregatedMap = {};
    
    const startLimit = new Date(selectedYear, 0, 1);
    let endLimit = new Date(selectedYear, 11, 31, 23, 59, 59);

    if (selectedMonths.length > 0) {
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      let maxMonthIndex = 0;
      selectedMonths.forEach(m => {
        const idx = monthNames.indexOf(m);
        if (idx > maxMonthIndex) maxMonthIndex = idx;
      });
      endLimit = new Date(selectedYear, maxMonthIndex + 1, 0, 23, 59, 59);
    } else if (selectedQuarters.length > 0) {
      let maxMonthIndex = 2; // Default 1T (Jan-Mar)
      selectedQuarters.forEach(q => {
        if (q === '1T' && maxMonthIndex < 2) maxMonthIndex = 2;
        if (q === '2T' && maxMonthIndex < 5) maxMonthIndex = 5;
        if (q === '3T' && maxMonthIndex < 8) maxMonthIndex = 8;
        if (q === '4T' && maxMonthIndex < 11) maxMonthIndex = 11;
      });
      endLimit = new Date(selectedYear, maxMonthIndex + 1, 0, 23, 59, 59);
    }

    accounts.forEach(account => {
      let movementSum = 0;
      journalEntries.forEach(entry => {
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

    // Comparative calculations for all selected comparison years
    const compDirectMaps = {};
    const compAggregatedMaps = {};

    selectedComparisonYears.forEach(compYrStr => {
      const cy = parseInt(compYrStr);
      const compStartLimit = new Date(cy, 0, 1);
      let compEndLimit = new Date(cy, 11, 31, 23, 59, 59);

      if (selectedMonths.length > 0) {
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        let maxMonthIndex = 0;
        selectedMonths.forEach(m => {
          const idx = monthNames.indexOf(m);
          if (idx > maxMonthIndex) maxMonthIndex = idx;
        });
        compEndLimit = new Date(cy, maxMonthIndex + 1, 0, 23, 59, 59);
      } else if (selectedQuarters.length > 0) {
        let maxMonthIndex = 2;
        selectedQuarters.forEach(q => {
          if (q === '1T' && maxMonthIndex < 2) maxMonthIndex = 2;
          if (q === '2T' && maxMonthIndex < 5) maxMonthIndex = 5;
          if (q === '3T' && maxMonthIndex < 8) maxMonthIndex = 8;
          if (q === '4T' && maxMonthIndex < 11) maxMonthIndex = 11;
        });
        compEndLimit = new Date(cy, maxMonthIndex + 1, 0, 23, 59, 59);
      }

      const currentCompDirect = {};
      accounts.forEach(account => {
        let movementSum = 0;
        journalEntries.forEach(entry => {
          const entryDate = new Date(entry.date);
          const isIncomeExpense = ['Ingreso', 'Gasto'].includes(account.type);
          const isInRange = isIncomeExpense 
            ? (entryDate >= compStartLimit && entryDate <= compEndLimit)
            : (entryDate <= compEndLimit);

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
        currentCompDirect[account.id] = movementSum;
      });

      const currentCompAggregated = {};
      const calcCompAggregated = (id) => {
        if (currentCompAggregated[id] !== undefined) return currentCompAggregated[id];
        let sum = currentCompDirect[id] || 0;
        const children = accounts.filter(a => String(a.parentId) === String(id));
        for (const child of children) {
          sum += calcCompAggregated(child.id);
        }
        currentCompAggregated[id] = sum;
        return sum;
      };

      accounts.forEach(a => calcCompAggregated(a.id));

      compDirectMaps[compYrStr] = currentCompDirect;
      compAggregatedMaps[compYrStr] = currentCompAggregated;
    });

    const getAccountsForGroup = (groupObj, categoryKey) => {
      if (groupObj.isProfitLoss) {
        return accounts.filter(a => ['Ingreso', 'Gasto'].includes(a.type));
      }

      const prefixes = groupObj.prefixes || (groupObj.prefix ? [groupObj.prefix] : []);
      const excludes = groupObj.exclude || [];

      return accounts.filter(acc => {
        const code = acc.code || '';
        
        if (categoryKey === 'activo') {
          if (acc.type !== 'Activo') return false;
        }
        if (categoryKey === 'pasivo') {
          const isLiability = acc.type === 'Pasivo' && !(code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13'));
          if (!isLiability) return false;
        }
        if (categoryKey === 'patrimonio') {
          const isEquity = acc.type === 'Patrimonio' || (acc.type === 'Pasivo' && (code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13')));
          if (!isEquity) return false;
        }

        const matchesPrefix = prefixes.some(p => code.startsWith(p));
        const matchesExclude = excludes.some(e => code.startsWith(e));
        return matchesPrefix && !matchesExclude;
      });
    };

    const getGroupValue = (groupObj, categoryKey) => {
      if (groupObj.isProfitLoss) {
        const revenues = accounts.filter(a => a.type === 'Ingreso').reduce((sum, a) => sum + (directMap[a.id] || 0), 0);
        const expenses = accounts.filter(a => a.type === 'Gasto').reduce((sum, a) => sum + (directMap[a.id] || 0), 0);
        return revenues - expenses;
      }
      const groupAccounts = getAccountsForGroup(groupObj, categoryKey);
      return groupAccounts.reduce((sum, a) => sum + (directMap[a.id] || 0), 0);
    };

    const getGroupCompValues = (groupObj, categoryKey) => {
      const compValues = {};
      selectedComparisonYears.forEach(yrStr => {
        const currentCompDirect = compDirectMaps[yrStr] || {};
        if (groupObj.isProfitLoss) {
          const revenues = accounts.filter(a => a.type === 'Ingreso').reduce((sum, a) => sum + (currentCompDirect[a.id] || 0), 0);
          const expenses = accounts.filter(a => a.type === 'Gasto').reduce((sum, a) => sum + (currentCompDirect[a.id] || 0), 0);
          compValues[yrStr] = revenues - expenses;
        } else {
          const groupAccounts = getAccountsForGroup(groupObj, categoryKey);
          compValues[yrStr] = groupAccounts.reduce((sum, a) => sum + (currentCompDirect[a.id] || 0), 0);
        }
      });
      return compValues;
    };

    const getAccountsForCategoryItem = (item, categoryKey) => {
      if (item.isProfitLoss) {
        return [];
      }
      const prefixes = item.prefixes || (item.prefix ? [item.prefix] : []);
      const excludes = item.exclude || [];

      const matched = accounts.filter(acc => {
        const code = acc.code || '';
        
        if (categoryKey === 'activo') {
          if (acc.type !== 'Activo') return false;
        }
        if (categoryKey === 'pasivo') {
          const isLiability = acc.type === 'Pasivo' && !(code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13'));
          if (!isLiability) return false;
        }
        if (categoryKey === 'patrimonio') {
          const isEquity = acc.type === 'Patrimonio' || (acc.type === 'Pasivo' && (code.startsWith('10') || code.startsWith('11') || code.startsWith('12') || code.startsWith('13')));
          if (!isEquity) return false;
        }

        const matchesPrefix = prefixes.some(p => code.startsWith(p));
        const matchesExclude = excludes.some(e => code.startsWith(e));
        return matchesPrefix && !matchesExclude;
      });

      const levelAccounts = matched.filter(acc => acc.code && acc.code.length <= maxDigits);
      
      return levelAccounts.map(acc => {
        const compBalances = {};
        selectedComparisonYears.forEach(yrStr => {
          compBalances[yrStr] = (compAggregatedMaps[yrStr] || {})[acc.id] || 0;
        });
        return {
          code: acc.code,
          name: acc.name,
          balance: aggregatedMap[acc.id] || 0,
          compBalances
        };
      }).sort((a, b) => a.code.localeCompare(b.code));
    };

    const balanceSheet = {
      activo: {
        no_corriente: [
          { label: 'I. Inmovilizado intangible', prefix: '20' },
          { label: 'II. Inmovilizado material', prefix: '21' },
          { label: 'III. Inversiones inmobiliarias', prefix: '22' },
          { label: 'IV. Inversiones en empresas del grupo LP', prefix: '24' },
          { label: 'V. Inversiones financieras a largo plazo', prefix: '25' },
          { label: 'VI. Activos por impuesto diferido', prefix: '474' }
        ],
        corriente: [
          { label: 'I. Existencias', prefix: '3' },
          { label: 'II. Deudores comerciales y otras cuentas a cobrar', prefixes: ['43', '44', '470', '471', '472'] },
          { label: 'III. Inversiones financieras a corto plazo', prefixes: ['53', '54', '55', '56'] },
          { label: 'IV. Periodificaciones a corto plazo', prefixes: ['480', '567'] },
          { label: 'V. Efectivo y otros activos líquidos equivalentes', prefix: '57' }
        ]
      },
      pasivo: {
        no_corriente: [
          { label: 'I. Provisiones a largo plazo', prefix: '14' },
          { label: 'II. Deudas a largo plazo', prefixes: ['17', '18'] },
          { label: 'III. Deudas con empresas del grupo LP', prefix: '16' }
        ],
        corriente: [
          { label: 'I. Provisiones a corto plazo', prefix: '529' },
          { label: 'II. Deudas a corto plazo', prefixes: ['50', '51', '52'], exclude: ['529'] },
          { label: 'III. Deudas con empresas del grupo CP', prefix: '55' },
          { label: 'V. Acreedores comerciales y otras cuentas a pagar', prefixes: ['40', '41', '475', '476', '477'] }
        ]
      },
      patrimonio: {
        fondos_propios: [
          { label: 'I. Capital', prefix: '10' },
          { label: 'II. Prima de emisión', prefix: '110' },
          { label: 'III. Reservas', prefixes: ['111', '112', '113', '114', '115', '116', '117', '118', '119'] },
          { label: 'V. Resultados de ejercicios anteriores', prefix: '12' },
          { label: 'VII. Resultado del ejercicio', isProfitLoss: true }
        ]
      }
    };

    const sheetData = {
      activo_no_corriente_items: balanceSheet.activo.no_corriente.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'activo'),
        compValues: getGroupCompValues(g, 'activo'),
        accounts: getAccountsForCategoryItem(g, 'activo')
      })),
      activo_corriente_items: balanceSheet.activo.corriente.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'activo'),
        compValues: getGroupCompValues(g, 'activo'),
        accounts: getAccountsForCategoryItem(g, 'activo')
      })),
      pasivo_no_corriente_items: balanceSheet.pasivo.no_corriente.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'pasivo'),
        compValues: getGroupCompValues(g, 'pasivo'),
        accounts: getAccountsForCategoryItem(g, 'pasivo')
      })),
      pasivo_corriente_items: balanceSheet.pasivo.corriente.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'pasivo'),
        compValues: getGroupCompValues(g, 'pasivo'),
        accounts: getAccountsForCategoryItem(g, 'pasivo')
      })),
      patrimonio_items: balanceSheet.patrimonio.fondos_propios.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'patrimonio'),
        compValues: getGroupCompValues(g, 'patrimonio'),
        accounts: getAccountsForCategoryItem(g, 'patrimonio')
      }))
    };

    sheetData.total_activo_no_corriente = sheetData.activo_no_corriente_items.reduce((s, i) => s + i.value, 0);
    sheetData.total_activo_corriente = sheetData.activo_corriente_items.reduce((s, i) => s + i.value, 0);
    sheetData.total_activo = sheetData.total_activo_no_corriente + sheetData.total_activo_corriente;

    sheetData.total_activo_no_corriente_comp = {};
    sheetData.total_activo_corriente_comp = {};
    sheetData.total_activo_comp = {};

    sheetData.total_pasivo_no_corriente = sheetData.pasivo_no_corriente_items.reduce((s, i) => s + i.value, 0);
    sheetData.total_pasivo_corriente = sheetData.pasivo_corriente_items.reduce((s, i) => s + i.value, 0);
    sheetData.total_pasivo = sheetData.total_pasivo_no_corriente + sheetData.total_pasivo_corriente;

    sheetData.total_pasivo_no_corriente_comp = {};
    sheetData.total_pasivo_corriente_comp = {};
    sheetData.total_pasivo_comp = {};

    sheetData.total_patrimonio = sheetData.patrimonio_items.reduce((s, i) => s + i.value, 0);
    sheetData.total_patrimonio_comp = {};
    sheetData.total_pasivo_patrimonio = sheetData.total_pasivo + sheetData.total_patrimonio;
    sheetData.total_pasivo_patrimonio_comp = {};

    selectedComparisonYears.forEach(yrStr => {
      sheetData.total_activo_no_corriente_comp[yrStr] = sheetData.activo_no_corriente_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      sheetData.total_activo_corriente_comp[yrStr] = sheetData.activo_corriente_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      sheetData.total_activo_comp[yrStr] = sheetData.total_activo_no_corriente_comp[yrStr] + sheetData.total_activo_corriente_comp[yrStr];
      
      sheetData.total_pasivo_no_corriente_comp[yrStr] = sheetData.pasivo_no_corriente_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      sheetData.total_pasivo_corriente_comp[yrStr] = sheetData.pasivo_corriente_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      sheetData.total_pasivo_comp[yrStr] = sheetData.total_pasivo_no_corriente_comp[yrStr] + sheetData.total_pasivo_corriente_comp[yrStr];

      sheetData.total_patrimonio_comp[yrStr] = sheetData.patrimonio_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      sheetData.total_pasivo_patrimonio_comp[yrStr] = sheetData.total_pasivo_comp[yrStr] + sheetData.total_patrimonio_comp[yrStr];
    });

    const incomeStatement = {
      ingresos: [
        { label: '1. Importe neto de la cifra de negocios', prefix: '70' },
        { label: '2. Variación de existencias', prefix: '71' },
        { label: '3. Trabajos realizados por la empresa para su activo', prefix: '73' },
        { label: '4. Aprovisionamientos (devoluciones/ingresos)', prefix: '708' },
        { label: '5. Otros ingresos de explotación', prefixes: ['74', '75'] },
        { label: '6. Ingresos financieros', prefix: '76' }
      ],
      gastos: [
        { label: '1. Aprovisionamientos', prefix: '60' },
        { label: '2. Gastos de personal', prefix: '64' },
        { label: '3. Servicios exteriores', prefix: '62' },
        { label: '4. Tributos', prefix: '63' },
        { label: '5. Pérdidas, deterioro y variación de provisiones', prefix: '65' },
        { label: '6. Otros gastos corrientes de gestión', prefix: '65', exclude: ['650', '651'] },
        { label: '7. Amortización del inmovilizado', prefix: '68' },
        { label: '8. Gastos financieros', prefix: '66' }
      ]
    };

    const incomeData = {
      ingresos_items: incomeStatement.ingresos.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'ingreso'),
        compValues: getGroupCompValues(g, 'ingreso')
      })),
      gastos_items: incomeStatement.gastos.map(g => ({ 
        ...g, 
        value: getGroupValue(g, 'gasto'),
        compValues: getGroupCompValues(g, 'gasto')
      }))
    };

    incomeData.total_ingresos = incomeData.ingresos_items.reduce((s, i) => s + i.value, 0);
    incomeData.total_ingresos_comp = {};
    incomeData.total_gastos = incomeData.gastos_items.reduce((s, i) => s + i.value, 0);
    incomeData.total_gastos_comp = {};
    incomeData.resultado_neto = incomeData.total_ingresos - incomeData.total_gastos;
    incomeData.resultado_neto_comp = {};

    selectedComparisonYears.forEach(yrStr => {
      incomeData.total_ingresos_comp[yrStr] = incomeData.ingresos_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      incomeData.total_gastos_comp[yrStr] = incomeData.gastos_items.reduce((s, i) => s + (i.compValues[yrStr] || 0), 0);
      incomeData.resultado_neto_comp[yrStr] = incomeData.total_ingresos_comp[yrStr] - incomeData.total_gastos_comp[yrStr];
    });

    const computeCashFlowForPeriod = (yearVal) => {
      const start = new Date(yearVal, 0, 1);
      let end = new Date(yearVal, 11, 31, 23, 59, 59);

      if (selectedMonths.length > 0) {
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        let maxMonthIndex = 0;
        selectedMonths.forEach(m => {
          const idx = monthNames.indexOf(m);
          if (idx > maxMonthIndex) maxMonthIndex = idx;
        });
        end = new Date(yearVal, maxMonthIndex + 1, 0, 23, 59, 59);
      } else if (selectedQuarters.length > 0) {
        let maxMonthIndex = 2;
        selectedQuarters.forEach(q => {
          if (q === '1T' && maxMonthIndex < 2) maxMonthIndex = 2;
          if (q === '2T' && maxMonthIndex < 5) maxMonthIndex = 5;
          if (q === '3T' && maxMonthIndex < 8) maxMonthIndex = 8;
          if (q === '4T' && maxMonthIndex < 11) maxMonthIndex = 11;
        });
        end = new Date(yearVal, maxMonthIndex + 1, 0, 23, 59, 59);
      }

      const cats = {
        explotacion_cobros: { label: '(+) Cobros de clientes y arrendamientos', val: 0 },
        explotacion_pagos_prov: { label: '(-) Pagos a proveedores y acreedores por gastos', val: 0 },
        explotacion_pagos_pers: { label: '(-) Pagos al personal y tributos', val: 0 },
        explotacion_otros: { label: '(+/-) Otros cobros/pagos de explotación', val: 0 },
        inversion_pagos: { label: '(-) Adquisición de activos (propiedades, etc.)', val: 0 },
        inversion_cobros: { label: '(+) Enajenación/venta de activos', val: 0 },
        financiacion_cobros: { label: '(+) Cobros por emisión de capital o deudas', val: 0 },
        financiacion_pagos: { label: '(-) Pagos por devolución de deudas o dividendos', val: 0 }
      };

      journalEntries.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= start && entryDate <= end && entry.lines) {
          const bankLines = entry.lines.filter(l => String(l.accountCode || '').startsWith('57'));
          if (bankLines.length > 0) {
            entry.lines.forEach(l => {
              const code = String(l.accountCode || '');
              if (code.startsWith('57')) return;

              const debit = parseFloat(l.debit) || 0;
              const credit = parseFloat(l.credit) || 0;
              const balance = debit - credit;

              if (code.startsWith('70') || code.startsWith('43') || code.startsWith('75')) {
                cats.explotacion_cobros.val += balance < 0 ? Math.abs(balance) : -balance;
              } else if (code.startsWith('60') || code.startsWith('62') || code.startsWith('40') || code.startsWith('41')) {
                cats.explotacion_pagos_prov.val += balance > 0 ? balance : -Math.abs(balance);
              } else if (code.startsWith('64') || code.startsWith('63') || code.startsWith('46') || code.startsWith('47')) {
                cats.explotacion_pagos_pers.val += balance > 0 ? balance : -Math.abs(balance);
              } else if (code.startsWith('21') || code.startsWith('22')) {
                cats.inversion_pagos.val += balance > 0 ? balance : 0;
                cats.inversion_cobros.val += balance < 0 ? Math.abs(balance) : 0;
              } else if (code.startsWith('17') || code.startsWith('52') || code.startsWith('10')) {
                if (balance < 0) cats.financiacion_cobros.val += Math.abs(balance);
                else cats.financiacion_pagos.val += balance;
              } else {
                cats.explotacion_otros.val += balance < 0 ? Math.abs(balance) : -balance;
              }
            });
          }
        }
      });

      const items = {
        explotacion: [
          { label: cats.explotacion_cobros.label, value: cats.explotacion_cobros.val },
          { label: cats.explotacion_pagos_prov.label, value: -Math.abs(cats.explotacion_pagos_prov.val) },
          { label: cats.explotacion_pagos_pers.label, value: -Math.abs(cats.explotacion_pagos_pers.val) },
          { label: cats.explotacion_otros.label, value: cats.explotacion_otros.val }
        ],
        inversion: [
          { label: cats.inversion_pagos.label, value: -Math.abs(cats.inversion_pagos.val) },
          { label: cats.inversion_cobros.label, value: cats.inversion_cobros.val }
        ],
        financiacion: [
          { label: cats.financiacion_cobros.label, value: cats.financiacion_cobros.val },
          { label: cats.financiacion_pagos.label, value: -Math.abs(cats.financiacion_pagos.val) }
        ]
      };

      const total_explotacion = items.explotacion.reduce((s, i) => s + i.value, 0);
      const total_inversion = items.inversion.reduce((s, i) => s + i.value, 0);
      const total_financiacion = items.financiacion.reduce((s, i) => s + i.value, 0);
      const total_neto = total_explotacion + total_inversion + total_financiacion;

      return {
        items,
        total_explotacion,
        total_inversion,
        total_financiacion,
        total_neto
      };
    };

    const mainCf = computeCashFlowForPeriod(selectedYear);
    const compCfData = {};
    selectedComparisonYears.forEach(yrStr => {
      compCfData[yrStr] = computeCashFlowForPeriod(parseInt(yrStr));
    });

    const cashFlowData = {
      explotacion: mainCf.items.explotacion.map((item, idx) => {
        const compValues = {};
        selectedComparisonYears.forEach(yrStr => {
          compValues[yrStr] = compCfData[yrStr].items.explotacion[idx].value;
        });
        return { ...item, compValues };
      }),
      inversion: mainCf.items.inversion.map((item, idx) => {
        const compValues = {};
        selectedComparisonYears.forEach(yrStr => {
          compValues[yrStr] = compCfData[yrStr].items.inversion[idx].value;
        });
        return { ...item, compValues };
      }),
      financiacion: mainCf.items.financiacion.map((item, idx) => {
        const compValues = {};
        selectedComparisonYears.forEach(yrStr => {
          compValues[yrStr] = compCfData[yrStr].items.financiacion[idx].value;
        });
        return { ...item, compValues };
      }),
      total_explotacion: mainCf.total_explotacion,
      total_explotacion_comp: {},
      total_inversion: mainCf.total_inversion,
      total_inversion_comp: {},
      total_financiacion: mainCf.total_financiacion,
      total_financiacion_comp: {},
      total_neto: mainCf.total_neto,
      total_neto_comp: {}
    };

    selectedComparisonYears.forEach(yrStr => {
      cashFlowData.total_explotacion_comp[yrStr] = compCfData[yrStr].total_explotacion;
      cashFlowData.total_inversion_comp[yrStr] = compCfData[yrStr].total_inversion;
      cashFlowData.total_financiacion_comp[yrStr] = compCfData[yrStr].total_financiacion;
      cashFlowData.total_neto_comp[yrStr] = compCfData[yrStr].total_neto;
    });

    return {
      sheet: sheetData,
      income: incomeData,
      cashflow: cashFlowData
    };
  }, [accounts, journalEntries, selectedYear, selectedMonths, selectedQuarters, maxDigits, selectedComparisonYears]);

  // Combined timeline and dropdown filters for print entries
  const filteredEntriesForPrint = useMemo(() => {
    let list = journalEntries;
    
    // 1. Year filter: only apply when user has explicitly selected years in the timeline
    if (selectedYears.length > 0) {
      list = list.filter(entry => {
        if (!entry.date) return false;
        const yr = new Date(entry.date).getFullYear().toString();
        return selectedYears.includes(yr);
      });
    }
    // If no years selected → show all years (no filter applied)
    
    // 2. Month / Quarter filters from timeline
    if (selectedMonths.length > 0 || selectedQuarters.length > 0) {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      list = list.filter(entry => {
        if (!entry.date) return false;
        const m = new Date(entry.date).getMonth();
        
        const matchMonth = selectedMonths.includes(months[m]);
        const matchQuarter = selectedQuarters.some(q => {
          if (q === '1T') return [0, 1, 2].includes(m);
          if (q === '2T') return [3, 4, 5].includes(m);
          if (q === '3T') return [6, 7, 8].includes(m);
          if (q === '4T') return [9, 10, 11].includes(m);
          return false;
        });
        
        if (selectedMonths.length > 0 && selectedQuarters.length > 0) {
          return matchMonth || matchQuarter;
        } else if (selectedMonths.length > 0) {
          return matchMonth;
        } else {
          return matchQuarter;
        }
      });
    }

    // 3. Impuesto filter
    if (filterImpuesto) {
      list = list.filter(entry => !!entry.isImpuesto);
    }
    
    return list;
  }, [journalEntries, selectedYear, selectedYears, selectedMonths, selectedQuarters, filterImpuesto]);

  // Entries filtered only by timeline+accounts (used to derive dynamic options for CEBE/CECO/Document)
  const entriesMatchingAccountAndTimeline = useMemo(() => {
    return filteredEntriesForPrint
      .map(entry => {
        if (!entry.lines) return null;
        const filteredLines = entry.lines.filter(l =>
          isAccountMatched(l.accountId, selectedAccounts, accounts)
        );
        return filteredLines.length > 0 ? { ...entry, lines: filteredLines } : null;
      })
      .filter(Boolean);
  }, [filteredEntriesForPrint, selectedAccounts, accounts]);

  // Dynamic CEBE options: only those that appear in the account/timeline filtered entries
  const selectableCebes = useMemo(() => {
    const set = new Set();
    entriesMatchingAccountAndTimeline.forEach(entry => {
      if (entry.cebe) set.add(entry.cebe);
      entry.lines.forEach(l => { if (l.cebe) set.add(l.cebe); });
    });
    return Array.from(set).sort();
  }, [entriesMatchingAccountAndTimeline]);

  const filteredSelectableCebes = useMemo(() => {
    if (!cebeSearch) return selectableCebes;
    const query = cebeSearch.toLowerCase();
    return selectableCebes.filter(c => {
      const cebeObj = cebes.find(x => x.code === c);
      const label = cebeObj ? `${c} - ${cebeObj.name}` : c;
      return label.toLowerCase().includes(query);
    });
  }, [selectableCebes, cebeSearch, cebes]);

  // Dynamic CECO options
  const selectableCecos = useMemo(() => {
    const set = new Set();
    entriesMatchingAccountAndTimeline.forEach(entry => {
      if (entry.ceco) set.add(entry.ceco);
      entry.lines.forEach(l => { if (l.ceco) set.add(l.ceco); });
    });
    return Array.from(set).sort();
  }, [entriesMatchingAccountAndTimeline]);

  const filteredSelectableCecos = useMemo(() => {
    if (!cecoSearch) return selectableCecos;
    const query = cecoSearch.toLowerCase();
    return selectableCecos.filter(c => {
      const cecoObj = cecos.find(x => x.code === c);
      const label = cecoObj ? `${c} - ${cecoObj.name}` : c;
      return label.toLowerCase().includes(query);
    });
  }, [selectableCecos, cecoSearch, cecos]);

  // Dynamic Document options
  const selectableDocuments = useMemo(() => {
    const set = new Set();
    entriesMatchingAccountAndTimeline.forEach(entry => {
      if (entry.document) set.add(entry.document);
      entry.lines.forEach(l => { if (l.document) set.add(l.document); });
    });
    return Array.from(set).sort();
  }, [entriesMatchingAccountAndTimeline]);

  const filteredSelectableDocuments = useMemo(() => {
    if (!docSearch) return selectableDocuments;
    const query = docSearch.toLowerCase();
    return selectableDocuments.filter(d => d.toLowerCase().includes(query));
  }, [selectableDocuments, docSearch]);

  // Helper: check if an entry/line matches active CEBE/CECO/Document filters
  const matchesCenterFilters = (entry, line) => {
    const cebe = line?.cebe || entry?.cebe || '';
    const ceco = line?.ceco || entry?.ceco || '';
    const document = line?.document || entry?.document || '';
    if (selectedCebes.length > 0 && !selectedCebes.includes(cebe)) return false;
    if (selectedCecos.length > 0 && !selectedCecos.includes(ceco)) return false;
    if (selectedDocuments.length > 0 && !selectedDocuments.includes(document)) return false;
    return true;
  };

  // Handle Print execution — clone print-area to body so overflow/flex containers don't clip pages
  const handlePrint = () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) { window.print(); return; }

    // Clone the rendered pages directly into body (bypasses all overflow:hidden ancestors)
    const clone = document.createElement('div');
    clone.id = 'print-body-clone';
    clone.innerHTML = printArea.innerHTML;
    document.body.appendChild(clone);

    window.print();

    // Clean up after printing dialog closes
    document.body.removeChild(clone);
  };

  useEffect(() => {
    const handleExecutePrint = () => {
      const printArea = document.getElementById('print-area');
      if (!printArea) { window.print(); return; }
      const clone = document.createElement('div');
      clone.id = 'print-body-clone';
      clone.innerHTML = printArea.innerHTML;
      document.body.appendChild(clone);
      window.print();
      document.body.removeChild(clone);
    };
    window.addEventListener('print:execute', handleExecutePrint);
    return () => window.removeEventListener('print:execute', handleExecutePrint);
  }, []);

  // Helper to format currency (no € symbol, trailing minus sign, clean alignment)
  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    const formatted = Math.abs(num).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num < 0 ? `${formatted}-` : `${formatted}\u00a0`;
  };

  const formatValue = (val, divisor) => {
    if (displayMode === 'percent') {
      const pct = divisor ? (val / divisor) * 100 : 0;
      return `${pct.toFixed(1)}%`;
    }
    return formatCurrency(val);
  };

  // Helper for sentence case names
  const formatAccountName = (name) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  // Helper to format dates to DD/MM/YYYY with leading zeros
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Chunking helper for Diario de Movimientos (increased to 28 for fuller A4 page)
  const chunkDiario = (entriesList, maxRowsPerPage = 28) => {
    const pages = [];
    let currentPage = [];
    let currentRowCount = 0;
    
    entriesList.forEach(entry => {
      const entryRowsCount = 1 + (entry.lines ? entry.lines.length : 0);
      if (currentRowCount + entryRowsCount > maxRowsPerPage && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [entry];
        currentRowCount = entryRowsCount;
      } else {
        currentPage.push(entry);
        currentRowCount += entryRowsCount;
      }
    });
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  };

  // Chunking helper for Libro Mayor (increased to 32 for fuller A4 page)
  const chunkMayor = (activeAccounts, maxLinesPerPage = 32) => {
    const pages = [];
    let currentPageBlocks = [];
    let currentLineCount = 0;

    activeAccounts.forEach(am => {
      const totalMovementLines = am.lines.length;
      if (currentLineCount + totalMovementLines + 3 <= maxLinesPerPage) {
        currentPageBlocks.push({
          account: am.account,
          lines: am.lines,
          debitSum: am.debitSum,
          creditSum: am.creditSum,
          isFirst: true,
          isLast: true
        });
        currentLineCount += totalMovementLines + 3;
      } else {
        let remainingLines = [...am.lines];
        let pageIdx = 0;
        
        while (remainingLines.length > 0) {
          if (currentPageBlocks.length > 0 && currentLineCount + 4 > maxLinesPerPage) {
            pages.push(currentPageBlocks);
            currentPageBlocks = [];
            currentLineCount = 0;
          }
          
          const availableSlots = maxLinesPerPage - currentLineCount - 3;
          if (availableSlots <= 0) {
            pages.push(currentPageBlocks);
            currentPageBlocks = [];
            currentLineCount = 0;
            continue;
          }

          const chunkLines = remainingLines.slice(0, availableSlots);
          remainingLines = remainingLines.slice(availableSlots);
          
          currentPageBlocks.push({
            account: am.account,
            lines: chunkLines,
            debitSum: am.debitSum,
            creditSum: am.creditSum,
            isFirst: pageIdx === 0,
            isLast: remainingLines.length === 0,
            pageIdx: pageIdx
          });
          
          currentLineCount += chunkLines.length + 3;
          pageIdx++;
        }
      }
    });

    if (currentPageBlocks.length > 0) {
      pages.push(currentPageBlocks);
    }
    return pages;
  };

  // Flat list chunker
  const chunkFlatList = (list, itemsPerPage = 34) => {
    const pages = [];
    for (let i = 0; i < list.length; i += itemsPerPage) {
      pages.push(list.slice(i, i + itemsPerPage));
    }
    return pages;
  };

  // Reusable Page Header
  const renderPageHeader = (title) => {
    const isAccounting = ['Diario de Movimientos', 'Libro Mayor de Cuentas', 'Balance de Sumas y Saldos'].includes(title);
    const yearLabel = selectedYears.length > 0 ? selectedYears.join(', ') : 'Todos los ejercicios';
    const subtitle = isAccounting
      ? `Ejercicio Contable: ${yearLabel}${selectedMonths.length > 0 || selectedQuarters.length > 0 ? ` (${[...selectedQuarters, ...selectedMonths].join(', ')})` : ''}`
      : `Ejercicio Contable: ${selectedYear}`;
    return (
      <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-end mb-4 select-none">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-slate-900">{title}</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase">{subtitle}</p>
        </div>
        <div className="text-right text-[10px] text-slate-500 font-mono">
          Fecha Emisión: {new Date().toLocaleDateString()}
        </div>
      </div>
    );
  };

  // Reusable Page Footer
  const renderPageFooter = (currentPage, totalPages, auditNumber) => {
    return (
      <div className="mt-auto pt-4 border-t border-slate-200 flex justify-between items-end text-[8px] text-slate-400 select-none">
        <div>
          <p className="font-bold text-slate-500 uppercase tracking-wide">{APP_NAME}</p>
        </div>
        <div className="text-right">
          <p>Página {currentPage} de {totalPages}</p>
          <p className="font-mono">Auditoría Nº {auditNumber}</p>
        </div>
      </div>
    );
  };

  // Paginated Rendering
  const renderPages = () => {
    const pageViews = [];
    const auditNumber = useMemo(() => Math.floor(Math.random() * 900000 + 100000), [selectedTemplate, selectedYear]);

    // 1. DIARIO DE MOVIMIENTOS
    if (selectedTemplate === 'diario') {
      const yearEntries = filteredEntriesForPrint
        .map(entry => {
          if (!entry.lines) return entry;
          const filteredLines = entry.lines.filter(l =>
            isAccountMatched(l.accountId, selectedAccounts, accounts) &&
            matchesCenterFilters(entry, l)
          );
          return { ...entry, lines: filteredLines };
        })
        .filter(entry => entry.lines && entry.lines.length > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const entryPages = chunkDiario(yearEntries, 28);
      const totalPages = entryPages.length || 1;

      if (entryPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Diario de Movimientos')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay asientos contables registrados para este año.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        entryPages.forEach((pageEntries, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Diario de Movimientos')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left w-16">Asiento Nº</th>
                      <th className="py-2 px-1 text-left">Concepto / Cuenta</th>
                      <th className="py-2 px-1 text-left w-20">CEBE/CECO</th>
                      <th className="py-2 px-1 text-right w-24">Debe</th>
                      <th className="py-2 px-1 text-right w-24">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.flatMap((entry, entryIndex) => {
                      const rows = [];
                      const rowBg = entryIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                      rows.push(
                        <tr key={`entry-${entry.id}`} className={`font-bold border-t border-slate-200 ${rowBg}`}>
                          <td className="py-1 px-1 text-slate-600 font-sans tabular-nums">{formatDate(entry.date)}</td>
                          <td className="py-1 px-1 text-slate-600">{entry.number || entryIndex + 1}</td>
                          <td className="py-1 px-1 text-slate-900 uppercase" colSpan="2">{entry.description}</td>
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(entry.total)}</td>
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(entry.total)}</td>
                        </tr>
                      );
                      if (entry.lines) {
                        const uniqueCebes = new Set();
                        const uniqueCecos = new Set();
                        if (entry.cebe) uniqueCebes.add(entry.cebe);
                        if (entry.ceco) uniqueCecos.add(entry.ceco);
                        entry.lines.forEach(l => {
                          if (l.cebe) uniqueCebes.add(l.cebe);
                          if (l.ceco) uniqueCecos.add(l.ceco);
                        });

                        const centerDisplays = [];
                        uniqueCebes.forEach(c => centerDisplays.push(`CEBE: ${c}`));
                        uniqueCecos.forEach(c => centerDisplays.push(`CECO: ${c}`));

                        entry.lines.forEach((line, lineIndex) => {
                          const account = accounts.find(a => a.id === line.accountId);
                          const accDisplay = account ? `${account.code} - ${formatAccountName(account.name)}` : line.accountId || 'Cuenta';
                          const centerDisplay = centerDisplays[lineIndex] || '';
                          rows.push(
                            <tr key={`line-${entry.id}-${lineIndex}`} className={rowBg}>
                              <td className="py-0.5 px-1" colSpan="2"></td>
                              <td className="py-0.5 px-1 text-slate-600 pl-4">{accDisplay}</td>
                              <td className="py-0.5 px-1 font-mono text-[9px] text-slate-500">{centerDisplay}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-600">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-600">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                            </tr>
                          );
                        });
                      }
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 2. LIBRO MAYOR
    if (selectedTemplate === 'mayor') {
      const yearEntries = filteredEntriesForPrint;
      const accountMovements = {};
      accounts.forEach(acc => {
        accountMovements[acc.id] = { account: acc, lines: [], debitSum: 0, creditSum: 0 };
      });
      yearEntries.forEach(entry => {
        if (entry.lines) {
          entry.lines.forEach(line => {
            if (accountMovements[line.accountId] && matchesCenterFilters(entry, line)) {
              const debit = parseFloat(line.debit) || 0;
              const credit = parseFloat(line.credit) || 0;
              accountMovements[line.accountId].lines.push({
                date: entry.date,
                entryNo: entry.number,
                description: entry.description,
                debit,
                credit
              });
              accountMovements[line.accountId].debitSum += debit;
              accountMovements[line.accountId].creditSum += credit;
            }
          });
        }
      });

      // Sort each account's lines by date ascending
      Object.values(accountMovements).forEach(am => {
        am.lines.sort((a, b) => new Date(a.date) - new Date(b.date));
      });

      const activeAccounts = Object.values(accountMovements)
        .filter(am => am.lines.length > 0 && isAccountMatched(am.account.code, selectedAccounts, accounts))
        .sort((a, b) => (a.account.code || '').localeCompare(b.account.code || ''));

      const mayorPages = chunkMayor(activeAccounts, 32);
      const totalPages = mayorPages.length || 1;

      if (mayorPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Libro Mayor de Cuentas')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay movimientos registrados para este año.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        mayorPages.forEach((pageBlocks, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div className="flex flex-col gap-4">
                {renderPageHeader('Libro Mayor de Cuentas')}
                {pageBlocks.map((block, bIdx) => {
                  let runningBalance = 0;
                  const isAssetOrExpense = ['Activo', 'Gasto'].includes(block.account.type);
                  
                  if (!block.isFirst) {
                    const allAccLines = accountMovements[block.account.id].lines;
                    const precedingLines = allAccLines.slice(0, allAccLines.indexOf(block.lines[0]));
                    precedingLines.forEach(l => {
                      const move = l.debit - l.credit;
                      runningBalance += isAssetOrExpense ? move : -move;
                    });
                  }

                  return (
                    <div key={bIdx} className="mb-2 break-inside-avoid">
                      <div className="bg-slate-100 p-1 border border-slate-300 font-bold text-slate-800 flex justify-between text-[9px] mb-1.5 uppercase">
                        <span>Cuenta: {block.account.code} - {formatAccountName(block.account.name)} {!block.isFirst && `(Continuación - Pág. ${block.pageIdx + 1})`}</span>
                        <span>Tipo: {block.account.type}</span>
                      </div>
                      <table className="w-full text-[8.5px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-300 font-semibold text-slate-600">
                            <th className="py-0.5 px-1 text-left w-16">Fecha</th>
                            <th className="py-0.5 px-1 text-center w-12">Asiento</th>
                            <th className="py-0.5 px-1 text-left">Concepto</th>
                            <th className="py-0.5 px-1 text-right w-20">Debe</th>
                            <th className="py-0.5 px-1 text-right w-20">Haber</th>
                            <th className="py-0.5 px-1 text-right w-24">Saldo Acum.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!block.isFirst && (
                            <tr className="bg-slate-50 italic font-semibold text-slate-500">
                              <td className="py-0.5 px-1" colSpan="3">Saldo anterior (Arrastrado):</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums" colSpan="3">{formatCurrency(runningBalance)}</td>
                            </tr>
                          )}
                          {block.lines.map((line, idx) => {
                            const movement = line.debit - line.credit;
                            runningBalance += isAssetOrExpense ? movement : -movement;
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-0.5 px-1 font-sans tabular-nums">{formatDate(line.date)}</td>
                                <td className="py-0.5 px-1 text-center font-mono">{line.entryNo || '-'}</td>
                                <td className="py-0.5 px-1 truncate max-w-[200px] uppercase">{line.description}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-650">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-650">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums font-bold text-slate-850">{formatCurrency(runningBalance)}</td>
                              </tr>
                            );
                          })}
                          {block.isLast && (
                            <tr className="bg-slate-50 font-bold border-t border-slate-300 text-[8.5px]">
                              <td className="py-0.5 px-1" colSpan="3">Suma de Movimientos y Saldo Final:</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(block.debitSum)}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(block.creditSum)}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(runningBalance)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 3. BALANCE DE SUMAS Y SALDOS
    if (selectedTemplate === 'sumas_saldos') {
      const yearEntries = filteredEntriesForPrint;
      const sumsMap = {};
      accounts.forEach(acc => {
        sumsMap[acc.id] = { id: acc.id, code: acc.code, name: acc.name, type: acc.type, parentId: acc.parentId, debit: 0, credit: 0 };
      });
      yearEntries.forEach(entry => {
        if (entry.lines) {
          entry.lines.forEach(line => {
            if (sumsMap[line.accountId] && matchesCenterFilters(entry, line)) {
              sumsMap[line.accountId].debit += parseFloat(line.debit) || 0;
              sumsMap[line.accountId].credit += parseFloat(line.credit) || 0;
            }
          });
        }
      });

      // Recursive consolidation of debits and credits for parent accounts
      const recursiveSums = {};
      const calcRecursiveSums = (id) => {
        if (recursiveSums[id] !== undefined) return recursiveSums[id];
        const self = sumsMap[id] || { debit: 0, credit: 0 };
        let debitSum = self.debit || 0;
        let creditSum = self.credit || 0;
        
        const children = accounts.filter(a => String(a.parentId) === String(id));
        children.forEach(child => {
          const childRes = calcRecursiveSums(child.id);
          debitSum += childRes.debit;
          creditSum += childRes.credit;
        });
        
        recursiveSums[id] = { debit: debitSum, credit: creditSum };
        return recursiveSums[id];
      };
      
      accounts.forEach(acc => calcRecursiveSums(acc.id));
      
      // Update sumsMap with recursive sums
      accounts.forEach(acc => {
        const res = recursiveSums[acc.id];
        if (res) {
          sumsMap[acc.id].debit = res.debit;
          sumsMap[acc.id].credit = res.credit;
        }
      });

      const list = Object.values(sumsMap)
        .filter(s => !s.code || s.code.length <= maxDigits)
        .filter(s => (s.debit > 0 || s.credit > 0) && isAccountMatched(s.code, selectedAccounts, accounts))
        .map(s => {
          const isAssetOrExpense = ['Activo', 'Gasto'].includes(s.type);
          const balanceDiff = s.debit - s.credit;
          return {
            ...s,
            debitBalance: isAssetOrExpense ? (balanceDiff > 0 ? balanceDiff : 0) : (balanceDiff < 0 ? Math.abs(balanceDiff) : 0),
            creditBalance: isAssetOrExpense ? (balanceDiff < 0 ? Math.abs(balanceDiff) : 0) : (balanceDiff > 0 ? balanceDiff : 0)
          };
        })
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

      const totals = list.reduce((t, acc) => {
        t.debitSum += acc.debit;
        t.creditSum += acc.credit;
        t.debitBalSum += acc.debitBalance;
        t.creditBalSum += acc.creditBalance;
        return t;
      }, { debitSum: 0, creditSum: 0, debitBalSum: 0, creditBalSum: 0 });

      const listPages = chunkFlatList(list, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Balance de Sumas y Saldos')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay cuentas con saldos para este ejercicio.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Balance de Sumas y Saldos')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-20">Código</th>
                      <th className="py-2 px-1 text-left">Cuenta</th>
                      <th className="py-2 px-1 text-right w-24">Sumas Debe</th>
                      <th className="py-2 px-1 text-right w-24">Sumas Haber</th>
                      <th className="py-2 px-1 text-right w-24">Saldo Deudor</th>
                      <th className="py-2 px-1 text-right w-24">Saldo Acreedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(acc => (
                      <tr key={acc.code} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-mono">{acc.code}</td>
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase">{formatAccountName(acc.name)}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-650">{acc.debit > 0 ? formatCurrency(acc.debit) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-650">{acc.credit > 0 ? formatCurrency(acc.credit) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums font-semibold text-blue-800">{acc.debitBalance > 0 ? formatCurrency(acc.debitBalance) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums font-semibold text-amber-900">{acc.creditBalance > 0 ? formatCurrency(acc.creditBalance) : '0,00'}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1" colSpan="2">TOTAL GENERAL:</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.debitSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.creditSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-blue-900">{formatCurrency(totals.debitBalSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-amber-955">{formatCurrency(totals.creditBalSum)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 4. INVENTARIO DE ACTIVOS INMOBILIARIOS
    if (selectedTemplate === 'activos') {
      const listPages = chunkFlatList(properties, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Inventario de Activos Inmobiliarios')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay activos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Inventario de Activos Inmobiliarios')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">ID</th>
                      <th className="py-2 px-1 text-left w-32">Nombre Finca</th>
                      <th className="py-2 px-1 text-left">Dirección</th>
                      <th className="py-2 px-1 text-left w-20">CEBE/CECO</th>
                      <th className="py-2 px-1 text-center w-24">Cuenta Contable</th>
                      <th className="py-2 px-1 text-right w-24">Hip. Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono font-bold text-slate-650">{p.id}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{p.name}</td>
                        <td className="py-2 px-1 uppercase">{p.address}, {p.city}</td>
                        <td className="py-2 px-1 font-mono text-[9px] text-slate-500">
                          <div>BE: {p.cebe || '---'}</div>
                          <div>CO: {p.ceco || '---'}</div>
                        </td>
                        <td className="py-2 px-1 text-center font-mono">{p.accountingAccount || '---'}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums font-semibold text-red-650">
                          {p.mortgagePending > 0 ? formatCurrency(p.mortgagePending) : '0,00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 5. CONTRATOS DE ALQUILER
    if (selectedTemplate === 'alquileres') {
      const listPages = chunkFlatList(rentals, 32);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Listado de Contratos de Alquiler')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay contratos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Listado de Contratos de Alquiler')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Referencia</th>
                      <th className="py-2 px-1 text-left w-36">Inmueble</th>
                      <th className="py-2 px-1 text-left">Inquilinos</th>
                      <th className="py-2 px-1 text-center w-24">Período</th>
                      <th className="py-2 px-1 text-right w-20">Fianza</th>
                      <th className="py-2 px-1 text-right w-20">Renta</th>
                      <th className="py-2 px-1 text-center w-16">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(r => {
                      const prop = properties.find(p => p.id === r.propertyId);
                      const cust = customers.find(c => c.id === r.tenantId);
                      const tenantDisplay = r.tenants?.length > 0 
                        ? r.tenants.map(t => t.name).join(', ') 
                        : (cust ? cust.name : 'Ninguno');
                      
                      return (
                        <tr key={r.id || r.reference} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-1 font-mono font-bold text-slate-650">{r.reference || '---'}</td>
                          <td className="py-2 px-1 uppercase font-bold text-slate-800">{prop ? prop.name : r.propertyId}</td>
                          <td className="py-2 px-1 uppercase">{tenantDisplay}</td>
                          <td className="py-2 px-1 text-center font-mono text-[9px]">
                            {r.startDate ? formatDate(r.startDate) : '---'} al <br/>
                            {r.endDate ? formatDate(r.endDate) : 'INDET.'}
                          </td>
                          <td className="py-2 px-1 text-right font-sans tabular-nums">{r.depositAmount > 0 ? formatCurrency(r.depositAmount) : '---'}</td>
                          <td className="py-2 px-1 text-right font-sans tabular-nums font-bold text-green-700">{formatCurrency(r.rentAmount)}</td>
                          <td className="py-2 px-1 text-center uppercase font-bold text-[9px]">
                            <span className={`px-1 py-0.5 rounded ${r.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                              {r.status || 'activo'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 6. FICHERO DE CLIENTES / INQUILINOS
    if (selectedTemplate === 'clientes') {
      const listPages = chunkFlatList(customers, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Fichero General de Clientes / Arrendatarios')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay inquilinos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Fichero General de Clientes / Arrendatarios')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">ID</th>
                      <th className="py-2 px-1 text-left w-36">Nombre Completo</th>
                      <th className="py-2 px-1 text-left w-24">NIF/DNI</th>
                      <th className="py-2 px-1 text-left w-24">Teléfono</th>
                      <th className="py-2 px-1 text-left">Correo Electrónico</th>
                      <th className="py-2 px-1 text-center w-16">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(c => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono text-slate-650">{c.id?.substring(0, 6)}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{c.name} {c.lastName || ''}</td>
                        <td className="py-2 px-1 font-mono uppercase">{c.dni || '---'}</td>
                        <td className="py-2 px-1 font-mono">{c.phone || '---'}</td>
                        <td className="py-2 px-1 lowercase truncate max-w-[150px] text-slate-600" title={c.email}>{c.email || '---'}</td>
                        <td className="py-2 px-1 text-center uppercase font-bold text-[9px]">
                          <span className={`px-1.5 py-0.5 rounded ${c.status === 'activo' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                            {c.status || 'activo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 7. CARTERA DE RENTA VARIABLE
    if (selectedTemplate === 'rv_portfolio') {
      const listPages = chunkFlatList(computedRvHoldings.holdings, 30);
      const totalPages = listPages.length || 1;
      const sum = computedRvHoldings.summary;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-rv" className="page-sheet relative">
            {renderPageHeader('Cartera de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay posiciones registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={`rv-p-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Cartera de Renta Variable - Posiciones')}
                
                {pageIdx === 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-4 text-[10px] select-none no-print border border-slate-350 p-2 bg-slate-50">
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Inversión Total</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalCost)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Valor de Mercado</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalValue)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Rendimiento Total (PnL)</span>
                      <span className={`font-mono font-bold text-[12px] ${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(sum.pnl)} € ({sum.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Dividendos Cobrados</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.dividends)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Efectivo en Brokers</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.cash)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Total Cartera</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.grandTotal)} €</span>
                    </div>
                  </div>
                )}

                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Ticker</th>
                      <th className="py-2 px-1 text-left">Activo</th>
                      <th className="py-2 px-1 text-left w-20">Broker</th>
                      <th className="py-2 px-1 text-right w-16">Cant.</th>
                      <th className="py-2 px-1 text-right w-20">PMC</th>
                      <th className="py-2 px-1 text-right w-20">Precio Act.</th>
                      <th className="py-2 px-1 text-right w-24">Coste Total</th>
                      <th className="py-2 px-1 text-right w-24">Valor Actual</th>
                      <th className="py-2 px-1 text-right w-24">Rend. (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(h => (
                      <tr key={`${h.symbol}_${h.brokerId}`} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono font-bold text-slate-650">{h.symbol}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase truncate max-w-[120px]">{h.name}</td>
                        <td className="py-2 px-1 text-slate-600 uppercase text-[9px]">{h.brokerName}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums">{h.quantity.toFixed(4)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(h.pmc)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(h.currentPrice)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(h.totalCost)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums font-bold text-slate-800">{formatCurrency(h.currentValue)}</td>
                        <td className={`py-2 px-1 text-right font-sans font-bold tabular-nums ${h.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {h.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1" colSpan="3">TOTAL POSICIONES:</td>
                        <td className="py-2 px-1" colSpan="3"></td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(sum.totalCost)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(sum.totalValue)}</td>
                        <td className={`py-2 px-1 text-right font-sans font-bold tabular-nums ${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {sum.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 8. TRANSACCIONES DE RENTA VARIABLE
    if (selectedTemplate === 'rv_transactions') {
      const chronTx = [...rvTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
      const listPages = chunkFlatList(chronTx, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-rv-tx" className="page-sheet relative">
            {renderPageHeader('Transacciones de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay transacciones registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={`rv-tx-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Registro de Transacciones de Renta Variable')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left w-16">Tipo</th>
                      <th className="py-2 px-1 text-left w-16">Ticker</th>
                      <th className="py-2 px-1 text-left">Broker</th>
                      <th className="py-2 px-1 text-right w-16">Cant.</th>
                      <th className="py-2 px-1 text-right w-20">Precio</th>
                      <th className="py-2 px-1 text-right w-20">Comisión</th>
                      <th className="py-2 px-1 text-center w-12">Divisa</th>
                      <th className="py-2 px-1 text-right w-24">Total (EUR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((tx, idx) => {
                      const qty = parseFloat(tx.quantity) || 0;
                      const price = parseFloat(tx.price) || 0;
                      const fee = parseFloat(tx.fee) || 0;
                      const rate = parseFloat(tx.exchangeRate) || 1.0;
                      const totalAmountEUR = tx.type === 'Dividendo'
                        ? (qty * price - fee) / rate
                        : tx.type === 'Compra'
                          ? (qty * price + fee) / rate
                          : (qty * price - fee) / rate;

                      return (
                        <tr key={tx.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-1 font-mono text-slate-650">{formatDate(tx.date)}</td>
                          <td className="py-1.5 px-1 font-bold">
                            <span className={`px-1 py-0.5 rounded text-[8px] uppercase ${
                              tx.type === 'Compra' ? 'bg-blue-100 text-blue-800' :
                              tx.type === 'Venta' ? 'bg-orange-100 text-orange-850' : 'bg-green-100 text-green-800'
                            }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-1.5 px-1 font-mono font-bold text-slate-800">{tx.assetId}</td>
                          <td className="py-1.5 px-1 uppercase text-slate-600 truncate max-w-[80px]">{tx.brokerId}</td>
                          <td className="py-1.5 px-1 text-right font-mono">{qty.toFixed(4)}</td>
                          <td className="py-1.5 px-1 text-right font-mono">{price.toFixed(2)}</td>
                          <td className="py-1.5 px-1 text-right font-mono">{fee.toFixed(2)}</td>
                          <td className="py-1.5 px-1 text-center font-mono text-[9px] text-slate-500">{tx.currency || 'EUR'}</td>
                          <td className="py-1.5 px-1 text-right font-sans font-bold tabular-nums text-slate-800">
                            {formatCurrency(totalAmountEUR)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 9. CARTERA DE CROWDFUNDING
    if (selectedTemplate === 'cf_portfolio') {
      const listPages = chunkFlatList(computedCfHoldings.rows, 32);
      const totalPages = listPages.length || 1;
      const sum = computedCfHoldings.summary;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-cf" className="page-sheet relative">
            {renderPageHeader('Cartera de Crowdfunding')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay activos de crowdfunding.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={`cf-p-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Cartera de Crowdfunding - Posiciones')}

                {pageIdx === 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-4 text-[10px] select-none no-print border border-slate-350 p-2 bg-slate-50">
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Total Invertido</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalInvested)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Valor Actual (Neto)</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalCurrentValueNet)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Rentas Netas</span>
                      <span className="font-mono font-bold text-green-700 text-[12px]">+{formatCurrency(sum.totalReturnNet)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Rentabilidad Neta Media</span>
                      <span className="font-mono font-bold text-blue-900 text-[12px]">{sum.avgReturnNet.toFixed(2)}%</span>
                    </div>
                  </div>
                )}

                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left">Activo / Proyecto</th>
                      <th className="py-2 px-1 text-right w-24">Inversión</th>
                      <th className="py-2 px-1 text-right w-20">Rentas Brutas</th>
                      <th className="py-2 px-1 text-right w-20">Gastos</th>
                      <th className="py-2 px-1 text-right w-20">Rentas Netas</th>
                      <th className="py-2 px-1 text-right w-24">Importe Neto</th>
                      <th className="py-2 px-1 text-right w-20">Rent. Neta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(r => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase truncate max-w-[180px]">{r.groupName}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums">{formatCurrency(r.investment)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(r.grossRents)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-red-650">{formatCurrency(r.expenses)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-green-700 font-semibold">{formatCurrency(r.netRents)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums font-bold text-slate-800">{formatCurrency(r.totalNet)}</td>
                        <td className="py-2 px-1 text-right font-mono font-bold text-blue-800">{r.yieldNet.toFixed(2)}%</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1">TOTAL GENERAL:</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(sum.totalInvested)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(sum.totalReturnGross)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-red-650">{formatCurrency(sum.totalReturnGross - sum.totalReturnNet)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-green-700 font-extrabold">{formatCurrency(sum.totalReturnNet)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(sum.totalCurrentValueNet)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold text-blue-900">{sum.avgReturnNet.toFixed(2)}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 10. TRANSACCIONES DE CROWDFUNDING
    if (selectedTemplate === 'cf_transactions') {
      const chronTx = [...cfTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
      const listPages = chunkFlatList(chronTx, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-cf-tx" className="page-sheet relative">
            {renderPageHeader('Transacciones de Crowdfunding')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay transacciones registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={`cf-tx-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Registro de Transacciones de Crowdfunding')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left">Proyecto</th>
                      <th className="py-2 px-1 text-left w-32">Plataforma</th>
                      <th className="py-2 px-1 text-left w-20">Tipo</th>
                      <th className="py-2 px-1 text-right w-24">Importe</th>
                      <th className="py-2 px-1 text-left w-40">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((tx, idx) => {
                      const platform = cfPlatforms.find(p => p.id === tx.platformId);
                      const project  = cfProjects.find(p => p.id === tx.projectId);
                      const amount = parseFloat(tx.amount) || 0;

                      return (
                        <tr key={tx.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-1 font-mono text-slate-650">{formatDate(tx.date)}</td>
                          <td className="py-1.5 px-1 font-bold text-slate-800 uppercase truncate max-w-[120px]">{project ? project.name : tx.projectId}</td>
                          <td className="py-1.5 px-1 uppercase text-[9px] text-slate-650 truncate max-w-[100px]">{platform ? platform.name : tx.platformId}</td>
                          <td className="py-1.5 px-1 font-semibold text-slate-600">{tx.type || '—'}</td>
                          <td className="py-1.5 px-1 text-right font-sans font-bold tabular-nums text-slate-800">{formatCurrency(amount)}</td>
                          <td className="py-1.5 px-1 text-slate-555 text-[9px] truncate max-w-[150px]" title={tx.notes}>{tx.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 11. IMPUESTOS - RESUMEN GENERAL
    if (selectedTemplate === 'taxes_total') {
      const overview = taxesData.yearlyOverview;
      const listPages = chunkFlatList(overview, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-taxes-total" className="page-sheet relative">
            {renderPageHeader('Impuestos - Resumen Fiscal General')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay datos fiscales para reportar.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={`taxes-tot-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Resumen Fiscal General (IRPF)')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-center w-16">Ejercicio</th>
                      <th className="py-2 px-1 text-right">Rend. Inmuebles</th>
                      <th className="py-2 px-1 text-right">Amort. Inmuebles</th>
                      <th className="py-2 px-1 text-right">Ganancias RV</th>
                      <th className="py-2 px-1 text-right">Dividendos RV</th>
                      <th className="py-2 px-1 text-right">Rend. Crowdfunding</th>
                      <th className="py-2 px-1 text-right font-bold text-blue-900">Base Imponible</th>
                      <th className="py-2 px-1 text-right font-bold text-amber-900">Cuota Est. IRPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(row => (
                      <tr key={row.year} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 text-center font-bold text-slate-700">{row.year}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(row.reNeto)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-500">{formatCurrency(row.reAmortizacion)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(row.rvGains)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(row.rvDividends)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(row.cfGains)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold tabular-nums text-blue-800 bg-blue-50/50">{formatCurrency(row.baseImponible)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold tabular-nums text-amber-900 bg-amber-50/30">{formatCurrency(row.impuestoEstimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 12. IMPUESTOS - FISCALIDAD INMOBILIARIA
    if (selectedTemplate === 'taxes_real_estate') {
      const listPages = chunkFlatList(taxesData.reTaxes, 34);
      const totalPages = listPages.length || 1;

      const totals = taxesData.reTaxes.reduce((t, r) => {
        t.ingresos += r.ingresos;
        t.gastos += r.gastos;
        t.amortizacion += r.amortizacion;
        t.beneficioNeto += r.beneficioNeto;
        return t;
      }, { ingresos: 0, gastos: 0, amortizacion: 0, beneficioNeto: 0 });

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-taxes-re" className="page-sheet relative">
            {renderPageHeader('Impuestos - Fiscalidad Inmobiliaria')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay activos inmobiliarios con datos fiscales.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={`taxes-re-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Fiscalidad de Inversiones Inmobiliarias')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">ID</th>
                      <th className="py-2 px-1 text-left">Finca</th>
                      <th className="py-2 px-1 text-right w-24">Ingresos Brutos</th>
                      <th className="py-2 px-1 text-right w-24">Gastos Deducibles</th>
                      <th className="py-2 px-1 text-right w-24">Amortización (3%)</th>
                      <th className="py-2 px-1 text-right w-24 font-bold text-blue-900">Rendimiento Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(r => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono text-slate-600">{r.id}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{r.name}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(r.ingresos)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-650">{formatCurrency(r.gastos)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums text-slate-500">{formatCurrency(r.amortizacion)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold tabular-nums text-blue-800">{formatCurrency(r.beneficioNeto)}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1" colSpan="2">TOTAL GENERAL:</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.ingresos)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.gastos)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500">{formatCurrency(totals.amortizacion)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold tabular-nums text-blue-900">{formatCurrency(totals.beneficioNeto)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 13. IMPUESTOS - FISCALIDAD RENTA VARIABLE
    if (selectedTemplate === 'taxes_rv') {
      const gains = taxesData.rvGains;
      const dividends = taxesData.rvDividends;
      
      const totalGain = gains.reduce((s, r) => s + r.gain, 0);
      const totalGainTax = gains.reduce((s, r) => s + r.tax, 0);
      const totalGrossDiv = dividends.reduce((s, r) => s + r.gross, 0);
      const totalWithholdingDiv = dividends.reduce((s, r) => s + r.withholding, 0);
      const totalDivTax = dividends.reduce((s, r) => s + r.tax, 0);

      const gainPages = chunkFlatList(gains, 30);
      const divPages = chunkFlatList(dividends, 30);
      const totalPages = (gainPages.length || 1) + (divPages.length || 1);
      let pageCounter = 1;

      if (gainPages.length === 0) {
        pageViews.push(
          <div key="empty-gains" className="page-sheet relative">
            {renderPageHeader('Fiscalidad RV - Ganancias Patrimoniales')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay operaciones de venta registradas para este año.</p>
            {renderPageFooter(pageCounter++, totalPages, auditNumber)}
          </div>
        );
      } else {
        gainPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === gainPages.length - 1;
          pageViews.push(
            <div key={`taxes-rv-g-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Fiscalidad RV - Ganancias Patrimoniales (FIFO)')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left">Activo</th>
                      <th className="py-2 px-1 text-right w-16">Cant.</th>
                      <th className="py-2 px-1 text-right w-24">Precio Venta</th>
                      <th className="py-2 px-1 text-right w-24">Valor Venta</th>
                      <th className="py-2 px-1 text-right w-24">Coste Adq.</th>
                      <th className="py-2 px-1 text-right w-24 font-bold text-blue-900">Ganancia/Pérdida</th>
                      <th className="py-2 px-1 text-right w-20">Cuota Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-mono text-slate-650">{formatDate(r.date)}</td>
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase truncate max-w-[120px]">{r.assetName} ({r.assetId})</td>
                        <td className="py-1.5 px-1 text-right font-mono">{r.qty.toFixed(4)}</td>
                        <td className="py-1.5 px-1 text-right font-mono">{formatCurrency(r.sellPriceEUR)}</td>
                        <td className="py-1.5 px-1 text-right font-mono">{formatCurrency(r.sellTotal)}</td>
                        <td className="py-1.5 px-1 text-right font-mono">{formatCurrency(r.costBasis)}</td>
                        <td className={`py-1.5 px-1 text-right font-sans font-bold ${r.gain >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(r.gain)}</td>
                        <td className="py-1.5 px-1 text-right font-sans font-bold text-amber-900">{formatCurrency(r.tax)}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[10px]">
                        <td className="py-2 px-1" colSpan="3">TOTAL GANANCIAS RV:</td>
                        <td className="py-2 px-1" colSpan="2"></td>
                        <td className="py-2 px-1 text-right font-sans">{formatCurrency(gains.reduce((s, r) => s + r.costBasis, 0))}</td>
                        <td className={`py-2 px-1 text-right font-sans font-bold ${totalGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalGain)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold text-amber-900">{formatCurrency(totalGainTax)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageCounter++, totalPages, auditNumber)}
            </div>
          );
        });
      }

      if (divPages.length === 0) {
        pageViews.push(
          <div key="empty-divs" className="page-sheet relative">
            {renderPageHeader('Fiscalidad RV - Dividendos y Retenciones')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay cobros de dividendos registrados para este año.</p>
            {renderPageFooter(pageCounter++, totalPages, auditNumber)}
          </div>
        );
      } else {
        divPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === divPages.length - 1;
          pageViews.push(
            <div key={`taxes-rv-d-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Fiscalidad RV - Dividendos y Retenciones')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left">Activo</th>
                      <th className="py-2 px-1 text-right w-24">Importe Bruto</th>
                      <th className="py-2 px-1 text-right w-24">Retención</th>
                      <th className="py-2 px-1 text-right w-24">Importe Neto</th>
                      <th className="py-2 px-1 text-right w-24 font-bold text-amber-900">Cuota Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-mono text-slate-650">{formatDate(r.date)}</td>
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase truncate max-w-[180px]">{r.assetName} ({r.assetId})</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums">{formatCurrency(r.gross)}</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums text-red-650">{formatCurrency(r.withholding)}</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums text-green-700 font-semibold">{formatCurrency(r.net)}</td>
                        <td className="py-1.5 px-1 text-right font-sans font-bold tabular-nums text-amber-900">{formatCurrency(r.tax)}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[10px]">
                        <td className="py-2 px-1" colSpan="2">TOTAL DIVIDENDOS RV:</td>
                        <td className="py-2 px-1 text-right font-sans">{formatCurrency(totalGrossDiv)}</td>
                        <td className="py-2 px-1 text-right font-sans text-red-650">{formatCurrency(totalWithholdingDiv)}</td>
                        <td className="py-2 px-1 text-right font-sans text-green-700 font-bold">{formatCurrency(totalGrossDiv - totalWithholdingDiv)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold text-amber-900">{formatCurrency(totalDivTax)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageCounter++, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 14. IMPUESTOS - FISCALIDAD CROWDFUNDING
    if (selectedTemplate === 'taxes_cf') {
      const rends = taxesData.cfRendimientos;
      const acts = taxesData.cfActivas;

      const totalGain = rends.reduce((s, r) => s + r.gain, 0);
      const totalTax = rends.reduce((s, r) => s + r.tax, 0);
      const totalInvestedActs = acts.reduce((s, r) => s + r.invested, 0);
      const totalExpectedGain = acts.reduce((s, r) => s + r.expectedGain, 0);
      const totalExpectedTax = acts.reduce((s, r) => s + r.expectedTax, 0);

      const rendPages = chunkFlatList(rends, 30);
      const actPages = chunkFlatList(acts, 30);
      const totalPages = (rendPages.length || 1) + (actPages.length || 1);
      let pageCounter = 1;

      if (rendPages.length === 0) {
        pageViews.push(
          <div key="empty-cf-rends" className="page-sheet relative">
            {renderPageHeader('Fiscalidad CF - Rendimientos Realizados')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay rendimientos realizados (amortizados) en este año.</p>
            {renderPageFooter(pageCounter++, totalPages, auditNumber)}
          </div>
        );
      } else {
        rendPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === rendPages.length - 1;
          pageViews.push(
            <div key={`taxes-cf-r-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Fiscalidad CF - Rendimientos Realizados (Amortizados)')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha fin</th>
                      <th className="py-2 px-1 text-left">Proyecto</th>
                      <th className="py-2 px-1 text-left w-24">Plataforma</th>
                      <th className="py-2 px-1 text-right w-24">Invertido</th>
                      <th className="py-2 px-1 text-right w-24">Recibido</th>
                      <th className="py-2 px-1 text-right w-24 font-bold text-blue-900">Rendimiento Realizado</th>
                      <th className="py-2 px-1 text-right w-20">Cuota Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-mono text-slate-650">{formatDate(r.endDate)}</td>
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase truncate max-w-[120px]">{r.projectName}</td>
                        <td className="py-1.5 px-1 uppercase text-[9px] text-slate-600 truncate max-w-[90px]">{r.platformName}</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums">{formatCurrency(r.invested)}</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums">{formatCurrency(r.received)}</td>
                        <td className={`py-1.5 px-1 text-right font-sans font-bold tabular-nums ${r.gain >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(r.gain)}</td>
                        <td className="py-1.5 px-1 text-right font-sans font-bold tabular-nums text-amber-900">{formatCurrency(r.tax)}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[10px]">
                        <td className="py-2 px-1" colSpan="3">TOTAL REALIZADOS CF:</td>
                        <td className="py-2 px-1 text-right font-sans">{formatCurrency(rends.reduce((s, r) => s + r.invested, 0))}</td>
                        <td className="py-2 px-1 text-right font-sans">{formatCurrency(rends.reduce((s, r) => s + r.received, 0))}</td>
                        <td className={`py-2 px-1 text-right font-sans font-bold ${totalGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalGain)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold text-amber-900">{formatCurrency(totalTax)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageCounter++, totalPages, auditNumber)}
            </div>
          );
        });
      }

      if (actPages.length === 0) {
        pageViews.push(
          <div key="empty-cf-acts" className="page-sheet relative">
            {renderPageHeader('Fiscalidad CF - Inversiones Activas')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay inversiones activas registradas para este año.</p>
            {renderPageFooter(pageCounter++, totalPages, auditNumber)}
          </div>
        );
      } else {
        actPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === actPages.length - 1;
          pageViews.push(
            <div key={`taxes-cf-a-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Fiscalidad CF - Rendimientos Esperados de Inversiones Activas')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left">Proyecto</th>
                      <th className="py-2 px-1 text-left w-24">Plataforma</th>
                      <th className="py-2 px-1 text-right w-24">Invertido</th>
                      <th className="py-2 px-1 text-center w-20">Tasa Anual</th>
                      <th className="py-2 px-1 text-right w-24 font-bold text-blue-900">Interés Estimado</th>
                      <th className="py-2 px-1 text-right w-20 font-bold text-amber-900">Cuota Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase truncate max-w-[140px]">{r.projectName}</td>
                        <td className="py-1.5 px-1 uppercase text-[9px] text-slate-600 truncate max-w-[90px]">{r.platformName}</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums">{formatCurrency(r.invested)}</td>
                        <td className="py-1.5 px-1 text-center font-mono">{r.rate.toFixed(2)}%</td>
                        <td className="py-1.5 px-1 text-right font-mono tabular-nums text-green-700 font-semibold">{formatCurrency(r.expectedGain)}</td>
                        <td className="py-1.5 px-1 text-right font-sans font-bold tabular-nums text-amber-900">{formatCurrency(r.expectedTax)}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[10px]">
                        <td className="py-2 px-1" colSpan="2">TOTAL ESPERADOS CF:</td>
                        <td className="py-2 px-1 text-right font-sans">{formatCurrency(totalInvestedActs)}</td>
                        <td className="py-2 px-1"></td>
                        <td className="py-2 px-1 text-right font-sans text-green-700 font-bold">{formatCurrency(totalExpectedGain)}</td>
                        <td className="py-2 px-1 text-right font-sans font-bold text-amber-900">{formatCurrency(totalExpectedTax)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageCounter++, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 15. BALANCE DE SITUACIÓN
    if (selectedTemplate === 'balance_situacion') {
      const data = computedAnnualAccounts.sheet;
      
      const activoRows = [];
      // ACTIVO Header
      const hasActivoValue = Math.abs(data.total_activo) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_activo_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasActivoValue) {
        activoRows.push({ type: 'main-header', label: 'ACTIVO', value: data.total_activo, compValues: data.total_activo_comp, divisor: data.total_activo, compDivisors: data.total_activo_comp });
      }
      
      // A) ACTIVO NO CORRIENTE Subheader
      const hasNoCorrienteValue = Math.abs(data.total_activo_no_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_activo_no_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasNoCorrienteValue) {
        activoRows.push({ type: 'subheader', label: 'A) ACTIVO NO CORRIENTE', value: data.total_activo_no_corriente, compValues: data.total_activo_no_corriente_comp, divisor: data.total_activo, compDivisors: data.total_activo_comp });
      }
      
      data.activo_no_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        activoRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_activo, compDivisors: data.total_activo_comp });
        filteredAccounts.forEach(acc => {
          activoRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_activo, compDivisors: data.total_activo_comp });
        });
      });
      
      // B) ACTIVO CORRIENTE Subheader
      const hasCorrienteValue = Math.abs(data.total_activo_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_activo_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasCorrienteValue) {
        activoRows.push({ type: 'subheader', label: 'B) ACTIVO CORRIENTE', value: data.total_activo_corriente, compValues: data.total_activo_corriente_comp, divisor: data.total_activo, compDivisors: data.total_activo_comp });
      }
      
      data.activo_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        activoRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_activo, compDivisors: data.total_activo_comp });
        filteredAccounts.forEach(acc => {
          activoRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_activo, compDivisors: data.total_activo_comp });
        });
      });

      const pasivoPatrimonioRows = [];
      
      // PASIVO Header
      const hasPasivoValue = Math.abs(data.total_pasivo) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoValue) {
        pasivoPatrimonioRows.push({ type: 'main-header', label: 'PASIVO', value: data.total_pasivo, compValues: data.total_pasivo_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      // A) PASIVO NO CORRIENTE Subheader
      const hasPasivoNoCorrienteValue = Math.abs(data.total_pasivo_no_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_no_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoNoCorrienteValue) {
        pasivoPatrimonioRows.push({ type: 'subheader', label: 'A) PASIVO NO CORRIENTE', value: data.total_pasivo_no_corriente, compValues: data.total_pasivo_no_corriente_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.pasivo_no_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        pasivoPatrimonioRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          pasivoPatrimonioRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });
      
      // B) PASIVO CORRIENTE Subheader
      const hasPasivoCorrienteValue = Math.abs(data.total_pasivo_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoCorrienteValue) {
        pasivoPatrimonioRows.push({ type: 'subheader', label: 'B) PASIVO CORRIENTE', value: data.total_pasivo_corriente, compValues: data.total_pasivo_corriente_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.pasivo_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        pasivoPatrimonioRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          pasivoPatrimonioRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });
      
      // PATRIMONIO NETO Header
      const hasPatrimonioValue = Math.abs(data.total_patrimonio) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_patrimonio_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPatrimonioValue) {
        pasivoPatrimonioRows.push({ type: 'main-header', label: 'PATRIMONIO NETO', value: data.total_patrimonio, compValues: data.total_patrimonio_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      // A) PATRIMONIO NETO Subheader
      if (!hideZeroBalances || hasPatrimonioValue) {
        pasivoPatrimonioRows.push({ type: 'subheader', label: 'A) PATRIMONIO NETO', value: data.total_patrimonio, compValues: data.total_patrimonio_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.patrimonio_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        pasivoPatrimonioRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          pasivoPatrimonioRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });

      // Split into pages dynamically
      const chunkedActivoPages = chunkFlatList(activoRows, 28);
      const chunkedPasivoPages = chunkFlatList(pasivoPatrimonioRows, 28);
      
      const totalPages = chunkedActivoPages.length + chunkedPasivoPages.length;
      
      let pageIndex = 1;

      const renderRowsPage = (pageRows, currentPage, totalPagesCount, sideTitle) => {
        const isComparativeMode = selectedComparisonYears.length > 0;

        return (
          <div key={`${sideTitle}-${currentPage}`} className="page-sheet relative flex flex-col justify-between">
            <div className="flex-1">
              {renderPageHeader('Balance de Situación')}
              
              <table className="w-full text-[10px] border-collapse mt-4">
                {isComparativeMode && (
                  <thead>
                    <tr className="font-bold text-slate-700 text-[8px] uppercase">
                      <th className="py-1 px-1 text-left"></th>
                      <th className="py-1 px-1 text-right w-24">{selectedYear}</th>
                      {showVerticalPercentage && (
                        <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                      )}
                      {selectedComparisonYears.map(yr => (
                        <Fragment key={yr}>
                          <th className="py-1 px-1 text-right w-24">{yr}</th>
                          {showVerticalPercentage && (
                            <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                          )}
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {pageRows.map((row, idx) => {
                    const rowDivisor = row.divisor;
                    const mainPct = rowDivisor ? `${((row.value / rowDivisor) * 100).toFixed(1)}%` : '0.0%';

                    if (row.type === 'main-header') {
                      return (
                        <tr key={idx} className="font-bold text-slate-900 text-[10.5px] uppercase bg-white">
                          <td className="py-2 px-1 font-bold">{row.label}</td>
                          <td className="py-2 px-1 text-right font-sans tabular-nums">
                            {formatValue(row.value, row.divisor)}
                          </td>
                          {showVerticalPercentage && (
                            <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                              {mainPct}
                            </td>
                          )}
                          {selectedComparisonYears.map(yr => {
                            const val = (row.compValues || {})[yr] || 0;
                            const div = (row.compDivisors || {})[yr] || 0;
                            const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                            return (
                              <Fragment key={yr}>
                                <td className="py-2 px-1 text-right font-sans tabular-nums">
                                  {formatValue(val, div)}
                                </td>
                                {showVerticalPercentage && (
                                  <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                    {pct}
                                  </td>
                                )}
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    if (row.type === 'subheader') {
                      return (
                        <tr key={idx} className="font-bold text-slate-750 bg-slate-100/30 text-[9.5px] uppercase">
                          <td className="py-1.5 px-2 font-bold">{row.label}</td>
                          <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                            {formatValue(row.value, row.divisor)}
                          </td>
                          {showVerticalPercentage && (
                            <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                              {mainPct}
                            </td>
                          )}
                          {selectedComparisonYears.map(yr => {
                            const val = (row.compValues || {})[yr] || 0;
                            const div = (row.compDivisors || {})[yr] || 0;
                            const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                            return (
                              <Fragment key={yr}>
                                <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                                  {formatValue(val, div)}
                                </td>
                                {showVerticalPercentage && (
                                  <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                    {pct}
                                  </td>
                                )}
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    if (row.type === 'item') {
                      return (
                        <tr key={idx} className="font-semibold text-slate-700 bg-slate-50/20 text-[9px]">
                          <td className="py-1 px-3 font-semibold">{row.label}</td>
                          <td className="py-1 px-1 text-right font-sans tabular-nums">
                            {formatValue(row.value, row.divisor)}
                          </td>
                          {showVerticalPercentage && (
                            <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                              {mainPct}
                            </td>
                          )}
                          {selectedComparisonYears.map(yr => {
                            const val = (row.compValues || {})[yr] || 0;
                            const div = (row.compDivisors || {})[yr] || 0;
                            const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                            return (
                              <Fragment key={yr}>
                                <td className="py-1 px-1 text-right font-sans tabular-nums">
                                  {formatValue(val, div)}
                                </td>
                                {showVerticalPercentage && (
                                  <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                    {pct}
                                  </td>
                                )}
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    if (row.type === 'account') {
                      return (
                        <tr key={idx} className="text-slate-600 text-[8px]">
                          <td className="py-0.5 px-8 font-normal text-slate-650">{row.code} - {row.name}</td>
                          <td className="py-0.5 px-1 text-right font-sans tabular-nums">
                            {formatValue(row.value, row.divisor)}
                          </td>
                          {showVerticalPercentage && (
                            <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-450 pr-5">
                              {mainPct}
                            </td>
                          )}
                          {selectedComparisonYears.map(yr => {
                            const val = (row.compBalances || {})[yr] || 0;
                            const div = (row.compDivisors || {})[yr] || 0;
                            const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                            return (
                              <Fragment key={yr}>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums">
                                  {formatValue(val, div)}
                                </td>
                                {showVerticalPercentage && (
                                  <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-450 pr-5">
                                    {pct}
                                  </td>
                                )}
                              </Fragment>
                            );
                          })}
                        </tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>
            </div>
            {renderPageFooter(currentPage, totalPagesCount, auditNumber)}
          </div>
        );
      };

      if (chunkedActivoPages.length === 0) {
        pageViews.push(
          <div key="activo-empty" className="page-sheet relative flex flex-col justify-between">
            <div>
              {renderPageHeader('Balance de Situación')}
              <p className="text-center py-12 text-slate-400 italic text-[10px]">No hay activos que mostrar.</p>
            </div>
            {renderPageFooter(pageIndex++, totalPages || 1, auditNumber)}
          </div>
        );
      } else {
        chunkedActivoPages.forEach((pageRows) => {
          pageViews.push(renderRowsPage(pageRows, pageIndex++, totalPages, 'activo'));
        });
      }

      if (chunkedPasivoPages.length === 0) {
        pageViews.push(
          <div key="pasivo-empty" className="page-sheet relative flex flex-col justify-between">
            <div>
              {renderPageHeader('Balance de Situación')}
              <p className="text-center py-12 text-slate-400 italic text-[10px]">No hay pasivos o patrimonio que mostrar.</p>
            </div>
            {renderPageFooter(pageIndex++, totalPages || 1, auditNumber)}
          </div>
        );
      } else {
        chunkedPasivoPages.forEach((pageRows) => {
          pageViews.push(renderRowsPage(pageRows, pageIndex++, totalPages, 'pasivo-patrimonio'));
        });
      }
    }

    // 16. CUENTA DE RESULTADOS
    if (selectedTemplate === 'cuenta_resultados') {
      const data = computedAnnualAccounts.income;
      const rows = [];

      // I. INGRESOS DE EXPLOTACIÓN
      const showIngresos = !hideZeroBalances || Math.abs(data.total_ingresos) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_ingresos_comp[yrStr]) > 0.005);
      if (showIngresos) {
        rows.push({ type: 'subheader', label: 'I. INGRESOS DE EXPLOTACIÓN', value: data.total_ingresos, compValues: data.total_ingresos_comp, divisor: data.total_ingresos, compDivisors: data.total_ingresos_comp });
        
        data.ingresos_items.forEach(item => {
          const hasVal = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
          if (hideZeroBalances && !hasVal) return;
          rows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_ingresos, compDivisors: data.total_ingresos_comp });
        });
      }

      // II. GASTOS DE EXPLOTACIÓN
      const showGastos = !hideZeroBalances || Math.abs(data.total_gastos) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_gastos_comp[yrStr]) > 0.005);
      if (showGastos) {
        rows.push({ type: 'subheader', label: 'II. GASTOS DE EXPLOTACIÓN', value: data.total_gastos, compValues: data.total_gastos_comp, divisor: data.total_ingresos, compDivisors: data.total_ingresos_comp });
        
        data.gastos_items.forEach(item => {
          const hasVal = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
          if (hideZeroBalances && !hasVal) return;
          rows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_ingresos, compDivisors: data.total_ingresos_comp });
        });
      }

      // III. RESULTADO DEL EJERCICIO (I - II)
      rows.push({ type: 'main-header', label: 'III. RESULTADO DEL EJERCICIO (I - II)', value: data.resultado_neto, compValues: data.resultado_neto_comp, divisor: data.total_ingresos, compDivisors: data.total_ingresos_comp });

      const isComparativeMode = selectedComparisonYears.length > 0;

      pageViews.push(
        <div key="cuenta-resultados-p" className="page-sheet relative flex flex-col justify-between">
          <div className="flex-1">
            {renderPageHeader('Cuenta de Resultados')}
            
            <table className="w-full text-[10px] border-collapse mt-4">
              {isComparativeMode && (
                <thead>
                  <tr className="font-bold text-slate-700 text-[8px] uppercase">
                    <th className="py-1 px-1 text-left"></th>
                    <th className="py-1 px-1 text-right w-24">{selectedYear}</th>
                    {showVerticalPercentage && (
                      <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                    )}
                    {selectedComparisonYears.map(yr => (
                      <Fragment key={yr}>
                        <th className="py-1 px-1 text-right w-24">{yr}</th>
                        {showVerticalPercentage && (
                          <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, idx) => {
                  const rowDivisor = row.divisor;
                  const mainPct = rowDivisor ? `${((row.value / rowDivisor) * 100).toFixed(1)}%` : '0.0%';

                  if (row.type === 'main-header') {
                    return (
                      <tr key={idx} className="font-bold text-slate-900 text-[10.5px] uppercase bg-white">
                        <td className="py-2 px-1 font-bold">{row.label}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-2 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'subheader') {
                    return (
                      <tr key={idx} className="font-bold text-slate-750 bg-slate-100/30 text-[9.5px] uppercase">
                        <td className="py-1.5 px-2 font-bold">{row.label}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'item') {
                    return (
                      <tr key={idx} className="font-semibold text-slate-700 bg-slate-50/20 text-[9px]">
                        <td className="py-1 px-3 font-semibold">{row.label}</td>
                        <td className="py-1 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'total-row') {
                    return (
                      <tr key={idx} className="font-bold text-slate-800 bg-slate-100/50 text-[9.5px] border-t border-slate-350">
                        <td className="py-1.5 px-3 font-bold">{row.label}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  return null;
                })}
              </tbody>
            </table>
          </div>
          {renderPageFooter(1, 1, auditNumber)}
        </div>
      );
    }

    // 17. ESTADO DE FLUJOS DE CAJA
    if (selectedTemplate === 'flujo_caja') {
      const data = computedAnnualAccounts.cashflow;
      const rows = [];

      // 1. ACTIVIDADES DE EXPLOTACIÓN
      const showExplotacion = !hideZeroBalances || Math.abs(data.total_explotacion) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_explotacion_comp[yrStr]) > 0.005);
      if (showExplotacion) {
        rows.push({ type: 'subheader', label: '1. ACTIVIDADES DE EXPLOTACIÓN', value: data.total_explotacion, compValues: data.total_explotacion_comp, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        
        data.explotacion.forEach(item => {
          const hasVal = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
          if (hideZeroBalances && !hasVal) return;
          rows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        });
      }

      // 2. ACTIVIDADES DE INVERSIÓN
      const showInversion = !hideZeroBalances || Math.abs(data.total_inversion) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_inversion_comp[yrStr]) > 0.005);
      if (showInversion) {
        rows.push({ type: 'subheader', label: '2. ACTIVIDADES DE INVERSIÓN', value: data.total_inversion, compValues: data.total_inversion_comp, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        
        data.inversion.forEach(item => {
          const hasVal = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
          if (hideZeroBalances && !hasVal) return;
          rows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        });
      }

      // 3. ACTIVIDADES DE FINANCIACIÓN
      const showFinanciacion = !hideZeroBalances || Math.abs(data.total_financiacion) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_financiacion_comp[yrStr]) > 0.005);
      if (showFinanciacion) {
        rows.push({ type: 'subheader', label: '3. ACTIVIDADES DE FINANCIACIÓN', value: data.total_financiacion, compValues: data.total_financiacion_comp, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        
        data.financiacion.forEach(item => {
          const hasVal = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
          if (hideZeroBalances && !hasVal) return;
          rows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });
        });
      }

      // AUMENTO/DISMINUCIÓN NETO DEL EFECTIVO
      rows.push({ type: 'main-header', label: 'AUMENTO/DISMINUCIÓN NETO DEL EFECTIVO (1 + 2 + 3)', value: data.total_neto, compValues: data.total_neto_comp, divisor: data.total_explotacion, compDivisors: data.total_explotacion_comp });

      const isComparativeMode = selectedComparisonYears.length > 0;

      pageViews.push(
        <div key="flujo-caja-p" className="page-sheet relative flex flex-col justify-between">
          <div className="flex-1">
            {renderPageHeader('Estado de Flujos de Caja')}
            
            <table className="w-full text-[10px] border-collapse mt-4">
              {isComparativeMode && (
                <thead>
                  <tr className="font-bold text-slate-700 text-[8px] uppercase">
                    <th className="py-1 px-1 text-left"></th>
                    <th className="py-1 px-1 text-right w-24">{selectedYear}</th>
                    {showVerticalPercentage && (
                      <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                    )}
                    {selectedComparisonYears.map(yr => (
                      <Fragment key={yr}>
                        <th className="py-1 px-1 text-right w-24">{yr}</th>
                        {showVerticalPercentage && (
                          <th className="py-1 px-1 text-right w-20 pr-5 text-slate-400 font-medium">%</th>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {rows.map((row, idx) => {
                  const rowDivisor = row.divisor;
                  const mainPct = rowDivisor ? `${((row.value / rowDivisor) * 100).toFixed(1)}%` : '0.0%';

                  if (row.type === 'main-header') {
                    return (
                      <tr key={idx} className="font-bold text-slate-900 text-[10.5px] uppercase bg-white">
                        <td className="py-2 px-1 font-bold">{row.label}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-2 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'subheader') {
                    return (
                      <tr key={idx} className="font-bold text-slate-750 bg-slate-100/30 text-[9.5px] uppercase">
                        <td className="py-1.5 px-2 font-bold">{row.label}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'item') {
                    return (
                      <tr key={idx} className="font-semibold text-slate-700 bg-slate-50/20 text-[9px]">
                        <td className="py-1 px-3 font-semibold">{row.label}</td>
                        <td className="py-1 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  if (row.type === 'total-row') {
                    return (
                      <tr key={idx} className="font-bold text-slate-800 bg-slate-100/50 text-[9.5px] border-t border-slate-350">
                        <td className="py-1.5 px-3 font-bold">{row.label}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                          {formatValue(row.value, row.divisor)}
                        </td>
                        {showVerticalPercentage && (
                          <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                            {mainPct}
                          </td>
                        )}
                        {selectedComparisonYears.map(yr => {
                          const val = (row.compValues || {})[yr] || 0;
                          const div = (row.compDivisors || {})[yr] || 0;
                          const pct = div ? `${((val / div) * 100).toFixed(1)}%` : '0.0%';
                          return (
                            <Fragment key={yr}>
                              <td className="py-1.5 px-1 text-right font-sans tabular-nums">
                                {formatValue(val, div)}
                              </td>
                              {showVerticalPercentage && (
                                <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-500 pr-5">
                                  {pct}
                                </td>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    );
                  }
                  return null;
                })}
              </tbody>
            </table>
          </div>
          {renderPageFooter(1, 1, auditNumber)}
        </div>
      );
    }

    return pageViews;
  };

  return (
    <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] overflow-hidden font-sans select-none p-2 gap-3 relative">
      {/* Print Stylesheet injection */}
      <style>{`
        .page-sheet {
          width: 210mm;
          min-height: 277mm;
          padding: 12mm 14mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background-color: white;
          color: black;
          position: relative;
        }

        @media screen {
          .page-sheet {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            border: 1px solid #cbd5e1;
            margin-bottom: 24px;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 14mm;
          }

          /* Hide everything in body except our clone */
          body > *:not(#print-body-clone) {
            display: none !important;
          }

          /* The clone sits at body level — no overflow constraints */
          body > #print-body-clone {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
            background: white;
            width: 100%;
          }

          body > #print-body-clone .page-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: 0 !important;
            page-break-after: always;
            break-after: page;
          }

          body > #print-body-clone .page-sheet:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Left panel - Templates list */}
      {showLeftPanel && (
        <div className="w-60 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print">
          <div className="bg-white border border-[#a0a0a0] flex flex-col">
            <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[10px] border-b border-[#a0a0a0] text-slate-700">
              Plantillas Disponibles
            </div>
            {templatesList.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTemplate(t.id);
                  setSearchParams(prev => {
                    prev.set('template', t.id);
                    return prev;
                  }, { replace: true });
                }}
                className={`w-full text-left px-3 py-2 text-[11px] transition-colors border-b border-slate-100 flex items-center gap-2 ${
                  selectedTemplate === t.id
                    ? 'bg-[#c0c0c0] text-black font-semibold shadow-inner'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <t.icon className="w-4 h-4 text-blue-900/70 shrink-0" />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Preview Container */}
      <div className="flex-1 flex flex-col bg-[#526075]/20 border border-[#808080] win-bevel min-w-0 relative h-full">
        {/* Top Control Bar */}
        <div className="bg-[#f0f0f0] border-b border-[#808080] p-2 flex justify-between items-center shrink-0 no-print gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLeftPanel(prev => !prev)}
              className={`btn-classic px-2.5 h-7 flex items-center gap-1.5 text-[11px] ${
                showLeftPanel ? 'bg-slate-200 shadow-inner' : 'bg-slate-50'
              }`}
              title="Mostrar/Ocultar Plantillas"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-750" />
              <span className="font-semibold text-slate-800">
                {showLeftPanel ? 'Ocultar Plantillas' : 'Mostrar Plantillas'}
              </span>
            </button>
            <div className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-2">
              <span>Vista Previa de Impresión</span>
              {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRightPanel(prev => !prev)}
              className={`btn-classic px-2.5 h-7 flex items-center gap-1.5 text-[11px] ${
                showRightPanel ? 'bg-slate-200 shadow-inner' : 'bg-slate-50'
              }`}
              title="Mostrar/Ocultar Filtros"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-750" />
              <span className="font-semibold text-slate-800">
                {showRightPanel ? 'Ocultar Filtros' : 'Mostrar Filtros'}
              </span>
            </button>
            <button
              onClick={handlePrint}
              className="btn-classic px-4 h-7 flex items-center gap-1.5 text-[11px] bg-blue-50 hover:bg-blue-100 font-bold"
            >
              <Printer className="w-4 h-4 text-blue-850" />
              <span className="text-blue-950">IMPRIMIR REPORTE</span>
            </button>
          </div>
        </div>

        {/* Paper Sheet Preview Area */}
        <div className="flex-1 overflow-auto p-4 flex justify-center bg-slate-400/30">
          <div 
            id="print-area" 
            className="flex flex-col gap-6 items-center animate-fadeIn"
          >
            {renderPages()}
          </div>
        </div>
      </div>

      {/* Right panel - Filters list */}
      {showRightPanel && (
        <div className="w-64 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">
          <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[10px] border-b border-[#a0a0a0] text-slate-700">
            Filtros Disponibles
          </div>

          {/* Timeline Period Selection inside Right Panel */}
          {['diario', 'mayor', 'sumas_saldos', 'rv_transactions', 'cf_transactions', 'taxes_total', 'taxes_real_estate', 'taxes_rv', 'taxes_cf', 'balance_situacion', 'cuenta_resultados', 'flujo_caja'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2">
              <div 
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsDatesCollapsed(!isDatesCollapsed)}
              >
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Período Temporal</span>
                </div>
                <span className="text-[9px]">{isDatesCollapsed ? '▶' : '▼'}</span>
              </div>
              
              {!isDatesCollapsed && (
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 mt-1">
                  {/* Years Selector */}
                  <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Años</div>
                  <div className="grid grid-cols-4 gap-1">
                    {['2024', '2025', '2026', '2027'].map(yr => (
                      <button 
                        key={yr} 
                        onClick={() => {
                          setSelectedYears(prev => prev.includes(yr) ? prev.filter(x => x !== yr) : [...prev, yr]);
                          setSelectedYear(parseInt(yr));
                        }}
                        className={`text-[9px] text-center hover:font-bold py-1 border transition-colors rounded ${
                          selectedYears.includes(yr) 
                            ? 'text-blue-700 font-bold bg-[#c0c0c0] border-slate-400 shadow-inner' 
                            : 'text-slate-800 bg-slate-50 border-slate-200 hover:text-blue-700'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  {/* Quarters Selector */}
                  <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Trimestres</div>
                  <div className="grid grid-cols-4 gap-1">
                    {['1T', '2T', '3T', '4T'].map(t => (
                      <button 
                        key={t} 
                        onClick={() => setSelectedQuarters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                        className={`text-[9px] text-center hover:font-bold py-1 border transition-colors rounded ${
                          selectedQuarters.includes(t) 
                            ? 'text-blue-700 font-bold bg-[#c0c0c0] border-slate-400 shadow-inner' 
                            : 'text-slate-800 bg-slate-50 border-slate-200 hover:text-blue-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Months Selector */}
                  <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Meses</div>
                  <div className="grid grid-cols-4 gap-1">
                    {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => (
                      <button 
                        key={m} 
                        onClick={() => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                        className={`text-[9px] text-center hover:font-bold py-1 border transition-colors rounded ${
                          selectedMonths.includes(m) 
                            ? 'text-blue-700 font-bold bg-[#c0c0c0] border-slate-400 shadow-inner' 
                            : 'text-slate-800 bg-slate-50 border-slate-200 hover:text-blue-700'
                        }`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Depth Level Filter (Profundidad) */}
          {['balance_situacion', 'sumas_saldos'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>Profundidad</span>
              </div>
              <div className="mt-1">
                <select 
                  value={maxDigits} 
                  onChange={(e) => setMaxDigits(parseInt(e.target.value))}
                  className="w-full border border-gray-300 px-1 py-1 outline-none cursor-pointer text-[11px] font-sans"
                >
                  <option value={10}>TODOS (MAX)</option>
                  {[1,2,3,4,5,6,7,8,9,10].map(d => (
                    <option key={d} value={d}>{d} {d === 1 ? 'dígito' : 'dígitos'}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Options specific to Balance de Situación */}
          {['balance_situacion', 'cuenta_resultados', 'flujo_caja'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>Opciones del Informe</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-600">
                  <input 
                    type="checkbox" 
                    checked={hideZeroBalances} 
                    onChange={(e) => setHideZeroBalances(e.target.checked)} 
                    className="w-3 h-3 text-blue-600" 
                  />
                  <span>Ocultar Cuentas a 0</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-600">
                  <input 
                    type="checkbox" 
                    checked={showVerticalPercentage} 
                    onChange={(e) => setShowVerticalPercentage(e.target.checked)} 
                    className="w-3 h-3 text-blue-600" 
                  />
                  <span>Mostrar Porcentaje Vertical</span>
                </label>

                {/* Display mode selector */}
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Valores en</span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                    <button 
                      onClick={() => setDisplayMode('euros')}
                      className={`text-[9px] text-center py-1 transition-all rounded font-bold ${
                        displayMode === 'euros' 
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      EUROS (€)
                    </button>
                    <button 
                      onClick={() => setDisplayMode('percent')}
                      className={`text-[9px] text-center py-1 transition-all rounded font-bold ${
                        displayMode === 'percent' 
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      PORCENTAJE (%)
                    </button>
                  </div>
                </div>

                {/* Comparison Years (Multi-select Checkboxes) */}
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Comparar con</span>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {['2024', '2025', '2026', '2027'].filter(yr => yr !== String(selectedYear)).map(yr => {
                      const isChecked = selectedComparisonYears.includes(yr);
                      return (
                        <label key={yr} className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600">
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedComparisonYears(prev => [...prev, yr].sort((a, b) => b - a));
                              } else {
                                setSelectedComparisonYears(prev => prev.filter(y => y !== yr));
                              }
                            }} 
                            className="w-3 h-3 text-blue-600" 
                          />
                          <span>EJERCICIO {yr}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Transaction Filters (Hidden for financial statements) */}
          {!['balance_situacion', 'cuenta_resultados', 'flujo_caja'].includes(selectedTemplate) && (
            <>
              {/* Cuentas a Mostrar Filter */}
              <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2 relative" ref={accountsDropdownRef}>
                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                  <span>Cuentas a Mostrar</span>
                </div>
                <div 
                  onClick={() => setAccountsDropdownOpen(prev => { if (prev) setAccountsSearch(''); return !prev; })}
                  className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                >
                  <span className="truncate pr-2 text-slate-700">
                    {selectedAccounts.length === 0 ? 'Todos' : selectedAccounts.join(', ')}
                  </span>
                  <span className="text-[9px] text-slate-500">▼</span>
                </div>
                {accountsDropdownOpen && (
                  <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 bg-white border border-[#a0a0a0] shadow-lg max-h-[200px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel">
                    <input 
                      type="text" 
                      value={accountsSearch} 
                      onChange={(e) => setAccountsSearch(e.target.value)} 
                      placeholder="Buscar cuenta..." 
                      className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case" 
                      onClick={(e) => e.stopPropagation()} 
                    />
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                      <input type="checkbox" checked={selectedAccounts.length === 0} onChange={() => setSelectedAccounts([])} className="mt-0.5" />
                      <span>Todos</span>
                    </label>
                    {filteredSelectableAccountsList.map(acc => {
                      const isSelected = selectedAccounts.includes(acc.code);
                      const indentClass = acc.code.length > 2 ? 'pl-4' : '';
                      return (
                        <label key={acc.code} className={`flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none ${indentClass}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedAccounts(prev => prev.filter(x => x !== acc.code));
                              } else {
                                setSelectedAccounts(prev => [...prev, acc.code]);
                              }
                            }}
                            className="mt-0.5"
                          />
                          <span className="text-slate-700">{acc.code} - {acc.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CEBE Filter */}
              <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2 relative" ref={cebeDropdownRef}>
                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                  <span>CEBE</span>
                </div>
                <div
                  onClick={() => setCebeDropdownOpen(prev => { if (prev) setCebeSearch(''); return !prev; })}
                  className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                >
                  <span className="truncate pr-2 text-slate-700">
                    {selectedCebes.length === 0 ? 'Todos' : selectedCebes.join(', ')}
                  </span>
                  <span className="text-[9px] text-slate-555">▼</span>
                </div>
                {cebeDropdownOpen && (
                  <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 bg-white border border-[#a0a0a0] shadow-lg max-h-[180px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel">
                    <input 
                      type="text" 
                      value={cebeSearch} 
                      onChange={(e) => setCebeSearch(e.target.value)} 
                      placeholder="Buscar CEBE..." 
                      className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case" 
                      onClick={(e) => e.stopPropagation()} 
                    />
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                      <input type="checkbox" checked={selectedCebes.length === 0} onChange={() => setSelectedCebes([])} className="mt-0.5" />
                      <span>Todos</span>
                    </label>
                    {filteredSelectableCebes.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic px-1">Sin opciones disponibles</span>
                    )}
                    {filteredSelectableCebes.map(c => {
                      const cebeObj = cebes.find(x => x.code === c);
                      const label = cebeObj ? `${c} - ${cebeObj.name}` : c;
                      return (
                        <label key={c} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                          <input
                            type="checkbox"
                            checked={selectedCebes.includes(c)}
                            onChange={() => setSelectedCebes(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                            className="mt-0.5"
                          />
                          <span className="text-slate-700">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CECO Filter */}
              <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2 relative" ref={cecoDropdownRef}>
                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                  <span>CECO</span>
                </div>
                <div
                  onClick={() => setCecoDropdownOpen(prev => { if (prev) setCecoSearch(''); return !prev; })}
                  className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                >
                  <span className="truncate pr-2 text-slate-700">
                    {selectedCecos.length === 0 ? 'Todos' : selectedCecos.join(', ')}
                  </span>
                  <span className="text-[9px] text-slate-555">▼</span>
                </div>
                {cecoDropdownOpen && (
                  <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 bg-white border border-[#a0a0a0] shadow-lg max-h-[180px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel">
                    <input 
                      type="text" 
                      value={cecoSearch} 
                      onChange={(e) => setCecoSearch(e.target.value)} 
                      placeholder="Buscar CECO..." 
                      className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case" 
                      onClick={(e) => e.stopPropagation()} 
                    />
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                      <input type="checkbox" checked={selectedCecos.length === 0} onChange={() => setSelectedCecos([])} className="mt-0.5" />
                      <span>Todos</span>
                    </label>
                    {filteredSelectableCecos.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic px-1">Sin opciones disponibles</span>
                    )}
                    {filteredSelectableCecos.map(c => {
                      const cecoObj = cecos.find(x => x.code === c);
                      const label = cecoObj ? `${c} - ${cecoObj.name}` : c;
                      return (
                        <label key={c} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                          <input
                            type="checkbox"
                            checked={selectedCecos.includes(c)}
                            onChange={() => setSelectedCecos(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                            className="mt-0.5"
                          />
                          <span className="text-slate-700">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Filtro Fiscal (Impuesto) */}
              <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                  <span>Filtro Fiscal</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setFilterImpuesto(prev => !prev)}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
                      filterImpuesto ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                      filterImpuesto ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </div>
                  <span className={`text-[10px] font-semibold ${
                    filterImpuesto ? 'text-amber-700' : 'text-slate-500'
                  }`}>
                    {filterImpuesto ? 'Solo con impuesto' : 'Todos los asientos'}
                  </span>
                </label>
              </div>

              {/* Documento Filter */}
              <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2 relative" ref={docDropdownRef}>
                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
                  <span>Documento</span>
                </div>
                <div
                  onClick={() => setDocDropdownOpen(prev => { if (prev) setDocSearch(''); return !prev; })}
                  className="win-input w-full flex justify-between items-center cursor-pointer select-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                >
                  <span className="truncate pr-2 text-slate-700">
                    {selectedDocuments.length === 0 ? 'Todos' : selectedDocuments.join(', ')}
                  </span>
                  <span className="text-[9px] text-slate-555">▼</span>
                </div>
                {docDropdownOpen && (
                  <div className="absolute left-3 right-3 top-[calc(100%-8px)] z-50 bg-white border border-[#a0a0a0] shadow-lg max-h-[180px] overflow-y-auto p-1.5 flex flex-col gap-1 rounded win-bevel">
                    <input 
                      type="text" 
                      value={docSearch} 
                      onChange={(e) => setDocSearch(e.target.value)} 
                      placeholder="Buscar documento..." 
                      className="w-full text-[10px] px-1.5 py-0.5 border border-slate-300 rounded mb-1 outline-none focus:border-blue-400 font-sans normal-case" 
                      onClick={(e) => e.stopPropagation()} 
                    />
                    <label className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none font-bold text-blue-900 border-b border-slate-100 pb-1">
                      <input type="checkbox" checked={selectedDocuments.length === 0} onChange={() => setSelectedDocuments([])} className="mt-0.5" />
                      <span>Todos</span>
                    </label>
                    {filteredSelectableDocuments.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic px-1">Sin opciones disponibles</span>
                    )}
                    {filteredSelectableDocuments.map(d => (
                      <label key={d} className="flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none">
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(d)}
                          onChange={() => setSelectedDocuments(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                          className="mt-0.5"
                        />
                        <span className="text-slate-700">{d}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Instruction Note */}
          <div className="p-3 bg-blue-50 border border-blue-200 text-[10px] text-blue-800 leading-normal flex flex-col gap-1.5 mt-auto">
            <div className="font-bold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
              <span>IMPRESIÓN EN NEXO</span>
            </div>
            <p>
              Al pulsar en <strong>Imprimir</strong> se abrirá la ventana de impresión nativa de tu navegador. 
              Hemos optimizado la hoja para ocultar el panel de Nexo e imprimir únicamente la hoja de reporte seleccionada.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

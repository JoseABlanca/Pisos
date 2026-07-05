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
  UserCircle,
  Calendar, 
  RefreshCw, 
  CheckCircle,
  TrendingUp,
  Landmark,
  Scale,
  FileSpreadsheet,
  LayoutGrid,
  Sliders,
  RotateCcw,
  ChevronDown,
  ArrowUpDown,
  Filter
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

const getPropertyMetrics = (p, entriesList) => {
  const propertyCebe = String(p.cebe || '').trim();
  const normalizedPropCebe = propertyCebe ? propertyCebe.replace(/^(CEBE|CECO)/i, '').trim().toLowerCase() : '';
  
  let ingresos = 0;
  let gastos = 0;
  let servicios = 0;
  
  if (!normalizedPropCebe) {
    return { ingresos: 0, gastos: 0, servicios: 0, neto: 0 };
  }
  
  entriesList.forEach(entry => {
    const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '').trim().toLowerCase();
    const entryCebeMatches = entryCebe && entryCebe.startsWith(normalizedPropCebe);
    
    if (entry.lines && entry.lines.length > 0) {
      entry.lines.forEach(l => {
        const lineCebe = String(l.cebe || '').trim().replace(/^(CEBE|CECO)/i, '').trim().toLowerCase();
        const lineCebeMatches = lineCebe ? lineCebe.startsWith(normalizedPropCebe) : entryCebeMatches;
        
        if (lineCebeMatches) {
          const acc = String(l.accountCode || '');
          const val = (parseFloat(l.debit) || 0) + (parseFloat(l.credit) || 0);
          
          if (acc.startsWith('7')) {
            ingresos += val;
          } else if (acc.startsWith('6')) {
            gastos += val;
            if (acc.startsWith('62')) {
              servicios += val;
            }
          }
        }
      });
    } else {
      if (entryCebeMatches) {
        const total = parseFloat(entry.total) || 0;
        const entryAcc = String(entry.accountCode || entry.accountId || '');
        if (entryAcc.startsWith('7')) {
          ingresos += total;
        } else {
          gastos += total;
          if (entryAcc.startsWith('62')) {
            servicios += total;
          }
        }
      }
    }
  });
  
  return {
    ingresos,
    gastos,
    servicios,
    neto: ingresos - gastos
  };
};

const isCustomerAssociatedWithProperty = (c, propertyId, rentalsList, propertiesList) => {
  const rent = rentalsList.find(r => 
    (r.id && c.rentalReference && r.id === c.rentalReference) || 
    (r.reference && c.rentalReference && r.reference === c.rentalReference) ||
    r.tenantId === c.id || 
    (r.tenants && r.tenants.some(t => t.id === c.id))
  );
  if (rent && rent.propertyId === propertyId) {
    return true;
  }
  
  const prop = propertiesList.find(p => p.id === propertyId);
  if (prop) {
    const propNameLower = (prop.name || '').toLowerCase().trim();
    const propIdLower = (prop.id || '').toLowerCase().trim();
    
    if (c.floor) {
      const fLower = String(c.floor).toLowerCase().trim();
      if (fLower === propNameLower || fLower === propIdLower) return true;
    }
    if (Array.isArray(c.floors)) {
      return c.floors.some(f => {
        const fLower = String(f).toLowerCase().trim();
        return fLower === propNameLower || fLower === propIdLower;
      });
    }
  }
  return false;
};

const getLogicalBlocks = (rows) => {
  const blocks = [];
  let currentBlock = [];
  
  rows.forEach(row => {
    if (row.type === 'main-header' || row.type === 'subheader' || row.type === 'item') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [row];
    } else {
      currentBlock.push(row);
    }
  });
  
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }
  return blocks;
};
const getHorizontalPercentage = (valSelected, valComp) => {
  const vSel = parseFloat(valSelected) || 0;
  const vComp = parseFloat(valComp) || 0;
  if (Math.abs(vComp) < 0.005) return '---';
  const pct = ((vSel - vComp) / Math.abs(vComp)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};



const paginateBlocks = (blocks, baseLimit = 28, maxFlex = 6) => {
  const pages = [];
  let currentPageRows = [];
  
  blocks.forEach(block => {
    const potentialLength = currentPageRows.length + block.length;
    
    if (potentialLength <= baseLimit) {
      currentPageRows.push(...block);
    } else {
      const overflow = potentialLength - baseLimit;
      if (overflow <= maxFlex || currentPageRows.length === 0) {
        currentPageRows.push(...block);
      } else {
        pages.push(currentPageRows);
        currentPageRows = [...block];
      }
    }
  });
  
  if (currentPageRows.length > 0) {
    pages.push(currentPageRows);
  }
  return pages;
};

// getSortValue and multiLevelSort are now defined inside the PrintPage component to access state variables directly.





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
    { id: 'sumas_saldos', name: 'Sumas y Saldos', icon: Columns },
    { id: 'plan_contable', name: 'Plan de Cuentas', icon: BookOpen }
  ],
  contabilidad_anuales: [
    { id: 'balance_situacion', name: 'Balance de Situación', icon: FileSpreadsheet },
    { id: 'cuenta_resultados', name: 'Cuenta de Resultados', icon: FileSpreadsheet },
    { id: 'flujo_caja', name: 'Estado de Flujos de Caja', icon: FileSpreadsheet }
  ],
  inversiones: [
    { id: 'activos', name: 'Inventario de Activos', icon: Building2 },
    { id: 'alquileres', name: 'Contratos de Alquiler', icon: Key },
    { id: 'clientes', name: 'Fichero de Clientes', icon: Users },
    { id: 'extracto_propietarios', name: 'Extracto de Propietarios', icon: UserCircle },
    { id: 'metricas_inversion', name: 'Métricas de Inversión', icon: TrendingUp }
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
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    return localStorage.getItem('print_selectedTemplate') || 'diario';
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem('print_selectedYear');
    return saved ? parseInt(saved, 10) : new Date().getFullYear();
  });
  const [selectedYears, setSelectedYears] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedYears');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedMonths, setSelectedMonths] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedMonths');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedQuarters, setSelectedQuarters] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedQuarters');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedAccounts, setSelectedAccounts] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedAccounts');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedCebes, setSelectedCebes] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedCebes');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedCecos, setSelectedCecos] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedCecos');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [selectedDocuments, setSelectedDocuments] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedDocuments');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [filterImpuesto, setFilterImpuesto] = useState(() => {
    return localStorage.getItem('print_filterImpuesto') === 'true';
  });
  const [maxDigits, setMaxDigits] = useState(() => {
    const saved = localStorage.getItem('print_maxDigits');
    return saved ? parseInt(saved, 10) : 10;
  });
  const [isDatesCollapsed, setIsDatesCollapsed] = useState(true);
  const [isFiltersInmobCollapsed, setIsFiltersInmobCollapsed] = useState(false);
  const [isSortCollapsed, setIsSortCollapsed] = useState(false);
  const [isColsCollapsed, setIsColsCollapsed] = useState(false);
  const [isOptsAlquilerCollapsed, setIsOptsAlquilerCollapsed] = useState(false);
  const [isOptsClientesCollapsed, setIsOptsClientesCollapsed] = useState(false);
  const [isOptsPropietariosCollapsed, setIsOptsPropietariosCollapsed] = useState(false);
  const [isOptsContabilidadCollapsed, setIsOptsContabilidadCollapsed] = useState(false);
  const [isProfundidadCollapsed, setIsProfundidadCollapsed] = useState(false);
  const [hideZeroBalances, setHideZeroBalances] = useState(() => {
    return localStorage.getItem('print_hideZeroBalances') === 'true';
  });
  const [showVerticalPercentage, setShowVerticalPercentage] = useState(() => {
    return localStorage.getItem('print_showVerticalPercentage') === 'true';
  });
  const [showHorizontalPercentage, setShowHorizontalPercentage] = useState(() => {
    return localStorage.getItem('print_showHorizontalPercentage') === 'true';
  });
  const [displayMode, setDisplayMode] = useState(() => {
    return localStorage.getItem('print_displayMode') || 'euros';
  });
  const [selectedComparisonYears, setSelectedComparisonYears] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedComparisonYears');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  // Multi-select dropdown states for properties, rentals, and owners
  const [selectedFilterProperties, setSelectedFilterProperties] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedFilterProperties');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return {};
        return parsed || {};
      }
    } catch(e) {}
    return {};
  });
  const [selectedFilterRentals, setSelectedFilterRentals] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedFilterRentals');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return {};
        return parsed || {};
      }
    } catch(e) {}
    return {};
  });
  const [selectedFilterOwners, setSelectedFilterOwners] = useState(() => {
    try {
      const saved = localStorage.getItem('print_selectedFilterOwners');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return {};
        return parsed || {};
      }
    } catch(e) {}
    return {};
  });

  const [sortCol1, setSortCol1] = useState(() => {
    return localStorage.getItem('print_sortCol1') || 'none';
  });
  const [sortDir1, setSortDir1] = useState(() => {
    return localStorage.getItem('print_sortDir1') || 'asc';
  });
  const [sortCol2, setSortCol2] = useState(() => {
    return localStorage.getItem('print_sortCol2') || 'none';
  });
  const [sortDir2, setSortDir2] = useState(() => {
    return localStorage.getItem('print_sortDir2') || 'asc';
  });

  const [showSecondSortLevel, setShowSecondSortLevel] = useState(() => {
    return localStorage.getItem('print_showSecondSortLevel') === 'true' || (localStorage.getItem('print_sortCol2') || 'none') !== 'none';
  });
  const [groupByOwner, setGroupByOwner] = useState(() => {
    return localStorage.getItem('print_groupByOwner') === 'true';
  });
  const [groupAccessoryAssets, setGroupAccessoryAssets] = useState(() => {
    return localStorage.getItem('print_groupAccessoryAssets') === 'true';
  });

  const [accountsDropdownOpen, setAccountsDropdownOpen] = useState(false);
  const [cebeDropdownOpen, setCebeDropdownOpen] = useState(false);
  const [cecoDropdownOpen, setCecoDropdownOpen] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [colDropdownOpen, setColDropdownOpen] = useState(false);
  const [propFilterDropdownOpen, setPropFilterDropdownOpen] = useState(false);
  const [rentFilterDropdownOpen, setRentFilterDropdownOpen] = useState(false);
  const [ownerFilterDropdownOpen, setOwnerFilterDropdownOpen] = useState(false);

  const [accountsSearch, setAccountsSearch] = useState('');
  const [cebeSearch, setCebeSearch] = useState('');
  const [cecoSearch, setCecoSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [propFilterSearch, setPropFilterSearch] = useState('');
  const [rentFilterSearch, setRentFilterSearch] = useState('');
  const [ownerFilterSearch, setOwnerFilterSearch] = useState('');

  const accountsDropdownRef = useRef(null);
  const cebeDropdownRef = useRef(null);
  const cecoDropdownRef = useRef(null);
  const docDropdownRef = useRef(null);
  const colDropdownRef = useRef(null);
  const propFilterDropdownRef = useRef(null);
  const rentFilterDropdownRef = useRef(null);
  const ownerFilterDropdownRef = useRef(null);
  const previewAreaRef = useRef(null);
  const [pageScale, setPageScale] = useState(1);

  // Paper / layout configuration
  const [paperSize, setPaperSize] = useState(() => localStorage.getItem('print_paperSize') || 'A4');
  const [pageOrientation, setPageOrientation] = useState(() => localStorage.getItem('print_pageOrientation') || 'portrait');
  const [printZoom, setPrintZoom] = useState(() => parseFloat(localStorage.getItem('print_printZoom')) || 1.0);

  // Compute page scale factor when paper size / orientation / panels change
  useEffect(() => {
    localStorage.setItem('print_paperSize', paperSize);
  }, [paperSize]);
  
  useEffect(() => {
    localStorage.setItem('print_pageOrientation', pageOrientation);
  }, [pageOrientation]);

  useEffect(() => {
    localStorage.setItem('print_printZoom', printZoom);
  }, [printZoom]);
  useEffect(() => {
    const computeScale = () => {
      const el = previewAreaRef.current;
      if (!el) return;
      const paperDims = { 'A4': { w: 210, h: 297 }, 'A5': { w: 148, h: 210 }, 'Letter': { w: 216, h: 279 } };
      const dims = paperDims[paperSize] || paperDims['A4'];
      const sheetWmm = pageOrientation === 'landscape' ? dims.h : dims.w;
      // 1mm = 3.7795px at 96dpi screen resolution
      const sheetWpx = sheetWmm * 3.7795;
      const containerW = el.clientWidth - 64; // subtract left+right padding (2*32px)
      const newScale = containerW > 0 && containerW < sheetWpx
        ? Math.max(0.35, containerW / sheetWpx)
        : 1;
      setPageScale(newScale);
    };
    // Use rAF to wait for browser layout after panel open/close
    const raf = requestAnimationFrame(computeScale);
    const observer = new ResizeObserver(computeScale);
    if (previewAreaRef.current) observer.observe(previewAreaRef.current);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [paperSize, pageOrientation, showLeftPanel, showRightPanel]);


  // Visible columns per template (keys = templateId, value = Set of visible column ids)
  const COLUMN_TOOLTIPS = {
    name: 'Nombre del propietario',
    percentage: 'Porcentaje de participación',
    acquisitionPrice: 'Precio original de adquisición',
    investedCapital: 'Capital aportado, excluyendo gastos',
    adquisitionExpenses: 'Gastos asociados a la adquisición',
    acqPlusExpenses: 'Precio de adquisición + Gastos',
    capitalReforma: 'Capital aportado + Reforma capitalizable',
    currentValue: 'Valor actual estimado del inmueble',
    ingresosExtracto: 'Ingresos generados por el inmueble',
    gastosExtracto: 'Gastos incurridos',
    rendimientoNetoExtracto: 'Ingresos menos gastos',
    mortgagePending: 'Saldo pendiente de la hipoteca',
    gain: 'Valor actual - (Capital aportado + Reforma cap.)',
    netGain: 'Ganancia bruta - Hipoteca pendiente',
    realReturn: 'Ganancia neta + Rendimiento neto'
  };

  const DEFAULT_ALL_COLUMNS = {
    activos: [
      { id: 'id', label: 'ID' },
      { id: 'name', label: 'Nombre Finca' },
      { id: 'address', label: 'Dirección' },
      { id: 'cebe_ceco', label: 'CEBE' },
      { id: 'accountingAccount', label: 'Cuenta Contable' },
      { id: 'mortgagePending', label: 'Hip. Pendiente' },
      { id: 'acquisitionDate', label: 'Fecha Adquisición' },
      { id: 'purchasePrice', label: 'Precio Compra' },
      { id: 'ingresos', label: 'Ingresos' },
      { id: 'gastos', label: 'Gastos' },
      { id: 'netYield', label: 'Rend. Neto' },
      { id: 'catastral', label: 'Ref. Catastral' },
      { id: 'cp', label: 'Código Postal' },
      { id: 'accountNumber', label: 'Número de Cuenta' },
      { id: 'activeTenant', label: 'Cliente (Activo)' },
      { id: 'capitalReformas', label: 'Capital Reformas' },
      { id: 'capitalAportado', label: 'Capital Aportado' },
      { id: 'totalInversion', label: 'Total Inversión' },
      { id: 'theoreticalSalePrice', label: 'Precio de Venta' },
      { id: 'gastosCompraVenta', label: 'Gastos Compra Venta' },
    ],
    alquileres: [
      { id: 'reference', label: 'Referencia' },
      { id: 'property', label: 'Inmueble' },
      { id: 'tenants', label: 'Inquilinos' },
      { id: 'startDate', label: 'Fecha Inicio' },
      { id: 'endDate', label: 'Fecha Fin' },
      { id: 'depositAmount', label: 'Fianza' },
      { id: 'rentAmount', label: 'Renta' },
      { id: 'expenses', label: 'Gastos Asociados' },
      { id: 'netYield', label: 'Rend. Neto' },
      { id: 'pctAlquiler', label: '% Alquiler' },
      { id: 'ingresosExtracto', label: 'Ingresos' },
      { id: 'gastosExtracto', label: 'Gastos' },
      { id: 'rentaNetaExtracto', label: 'Renta Neta' },
      { id: 'pctIngresos', label: '% Ingresos' },
      { id: 'status', label: 'Estado' },
    ],
    clientes: [
      { id: 'id', label: 'ID' },
      { id: 'name', label: 'Nombre Completo' },
      { id: 'dni', label: 'DNI / NIF' },
      { id: 'phone', label: 'Teléfono' },
      { id: 'email', label: 'Email' },
      { id: 'status', label: 'Estado' },
      { id: 'propertyName', label: 'Propiedad Asociada' },
      { id: 'rentalRef', label: 'Ref. Contrato' },
    ],
    extracto_propietarios: [
      { id: 'name', label: 'Propietario' },
      { id: 'property', label: 'Propiedad' },
      { id: 'percentage', label: 'Participación (%)' },
      { id: 'acquisitionPrice', label: 'Precio Adquisición' },
      { id: 'investedCapital', label: 'Cap. Aportado' },
      { id: 'adquisitionExpenses', label: 'Gastos Adquisición' },
      { id: 'acqPlusExpenses', label: 'Precio + Gastos' },
      { id: 'capitalReforma', label: 'Cap. + Reforma Cap.' },
      { id: 'currentValue', label: 'V. Actual' },
      { id: 'ingresosExtracto', label: 'Ingresos' },
      { id: 'gastosExtracto', label: 'Gastos' },
      { id: 'rendimientoNetoExtracto', label: 'Rend. Neto' },
      { id: 'mortgagePending', label: 'Hipoteca Pendiente' },
      { id: 'gain', label: 'Ganancia Bruta' },
      { id: 'netGain', label: 'Ganancia Neta' },
      { id: 'realReturn', label: 'Total' },
    ],
    metricas_inversion: [
      { id: 'property', label: 'Inmueble' },
      { id: 'owner', label: 'Propietario' },
      { id: 'percentage', label: '% Prop.' },
      { id: 'acquisitionPrice', label: 'Precio Adquisición' },
      { id: 'investedCapital', label: 'Inversión Inicial' },
      { id: 'ingresosAnuales', label: 'Ingresos Anuales' },
      { id: 'gastosAnuales', label: 'Gastos Anuales' },
      { id: 'beneficioNeto', label: 'Beneficio Neto' },
      { id: 'roi', label: 'ROI (%)' },
      { id: 'roe', label: 'ROE (%)' },
      { id: 'cashOnCash', label: 'Cash on Cash (%)' },
      { id: 'grossYield', label: 'Rent. Bruta (%)' },
      { id: 'netYield', label: 'Rent. Neta (%)' }
    ],
    plan_contable: [
      { id: 'code', label: 'Código' },
      { id: 'description', label: 'Descripción' }
    ]
  };

  const DEFAULT_VISIBLE_COLUMNS = {
    activos: new Set([
      'id', 'name', 'address', 'cebe_ceco', 'accountingAccount', 
      'ingresos', 'gastos', 'netYield', 'catastral', 'cp', 'accountNumber',
      'activeTenant', 'capitalReformas', 'capitalAportado', 'totalInversion',
      'theoreticalSalePrice', 'gastosCompraVenta'
    ]),
    alquileres: new Set(['reference','property','tenants','startDate','endDate','rentAmount','expenses','netYield','pctAlquiler','ingresosExtracto','gastosExtracto','rentaNetaExtracto','pctIngresos','status']),
    clientes: new Set(['id','name','dni','phone','email','status','propertyName','rentalRef']),
    extracto_propietarios: new Set(['name','property','percentage','acquisitionPrice','investedCapital','adquisitionExpenses','acqPlusExpenses','capitalReforma','currentValue','ingresosExtracto','gastosExtracto','rendimientoNetoExtracto','mortgagePending','gain','netGain','realReturn']),
    metricas_inversion: new Set(['property','owner','percentage','acquisitionPrice','investedCapital','ingresosAnuales','gastosAnuales','beneficioNeto','roi','roe','cashOnCash','grossYield','netYield']),
    plan_contable: new Set(['code','description'])
  };
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('print_visibleColumns');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Object.fromEntries(
          Object.entries(parsed).map(([k, arr]) => [k, new Set(arr)])
        );
      }
    } catch (e) {}
    return DEFAULT_VISIBLE_COLUMNS;
  });

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('print_columnOrder');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [draggedCol, setDraggedCol] = useState(null);

  const handleColumnDrop = (templateId, targetColId) => {
    if (!draggedCol || draggedCol === targetColId) return;
    setColumnOrder(prev => {
      const currentOrder = prev[templateId] ? [...prev[templateId]] : DEFAULT_ALL_COLUMNS[templateId].map(c => c.id);
      
      const defaultIds = DEFAULT_ALL_COLUMNS[templateId].map(c => c.id);
      defaultIds.forEach(id => {
        if (!currentOrder.includes(id)) {
          currentOrder.push(id);
        }
      });

      const draggedIdx = currentOrder.indexOf(draggedCol);
      const targetIdx = currentOrder.indexOf(targetColId);
      if (draggedIdx < 0 || targetIdx < 0) return prev;
      const newOrder = [...currentOrder];
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedCol);
      return { ...prev, [templateId]: newOrder };
    });
    setDraggedCol(null);
  };

  const ALL_COLUMNS = useMemo(() => {
    const res = {};
    for (const [tpl, cols] of Object.entries(DEFAULT_ALL_COLUMNS)) {
      if (columnOrder[tpl]) {
        const orderMap = new Map(columnOrder[tpl].map((id, i) => [id, i]));
        res[tpl] = [...cols].sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
          return idxA - idxB;
        });
      } else {
        res[tpl] = cols;
      }
    }
    return res;
  }, [columnOrder]);

  const [rentPeriod, setRentPeriod] = useState('mes'); // 'mes' or 'anual'
  const [statusFilterAlquileres, setStatusFilterAlquileres] = useState('todos'); // 'todos','activo','inactivo'
  const [statusFilterClientes, setStatusFilterClientes] = useState('todos'); // 'todos','activo','inactivo'

  const getSelectedMonthsCount = () => {
    const yearsCount = selectedYears.length > 0 ? selectedYears.length : 1;
    if (selectedMonths.length > 0) {
      return selectedMonths.length * yearsCount;
    }
    if (selectedQuarters.length > 0) {
      return selectedQuarters.length * 3 * yearsCount;
    }
    if (selectedYears.length > 0) {
      return 12 * selectedYears.length;
    }
    return rentPeriod === 'anual' ? 12 : 1;
  };

  const toggleColumn = (templateId, colId) => {
    setVisibleColumns(prev => {
      const current = new Set(prev[templateId] || []);
      if (current.has(colId)) { current.delete(colId); } else { current.add(colId); }
      return { ...prev, [templateId]: current };
    });
  };
  const isColVisible = (templateId, colId) => (visibleColumns[templateId] || DEFAULT_VISIBLE_COLUMNS[templateId] || new Set()).has(colId);

  const getActiveClientDisplay = (p) => {
    const activeRentalsForP = rentals.filter(r => r.propertyId === p.id && (r.status || 'activo') === 'activo');
    const names = [];
    activeRentalsForP.forEach(r => {
      if (Array.isArray(r.tenants)) {
        r.tenants.forEach(t => names.push((t.name || '').trim()));
      }
      if (r.tenantId) {
        const cust = customers.find(c => c.id === r.tenantId);
        if (cust) names.push(`${cust.name} ${cust.lastName || ''}`.trim());
      }
    });
    const uniqueNames = [...new Set(names)].filter(Boolean);
    return uniqueNames.join(', ') || '---';
  };

  const getActiveClientDisplayConsolidated = (p) => {
    const mainTenants = getActiveClientDisplay(p);
    if (!groupAccessoryAssets) return mainTenants;
    const acc = p.accessoryPropertyId ? properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId) : null;
    if (!acc) return mainTenants;
    const accTenants = getActiveClientDisplay(acc);
    if (accTenants === '---' || !accTenants) return mainTenants;
    if (mainTenants === '---' || !mainTenants) return accTenants;
    const combined = [...new Set([...mainTenants.split(', '), ...accTenants.split(', ')])];
    return combined.join(', ') || '---';
  };

  const getRentalExtractMetrics = (r, entriesList) => {
    let ingresos = 0;
    let gastos = 0;

    const currentCebe = r.incomeCebeId || '';
    const normValueCebe = String(currentCebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
    const currentRef = String(r.reference || '').trim().toUpperCase();

    if (!currentRef) return { ingresos: 0, gastos: 0, neto: 0 };

    entriesList.forEach(entry => {
      let isMatch = false;
      let matchedLines = [];

      // Check line levels
      if (entry.lines) {
        entry.lines.forEach(l => {
          let lineMatchCebe = false;
          let lineMatchRef = false;
          
          if (l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normValueCebe && normField.startsWith(normValueCebe)) lineMatchCebe = true;
          } else if (normValueCebe && entry.cebe) {
            const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
          }

          if (l.document) {
            if (String(l.document).trim().toUpperCase() === currentRef) lineMatchRef = true;
          } else if (entry.document || entry.documentName) {
            const docVal = String(entry.document || entry.documentName || '').trim().toUpperCase();
            if (docVal === currentRef) lineMatchRef = true;
          }

          if (lineMatchCebe && lineMatchRef) {
            isMatch = true;
            matchedLines.push(l);
          }
        });
      }

      // Fallback check on global header level if no line matched but header matches
      if (!isMatch) {
        let matchCebe = false;
        let matchRef = false;

        if (entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normValueCebe && normField.startsWith(normValueCebe)) matchCebe = true;
        }
        if (entry.document || entry.documentName) {
          const docVal = String(entry.document || entry.documentName || '').trim().toUpperCase();
          if (docVal === currentRef) matchRef = true;
        }

        if (matchCebe && matchRef) {
          isMatch = true;
        }
      }

      if (isMatch) {
        if (matchedLines.length > 0) {
          matchedLines.forEach(l => {
            const d = parseFloat(l.debit) || 0;
            const c = parseFloat(l.credit) || 0;
            const accCode = String(l.accountCode || l.accountId || '');
            if (accCode.startsWith('7')) {
              ingresos += c;
              gastos += d;
            } else if (accCode.startsWith('6')) {
              gastos += d;
              ingresos += c;
            } else {
              if (c > 0) ingresos += c;
              if (d > 0) gastos += d;
            }
          });
        } else {
          const totalAmt = entry.total || 0;
          const desc = String(entry.description || '').toLowerCase();
          const isExpense = totalAmt < 0 || desc.includes('comunidad') || desc.includes('gasto') || desc.includes('reforma');
          if (isExpense) {
            gastos += Math.abs(totalAmt);
          } else {
            ingresos += totalAmt;
          }
        }
      }
    });

    return {
      ingresos,
      gastos,
      neto: ingresos - gastos
    };
  };

  const getPropertyExtractMetrics = (p, rentalsList, entriesList) => {
    // Use the same CEBE/CECO matching logic as ExtractoContableTab (properties mode)
    // so the informe figures match exactly what the extracto modal shows.
    let ingresos = 0;
    let gastos = 0;

    const normValueCebe = p.cebe ? String(p.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase() : '';
    const normIncomeCecos = (p.taxIncomeCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase());
    const normExpenseCecos = (p.taxExpenseCecos || []).map(c => String(c).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase());

    if (!normValueCebe && normIncomeCecos.length === 0 && normExpenseCecos.length === 0) {
      return { ingresos: 0, gastos: 0, neto: 0 };
    }

    // 1. Pre-filter entries exactly like ExtractoContableTab's filteredEntries
    const filteredEntries = entriesList.filter(entry => {
      let matchCebe = false;
      let matchCeco = false;

      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

      if (entry.lines) {
        entry.lines.forEach(l => {
          // Income check
          let lineCebeMatch = false;
          if (normValueCebe && l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normField.startsWith(normValueCebe)) lineCebeMatch = true;
          } else if (!l.cebe && normValueCebe) {
            const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (entryCebe.startsWith(normValueCebe)) lineCebeMatch = true;
          }

          let lineCecoMatch = false;
          if (normIncomeCecos.length > 0) {
            if (l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
              if (normIncomeCecos.some(c => normField.startsWith(c))) lineCecoMatch = true;
            } else if (!l.ceco) {
              const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
              if (normIncomeCecos.some(c => entryCeco.startsWith(c))) lineCecoMatch = true;
            }
          } else {
            lineCecoMatch = true;
          }

          if (lineCebeMatch && lineCecoMatch) {
            matchCebe = true;
          }

          // Expense check
          let lineExpenseCebeMatch = false;
          if (!normValueCebe) {
            lineExpenseCebeMatch = true;
          } else if (l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normField.startsWith(normValueCebe)) lineExpenseCebeMatch = true;
          } else if (entry.cebe) {
            const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (entryCebe.startsWith(normValueCebe)) lineExpenseCebeMatch = true;
          }

          let lineExpenseCecoMatch = false;
          if (normExpenseCecos.length > 0) {
            if (l.ceco) {
              const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
              if (normExpenseCecos.some(c => normField.startsWith(c))) lineExpenseCecoMatch = true;
            } else if (!l.ceco) {
              const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
              if (normExpenseCecos.some(c => entryCeco.startsWith(c))) lineExpenseCecoMatch = true;
            }
          } else {
            lineExpenseCecoMatch = true;
          }

          if (lineExpenseCebeMatch && lineExpenseCecoMatch) {
            matchCeco = true;
          }
        });
      }

      if (!hasLineLevelAnalytics) {
        // Global Income
        let globalCebe = false;
        if (normValueCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normField.startsWith(normValueCebe)) globalCebe = true;
        }
        let globalIncomeCeco = false;
        if (normIncomeCecos.length > 0) {
          if (entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normIncomeCecos.some(c => normField.startsWith(c))) globalIncomeCeco = true;
          }
        } else {
          globalIncomeCeco = true;
        }
        if (globalCebe && globalIncomeCeco) matchCebe = true;

        // Global Expense
        let globalExpenseCebe = false;
        if (!normValueCebe) {
          globalExpenseCebe = true;
        } else if (entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          globalExpenseCebe = normField.startsWith(normValueCebe);
        }
        let globalExpenseCeco = false;
        if (normExpenseCecos.length > 0) {
          if (entry.ceco) {
            const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normExpenseCecos.some(c => normField.startsWith(c))) globalExpenseCeco = true;
          }
        } else {
          globalExpenseCeco = true;
        }
        if (globalExpenseCebe && globalExpenseCeco) matchCeco = true;
      }

      return matchCebe || matchCeco;
    });

    // 2. Sum totals for the pre-filtered list
    filteredEntries.forEach(entry => {
      let cebeEntryAmount = 0;
      let cecoEntryAmount = 0;
      const hasLineLevelAnalytics = entry.lines && entry.lines.some(l => l.cebe || l.ceco);

      if (entry.lines) {
        entry.lines.forEach(l => {
          const lineAmt = (Number(l.debit) || 0) + (Number(l.credit) || 0);
          const accCode = String(l.accountCode || '');

          let lineMatchCebe = false;
          let lineMatchCeco = false;

          if (normValueCebe && l.cebe) {
            const normField = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normField.startsWith(normValueCebe)) lineMatchCebe = true;
          }
          if (normIncomeCecos.length > 0 && l.ceco) {
            const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normIncomeCecos.some(c => normField.startsWith(c))) lineMatchCebe = true;
          }

          if (normExpenseCecos.length > 0 && l.ceco) {
            const normField = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
            if (normExpenseCecos.some(c => normField.startsWith(c))) lineMatchCeco = true;
          }

          if (lineMatchCebe || lineMatchCeco) {
            const isInc = accCode.startsWith('7');
            const isExp = accCode.startsWith('6');
            if (isInc) {
              cebeEntryAmount += lineAmt;
            } else if (isExp) {
              cecoEntryAmount += lineAmt;
            } else {
              if (lineMatchCebe) cebeEntryAmount += lineAmt;
              if (lineMatchCeco) cecoEntryAmount += lineAmt;
            }
          }
        });
      }

      if (!hasLineLevelAnalytics) {
        let globalCebe = false;
        if (normValueCebe && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normField.startsWith(normValueCebe)) globalCebe = true;
        }
        if (normIncomeCecos.length > 0 && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normIncomeCecos.some(c => normField.startsWith(c))) globalCebe = true;
        }
        if (globalCebe) {
          cebeEntryAmount = entry.total || 0;
        }

        let globalCeco = false;
        if (normExpenseCecos.length > 0 && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '').toLowerCase();
          if (normExpenseCecos.some(c => normField.startsWith(c))) globalCeco = true;
        }
        if (globalCeco) {
          cecoEntryAmount = entry.total || 0;
        }
      }

      ingresos += cebeEntryAmount;
      gastos += cecoEntryAmount;
    });

    return {
      ingresos,
      gastos,
      neto: ingresos - gastos
    };
  };

  const getConsolidatedProperty = (p, propertiesList, rentalsList, entriesList) => {
    if (!groupAccessoryAssets) {
      const propInvestedCapital = parseFloat(p.investedCapital || 0);
      const propAdquisitionExpenses = (p.adquisitionExpenses || p.financials?.acquisitionExpenses || []).reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
      const propCapitalizedReforms = (p.reforms || []).reduce((acc, ref) => acc + (ref.expenses || []).reduce((s, exp) => s + (exp.capitalize ? (parseFloat(exp.amount) || 0) : 0), 0), 0);
      const propAcquisitionPrice = parseFloat(p.acquisitionPrice || p.financials?.purchasePrice || 0);
      const propCurrentValue = parseFloat(p.currentValue || p.financials?.currentValue || 0);
      const propMortgagePending = parseFloat(p.mortgagePending || p.financials?.mortgagePending || 0);
      const propTheoreticalSalePrice = parseFloat(p.theoreticalSalePrice || p.financials?.theoreticalSalePrice || 0);
      const propExtract = getPropertyExtractMetrics(p, rentalsList, entriesList);

      return {
        ...p,
        acquisitionPrice: propAcquisitionPrice,
        investedCapital: propInvestedCapital,
        adquisitionExpenses: propAdquisitionExpenses,
        capitalizedReforms: propCapitalizedReforms,
        currentValue: propCurrentValue,
        mortgagePending: propMortgagePending,
        theoreticalSalePrice: propTheoreticalSalePrice,
        ingresosExtracto: propExtract.ingresos,
        gastosExtracto: propExtract.gastos,
        rendimientoNetoExtracto: propExtract.neto
      };
    }

    const acc = p.accessoryPropertyId ? propertiesList.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId) : null;

    const propInvestedCapital = parseFloat(p.investedCapital || 0) + (acc ? parseFloat(acc.investedCapital || 0) : 0);
    
    const pAdqExp = (p.adquisitionExpenses || p.financials?.acquisitionExpenses || []).reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
    const accAdqExp = acc ? (acc.adquisitionExpenses || acc.financials?.acquisitionExpenses || []).reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0) : 0;
    const propAdquisitionExpenses = pAdqExp + accAdqExp;

    const pCapRef = (p.reforms || []).reduce((acc, ref) => acc + (ref.expenses || []).reduce((s, exp) => s + (exp.capitalize ? (parseFloat(exp.amount) || 0) : 0), 0), 0);
    const accCapRef = acc ? (acc.reforms || []).reduce((acc, ref) => acc + (ref.expenses || []).reduce((s, exp) => s + (exp.capitalize ? (parseFloat(exp.amount) || 0) : 0), 0), 0) : 0;
    const propCapitalizedReforms = pCapRef + accCapRef;

    const propAcquisitionPrice = parseFloat(p.acquisitionPrice || p.financials?.purchasePrice || 0) + (acc ? parseFloat(acc.acquisitionPrice || acc.financials?.purchasePrice || 0) : 0);
    
    const propCurrentValue = parseFloat(p.currentValue || p.financials?.currentValue || 0) + (acc ? parseFloat(acc.currentValue || acc.financials?.currentValue || 0) : 0);
    
    const propMortgagePending = parseFloat(p.mortgagePending || p.financials?.mortgagePending || 0) + (acc ? parseFloat(acc.mortgagePending || acc.financials?.mortgagePending || 0) : 0);
    
    const propTheoreticalSalePrice = parseFloat(p.theoreticalSalePrice || p.financials?.theoreticalSalePrice || 0) + (acc ? parseFloat(acc.theoreticalSalePrice || acc.financials?.theoreticalSalePrice || 0) : 0);

    const pExtract = getPropertyExtractMetrics(p, rentalsList, entriesList);
    const accExtract = acc ? getPropertyExtractMetrics(acc, rentalsList, entriesList) : { ingresos: 0, gastos: 0, neto: 0 };
    
    return {
      ...p,
      acquisitionPrice: propAcquisitionPrice,
      investedCapital: propInvestedCapital,
      adquisitionExpenses: propAdquisitionExpenses,
      capitalizedReforms: propCapitalizedReforms,
      currentValue: propCurrentValue,
      mortgagePending: propMortgagePending,
      theoreticalSalePrice: propTheoreticalSalePrice,
      ingresosExtracto: pExtract.ingresos + accExtract.ingresos,
      gastosExtracto: pExtract.gastos + accExtract.gastos,
      rendimientoNetoExtracto: pExtract.neto + accExtract.neto
    };
  };

  const getSortValue = (item, colId, templateId) => {
    if (!colId || colId === 'none') return '';
    
    if (templateId === 'extracto_propietarios') {
      if (colId === 'name') return item.partnerName || '';
      if (colId === 'property') return item.propertyName || '';
      if ([
        'acquisitionPrice', 'capitalAportadoGastos', 'capitalReforma', 'currentValue',
        'gain', 'netGain', 'mortgagePending', 'ingresosExtracto', 'gastosExtracto',
        'rendimientoNetoExtracto', 'realReturn'
      ].includes(colId)) {
        return parseFloat(item[colId]) || 0;
      }
      return item[colId] ?? '';
    }

    if (templateId === 'metricas_inversion') {
      if (colId === 'property') return item.pName || '';
      if (colId === 'owner') return item.ownerName || '';
      if (colId === 'percentage') return item.percentage || 0;
      if (['acquisitionPrice', 'investedCapital', 'ingresosAnuales', 'gastosAnuales', 'beneficioNeto'].includes(colId)) {
        return parseFloat(item[colId]) || 0;
      }
      if (colId === 'roi') return item.investedCapital > 0 ? (item.beneficioNeto / item.investedCapital) * 100 : 0;
      if (colId === 'roe') return item.investedCapital > 0 ? (item.beneficioNeto / item.investedCapital) * 100 : 0;
      if (colId === 'cashOnCash') return item.investedCapital > 0 ? (item.beneficioNeto / item.investedCapital) * 100 : 0;
      if (colId === 'grossYield') return item.acquisitionPrice > 0 ? (item.ingresosAnuales / item.acquisitionPrice) * 100 : 0;
      if (colId === 'netYield') return item.acquisitionPrice > 0 ? (item.beneficioNeto / item.acquisitionPrice) * 100 : 0;
      return item[colId] ?? '';
    }

    if (templateId === 'activos') {
      const consolidated = getConsolidatedProperty(item, properties, rentals, filteredEntriesForPrint);
      if (colId === 'id') return item.id || '';
      if (colId === 'name') return item.name || '';
      if (colId === 'address') return item.address || '';
      if (colId === 'cebe_ceco') return item.cebe || '';
      if (colId === 'accountingAccount') {
        const hasValidAcc = accounts.some(a => a.code === item.accountingAccount);
        return hasValidAcc ? item.accountingAccount : '';
      }
      if (colId === 'mortgagePending') return consolidated.mortgagePending;
      if (colId === 'acquisitionDate') return item.purchaseDate || item.financials?.acquisitionDate || '';
      if (colId === 'purchasePrice') return consolidated.acquisitionPrice;
      if (colId === 'currentValue') return consolidated.currentValue;
      if (colId === 'ingresos') {
        const mainMetrics = getPropertyMetrics(item, filteredEntriesForPrint);
        const acc = item.accessoryPropertyId ? properties.find(prop => prop.id === item.accessoryPropertyId || prop.name === item.accessoryPropertyId) : null;
        const accMetrics = acc ? getPropertyMetrics(acc, filteredEntriesForPrint) : { ingresos: 0, gastos: 0, neto: 0 };
        return mainMetrics.ingresos + accMetrics.ingresos;
      }
      if (colId === 'gastos') {
        const mainMetrics = getPropertyMetrics(item, filteredEntriesForPrint);
        const acc = item.accessoryPropertyId ? properties.find(prop => prop.id === item.accessoryPropertyId || prop.name === item.accessoryPropertyId) : null;
        const accMetrics = acc ? getPropertyMetrics(acc, filteredEntriesForPrint) : { ingresos: 0, gastos: 0, neto: 0 };
        return mainMetrics.gastos + accMetrics.gastos;
      }
      if (colId === 'netYield') {
        const mainMetrics = getPropertyMetrics(item, filteredEntriesForPrint);
        const acc = item.accessoryPropertyId ? properties.find(prop => prop.id === item.accessoryPropertyId || prop.name === item.accessoryPropertyId) : null;
        const accMetrics = acc ? getPropertyMetrics(acc, filteredEntriesForPrint) : { ingresos: 0, gastos: 0, neto: 0 };
        return (mainMetrics.ingresos + accMetrics.ingresos) - (mainMetrics.gastos + accMetrics.gastos);
      }
      if (colId === 'catastral') return item.catastral || '';
      if (colId === 'cp') return item.cp || '';
      if (colId === 'accountNumber') return item.accountNumber || '';
      if (colId === 'activeTenant') return getActiveClientDisplayConsolidated(item);
      if (colId === 'capitalReformas') return consolidated.capitalizedReforms;
      if (colId === 'capitalAportado') return consolidated.investedCapital;
      if (colId === 'totalInversion') return consolidated.investedCapital + consolidated.capitalizedReforms;
      if (colId === 'theoreticalSalePrice') return consolidated.theoreticalSalePrice;
      if (colId === 'gastosCompraVenta') return consolidated.adquisitionExpenses;
    }

    if (templateId === 'alquileres') {
      if (colId === 'reference') return item.reference || '';
      if (colId === 'property') {
        const prop = properties.find(p => p.id === item.propertyId);
        return prop ? (prop.name || '') : (item.propertyId || '');
      }
      if (colId === 'tenants') {
        const cust = customers.find(c => c.id === item.tenantId);
        return item.tenants?.length > 0 
          ? item.tenants.map(t => t.name).join(', ') 
          : (cust ? cust.name : 'Ninguno');
      }
      if (colId === 'startDate') {
        if (item.rentalType === 'alquiler por habitaciones' && Array.isArray(item.rooms) && item.rooms.length > 0) {
          const dates = item.rooms.map(room => room.startDate).filter(Boolean);
          if (dates.length > 0) { dates.sort(); return dates[0]; }
        }
        return item.startDate || '';
      }
      if (colId === 'endDate') return item.endDate || '';
      if (colId === 'depositAmount') return parseFloat(item.depositAmount) || 0;
      if (colId === 'rentAmount') {
        const amt = parseFloat(item.rentAmount) || 0;
        const base = item.paymentPeriod === 'anual' ? amt / 12 : (item.paymentPeriod === 'trimestral' ? amt / 3 : amt);
        return base * (rentPeriod === 'anual' ? 12 : 1);
      }
      if (colId === 'expenses') {
        const base = (item.expenses || []).reduce((sum, exp) => {
          if (exp.includeInSum === false) return sum;
          let amt = parseFloat(exp.amount) || 0;
          if (exp.period === 'anual') return sum + amt / 12;
          if (exp.period === 'trimestral') return sum + amt / 3;
          return sum + amt;
        }, 0);
        return base * (rentPeriod === 'anual' ? 12 : 1);
      }
      if (colId === 'netYield') {
        const amt = parseFloat(item.rentAmount) || 0;
        const rent = item.paymentPeriod === 'anual' ? amt / 12 : (item.paymentPeriod === 'trimestral' ? amt / 3 : amt);
        const expenses = (item.expenses || []).reduce((sum, exp) => {
          if (exp.includeInSum === false) return sum;
          let a = parseFloat(exp.amount) || 0;
          if (exp.period === 'anual') return sum + a / 12;
          if (exp.period === 'trimestral') return sum + a / 3;
          return sum + a;
        }, 0);
        return (rent - expenses) * (rentPeriod === 'anual' ? 12 : 1);
      }
      if (colId === 'pctAlquiler') {
        const amt = parseFloat(item.rentAmount) || 0;
        const rent = item.paymentPeriod === 'anual' ? amt / 12 : (item.paymentPeriod === 'trimestral' ? amt / 3 : amt);
        const expenses = (item.expenses || []).reduce((sum, exp) => {
          if (exp.includeInSum === false) return sum;
          let a = parseFloat(exp.amount) || 0;
          if (exp.period === 'anual') return sum + a / 12;
          if (exp.period === 'trimestral') return sum + a / 3;
          return sum + a;
        }, 0);
        const netYield = rent - expenses;
        return rent > 0 ? netYield / rent : 0;
      }
      if (colId === 'ingresosExtracto') {
        return getRentalExtractMetrics(item, filteredEntriesForPrint).ingresos;
      }
      if (colId === 'gastosExtracto') {
        return getRentalExtractMetrics(item, filteredEntriesForPrint).gastos;
      }
      if (colId === 'rentaNetaExtracto') {
        return getRentalExtractMetrics(item, filteredEntriesForPrint).neto;
      }
      if (colId === 'pctIngresos') {
        const metrics = getRentalExtractMetrics(item, filteredEntriesForPrint);
        return metrics.ingresos > 0 ? metrics.neto / metrics.ingresos : 0;
      }
      if (colId === 'status') return item.status || 'activo';
    }

    if (templateId === 'clientes') {
      if (colId === 'id') return item.id || '';
      if (colId === 'name') return `${item.name || ''} ${item.lastName || ''}`.trim();
      if (colId === 'status') return item.status || 'activo';
      if (colId === 'propertyName') {
        const rent = rentals.find(r => r.tenantId === item.id || (r.tenants && r.tenants.some(t => t.id === item.id)));
        if (rent) {
          const prop = properties.find(p => p.id === rent.propertyId);
          if (prop) return prop.name || '';
        }
        return '';
      }
      if (colId === 'rentalRef') {
        const rent = rentals.find(r => r.tenantId === item.id || (r.tenants && r.tenants.some(t => t.id === item.id)));
        return rent ? (rent.reference || '') : '';
      }
    }

    return item[colId] ?? '';
  };

  const multiLevelSort = (list, templateId, rentalsList, propertiesList, sortCol1, sortDir1, sortCol2, sortDir2, entriesList) => {
    const sorted = [...list];

    const compareValues = (a, b, colId, dir) => {
      if (!colId || colId === 'none') return 0;
      const isDesc = dir === 'desc';

      const valA = getSortValue(a, colId, templateId);
      const valB = getSortValue(b, colId, templateId);

      if (valA === undefined || valA === null || valA === '') {
        if (valB === undefined || valB === null || valB === '') return 0;
        return 1;
      }
      if (valB === undefined || valB === null || valB === '') {
        return -1;
      }

      let result = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        result = valA - valB;
      } else {
        result = String(valA).localeCompare(String(valB), 'es', { sensitivity: 'base', numeric: true });
      }

      return isDesc ? -result : result;
    };

    sorted.sort((a, b) => {
      const res1 = compareValues(a, b, sortCol1, sortDir1);
      if (res1 !== 0) return res1;
      return compareValues(a, b, sortCol2, sortDir2);
    });

    return sorted;
  };

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
      if (propFilterDropdownRef.current && !propFilterDropdownRef.current.contains(e.target)) {
        setPropFilterDropdownOpen(false);
        setPropFilterSearch('');
      }
      if (rentFilterDropdownRef.current && !rentFilterDropdownRef.current.contains(e.target)) {
        setRentFilterDropdownOpen(false);
        setRentFilterSearch('');
      }
      if (ownerFilterDropdownRef.current && !ownerFilterDropdownRef.current.contains(e.target)) {
        setOwnerFilterDropdownOpen(false);
        setOwnerFilterSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Sync print settings/filters to localStorage
  useEffect(() => {
    localStorage.setItem('print_selectedTemplate', selectedTemplate);
    localStorage.setItem('print_rentPeriod', rentPeriod);
    localStorage.setItem('print_statusFilterAlquileres', statusFilterAlquileres);
    localStorage.setItem('print_statusFilterClientes', statusFilterClientes);
    localStorage.setItem('print_paperSize', paperSize);
    localStorage.setItem('print_pageOrientation', pageOrientation);
    localStorage.setItem('print_selectedYear', selectedYear.toString());
    localStorage.setItem('print_selectedYears', JSON.stringify(selectedYears));
    localStorage.setItem('print_selectedMonths', JSON.stringify(selectedMonths));
    localStorage.setItem('print_selectedQuarters', JSON.stringify(selectedQuarters));
    localStorage.setItem('print_selectedAccounts', JSON.stringify(selectedAccounts));
    localStorage.setItem('print_selectedCebes', JSON.stringify(selectedCebes));
    localStorage.setItem('print_selectedCecos', JSON.stringify(selectedCecos));
    localStorage.setItem('print_selectedDocuments', JSON.stringify(selectedDocuments));
    localStorage.setItem('print_hideZeroBalances', hideZeroBalances.toString());
    localStorage.setItem('print_showVerticalPercentage', showVerticalPercentage.toString());
    localStorage.setItem('print_showHorizontalPercentage', showHorizontalPercentage.toString());
    localStorage.setItem('print_displayMode', displayMode);
    localStorage.setItem('print_selectedComparisonYears', JSON.stringify(selectedComparisonYears));
    localStorage.setItem('print_selectedFilterProperties', JSON.stringify(selectedFilterProperties));
    localStorage.setItem('print_selectedFilterRentals', JSON.stringify(selectedFilterRentals));
    localStorage.setItem('print_selectedFilterOwners', JSON.stringify(selectedFilterOwners));
    localStorage.setItem('print_sortCol1', sortCol1);
    localStorage.setItem('print_sortDir1', sortDir1);
    localStorage.setItem('print_sortCol2', sortCol2);
    localStorage.setItem('print_sortDir2', sortDir2);
    localStorage.setItem('print_showSecondSortLevel', showSecondSortLevel.toString());
    localStorage.setItem('print_groupByOwner', groupByOwner.toString());
    localStorage.setItem('print_filterImpuesto', filterImpuesto.toString());
    localStorage.setItem('print_maxDigits', maxDigits.toString());
    localStorage.setItem('print_groupAccessoryAssets', groupAccessoryAssets.toString());
    
    // Serialize visibleColumns Sets to Arrays
    const serializedCols = Object.fromEntries(
      Object.entries(visibleColumns).map(([k, set]) => [k, Array.from(set || [])])
    );
    localStorage.setItem('print_visibleColumns', JSON.stringify(serializedCols));
    localStorage.setItem('print_columnOrder', JSON.stringify(columnOrder));
  }, [
    selectedTemplate, rentPeriod, statusFilterAlquileres, statusFilterClientes, paperSize, pageOrientation,
    selectedYear, selectedYears, selectedMonths, selectedQuarters, selectedAccounts,
    selectedCebes, selectedCecos, selectedDocuments, hideZeroBalances, showVerticalPercentage, showHorizontalPercentage,
    displayMode, selectedComparisonYears, selectedFilterProperties, selectedFilterRentals,
    selectedFilterOwners, sortCol1, sortDir1, sortCol2, sortDir2, showSecondSortLevel, groupByOwner,
    filterImpuesto, maxDigits, groupAccessoryAssets, visibleColumns, columnOrder
  ]);

  
  // Database collections states
  const [accounts, setAccounts] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [partners, setPartners] = useState([]);

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
    const unsubPartners = onSnapshot(
      query(collection(db, 'partners'), where('userId', 'in', userIds)),
      (snap) => setPartners(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    );

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
      unsubPartners();
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
    return num < 0 ? `(${formatted})` : `${formatted}\u00a0`;
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

  const chunkFlatListDynamic = (list, maxWeight = 28, getRowWeight = () => 1) => {
    const pages = [];
    let currentPage = [];
    let currentWeight = 0;

    list.forEach(item => {
      const w = getRowWeight(item);
      if (currentWeight + w > maxWeight && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [item];
        currentWeight = w;
      } else {
        currentPage.push(item);
        currentWeight += w;
      }
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  };

  // Reusable Page Header
  const renderPageHeader = (title) => {
    const yearLabel = selectedYears.length > 0 ? selectedYears.join(', ') : 'Todos los ejercicios';
    const subtitle = `Ejercicio Contable: ${yearLabel}${selectedMonths.length > 0 || selectedQuarters.length > 0 ? ` (${[...selectedQuarters, ...selectedMonths].join(', ')})` : ''}`;
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

    const paperDims = {
      'A4':     { w: 210, h: 297 },
      'A5':     { w: 148, h: 210 },
      'Letter': { w: 216, h: 279 },
    };
    const dims = paperDims[paperSize] || paperDims['A4'];
    const sheetH = pageOrientation === 'landscape' ? dims.w : dims.h;
    const heightRatio = Math.max(0.3, (sheetH - 45) / 252);
    const getLimit = (baseLimit) => Math.max(5, Math.floor(baseLimit * heightRatio));

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
      const entryPages = chunkDiario(yearEntries, getLimit(28));
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

      const mayorPages = chunkMayor(activeAccounts, getLimit(32));
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

      const listPages = chunkFlatList(list, getLimit(34));
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
      const cv = (colId) => isColVisible('activos', colId);
      
      const accessoryIds = new Set(
        properties
          .map(p => {
            if (!p.accessoryPropertyId) return null;
            const acc = properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId);
            return acc ? acc.id : null;
          })
          .filter(Boolean)
      );

      const filteredProperties = properties.filter(p => {
        const activePropFilters = selectedFilterProperties.activos || [];
        if (activePropFilters.length > 0 && !activePropFilters.includes(p.id)) return false;
        if (groupAccessoryAssets && accessoryIds.has(p.id)) return false;
        return true;
      });

      const sortedProperties = multiLevelSort(filteredProperties, 'activos', rentals, properties, sortCol1, sortDir1, sortCol2, sortDir2, filteredEntriesForPrint);

      const getRowWeight = (p) => {
        const tenantsStr = getActiveClientDisplayConsolidated(p);
        if (tenantsStr === '---' || !tenantsStr) return 1.0;
        const count = tenantsStr.split(', ').length;
        return 1.0 + (count - 1) * 0.45;
      };

      const listPages = chunkFlatListDynamic(sortedProperties, getLimit(24), getRowWeight);
      const totalPages = listPages.length || 1;

      if (filteredProperties.length === 0) {
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
                    <tr className="border-b border-slate-400 bg-slate-100 text-[9px] uppercase">
                      {cv('id') && <th className="py-1.5 px-2 text-left w-14 font-semibold">ID</th>}
                      {cv('name') && <th className="py-1.5 px-2 text-left w-32 font-semibold">Finca</th>}
                      {cv('address') && <th className="py-1.5 px-2 text-left font-semibold">Dirección</th>}
                      {cv('cebe_ceco') && <th className="py-1.5 px-2 text-left w-20 font-semibold">CEBE</th>}
                      {cv('accountingAccount') && <th className="py-1.5 px-2 text-center w-24 font-semibold">Cta. Contable</th>}
                      {cv('acquisitionDate') && <th className="py-1.5 px-2 text-center w-20 font-semibold">F. Adquisición</th>}
                      {cv('purchasePrice') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Precio Compra</th>}
                      {cv('currentValue') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Valor Actual</th>}
                      {cv('mortgagePending') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Hip. Pendiente</th>}
                      {cv('ingresos') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Ingresos</th>}
                      {cv('gastos') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Gastos</th>}
                      {cv('netYield') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Rend. Neto</th>}
                      {cv('catastral') && <th className="py-1.5 px-2 text-left w-24 font-semibold">Ref. Catastral</th>}
                      {cv('cp') && <th className="py-1.5 px-2 text-center w-16 font-semibold">C.P.</th>}
                      {cv('accountNumber') && <th className="py-1.5 px-2 text-left w-28 font-semibold">Nº Cuenta</th>}
                      {cv('activeTenant') && <th className="py-1.5 px-2 text-left w-28 font-semibold">Cliente (Activo)</th>}
                      {cv('capitalReformas') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Cap. Reformas</th>}
                      {cv('capitalAportado') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Cap. Aportado</th>}
                      {cv('totalInversion') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Total Inversión</th>}
                      {cv('theoreticalSalePrice') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Precio Venta</th>}
                      {cv('gastosCompraVenta') && <th className="py-1.5 px-2 text-right w-24 font-semibold">Gastos Compraventa</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p, ri) => {
                      const consolidated = getConsolidatedProperty(p, properties, rentals, filteredEntriesForPrint);
                      
                      const mainMetrics = getPropertyMetrics(p, filteredEntriesForPrint);
                      const acc = p.accessoryPropertyId ? properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId) : null;
                      const accMetrics = acc ? getPropertyMetrics(acc, filteredEntriesForPrint) : { ingresos: 0, gastos: 0, neto: 0 };
                      const metrics = {
                        ingresos: mainMetrics.ingresos + accMetrics.ingresos,
                        gastos: mainMetrics.gastos + accMetrics.gastos,
                        neto: mainMetrics.neto + accMetrics.neto
                      };

                      const propInvestedCapital = consolidated.investedCapital;
                      const propAdquisitionExpenses = consolidated.adquisitionExpenses;
                      const propCapitalizedReforms = consolidated.capitalizedReforms;
                      const propTotalInversion = propInvestedCapital + propCapitalizedReforms;
                      const propTheoreticalSalePrice = consolidated.theoreticalSalePrice;
                      const displayPurchasePrice = consolidated.acquisitionPrice;
                      const displayCurrentValue = consolidated.currentValue;
                      const displayMortgagePending = consolidated.mortgagePending;
                      
                      const hasValidAccount = p.accountingAccount && accounts.some(a => a.code === p.accountingAccount);
                      const displayAcqDate = p.purchaseDate || p.financials?.acquisitionDate || '';
                      
                      return (
                        <tr key={p.id} className="border-b border-slate-200 text-[9px] text-slate-800">
                          {cv('id') && <td className="py-1.5 px-2">{p.id}</td>}
                          {cv('name') && <td className="py-1.5 px-2 uppercase">{p.name}</td>}
                          {cv('address') && <td className="py-1.5 px-2 uppercase">{p.address}{p.city ? `, ${p.city}` : ''}</td>}
                          {cv('cebe_ceco') && <td className="py-1.5 px-2 uppercase">{p.cebe || '---'}</td>}
                          {cv('accountingAccount') && <td className="py-1.5 px-2 text-center">{hasValidAccount ? p.accountingAccount : '---'}</td>}
                          {cv('acquisitionDate') && <td className="py-1.5 px-2 text-center">{displayAcqDate ? formatDate(displayAcqDate) : '---'}</td>}
                          {cv('purchasePrice') && <td className="py-1.5 px-2 text-right tabular-nums">{displayPurchasePrice > 0 ? formatCurrency(displayPurchasePrice) : '---'}</td>}
                          {cv('currentValue') && <td className="py-1.5 px-2 text-right tabular-nums">{displayCurrentValue > 0 ? formatCurrency(displayCurrentValue) : '---'}</td>}
                          {cv('mortgagePending') && <td className="py-1.5 px-2 text-right tabular-nums">{displayMortgagePending > 0 ? formatCurrency(displayMortgagePending) : '0,00'}</td>}
                          {cv('ingresos') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(metrics.ingresos)}</td>}
                          {cv('gastos') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(metrics.gastos)}</td>}
                          {cv('netYield') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(metrics.neto)}</td>}
                          {cv('catastral') && <td className="py-1.5 px-2 font-mono uppercase">{p.catastral || '---'}</td>}
                          {cv('cp') && <td className="py-1.5 px-2 text-center">{p.cp || '---'}</td>}
                          {cv('accountNumber') && <td className="py-1.5 px-2 font-mono">{p.accountNumber || '---'}</td>}
                          {cv('activeTenant') && <td className="py-1.5 px-2 uppercase">{getActiveClientDisplayConsolidated(p)}</td>}
                          {cv('capitalReformas') && <td className="py-1.5 px-2 text-right tabular-nums">{propCapitalizedReforms > 0 ? formatCurrency(propCapitalizedReforms) : '---'}</td>}
                          {cv('capitalAportado') && <td className="py-1.5 px-2 text-right tabular-nums">{propInvestedCapital > 0 ? formatCurrency(propInvestedCapital) : '---'}</td>}
                          {cv('totalInversion') && <td className="py-1.5 px-2 text-right tabular-nums">{propTotalInversion > 0 ? formatCurrency(propTotalInversion) : '---'}</td>}
                          {cv('theoreticalSalePrice') && <td className="py-1.5 px-2 text-right tabular-nums">{propTheoreticalSalePrice > 0 ? formatCurrency(propTheoreticalSalePrice) : '---'}</td>}
                          {cv('gastosCompraVenta') && <td className="py-1.5 px-2 text-right tabular-nums">{propAdquisitionExpenses > 0 ? formatCurrency(propAdquisitionExpenses) : '---'}</td>}
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

    // 5. CONTRATOS DE ALQUILER
    if (selectedTemplate === 'alquileres') {
      const cv = (colId) => isColVisible('alquileres', colId);
      
      // Filter rentals based on state
      const filteredRentals = rentals.filter(r => {
        const status = r.status || 'activo';
        if (statusFilterAlquileres !== 'todos' && status !== statusFilterAlquileres) return false;
        
        const activePropFilters = selectedFilterProperties.alquileres || [];
        if (activePropFilters.length > 0 && !activePropFilters.includes(r.propertyId)) return false;
        
        const activeRentFilters = selectedFilterRentals.alquileres || [];
        if (activeRentFilters.length > 0 && !activeRentFilters.includes(r.reference)) return false;
        
        return true;
      });

      const sortedRentals = multiLevelSort(filteredRentals, 'alquileres', rentals, properties, sortCol1, sortDir1, sortCol2, sortDir2, filteredEntriesForPrint);

      const listPages = chunkFlatList(sortedRentals, getLimit(32));
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
        // Helper to get base monthly rent equivalent
        const getMonthlyRent = (r) => {
          const amt = parseFloat(r.rentAmount) || 0;
          if (r.paymentPeriod === 'anual') return amt / 12;
          if (r.paymentPeriod === 'trimestral') return amt / 3;
          return amt;
        };

        // Helper to get total monthly expenses sum
        const getMonthlyExpenses = (r) => {
          return (r.expenses || []).reduce((sum, exp) => {
            if (exp.includeInSum === false) return sum;
            let amt = parseFloat(exp.amount) || 0;
            if (exp.period === 'anual') return sum + amt / 12;
            if (exp.period === 'trimestral') return sum + amt / 3;
            return sum + amt;
          }, 0);
        };

        const getRentalStartDate = (r) => {
          if (r.rentalType === 'alquiler por habitaciones' && Array.isArray(r.rooms) && r.rooms.length > 0) {
            const dates = r.rooms
              .map(room => room.startDate)
              .filter(dateStr => !!dateStr);
            if (dates.length > 0) {
              dates.sort();
              return dates[0];
            }
          }
          return r.startDate;
        };

        const alquileresTotals = sortedRentals.reduce((acc, r) => {
          const baseRent = getMonthlyRent(r);
          const baseExpenses = getMonthlyExpenses(r);
          const monthsMultiplier = getSelectedMonthsCount();
          const rentVal = baseRent * monthsMultiplier;
          const expensesVal = baseExpenses * monthsMultiplier;
          const netYieldVal = rentVal - expensesVal;
          const extractMetrics = getRentalExtractMetrics(r, filteredEntriesForPrint);
          
          acc.depositAmount += r.depositAmount || 0;
          acc.rentAmount += rentVal;
          acc.expenses += expensesVal;
          acc.netYield += netYieldVal;
          acc.ingresosExtracto += extractMetrics.ingresos;
          acc.gastosExtracto += extractMetrics.gastos;
          acc.rentaNetaExtracto += extractMetrics.neto;
          return acc;
        }, {
          depositAmount: 0, rentAmount: 0, expenses: 0, netYield: 0,
          ingresosExtracto: 0, gastosExtracto: 0, rentaNetaExtracto: 0
        });
        
        const tPctAlquilerVal = alquileresTotals.rentAmount > 0 ? `${((alquileresTotals.netYield / alquileresTotals.rentAmount) * 100).toFixed(2)} %` : '---';
        const tPctIngresosVal = alquileresTotals.ingresosExtracto > 0 ? `${((alquileresTotals.rentaNetaExtracto / alquileresTotals.ingresosExtracto) * 100).toFixed(2)} %` : '---';

        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Listado de Contratos de Alquiler')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 text-[9px] uppercase">
                      {cv('reference') && <th className="py-1.5 px-2 text-left w-16 font-semibold">Referencia</th>}
                      {cv('property') && <th className="py-1.5 px-2 text-left w-36 font-semibold">Inmueble</th>}
                      {cv('tenants') && <th className="py-1.5 px-2 text-left font-semibold">Inquilinos</th>}
                      {cv('startDate') && <th className="py-1.5 px-2 text-center w-22 font-semibold">Fecha Inicio</th>}
                      {cv('endDate') && <th className="py-1.5 px-2 text-center w-22 font-semibold">Fecha Fin</th>}
                      {cv('depositAmount') && <th className="py-1.5 px-2 text-right w-20 font-semibold">Fianza</th>}
                      {cv('rentAmount') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Renta</th>}
                      {cv('expenses') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Gastos Asociados</th>}
                      {cv('netYield') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Rend. Neto</th>}
                      {cv('pctAlquiler') && <th className="py-1.5 px-2 text-right w-22 font-semibold">% Alquiler</th>}
                      {cv('ingresosExtracto') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Ingresos</th>}
                      {cv('gastosExtracto') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Gastos</th>}
                      {cv('rentaNetaExtracto') && <th className="py-1.5 px-2 text-right w-22 font-semibold">Renta Neta</th>}
                      {cv('pctIngresos') && <th className="py-1.5 px-2 text-right w-22 font-semibold">% Ingresos</th>}
                      {cv('status') && <th className="py-1.5 px-2 text-center w-16 font-semibold">Estado</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((r, ri) => {
                      const prop = properties.find(p => p.id === r.propertyId);
                      const cust = customers.find(c => c.id === r.tenantId);
                      
                      let tenantDisplay = 'Ninguno';
                      if (r.rentalType === 'alquiler por habitaciones' && Array.isArray(r.rooms)) {
                        const activeTenantNames = r.rooms
                          .filter(room => room.isActive !== false && room.tenantId)
                          .map(room => {
                            const c = customers.find(cust => cust.id === room.tenantId);
                            return c ? `${c.name || ''} ${c.lastName || ''}`.trim() : '';
                          })
                          .filter(name => !!name);
                        tenantDisplay = activeTenantNames.length > 0 ? activeTenantNames.join(', ') : 'Ninguno';
                      } else {
                        tenantDisplay = r.tenants?.length > 0 
                          ? r.tenants.map(t => t.name).join(', ') 
                          : (cust ? `${cust.name || ''} ${cust.lastName || ''}`.trim() : 'Ninguno');
                      }

                      const baseRent = getMonthlyRent(r);
                      const baseExpenses = getMonthlyExpenses(r);

                      const monthsMultiplier = getSelectedMonthsCount();
                      const rentVal = baseRent * monthsMultiplier;
                      const expensesVal = baseExpenses * monthsMultiplier;
                      const netYieldVal = rentVal - expensesVal;
                      
                      const startDateVal = getRentalStartDate(r);
                      const extractMetrics = getRentalExtractMetrics(r, filteredEntriesForPrint);
                      
                      const pctAlquilerVal = rentVal > 0 ? `${((netYieldVal / rentVal) * 100).toFixed(2)} %` : '---';
                      const pctIngresosVal = extractMetrics.ingresos > 0 ? `${((extractMetrics.neto / extractMetrics.ingresos) * 100).toFixed(2)} %` : '---';

                      return (
                        <tr key={r.id || r.reference} className="border-b border-slate-200 text-[9px] text-slate-800">
                          {cv('reference') && <td className="py-1.5 px-2">{r.reference || '---'}</td>}
                          {cv('property') && <td className="py-1.5 px-2 uppercase">{prop ? prop.name : r.propertyId}</td>}
                          {cv('tenants') && <td className="py-1.5 px-2 uppercase">{tenantDisplay}</td>}
                          {cv('startDate') && <td className="py-1.5 px-2 text-center">{startDateVal ? formatDate(startDateVal) : '---'}</td>}
                          {cv('endDate') && <td className="py-1.5 px-2 text-center">{r.endDate ? formatDate(r.endDate) : '--'}</td>}
                          {cv('depositAmount') && <td className="py-1.5 px-2 text-right tabular-nums">{r.depositAmount > 0 ? formatCurrency(r.depositAmount) : '---'}</td>}
                          {cv('rentAmount') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(rentVal)}</td>}
                          {cv('expenses') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(expensesVal)}</td>}
                          {cv('netYield') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(netYieldVal)}</td>}
                          {cv('pctAlquiler') && <td className="py-1.5 px-2 text-right tabular-nums">{pctAlquilerVal}</td>}
                          {cv('ingresosExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(extractMetrics.ingresos)}</td>}
                          {cv('gastosExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(extractMetrics.gastos)}</td>}
                          {cv('rentaNetaExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(extractMetrics.neto)}</td>}
                          {cv('pctIngresos') && <td className="py-1.5 px-2 text-right tabular-nums">{pctIngresosVal}</td>}
                          {cv('status') && <td className="py-1.5 px-2 text-center uppercase text-[8px]">{r.status || 'activo'}</td>}
                        </tr>
                      );
                    })}
                    {pageIdx === listPages.length - 1 && (
                      <tr className="border-t border-slate-400 bg-slate-50 font-bold text-[9px] text-slate-800">
                        {cv('reference') && <td className="py-1.5 px-2">TOTALES</td>}
                        {cv('property') && <td className="py-1.5 px-2"></td>}
                        {cv('tenants') && <td className="py-1.5 px-2"></td>}
                        {cv('startDate') && <td className="py-1.5 px-2"></td>}
                        {cv('endDate') && <td className="py-1.5 px-2"></td>}
                        {cv('depositAmount') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.depositAmount)}</td>}
                        {cv('rentAmount') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.rentAmount)}</td>}
                        {cv('expenses') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.expenses)}</td>}
                        {cv('netYield') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.netYield)}</td>}
                        {cv('pctAlquiler') && <td className="py-1.5 px-2 text-right tabular-nums">{tPctAlquilerVal}</td>}
                        {cv('ingresosExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.ingresosExtracto)}</td>}
                        {cv('gastosExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.gastosExtracto)}</td>}
                        {cv('rentaNetaExtracto') && <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(alquileresTotals.rentaNetaExtracto)}</td>}
                        {cv('pctIngresos') && <td className="py-1.5 px-2 text-right tabular-nums">{tPctIngresosVal}</td>}
                        {cv('status') && <td className="py-1.5 px-2"></td>}
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

    // 6. FICHERO DE CLIENTES / INQUILINOS
    if (selectedTemplate === 'clientes') {
      const cv = (colId) => isColVisible('clientes', colId);

      // Filter customers based on state and only active rentals
      const seenNames = new Set();
      const filteredCustomers = customers.filter(c => {
        const status = c.status || 'activo';
        if (statusFilterClientes !== 'todos' && status !== statusFilterClientes) return false;
        
        // Only include customers with an active rental contract
        const hasActiveRental = rentals.some(r => 
          (r.tenantId === c.id || (r.tenants && r.tenants.some(t => t.id === c.id))) && 
          (r.status || 'activo') === 'activo'
        );
        if (!hasActiveRental) return false;

        const activePropFilters = selectedFilterProperties.clientes || [];
        if (activePropFilters.length > 0) {
          const matchesAny = activePropFilters.some(pid => isCustomerAssociatedWithProperty(c, pid, rentals, properties));
          if (!matchesAny) return false;
        }

        // Deduplicate by name + DNI to avoid showing duplicate rows
        const nameKey = `${(c.name || '').trim()} ${(c.lastName || '').trim()} - ${(c.dni || '').trim()}`.toLowerCase();
        if (seenNames.has(nameKey)) return false;
        seenNames.add(nameKey);

        return true;
      });

      const sortedCustomers = multiLevelSort(filteredCustomers, 'clientes', rentals, properties, sortCol1, sortDir1, sortCol2, sortDir2, filteredEntriesForPrint);

      const listPages = chunkFlatList(sortedCustomers, getLimit(34));
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
                    <tr className="border-b border-slate-400 bg-slate-100 text-[9px] uppercase">
                      {cv('id') && <th className="py-1.5 px-2 text-left w-16 font-semibold">ID</th>}
                      {cv('name') && <th className="py-1.5 px-2 text-left w-36 font-semibold">Nombre Completo</th>}
                      {cv('dni') && <th className="py-1.5 px-2 text-left w-24 font-semibold">NIF/DNI</th>}
                      {cv('phone') && <th className="py-1.5 px-2 text-left w-24 font-semibold">Teléfono</th>}
                      {cv('email') && <th className="py-1.5 px-2 text-left font-semibold">Email</th>}
                      {cv('address') && <th className="py-1.5 px-2 text-left w-36 font-semibold">Dirección</th>}
                      {cv('nationality') && <th className="py-1.5 px-2 text-left w-20 font-semibold">Nac.</th>}
                      {cv('propertyName') && <th className="py-1.5 px-2 text-left font-semibold">Inmueble</th>}
                      {cv('rentalRef') && <th className="py-1.5 px-2 text-left w-24 font-semibold">Ref. Alquiler</th>}
                      {cv('status') && <th className="py-1.5 px-2 text-center w-16 font-semibold">Estado</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((c, ri) => {
                      // Find if this customer belongs to any rental by ref, id, or tenant relationship
                      const rent = rentals.find(r => 
                        (r.id && c.rentalReference && r.id === c.rentalReference) || 
                        (r.reference && c.rentalReference && r.reference === c.rentalReference) ||
                        r.tenantId === c.id || 
                        (r.tenants && r.tenants.some(t => t.id === c.id))
                      );
                      const prop = rent ? properties.find(p => p.id === rent.propertyId) : null;
                      
                      let propNameDisplay = '---';
                      let rentalRefDisplay = '---';
                      if (rent) {
                        propNameDisplay = prop ? prop.name : rent.propertyId;
                        rentalRefDisplay = rent.reference || '---';
                      } else if (c.floor || (Array.isArray(c.floors) && c.floors.length > 0)) {
                        propNameDisplay = c.floor || c.floors.join(', ');
                      }

                      return (
                        <tr key={c.id} className="border-b border-slate-200 text-[9px] text-slate-800">
                          {cv('id') && <td className="py-1.5 px-2">{c.id?.substring(0, 6)}</td>}
                          {cv('name') && <td className="py-1.5 px-2 uppercase">{c.name} {c.lastName || ''}</td>}
                          {cv('dni') && <td className="py-1.5 px-2 uppercase">{c.dni || '---'}</td>}
                          {cv('phone') && <td className="py-1.5 px-2">{c.phone || '---'}</td>}
                          {cv('email') && <td className="py-1.5 px-2 lowercase truncate max-w-[140px]" title={c.email}>{c.email || '---'}</td>}
                          {cv('address') && <td className="py-1.5 px-2 uppercase">{c.address || '---'}</td>}
                          {cv('nationality') && <td className="py-1.5 px-2">{c.nationality || '---'}</td>}
                          {cv('propertyName') && <td className="py-1.5 px-2 uppercase">{propNameDisplay}</td>}
                          {cv('rentalRef') && <td className="py-1.5 px-2 uppercase">{rentalRefDisplay}</td>}
                          {cv('status') && <td className="py-1.5 px-2 text-center uppercase text-[8px]">{c.status || 'activo'}</td>}
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

    // 6b. EXTRACTO DE PROPIETARIOS
    if (selectedTemplate === 'extracto_propietarios') {
      const cv = (colId) => isColVisible('extracto_propietarios', colId);
      // Build rows: for each property → for each owner → one row
      const accessoryIds = new Set(
        properties
          .map(p => {
            if (!p.accessoryPropertyId) return null;
            const acc = properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId);
            return acc ? acc.id : null;
          })
          .filter(Boolean)
      );

      const ownerRows = [];
      properties.forEach(p => {
        if (groupAccessoryAssets && accessoryIds.has(p.id)) return;
        
        const ownersArr = Array.isArray(p.owners) ? p.owners : [];
        const cp = getConsolidatedProperty(p, properties, rentals, filteredEntriesForPrint);
        const propAcquisitionPrice = cp.acquisitionPrice;
        const propInvestedCapital = cp.investedCapital;
        const propAdquisitionExpenses = cp.adquisitionExpenses;
        const propCapitalizedReforms = cp.capitalizedReforms;
        const propCurrentValue = cp.currentValue;
        
        // Computed composite columns (property total, before applying % owner)
        const propAcqPlusExpenses = propAcquisitionPrice + propAdquisitionExpenses;
        const propCapReforma = propInvestedCapital + propCapitalizedReforms;
        
        // Ganancia bruta = valor actual - (capital aportado + reforma capitalizable)
        const propGanancia = propCurrentValue - propCapReforma;
        const propMortgagePending = cp.mortgagePending;
        // Ganancia neta = valor actual - hipoteca pendiente - (capital aportado + reforma capitalizable)
        const propGananciaNeta = propGanancia - propMortgagePending;
        // Ganancia real + Rend.neto = Ganancia neta + ingresos netos
        const propRealReturn = propGananciaNeta + cp.rendimientoNetoExtracto;

        ownersArr.forEach(o => {
          const perc = (o.percentage || 0) / 100;
          if (perc > 0) {
            ownerRows.push({
              type: 'group-item',
              partnerName: o.name || '---',
              partnerNif: o.nif || '---',
              propertyName: p.name || p.id,
              propertyId: p.id,
              percentage: o.percentage,
              acquisitionPrice: propAcquisitionPrice,
              investedCapital: propInvestedCapital,
              adquisitionExpenses: propAdquisitionExpenses,
              acqPlusExpenses: propAcqPlusExpenses,
              capitalReforma: propCapReforma,
              currentValue: propCurrentValue,
              ingresosExtracto: cp.ingresosExtracto,
              gastosExtracto: cp.gastosExtracto,
              rendimientoNetoExtracto: cp.rendimientoNetoExtracto,
              mortgagePending: propMortgagePending,
              gain: propGanancia,
              netGain: propGananciaNeta,
              realReturn: propRealReturn
            });
          }
        });
        
        // Add residual to main owner if total < 100% (with a threshold for rounding like 99.99%)
        const totalPct = ownersArr.reduce((sum, o) => sum + (o.percentage || 0), 0);
        if (ownersArr.length > 0 && totalPct < 99.9) {
          ownerRows.push({
            type: 'group-item',
            partnerName: 'PROPIETARIO PRINCIPAL',
            partnerNif: '---',
            propertyName: p.name || p.id,
            propertyId: p.id,
            percentage: 100 - totalPct,
            acquisitionPrice: propAcquisitionPrice,
            investedCapital: propInvestedCapital,
            adquisitionExpenses: propAdquisitionExpenses,
            acqPlusExpenses: propAcqPlusExpenses,
            capitalReforma: propCapReforma,
            currentValue: propCurrentValue,
            ingresosExtracto: cp.ingresosExtracto,
            gastosExtracto: cp.gastosExtracto,
            rendimientoNetoExtracto: cp.rendimientoNetoExtracto,
            mortgagePending: propMortgagePending,
            gain: propGanancia,
            netGain: propGananciaNeta,
            realReturn: propRealReturn
          });
        }
        
        if (ownersArr.length === 0) {
          ownerRows.push({
            type: 'group-item',
            partnerName: '(Sin propietario asignado)',
            partnerNif: '---',
            propertyName: p.name || p.id,
            propertyId: p.id,
            percentage: 100,
            acquisitionPrice: propAcquisitionPrice,
            investedCapital: propInvestedCapital,
            adquisitionExpenses: propAdquisitionExpenses,
            acqPlusExpenses: propAcqPlusExpenses,
            capitalReforma: propCapReforma,
            currentValue: propCurrentValue,
            ingresosExtracto: cp.ingresosExtracto,
            gastosExtracto: cp.gastosExtracto,
            rendimientoNetoExtracto: cp.rendimientoNetoExtracto,
            mortgagePending: propMortgagePending,
            gain: propGanancia,
            netGain: propGananciaNeta,
            realReturn: propRealReturn
          });
        }
      });

      const filteredOwnerRows = ownerRows.filter(row => {
        const activePropFilters = selectedFilterProperties.extracto_propietarios || [];
        if (activePropFilters.length > 0 && !activePropFilters.includes(row.propertyId)) return false;
        
        const activeOwnerFilters = selectedFilterOwners.extracto_propietarios || [];
        if (activeOwnerFilters.length > 0 && !activeOwnerFilters.includes(row.partnerName)) return false;
        
        return true;
      });

      const sortedOwnerRows = multiLevelSort(filteredOwnerRows, 'extracto_propietarios', rentals, properties, sortCol1, sortDir1, sortCol2, sortDir2, filteredEntriesForPrint);

      // Group by partner name
      const partnerGroups = {};
      sortedOwnerRows.forEach(r => {
        if (!partnerGroups[r.partnerName]) partnerGroups[r.partnerName] = [];
        partnerGroups[r.partnerName].push(r);
      });

      // Calculate totals for summation row (only relevant for flat mode)
      const totals = sortedOwnerRows.reduce((acc, r) => {
        acc.acquisitionPrice += r.acquisitionPrice || 0;
        acc.investedCapital += r.investedCapital || 0;
        acc.adquisitionExpenses += r.adquisitionExpenses || 0;
        acc.acqPlusExpenses += r.acqPlusExpenses || 0;
        acc.capitalReforma += r.capitalReforma || 0;
        acc.currentValue += r.currentValue || 0;
        acc.gain += r.gain || 0;
        acc.mortgagePending += r.mortgagePending || 0;
        acc.netGain += r.netGain || 0;
        acc.ingresosExtracto += r.ingresosExtracto || 0;
        acc.gastosExtracto += r.gastosExtracto || 0;
        acc.rendimientoNetoExtracto += r.rendimientoNetoExtracto || 0;
        acc.realReturn += r.realReturn || 0;
        return acc;
      }, { 
        acquisitionPrice: 0, 
        investedCapital: 0, 
        adquisitionExpenses: 0,
        acqPlusExpenses: 0,
        capitalReforma: 0, 
        currentValue: 0, 
        gain: 0,
        mortgagePending: 0,
        netGain: 0,
        ingresosExtracto: 0,
        gastosExtracto: 0,
        rendimientoNetoExtracto: 0,
        realReturn: 0
      });

      let listPages = [];
      let totalPages = 1;
      let ownerBlocks = [];

      if (groupByOwner) {
        // Build blocks: each owner is a block containing owner header, owner rows, and owner subtotal
        ownerBlocks = Object.entries(partnerGroups).map(([pName, rows]) => {
          const acqSum = rows.reduce((s, r) => s + (r.acquisitionPrice || 0), 0);
          const invSum = rows.reduce((s, r) => s + (r.investedCapital || 0), 0);
          const adqSum = rows.reduce((s, r) => s + (r.adquisitionExpenses || 0), 0);
          const acqPlusSum = rows.reduce((s, r) => s + (r.acqPlusExpenses || 0), 0);
          const capRefSum = rows.reduce((s, r) => s + (r.capitalReforma || 0), 0);
          const valSum = rows.reduce((s, r) => s + (r.currentValue || 0), 0);
          const gainSum = rows.reduce((s, r) => s + (r.gain || 0), 0);
          const mortgageSum = rows.reduce((s, r) => s + (r.mortgagePending || 0), 0);
          const netGainSum = rows.reduce((s, r) => s + (r.netGain || 0), 0);
          const ingresosSum = rows.reduce((s, r) => s + (r.ingresosExtracto || 0), 0);
          const gastosSum = rows.reduce((s, r) => s + (r.gastosExtracto || 0), 0);
          const rendNetoSum = rows.reduce((s, r) => s + (r.rendimientoNetoExtracto || 0), 0);
          const realReturnSum = rows.reduce((s, r) => s + (r.realReturn || 0), 0);
          
          return [
            { type: 'group-header', label: pName },
            ...rows.map(r => ({ ...r, type: 'group-item' })),
            { 
              type: 'group-total', 
              label: pName, 
              acquisitionPrice: acqSum, 
              investedCapital: invSum,
              adquisitionExpenses: adqSum,
              acqPlusExpenses: acqPlusSum,
              capitalReforma: capRefSum, 
              currentValue: valSum, 
              gain: gainSum,
              mortgagePending: mortgageSum,
              netGain: netGainSum,
              ingresosExtracto: ingresosSum,
              gastosExtracto: gastosSum,
              rendimientoNetoExtracto: rendNetoSum,
              realReturn: realReturnSum
            }
          ];
        }).filter(b => b.length > 0);
        
        listPages = paginateBlocks(ownerBlocks, getLimit(22), Math.max(2, Math.floor(6 * heightRatio)));
        totalPages = listPages.length || 1;
      } else {
        // Group by inmueble: each property is a block with a property header, owner rows, and subtotal
        const propertyGroups = {};
        sortedOwnerRows.forEach(r => {
          if (!propertyGroups[r.propertyId]) propertyGroups[r.propertyId] = { propertyName: r.propertyName, rows: [] };
          propertyGroups[r.propertyId].rows.push(r);
        });
        const propertyBlocks = Object.entries(propertyGroups).map(([pId, { propertyName, rows }]) => {
          const ingresosSum = rows.reduce((s, r) => s + (r.ingresosExtracto || 0), 0);
          const gastosSum = rows.reduce((s, r) => s + (r.gastosExtracto || 0), 0);
          const rendNetoSum = rows.reduce((s, r) => s + (r.rendimientoNetoExtracto || 0), 0);
          const acqSum = rows.reduce((s, r) => s + (r.acquisitionPrice || 0), 0);
          const invSum = rows.reduce((s, r) => s + (r.investedCapital || 0), 0);
          const adqSum = rows.reduce((s, r) => s + (r.adquisitionExpenses || 0), 0);
          const acqPlusSum = rows.reduce((s, r) => s + (r.acqPlusExpenses || 0), 0);
          const capRefSum = rows.reduce((s, r) => s + (r.capitalReforma || 0), 0);
          const valSum = rows.reduce((s, r) => s + (r.currentValue || 0), 0);
          const gainSum = rows.reduce((s, r) => s + (r.gain || 0), 0);
          const mortgageSum = rows.reduce((s, r) => s + (r.mortgagePending || 0), 0);
          const netGainSum = rows.reduce((s, r) => s + (r.netGain || 0), 0);
          const realReturnSum = rows.reduce((s, r) => s + (r.realReturn || 0), 0);
          return [
            { type: 'property-header', label: propertyName },
            ...rows.map(r => ({ ...r, type: 'group-item' })),
            { type: 'group-total', label: propertyName, ingresosExtracto: ingresosSum, gastosExtracto: gastosSum, rendimientoNetoExtracto: rendNetoSum,
              acquisitionPrice: acqSum, investedCapital: invSum, adquisitionExpenses: adqSum, acqPlusExpenses: acqPlusSum,
              capitalReforma: capRefSum, currentValue: valSum, gain: gainSum, mortgagePending: mortgageSum, netGain: netGainSum, realReturn: realReturnSum }
          ];
        }).filter(b => b.length > 0);
        listPages = paginateBlocks(propertyBlocks, getLimit(22), Math.max(2, Math.floor(6 * heightRatio)));
        totalPages = listPages.length || 1;
      }

      if (sortedOwnerRows.length === 0) {
        pageViews.push(
          <div key="empty-prop" className="page-sheet relative">
            {renderPageHeader('Extracto de Propietarios')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay activos con propietarios asignados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          const visibleCols = (ALL_COLUMNS.extracto_propietarios || []).filter(col => cv(col.id));
          const firstVisibleId = visibleCols[0]?.id;

          pageViews.push(
            <div key={`eprop-${pageIdx}`} className="page-sheet relative">
              <div>
                {renderPageHeader('Extracto de Propietarios')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 text-[9px] uppercase">
                      {visibleCols.map(col => {
                        let align = 'text-right';
                        if (['name', 'nif', 'property'].includes(col.id)) align = 'text-left';
                        let width = 'w-24';
                        if (col.id === 'name') width = 'w-36';
                        else if (col.id === 'nif') width = 'w-24';
                        else if (col.id === 'acqPlusExpenses') width = 'w-28';
                        else if (col.id === 'capitalReforma') width = 'w-28';
                        else if (col.id === 'realReturn') width = 'w-32';
                        else if (col.id === 'percentage') width = 'w-14';

                        return (
                          <th key={col.id} className={`py-1.5 px-2 ${align} ${width} font-semibold`}>
                            {col.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((row, ri) => {
                      const visibleCount = visibleCols.length;

                      if (row.type === 'group-header') {
                        return (
                          <tr key={`ghead-${row.label}-${ri}`} className="bg-slate-100/50 font-bold border-t border-slate-350">
                            <td colSpan={visibleCount} className="py-2 px-2 text-[10px] text-slate-800 font-sans tracking-wide uppercase">
                              PROPIETARIO: {row.label}
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === 'property-header') {
                        return (
                          <tr key={`phead-${row.label}-${ri}`} className="bg-slate-100/50 font-bold border-t border-slate-350">
                            <td colSpan={visibleCount} className="py-2 px-2 text-[10px] text-slate-800 font-sans tracking-wide uppercase">
                              INMUEBLE: {row.label}
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === 'group-total') {
                        return (
                          <tr key={`gtotal-${row.label}-${ri}`} className="bg-slate-50 font-bold border-t border-slate-300 border-b-2 border-slate-450 text-[9px] text-slate-850">
                            {visibleCols.map(col => {
                              let align = 'text-right';
                              if (['name', 'nif', 'property'].includes(col.id)) align = 'text-left';

                              if (col.id === firstVisibleId) {
                                return (
                                  <td key={col.id} className={`py-1.5 px-2 ${align} font-bold font-sans`}>
                                    SUBTOTAL
                                  </td>
                                );
                              }

                              if (['name', 'nif', 'property', 'percentage'].includes(col.id)) {
                                return <td key={col.id} className="py-1.5 px-2"></td>;
                              }

                              let valDisplay = '---';
                              if (col.id === 'acquisitionPrice') valDisplay = formatCurrency(row.acquisitionPrice || 0);
                              else if (col.id === 'investedCapital') valDisplay = formatCurrency(row.investedCapital || 0);
                              else if (col.id === 'adquisitionExpenses') valDisplay = formatCurrency(row.adquisitionExpenses || 0);
                              else if (col.id === 'acqPlusExpenses') valDisplay = formatCurrency(row.acqPlusExpenses || 0);
                              else if (col.id === 'capitalReforma') valDisplay = formatCurrency(row.capitalReforma || 0);
                              else if (col.id === 'currentValue') valDisplay = formatCurrency(row.currentValue || 0);
                              else if (col.id === 'ingresosExtracto') valDisplay = formatCurrency(row.ingresosExtracto || 0);
                              else if (col.id === 'gastosExtracto') valDisplay = formatCurrency(-(row.gastosExtracto || 0));
                              else if (col.id === 'rendimientoNetoExtracto') valDisplay = formatCurrency(row.rendimientoNetoExtracto || 0);
                              else if (col.id === 'mortgagePending') valDisplay = formatCurrency(row.mortgagePending || 0);
                              else if (col.id === 'gain') valDisplay = formatCurrency(row.gain || 0);
                              else if (col.id === 'netGain') valDisplay = formatCurrency(row.netGain || 0);
                              else if (col.id === 'realReturn') valDisplay = formatCurrency(row.realReturn || 0);

                              const isSpan = ['rendimientoNetoExtracto', 'gain', 'netGain', 'realReturn'].includes(col.id);

                              return (
                                <td key={col.id} className={`py-1.5 px-2 ${align} tabular-nums`}>
                                  {isSpan ? <span>{valDisplay}</span> : valDisplay}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }

                      return (
                        <tr key={`${row.partnerName}-${row.propertyId}-${ri}`} className="border-b border-slate-200 text-[9px] text-slate-800">
                          {visibleCols.map(col => {
                            let align = 'text-right';
                            if (['name', 'nif', 'property'].includes(col.id)) align = 'text-left';

                            let valDisplay = '---';
                            if (col.id === 'name') valDisplay = groupByOwner ? '' : row.partnerName;
                            else if (col.id === 'nif') valDisplay = groupByOwner ? '' : row.partnerNif;
                            else if (col.id === 'property') valDisplay = row.propertyName;
                            else if (col.id === 'percentage') valDisplay = `${row.percentage.toFixed(2)}%`;
                            else if (col.id === 'acquisitionPrice') valDisplay = (row.acquisitionPrice || 0) > 0 ? formatCurrency(row.acquisitionPrice) : '---';
                            else if (col.id === 'investedCapital') valDisplay = (row.investedCapital || 0) > 0 ? formatCurrency(row.investedCapital) : '---';
                            else if (col.id === 'adquisitionExpenses') valDisplay = (row.adquisitionExpenses || 0) > 0 ? formatCurrency(row.adquisitionExpenses) : '---';
                            else if (col.id === 'acqPlusExpenses') valDisplay = (row.acqPlusExpenses || 0) > 0 ? formatCurrency(row.acqPlusExpenses) : '---';
                            else if (col.id === 'capitalReforma') valDisplay = (row.capitalReforma || 0) > 0 ? formatCurrency(row.capitalReforma) : '---';
                            else if (col.id === 'currentValue') valDisplay = (row.currentValue || 0) > 0 ? formatCurrency(row.currentValue) : '---';
                            else if (col.id === 'ingresosExtracto') valDisplay = (row.ingresosExtracto || 0) > 0 ? formatCurrency(row.ingresosExtracto) : '---';
                            else if (col.id === 'gastosExtracto') valDisplay = (row.gastosExtracto || 0) > 0 ? formatCurrency(-row.gastosExtracto) : '---';
                            else if (col.id === 'rendimientoNetoExtracto') valDisplay = formatCurrency(row.rendimientoNetoExtracto || 0);
                            else if (col.id === 'mortgagePending') valDisplay = (row.mortgagePending || 0) > 0 ? formatCurrency(row.mortgagePending) : '---';
                            else if (col.id === 'gain') valDisplay = formatCurrency(row.gain || 0);
                            else if (col.id === 'netGain') valDisplay = formatCurrency(row.netGain || 0);
                            else if (col.id === 'realReturn') valDisplay = formatCurrency(row.realReturn || 0);

                            const isSpan = ['rendimientoNetoExtracto', 'gain', 'netGain', 'realReturn'].includes(col.id);

                            return (
                              <td key={col.id} className={`py-1.5 px-2 ${align} tabular-nums`}>
                                {isSpan ? <span>{valDisplay}</span> : valDisplay}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Summation TOTAL row at the end of the last page (only for flat list) */}
                    {!groupByOwner && isLastPage && (
                      <tr className="bg-slate-150 font-bold border-t-2 border-slate-400 text-[9px] text-slate-800">
                        {visibleCols.map(col => {
                          let align = 'text-right';
                          if (['name', 'nif', 'property'].includes(col.id)) align = 'text-left';

                          if (col.id === firstVisibleId) {
                            return (
                              <td key={col.id} className={`py-1.5 px-2 ${align} font-bold`}>
                                TOTAL
                              </td>
                            );
                          }

                          if (['name', 'nif', 'property', 'percentage'].includes(col.id)) {
                            return <td key={col.id} className="py-1.5 px-2"></td>;
                          }

                          let valDisplay = '---';
                          if (col.id === 'acquisitionPrice') valDisplay = formatCurrency(totals.acquisitionPrice);
                          else if (col.id === 'investedCapital') valDisplay = formatCurrency(totals.investedCapital || 0);
                          else if (col.id === 'adquisitionExpenses') valDisplay = formatCurrency(totals.adquisitionExpenses || 0);
                          else if (col.id === 'acqPlusExpenses') valDisplay = formatCurrency(totals.acqPlusExpenses || 0);
                          else if (col.id === 'capitalReforma') valDisplay = formatCurrency(totals.capitalReforma);
                          else if (col.id === 'currentValue') valDisplay = formatCurrency(totals.currentValue);
                          else if (col.id === 'ingresosExtracto') valDisplay = formatCurrency(totals.ingresosExtracto);
                          else if (col.id === 'gastosExtracto') valDisplay = formatCurrency(-totals.gastosExtracto);
                          else if (col.id === 'rendimientoNetoExtracto') valDisplay = formatCurrency(totals.rendimientoNetoExtracto);
                          else if (col.id === 'mortgagePending') valDisplay = formatCurrency(totals.mortgagePending);
                          else if (col.id === 'gain') valDisplay = formatCurrency(totals.gain);
                          else if (col.id === 'netGain') valDisplay = formatCurrency(totals.netGain);
                          else if (col.id === 'realReturn') valDisplay = formatCurrency(totals.realReturn);

                          const isSpan = ['rendimientoNetoExtracto', 'gain', 'netGain', 'realReturn'].includes(col.id);

                          return (
                            <td key={col.id} className={`py-1.5 px-2 ${align} tabular-nums`}>
                              {isSpan ? <span>{valDisplay}</span> : valDisplay}
                            </td>
                          );
                        })}
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

    // 7. CARTERA DE RENTA VARIABLE

    if (selectedTemplate === 'metricas_inversion') {
      const cv = (colId) => isColVisible('metricas_inversion', colId);
      
      const accessoryIds = new Set(
        properties
          .map(p => {
            if (!p.accessoryPropertyId) return null;
            const acc = properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId);
            return acc ? acc.id : null;
          })
          .filter(Boolean)
      );

      const ownerRows = [];
      properties.forEach(p => {
        if (groupAccessoryAssets && accessoryIds.has(p.id)) return;

        const activePropFilters = selectedFilterProperties.metricas_inversion || [];
        if (activePropFilters.length > 0 && !activePropFilters.includes(p.id)) return;

        const activeRentFilters = selectedFilterRentals.metricas_inversion || [];
        if (activeRentFilters.length > 0) {
          const pRentals = rentals.filter(r => r.propertyId === p.id).map(r => r.reference);
          if (!activeRentFilters.some(ref => pRentals.includes(ref))) return;
        }

        let ownersArr = Array.isArray(p.owners) && p.owners.length > 0 ? p.owners : [{ name: 'Sin Propietario', percentage: 100 }];

        const consolidated = getConsolidatedProperty(p, properties, rentals, filteredEntriesForPrint);
        const mainMetrics = getPropertyMetrics(p, filteredEntriesForPrint);
        const acc = p.accessoryPropertyId ? properties.find(prop => prop.id === p.accessoryPropertyId || prop.name === p.accessoryPropertyId) : null;
        const accMetrics = acc ? getPropertyMetrics(acc, filteredEntriesForPrint) : { ingresos: 0, gastos: 0, neto: 0 };
        
        const baseIngresos = mainMetrics.ingresos + accMetrics.ingresos;
        const baseGastos = mainMetrics.gastos + accMetrics.gastos;
        const baseNeto = mainMetrics.neto + accMetrics.neto;
        const baseInvested = consolidated.investedCapital || 0;
        const baseAcqPrice = consolidated.acquisitionPrice || 0;

        ownersArr.forEach(o => {
          const activeOwnerFilters = selectedFilterOwners.metricas_inversion || [];
          if (activeOwnerFilters.length > 0 && !activeOwnerFilters.includes(o.name)) return;
          
          const pct = parseFloat(o.percentage) || 100;
          const factor = pct / 100;

          ownerRows.push({
            pId: p.id,
            pName: p.name,
            ownerName: o.name || '---',
            percentage: pct,
            ingresosAnuales: baseIngresos * factor,
            gastosAnuales: baseGastos * factor,
            beneficioNeto: baseNeto * factor,
            investedCapital: baseInvested * factor,
            acquisitionPrice: baseAcqPrice * factor,
          });
        });
      });

      const sortedOwnerRows = multiLevelSort(ownerRows, 'metricas_inversion', rentals, properties, sortCol1, sortDir1, sortCol2, sortDir2, filteredEntriesForPrint);

      let blocks = [];
      if (groupByOwner) {
        const groups = {};
        sortedOwnerRows.forEach(r => {
          if (!groups[r.ownerName]) groups[r.ownerName] = [];
          groups[r.ownerName].push(r);
        });
        
        blocks = Object.entries(groups).map(([ownerName, rows]) => {
          return {
            headerLabel: `Propietario: ${ownerName}`,
            rows: rows
          };
        });
      } else {
        const groups = {};
        sortedOwnerRows.forEach(r => {
          if (!groups[r.pName]) groups[r.pName] = [];
          groups[r.pName].push(r);
        });
        
        blocks = Object.entries(groups).map(([pName, rows]) => {
          return {
            headerLabel: `Finca: ${pName}`,
            rows: rows
          };
        });
      }

      const listPages = chunkFlatList(blocks, getLimit(6));

      if (blocks.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Métricas de Inversión')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay inmuebles registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div className="flex flex-col gap-4">
                {renderPageHeader('Métricas de Inversión')}
                {pageItems.map((block, idx) => {
                  const orderedCols = ALL_COLUMNS['metricas_inversion'].filter(c => cv(c.id));

                  const blockTotals = block.rows.reduce((acc, r) => {
                    acc.acquisitionPrice += r.acquisitionPrice || 0;
                    acc.investedCapital += r.investedCapital || 0;
                    acc.ingresosAnuales += r.ingresosAnuales || 0;
                    acc.gastosAnuales += r.gastosAnuales || 0;
                    acc.beneficioNeto += r.beneficioNeto || 0;
                    return acc;
                  }, { acquisitionPrice: 0, investedCapital: 0, ingresosAnuales: 0, gastosAnuales: 0, beneficioNeto: 0 });

                  const tRoi = blockTotals.investedCapital > 0 ? (blockTotals.beneficioNeto / blockTotals.investedCapital) * 100 : 0;
                  const tRoe = blockTotals.investedCapital > 0 ? (blockTotals.beneficioNeto / blockTotals.investedCapital) * 100 : 0;
                  const tCashOnCash = blockTotals.investedCapital > 0 ? (blockTotals.beneficioNeto / blockTotals.investedCapital) * 100 : 0;
                  const tGrossYield = blockTotals.acquisitionPrice > 0 ? (blockTotals.ingresosAnuales / blockTotals.acquisitionPrice) * 100 : 0;
                  const tNetYield = blockTotals.acquisitionPrice > 0 ? (blockTotals.beneficioNeto / blockTotals.acquisitionPrice) * 100 : 0;

                  return (
                    <div key={idx} className="mb-2 break-inside-avoid">
                      <div className="bg-slate-100 p-1 border border-slate-300 font-bold text-slate-800 flex justify-between text-[9px] mb-1.5 uppercase">
                        <span>{block.headerLabel}</span>
                      </div>
                      <table className="w-full text-[8.5px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-300 font-semibold text-slate-600 bg-slate-50">
                            {orderedCols.map(c => {
                              if (c.id === 'property') return <th key={c.id} className="py-0.5 px-1 text-left">Inmueble</th>;
                              if (c.id === 'owner') return <th key={c.id} className="py-0.5 px-1 text-left">Propietario</th>;
                              if (c.id === 'percentage') return <th key={c.id} className="py-0.5 px-1 text-right">% Prop.</th>;
                              if (c.id === 'acquisitionPrice') return <th key={c.id} className="py-0.5 px-1 text-right">Precio Adq.</th>;
                              if (c.id === 'investedCapital') return <th key={c.id} className="py-0.5 px-1 text-right">Inv. Inicial</th>;
                              if (c.id === 'ingresosAnuales') return <th key={c.id} className="py-0.5 px-1 text-right">Ingresos</th>;
                              if (c.id === 'gastosAnuales') return <th key={c.id} className="py-0.5 px-1 text-right">Gastos</th>;
                              if (c.id === 'beneficioNeto') return <th key={c.id} className="py-0.5 px-1 text-right">Bº Neto</th>;
                              if (c.id === 'roi') return <th key={c.id} className="py-0.5 px-1 text-right">ROI</th>;
                              if (c.id === 'roe') return <th key={c.id} className="py-0.5 px-1 text-right">ROE</th>;
                              if (c.id === 'cashOnCash') return <th key={c.id} className="py-0.5 px-1 text-right">Cash on Cash</th>;
                              if (c.id === 'grossYield') return <th key={c.id} className="py-0.5 px-1 text-right">R. Bruta</th>;
                              if (c.id === 'netYield') return <th key={c.id} className="py-0.5 px-1 text-right">R. Neta</th>;
                              return null;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((item, rIdx) => {
                            const { pName, ownerName, percentage, ingresosAnuales, gastosAnuales, beneficioNeto, investedCapital, acquisitionPrice } = item;
                            
                            const roi = investedCapital > 0 ? (beneficioNeto / investedCapital) * 100 : 0;
                            const roe = investedCapital > 0 ? (beneficioNeto / investedCapital) * 100 : 0;
                            const cashOnCash = investedCapital > 0 ? (beneficioNeto / investedCapital) * 100 : 0;
                            const grossYield = acquisitionPrice > 0 ? (ingresosAnuales / acquisitionPrice) * 100 : 0;
                            const netYield = acquisitionPrice > 0 ? (beneficioNeto / acquisitionPrice) * 100 : 0;

                            return (
                              <tr key={rIdx} className="border-b border-slate-100">
                                {orderedCols.map(c => {
                                  if (c.id === 'property') return <td key={c.id} className="py-0.5 px-1 text-left">{pName}</td>;
                                  if (c.id === 'owner') return <td key={c.id} className="py-0.5 px-1 text-left">{ownerName}</td>;
                                  if (c.id === 'percentage') return <td key={c.id} className="py-0.5 px-1 text-right">{percentage.toFixed(2)}%</td>;
                                  if (c.id === 'acquisitionPrice') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(acquisitionPrice)}</td>;
                                  if (c.id === 'investedCapital') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(investedCapital)}</td>;
                                  if (c.id === 'ingresosAnuales') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(ingresosAnuales)}</td>;
                                  if (c.id === 'gastosAnuales') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(gastosAnuales)}</td>;
                                  if (c.id === 'beneficioNeto') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(beneficioNeto)}</td>;
                                  if (c.id === 'roi') return <td key={c.id} className="py-0.5 px-1 text-right">{roi.toFixed(2)}%</td>;
                                  if (c.id === 'roe') return <td key={c.id} className="py-0.5 px-1 text-right">{roe.toFixed(2)}%</td>;
                                  if (c.id === 'cashOnCash') return <td key={c.id} className="py-0.5 px-1 text-right">{cashOnCash.toFixed(2)}%</td>;
                                  if (c.id === 'grossYield') return <td key={c.id} className="py-0.5 px-1 text-right">{grossYield.toFixed(2)}%</td>;
                                  if (c.id === 'netYield') return <td key={c.id} className="py-0.5 px-1 text-right">{netYield.toFixed(2)}%</td>;
                                  return null;
                                })}
                              </tr>
                            );
                          })}
                          {block.rows.length > 1 && (
                            <tr className="border-t border-slate-400 bg-slate-50 font-bold text-slate-800">
                              {orderedCols.map(c => {
                                if (c.id === 'property') return <td key={c.id} className="py-0.5 px-1 text-left">TOTALES</td>;
                                if (c.id === 'owner') return <td key={c.id} className="py-0.5 px-1 text-left"></td>;
                                if (c.id === 'percentage') return <td key={c.id} className="py-0.5 px-1 text-right"></td>;
                                if (c.id === 'acquisitionPrice') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(blockTotals.acquisitionPrice)}</td>;
                                if (c.id === 'investedCapital') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(blockTotals.investedCapital)}</td>;
                                if (c.id === 'ingresosAnuales') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(blockTotals.ingresosAnuales)}</td>;
                                if (c.id === 'gastosAnuales') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(blockTotals.gastosAnuales)}</td>;
                                if (c.id === 'beneficioNeto') return <td key={c.id} className="py-0.5 px-1 text-right">{formatCurrency(blockTotals.beneficioNeto)}</td>;
                                if (c.id === 'roi') return <td key={c.id} className="py-0.5 px-1 text-right">{tRoi.toFixed(2)}%</td>;
                                if (c.id === 'roe') return <td key={c.id} className="py-0.5 px-1 text-right">{tRoe.toFixed(2)}%</td>;
                                if (c.id === 'cashOnCash') return <td key={c.id} className="py-0.5 px-1 text-right">{tCashOnCash.toFixed(2)}%</td>;
                                if (c.id === 'grossYield') return <td key={c.id} className="py-0.5 px-1 text-right">{tGrossYield.toFixed(2)}%</td>;
                                if (c.id === 'netYield') return <td key={c.id} className="py-0.5 px-1 text-right">{tNetYield.toFixed(2)}%</td>;
                                return null;
                              })}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
              {renderPageFooter(pageIdx + 1, listPages.length, auditNumber)}
            </div>
          );
        });
      }
    }

    if (selectedTemplate === 'plan_contable') {
      const cv = (colId) => isColVisible('plan_contable', colId);
      
      const grouped = {};
      const groupNames = {};
      accounts.forEach(acc => {
        if (acc.code.length === 1) {
          groupNames[acc.code] = acc.name;
        } else {
          const group = acc.code.charAt(0);
          if (!grouped[group]) grouped[group] = [];
          grouped[group].push(acc);
        }
      });
      const sortedGroups = Object.keys(grouped).sort();
      sortedGroups.forEach(g => {
        grouped[g].sort((a, b) => a.code.localeCompare(b.code));
      });

      const chunks = [];
      let currentChunk = [];
      let currentLines = 0;
      const MAX_LINES = getLimit(35);

      sortedGroups.forEach(g => {
        if (currentLines + grouped[g].length + 2 > MAX_LINES && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentLines = 0;
        }
        currentChunk.push({ group: g, items: grouped[g] });
        currentLines += grouped[g].length + 2;
      });
      if (currentChunk.length > 0) chunks.push(currentChunk);

      if (chunks.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Plan Contable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay cuentas registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        chunks.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div className="flex flex-col gap-4">
                {renderPageHeader('Plan de Cuentas')}
                {pageItems.map((block, bIdx) => (
                  <div key={bIdx} className="mb-2 break-inside-avoid">
                    <div className="bg-slate-100 p-1 border border-slate-300 font-bold text-slate-800 flex justify-between text-[9px] mb-1.5 uppercase">
                      <span>Grupo {block.group}: {groupNames[block.group] || ''}</span>
                    </div>
                    <table className="w-full text-[8.5px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-300 font-semibold text-slate-600 bg-slate-50">
                          {cv('code') && <th className="py-0.5 px-1 text-left w-32">Código</th>}
                          {cv('description') && <th className="py-0.5 px-1 text-left">Descripción</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {block.items.map((acc, aIdx) => {
                          const padded = acc.code.padEnd(maxDigits, '0');
                          return (
                            <tr key={aIdx} className="border-b border-slate-100">
                              {cv('code') && <td className="py-0.5 px-1 text-left font-mono">{padded}</td>}
                              {cv('description') && <td className="py-0.5 px-1 text-left uppercase">{acc.name}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              {renderPageFooter(pageIdx + 1, chunks.length, auditNumber)}
            </div>
          );
        });
      }
    }

    // 7. CARTERA DE RENTA VARIABLE

    if (selectedTemplate === 'rv_portfolio') {
      const listPages = chunkFlatList(computedRvHoldings.holdings, getLimit(30));
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
      const listPages = chunkFlatList(chronTx, getLimit(34));
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
      const listPages = chunkFlatList(computedCfHoldings.rows, getLimit(32));
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
      const listPages = chunkFlatList(chronTx, getLimit(34));
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
      const listPages = chunkFlatList(overview, getLimit(34));
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
      const listPages = chunkFlatList(taxesData.reTaxes, getLimit(34));
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
                        <td className="py-2 px-1 font-mono text-slate-650">{r.id}</td>
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
 
      const gainPages = chunkFlatList(gains, getLimit(30));
      const divPages = chunkFlatList(dividends, getLimit(30));
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

      const rendPages = chunkFlatList(rends, getLimit(30));
      const actPages = chunkFlatList(acts, getLimit(30));
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

      const pasivoRows = [];
      const patrimonioRows = [];
      
      // PASIVO Header
      const hasPasivoValue = Math.abs(data.total_pasivo) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoValue) {
        pasivoRows.push({ type: 'main-header', label: 'PASIVO', value: data.total_pasivo, compValues: data.total_pasivo_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      // A) PASIVO NO CORRIENTE Subheader
      const hasPasivoNoCorrienteValue = Math.abs(data.total_pasivo_no_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_no_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoNoCorrienteValue) {
        pasivoRows.push({ type: 'subheader', label: 'A) PASIVO NO CORRIENTE', value: data.total_pasivo_no_corriente, compValues: data.total_pasivo_no_corriente_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.pasivo_no_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        pasivoRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          pasivoRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });
      
      // B) PASIVO CORRIENTE Subheader
      const hasPasivoCorrienteValue = Math.abs(data.total_pasivo_corriente) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_pasivo_corriente_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPasivoCorrienteValue) {
        pasivoRows.push({ type: 'subheader', label: 'B) PASIVO CORRIENTE', value: data.total_pasivo_corriente, compValues: data.total_pasivo_corriente_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.pasivo_corriente_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        pasivoRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          pasivoRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });
      
      // PATRIMONIO NETO Header
      const hasPatrimonioValue = Math.abs(data.total_patrimonio) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(data.total_patrimonio_comp[yrStr]) > 0.005);
      if (!hideZeroBalances || hasPatrimonioValue) {
        patrimonioRows.push({ type: 'main-header', label: 'PATRIMONIO NETO', value: data.total_patrimonio, compValues: data.total_patrimonio_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      // A) PATRIMONIO NETO Subheader
      if (!hideZeroBalances || hasPatrimonioValue) {
        patrimonioRows.push({ type: 'subheader', label: 'A) PATRIMONIO NETO', value: data.total_patrimonio, compValues: data.total_patrimonio_comp, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
      }
      
      data.patrimonio_items.forEach(item => {
        const itemAccounts = item.accounts || [];
        const filteredAccounts = hideZeroBalances 
          ? itemAccounts.filter(a => Math.abs(a.balance) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(a.compBalances[yrStr]) > 0.005))
          : itemAccounts;
          
        const hasValue = Math.abs(item.value) > 0.005 || selectedComparisonYears.some(yrStr => Math.abs(item.compValues[yrStr]) > 0.005);
        if (hideZeroBalances && !hasValue) return;
        
        patrimonioRows.push({ type: 'item', label: item.label, value: item.value, compValues: item.compValues, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        filteredAccounts.forEach(acc => {
          patrimonioRows.push({ type: 'account', code: acc.code, name: acc.name, value: acc.balance, compValues: acc.compBalances, divisor: data.total_pasivo_patrimonio, compDivisors: data.total_pasivo_patrimonio_comp });
        });
      });

      // Combine blocks at the Masa Monetaria level
      const allBalanceRows = [...activoRows, ...pasivoRows, ...patrimonioRows];
      const balanceBlocks = [activoRows, pasivoRows, patrimonioRows].filter(b => b.length > 0);
      const chunkedPages = paginateBlocks(balanceBlocks, getLimit(28), Math.max(2, Math.floor(7 * heightRatio)));
      
      const totalPages = chunkedPages.length || 1;
      
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

      if (allBalanceRows.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative flex flex-col justify-between">
            <div>
              {renderPageHeader('Balance de Situación')}
              <p className="text-center py-12 text-slate-400 italic text-[10px]">No hay datos registrados.</p>
            </div>
            {renderPageFooter(pageIndex++, totalPages || 1, auditNumber)}
          </div>
        );
      } else {
        chunkedPages.forEach((pageRows) => {
          pageViews.push(renderRowsPage(pageRows, pageIndex++, totalPages, 'balance'));
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
      {/* Print Stylesheet injection - dynamic paper size & orientation */}
      {(() => {
        // Paper dimensions in mm (width x height) for portrait
        const paperDims = {
          'A4':     { w: 210, h: 297 },
          'A5':     { w: 148, h: 210 },
          'Letter': { w: 216, h: 279 },
        };
        const dims = paperDims[paperSize] || paperDims['A4'];
        const sheetW = pageOrientation === 'landscape' ? dims.h : dims.w;
        const sheetH = pageOrientation === 'landscape' ? dims.w : dims.h;
        return (
          <style>{`
            .page-sheet {
              width: ${sheetW}mm;
              min-height: ${sheetH - 20}mm;
              padding: 12mm 14mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background-color: white;
              color: black;
              position: relative;
              --zoom: ${printZoom};
            }

            .page-sheet .text-\\[8px\\] { font-size: calc(8px * var(--zoom)) !important; }
            .page-sheet .text-\\[8\\.5px\\] { font-size: calc(8.5px * var(--zoom)) !important; }
            .page-sheet .text-\\[9px\\] { font-size: calc(9px * var(--zoom)) !important; }
            .page-sheet .text-\\[10px\\] { font-size: calc(10px * var(--zoom)) !important; }
            .page-sheet .text-\\[11px\\] { font-size: calc(11px * var(--zoom)) !important; }
            .page-sheet .text-\\[12px\\] { font-size: calc(12px * var(--zoom)) !important; }
            .page-sheet .text-xs { font-size: calc(12px * var(--zoom)) !important; }
            .page-sheet .text-sm { font-size: calc(14px * var(--zoom)) !important; }

            @media screen {
              .page-sheet {
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                border: 1px solid #cbd5e1;
                margin-bottom: 24px;
              }
            }

            @media print {
              @page {
                size: ${paperSize} ${pageOrientation};
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
        );
      })()}

      {/* Left panel - Templates list */}
      {showLeftPanel && (
        <div className="w-60 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">
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



          {/* Global View Configuration Panel */}
          <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
            <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 select-none">
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Configurar Vista</span>
            </div>

            {/* Paper Size */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Tamaño de Página</span>
              <div className="grid grid-cols-3 gap-1">
                {['A4', 'A5', 'Letter'].map(size => (
                  <button
                    key={size}
                    onClick={() => setPaperSize(size)}
                    className={`text-[9px] text-center py-1.5 border transition-all rounded font-bold ${
                      paperSize === size
                        ? 'text-blue-700 font-bold bg-[#c0c0c0] border-slate-400 shadow-inner'
                        : 'text-slate-800 bg-slate-50 border-slate-200 hover:text-blue-700'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Orientación</span>
              <div className="grid grid-cols-2 gap-1">
                {[{id: 'portrait', label: '↕ Vertical'}, {id: 'landscape', label: '↔ Horizontal'}].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setPageOrientation(opt.id)}
                    className={`text-[9px] text-center py-1.5 border transition-all rounded font-bold ${
                      pageOrientation === opt.id
                        ? 'text-blue-700 bg-[#c0c0c0] border-slate-400 shadow-inner'
                        : 'text-slate-800 bg-slate-50 border-slate-200 hover:text-blue-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom / Font Size */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Tamaño de Fuente</span>
              <div className="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0.6" 
                  max="1.5" 
                  step="0.05" 
                  value={printZoom} 
                  onChange={(e) => setPrintZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                />
                <span className="text-[10px] font-bold text-slate-600 w-8 text-right">{Math.round(printZoom * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Main Preview Container */}
      <div className="flex-1 flex flex-col bg-[#526075]/20 border border-[#808080] win-bevel min-w-0 relative h-full">
        {/* Top Control Bar */}
        <div className="bg-[#f0f0f0] border-b border-[#808080] p-2 flex justify-between items-center shrink-0 no-print gap-4 relative">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLeftPanel(prev => !prev)}
              className={`btn-classic px-2.5 h-7 flex items-center justify-center text-[11px] ${
                showLeftPanel ? 'bg-slate-200 shadow-inner' : 'bg-slate-50'
              }`}
              title="Mostrar/Ocultar Plantillas"
            >
              <LayoutGrid className="w-4 h-4 text-slate-750" />
            </button>
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-700 uppercase flex items-center gap-2">
            <span>Vista Previa de Impresión</span>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRightPanel(prev => !prev)}
              className={`btn-classic px-2.5 h-7 flex items-center justify-center text-[11px] ${
                showRightPanel ? 'bg-slate-200 shadow-inner' : 'bg-slate-50'
              }`}
              title="Mostrar/Ocultar Filtros"
            >
              <Sliders className="w-4 h-4 text-slate-750" />
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
        <div className="flex-1 overflow-auto p-4 flex justify-center bg-slate-400/30" ref={previewAreaRef}>
          <div 
            id="print-area" 
            className="flex flex-col gap-6 items-center animate-fadeIn"
            style={pageScale < 1 ? { zoom: pageScale, transformOrigin: 'top left' } : {}}
          >
            {renderPages()}
          </div>
        </div>
      </div>

      {/* Right panel - Filters list */}
      {showRightPanel && (
        <div className="w-64 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print overflow-y-auto max-h-full">
          <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[10px] border-b border-[#a0a0a0] text-slate-700 flex justify-between items-center">
            <span>Filtros Disponibles</span>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => {
                  setIsDatesCollapsed(false);
                  setIsFiltersInmobCollapsed(false);
                  setIsSortCollapsed(false);
                  setIsColsCollapsed(false);
                  setIsOptsAlquilerCollapsed(false);
                  setIsOptsClientesCollapsed(false);
                  setIsOptsPropietariosCollapsed(false);
                  setIsOptsContabilidadCollapsed(false);
                  setIsProfundidadCollapsed(false);
                }}
                className="text-blue-700 hover:text-blue-900 lowercase text-[9px] font-normal cursor-pointer"
                title="Expandir todos los filtros"
              >
                [expandir]
              </button>
              <button 
                onClick={() => {
                  setIsDatesCollapsed(true);
                  setIsFiltersInmobCollapsed(true);
                  setIsSortCollapsed(true);
                  setIsColsCollapsed(true);
                  setIsOptsAlquilerCollapsed(true);
                  setIsOptsClientesCollapsed(true);
                  setIsOptsPropietariosCollapsed(true);
                  setIsOptsContabilidadCollapsed(true);
                  setIsProfundidadCollapsed(true);
                }}
                className="text-blue-700 hover:text-blue-900 lowercase text-[9px] font-normal cursor-pointer"
                title="Contraer todos los filtros"
              >
                [contraer]
              </button>
            </div>
          </div>

          {/* Timeline Period Selection inside Right Panel */}
          {['diario', 'mayor', 'sumas_saldos', 'rv_transactions', 'cf_transactions', 'taxes_total', 'taxes_real_estate', 'taxes_rv', 'taxes_cf', 'balance_situacion', 'cuenta_resultados', 'flujo_caja', 'activos', 'alquileres', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2">
              <div 
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsDatesCollapsed(!isDatesCollapsed)}
              >
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Período Temporal</span>
                </div>
                <div className="flex items-center gap-1">
                  {isDatesCollapsed && (selectedYears.length > 0 || selectedQuarters.length > 0 || selectedMonths.length > 0) && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isDatesCollapsed ? '▶' : '▼'}</span>
                </div>
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
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsProfundidadCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Profundidad</span>
                </div>
                <div className="flex items-center gap-1">
                  {isProfundidadCollapsed && maxDigits !== 10 && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isProfundidadCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isProfundidadCollapsed && (
                <div className="mt-1 border-t border-slate-100 pt-2">
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
              )}
            </div>
          )}

          {/* Filtros Inmobiliarios (Multiselección) */}
          {['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsFiltersInmobCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Filtros Inmobiliarios</span>
                </div>
                <div className="flex items-center gap-1">
                  {isFiltersInmobCollapsed && (
                    (selectedFilterProperties[selectedTemplate] || []).length > 0 ||
                    (selectedFilterRentals[selectedTemplate] || []).length > 0 ||
                    (selectedFilterOwners[selectedTemplate] || []).length > 0
                  ) && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isFiltersInmobCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isFiltersInmobCollapsed && <div className="flex flex-col gap-3 border-t border-slate-100 pt-2">
                {/* 1. Dropdown Fincas (Activos) - shown for activos, alquileres, clientes, propietarios */}
                {['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (() => {
                  const currentPropFilters = selectedFilterProperties[selectedTemplate] || [];
                  return (
                    <div className="flex flex-col gap-1 relative" ref={propFilterDropdownRef}>
                      <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Fincas (Activos)</span>
                      <div 
                        onClick={() => setPropFilterDropdownOpen(prev => !prev)}
                        className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                      >
                        <span className="truncate pr-2 text-slate-700 font-sans">
                          {currentPropFilters.length === 0 
                            ? 'Todas' 
                            : currentPropFilters.map(pid => {
                                const p = properties.find(x => x.id === pid);
                                return p ? p.name : pid;
                              }).join(', ')
                          }
                        </span>
                        <span className="text-[9px] text-slate-500">▼</span>
                      </div>
                      
                      {propFilterDropdownOpen && (
                        <div className="absolute top-[38px] left-0 right-0 bg-white border border-[#808080] shadow-[2px_2px_4px_rgba(0,0,0,0.15)] z-20 max-h-60 overflow-y-auto p-1.5 flex flex-col gap-1">
                          <div className="flex justify-between items-center pb-1 border-b border-slate-100 mb-1">
                            <span className="text-[8px] text-slate-400 uppercase font-bold font-sans">Buscar finca</span>
                            {currentPropFilters.length > 0 && (
                              <button 
                                onClick={() => setSelectedFilterProperties(prev => ({ ...prev, [selectedTemplate]: [] }))}
                                className="text-[8px] text-blue-600 hover:underline font-bold font-sans"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={propFilterSearch}
                            onChange={(e) => setPropFilterSearch(e.target.value)}
                            className="w-full border border-[#a0a0a0] px-1 py-0.5 text-[10px] font-sans mb-1.5 outline-none"
                          />
                          {properties.filter(p => (p.name || '').toLowerCase().includes(propFilterSearch.toLowerCase())).map(p => {
                            const isChecked = currentPropFilters.includes(p.id);
                            return (
                              <label key={p.id} className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-slate-700 hover:bg-slate-50 p-0.5 font-sans">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    setSelectedFilterProperties(prev => {
                                      const old = prev[selectedTemplate] || [];
                                      return {
                                        ...prev,
                                        [selectedTemplate]: e.target.checked 
                                          ? [...old, p.id] 
                                          : old.filter(x => x !== p.id)
                                      };
                                    });
                                  }}
                                  className="w-3 h-3"
                                />
                                <span className="uppercase">{p.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Dropdown Alquileres (Referencia) - shown for alquileres */}
                {['alquileres', 'metricas_inversion'].includes(selectedTemplate) && (() => {
                  const currentRentFilters = selectedFilterRentals[selectedTemplate] || [];
                  return (
                    <div className="flex flex-col gap-1 relative" ref={rentFilterDropdownRef}>
                      <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Contratos (Referencia)</span>
                      <div 
                        onClick={() => setRentFilterDropdownOpen(prev => !prev)}
                        className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                      >
                        <span className="truncate pr-2 text-slate-700 font-sans">
                          {currentRentFilters.length === 0 ? 'Todos' : currentRentFilters.join(', ')}
                        </span>
                        <span className="text-[9px] text-slate-500">▼</span>
                      </div>
                      
                      {rentFilterDropdownOpen && (
                        <div className="absolute top-[38px] left-0 right-0 bg-white border border-[#808080] shadow-[2px_2px_4px_rgba(0,0,0,0.15)] z-20 max-h-60 overflow-y-auto p-1.5 flex flex-col gap-1">
                          <div className="flex justify-between items-center pb-1 border-b border-slate-100 mb-1 font-sans">
                            <span className="text-[8px] text-slate-400 uppercase font-bold font-sans">Buscar referencia</span>
                            {currentRentFilters.length > 0 && (
                              <button 
                                onClick={() => setSelectedFilterRentals(prev => ({ ...prev, [selectedTemplate]: [] }))}
                                className="text-[8px] text-blue-600 hover:underline font-bold font-sans"
                              >
                                Limpiar
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={rentFilterSearch}
                            onChange={(e) => setRentFilterSearch(e.target.value)}
                            className="w-full border border-[#a0a0a0] px-1 py-0.5 text-[10px] font-sans mb-1.5 outline-none"
                          />
                          {rentals.filter(r => (r.reference || '').toLowerCase().includes(rentFilterSearch.toLowerCase())).map(r => {
                            const isChecked = currentRentFilters.includes(r.reference);
                            return (
                              <label key={r.id || r.reference} className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-slate-700 hover:bg-slate-50 p-0.5 font-sans">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    setSelectedFilterRentals(prev => {
                                      const old = prev[selectedTemplate] || [];
                                      return {
                                        ...prev,
                                        [selectedTemplate]: e.target.checked 
                                          ? [...old, r.reference] 
                                          : old.filter(x => x !== r.reference)
                                      };
                                    });
                                  }}
                                  className="w-3 h-3"
                                />
                                <span>{r.reference}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 3. Dropdown Propietarios - shown for extracto_propietarios */}
                {['extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (() => {
                  const currentOwnerFilters = selectedFilterOwners[selectedTemplate] || [];
                  return (
                    <div className="flex flex-col gap-1 relative" ref={ownerFilterDropdownRef}>
                      <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">Propietarios (Socios)</span>
                      <div 
                        onClick={() => setOwnerFilterDropdownOpen(prev => !prev)}
                        className="win-input w-full flex justify-between items-center cursor-pointer select-none bg-white border border-[#a0a0a0] px-2 py-1 text-[11px] font-sans rounded min-h-[24px]"
                      >
                        <span className="truncate pr-2 text-slate-700 font-sans">
                          {currentOwnerFilters.length === 0 ? 'Todos' : currentOwnerFilters.join(', ')}
                        </span>
                        <span className="text-[9px] text-slate-500">▼</span>
                      </div>
                      
                      {ownerFilterDropdownOpen && (() => {
                        // Extract unique owner names from properties
                        const availableOwners = [];
                        properties.forEach(p => {
                          (p.owners || []).forEach(o => {
                            if (o.name && !availableOwners.includes(o.name)) {
                              availableOwners.push(o.name);
                            }
                          });
                        });
                        availableOwners.sort();
                        
                        return (
                          <div className="absolute top-[38px] left-0 right-0 bg-white border border-[#808080] shadow-[2px_2px_4px_rgba(0,0,0,0.15)] z-20 max-h-60 overflow-y-auto p-1.5 flex flex-col gap-1">
                            <div className="flex justify-between items-center pb-1 border-b border-slate-100 mb-1 font-sans">
                              <span className="text-[8px] text-slate-400 uppercase font-bold font-sans">Buscar propietario</span>
                              {currentOwnerFilters.length > 0 && (
                                <button 
                                  onClick={() => setSelectedFilterOwners(prev => ({ ...prev, [selectedTemplate]: [] }))}
                                  className="text-[8px] text-blue-600 hover:underline font-bold font-sans"
                                >
                                  Limpiar
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Buscar..."
                              value={ownerFilterSearch}
                              onChange={(e) => setOwnerFilterSearch(e.target.value)}
                              className="w-full border border-[#a0a0a0] px-1 py-0.5 text-[10px] font-sans mb-1.5 outline-none"
                            />
                            {availableOwners.filter(name => name.toLowerCase().includes(ownerFilterSearch.toLowerCase())).map(name => {
                              const isChecked = currentOwnerFilters.includes(name);
                              return (
                                <label key={name} className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-slate-700 hover:bg-slate-50 p-0.5 font-sans">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      setSelectedFilterOwners(prev => {
                                        const old = prev[selectedTemplate] || [];
                                        return {
                                          ...prev,
                                          [selectedTemplate]: e.target.checked 
                                            ? [...old, name] 
                                            : old.filter(x => x !== name)
                                        };
                                      });
                                    }}
                                    className="w-3 h-3"
                                  />
                                  <span>{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>}
            </div>
          )}

          {/* Ordenación del Informe */}
          {['activos', 'alquileres', 'clientes', 'extracto_propietarios'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsSortCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ordenación del Informe</span>
                </div>
                <div className="flex items-center gap-1">
                  {isSortCollapsed && (sortCol1 !== 'none' || sortCol2 !== 'none') && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isSortCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isSortCollapsed && <div className="flex flex-col gap-3.5 border-t border-slate-100 pt-2">
                {/* 1º Nivel */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">1º Nivel (Principal)</span>
                  <select 
                    value={sortCol1} 
                    onChange={(e) => setSortCol1(e.target.value)}
                    className="win-input w-full text-[11px] font-sans rounded h-[24px]"
                  >
                    <option value="none">Sin ordenar</option>
                    {(ALL_COLUMNS[selectedTemplate] || []).map(col => (
                      <option key={col.id} value={col.id}>{col.label}</option>
                    ))}
                  </select>
                  {sortCol1 !== 'none' && (
                    <select 
                      value={sortDir1} 
                      onChange={(e) => setSortDir1(e.target.value)}
                      className="win-input w-full text-[11px] font-sans rounded h-[24px] mt-1"
                    >
                      <option value="asc">Ascendente</option>
                      <option value="desc">Descendente</option>
                    </select>
                  )}
                </div>

                {/* Click to add level */}
                {!showSecondSortLevel && sortCol1 !== 'none' && (
                  <button 
                    type="button"
                    onClick={() => setShowSecondSortLevel(true)}
                    className="text-[9px] text-blue-600 hover:underline font-bold text-left self-start mt-0.5 font-sans"
                  >
                    + Añadir nivel de ordenación
                  </button>
                )}

                {/* 2º Nivel */}
                {showSecondSortLevel && (
                  <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase font-sans">2º Nivel (Secundario)</span>
                      <button 
                        type="button"
                        onClick={() => {
                          setShowSecondSortLevel(false);
                          setSortCol2('none');
                        }}
                        className="text-[8px] text-red-500 hover:underline font-bold font-sans"
                      >
                        Quitar nivel
                      </button>
                    </div>
                    <select 
                      value={sortCol2} 
                      onChange={(e) => setSortCol2(e.target.value)}
                      className="win-input w-full text-[11px] font-sans rounded h-[24px]"
                    >
                      <option value="none">Sin ordenar</option>
                      {(ALL_COLUMNS[selectedTemplate] || []).map(col => (
                        <option key={col.id} value={col.id}>{col.label}</option>
                      ))}
                    </select>
                    {sortCol2 !== 'none' && (
                      <select 
                        value={sortDir2} 
                        onChange={(e) => setSortDir2(e.target.value)}
                        className="win-input w-full text-[11px] font-sans rounded h-[24px] mt-1"
                      >
                        <option value="asc">Ascendente</option>
                        <option value="desc">Descendente</option>
                      </select>
                    )}
                  </div>
                )}
              </div>}
            </div>
          )}

          {/* Column Visibility Filter (for inmobiliaria reports) */}
          {['activos', 'alquileres', 'clientes', 'extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && ALL_COLUMNS[selectedTemplate] && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-2" ref={colDropdownRef}>
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsColsCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Columns className="w-3.5 h-3.5 text-slate-400" />
                  <span>Columnas Visibles</span>
                </div>
                <div className="flex items-center gap-1">
                  {isColsCollapsed && visibleColumns[selectedTemplate] && ALL_COLUMNS[selectedTemplate] &&
                    visibleColumns[selectedTemplate].size < ALL_COLUMNS[selectedTemplate].length && (
                      <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                    )}
                  <span className="text-[9px]">{isColsCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isColsCollapsed && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100 mt-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] text-slate-450 uppercase font-bold">Seleccionar columnas</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setVisibleColumns(prev => ({
                          ...prev,
                          [selectedTemplate]: new Set(ALL_COLUMNS[selectedTemplate].map(c => c.id))
                        }))}
                        className="text-[8px] text-blue-650 hover:underline font-bold"
                      >
                        Todas
                      </button>
                      <span className="text-[8px] text-slate-350">|</span>
                      <button
                        onClick={() => setVisibleColumns(prev => ({
                          ...prev,
                          [selectedTemplate]: new Set()
                        }))}
                        className="text-[8px] text-red-650 hover:underline font-bold"
                      >
                        Ninguna
                      </button>
                    </div>
                  </div>
                  {ALL_COLUMNS[selectedTemplate].map(col => {
                    const isVisible = isColVisible(selectedTemplate, col.id);
                    return (
                      <label 
                        key={col.id} 
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggedCol(col.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleColumnDrop(selectedTemplate, col.id);
                        }}
                        className={`group relative flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 ${draggedCol === col.id ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleColumn(selectedTemplate, col.id)}
                          className="w-3 h-3 text-blue-600"
                        />
                        <span>{col.label}</span>
                        {COLUMN_TOOLTIPS[col.id] && (
                          <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-[9999] bg-slate-800 text-white text-[10px] px-2 py-1 rounded w-max opacity-0 group-hover:opacity-100 transition-opacity duration-[30ms] delay-[30ms]">
                            {COLUMN_TOOLTIPS[col.id]}
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Options specific to Contratos de Alquiler */}
          {selectedTemplate === 'alquileres' && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsOptsAlquilerCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones de Alquileres</span>
                </div>
                <div className="flex items-center gap-1">
                  {isOptsAlquilerCollapsed && (rentPeriod !== 'mes' || statusFilterAlquileres !== 'todos') && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isOptsAlquilerCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isOptsAlquilerCollapsed && <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-2">
                {/* Período de Cálculos */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Cálculos de Renta</span>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                    <button 
                      onClick={() => setRentPeriod('mes')}
                      className={`text-[9px] text-center py-1 transition-all rounded font-bold ${
                        rentPeriod === 'mes' 
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      MENSUAL
                    </button>
                    <button 
                      onClick={() => setRentPeriod('anual')}
                      className={`text-[9px] text-center py-1 transition-all rounded font-bold ${
                        rentPeriod === 'anual' 
                          ? 'bg-white text-blue-700 shadow-sm border border-slate-200' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      ANUAL
                    </button>
                  </div>
                </div>

                {/* Filtro Estado */}
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Filtrar por Estado</span>
                  <select 
                    value={statusFilterAlquileres} 
                    onChange={(e) => setStatusFilterAlquileres(e.target.value)}
                    className="win-input w-full text-[11px] font-sans rounded"
                  >
                    <option value="todos">Todos los contratos</option>
                    <option value="activo">Solo Activos</option>
                    <option value="inactivo">Solo Inactivos</option>
                  </select>
                </div>
              </div>}
            </div>
          )}

          {/* Options specific to Fichero de Clientes */}
          {selectedTemplate === 'clientes' && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsOptsClientesCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones de Clientes</span>
                </div>
                <div className="flex items-center gap-1">
                  {isOptsClientesCollapsed && statusFilterClientes !== 'todos' && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isOptsClientesCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isOptsClientesCollapsed && <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-2">
                {/* Filtro Estado */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Filtrar por Estado</span>
                  <select 
                    value={statusFilterClientes} 
                    onChange={(e) => setStatusFilterClientes(e.target.value)}
                    className="win-input w-full text-[11px] font-sans rounded"
                  >
                    <option value="todos">Todos los clientes</option>
                    <option value="activo">Solo Activos</option>
                    <option value="inactivo">Solo Inactivos</option>
                  </select>
                </div>
              </div>}
            </div>
          )}

          {/* Options specific to Extracto de Propietarios */}
          {['extracto_propietarios', 'inventario_activos', 'metricas_inversion'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsOptsPropietariosCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones de Listado</span>
                </div>
                <div className="flex items-center gap-1">
                  {isOptsPropietariosCollapsed && (groupByOwner || groupAccessoryAssets) && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isOptsPropietariosCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isOptsPropietariosCollapsed && (
                <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-2">
                  {['extracto_propietarios', 'metricas_inversion'].includes(selectedTemplate) && (
                    <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-2 mb-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Modo de Agrupación</span>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 font-sans">
                        <input 
                          type="radio"
                          name="groupingMode"
                          checked={!groupByOwner}
                          onChange={() => setGroupByOwner(false)}
                          className="w-3 h-3"
                        />
                        <span>Agrupar por Inmueble</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 font-sans">
                        <input 
                          type="radio"
                          name="groupingMode"
                          checked={groupByOwner}
                          onChange={() => setGroupByOwner(true)}
                          className="w-3 h-3"
                        />
                        <span>Agrupar por Propietario</span>
                      </label>
                    </div>
                  )}
                  {['extracto_propietarios', 'inventario_activos'].includes(selectedTemplate) && (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-semibold text-slate-600 font-sans">
                      <input 
                        type="checkbox"
                        checked={groupAccessoryAssets}
                        onChange={(e) => setGroupAccessoryAssets(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span>Sumar activo accesorio al activo principal</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Options specific to Balance de Situación */}
          {['balance_situacion', 'cuenta_resultados', 'flujo_caja'].includes(selectedTemplate) && (
            <div className="bg-white border border-[#a0a0a0] p-3 flex flex-col gap-3">
              <div
                className="text-[10px] font-bold text-slate-500 uppercase flex items-center justify-between cursor-pointer select-none hover:text-slate-800"
                onClick={() => setIsOptsContabilidadCollapsed(p => !p)}
              >
                <div className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span>Opciones del Informe</span>
                </div>
                <div className="flex items-center gap-1">
                  {isOptsContabilidadCollapsed && (
                    hideZeroBalances ||
                    showVerticalPercentage ||
                    showHorizontalPercentage ||
                    displayMode !== 'euros' ||
                    (selectedComparisonYears || []).length > 0
                  ) && (
                    <Filter className="w-3 h-3 text-blue-600 animate-pulse" />
                  )}
                  <span className="text-[9px]">{isOptsContabilidadCollapsed ? '▶' : '▼'}</span>
                </div>
              </div>
              {!isOptsContabilidadCollapsed && <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-2">
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
                <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-600">
                  <input 
                    type="checkbox" 
                    checked={showHorizontalPercentage} 
                    onChange={(e) => setShowHorizontalPercentage(e.target.checked)} 
                    className="w-3 h-3 text-blue-600" 
                  />
                  <span>Mostrar Porcentaje Horizontal (Comparativo)</span>
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
              </div>}
            </div>
          )}

          {/* Transaction Filters (Hidden for financial statements, inmobiliaria, RV and CF) */}
          {!['balance_situacion', 'cuenta_resultados', 'flujo_caja',
             'activos', 'alquileres', 'clientes', 'extracto_propietarios',
             'rv_portfolio', 'rv_transactions',
             'cf_portfolio', 'cf_transactions', 'metricas_inversion', 'plan_contable'].includes(selectedTemplate) && (
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

          {/* Aclaraciones de Métricas */}
          {selectedTemplate === 'metricas_inversion' && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-[10px] text-blue-800 leading-normal flex flex-col gap-1.5 mt-auto mb-2">
              <div className="font-bold flex items-center gap-1 text-blue-900 uppercase">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Aclaraciones de Métricas</span>
              </div>
              <ul className="list-disc pl-4 space-y-1.5 mt-1 text-blue-800/90">
                <li><strong>Bº Neto:</strong> Ingresos Anuales - Gastos Anuales</li>
                <li><strong>ROI:</strong> (Beneficio Neto / Inversión Inicial) × 100</li>
                <li><strong>ROE:</strong> (Beneficio Neto / Capital Propio) × 100. En este caso se calcula sobre la inversión inicial aportada.</li>
                <li><strong>Cash on Cash:</strong> (Flujo de Caja / Efectivo Invertido) × 100.</li>
                <li><strong>R. Bruta:</strong> (Ingresos Anuales / Precio Adquisición) × 100</li>
                <li><strong>R. Neta:</strong> (Beneficio Neto / Precio Adquisición) × 100</li>
              </ul>
            </div>
          )}


        </div>
      )}
    </div>
  );
}

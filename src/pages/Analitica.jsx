import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, X, FileText, Info } from 'lucide-react';
import Accounts from './Accounts';
import AnalyticalCenters from './AnalyticalCenters';
import { useDragResize } from '../hooks/useDragResize';

/* ═══════════════════════════════════════════════════════════════════════════════
   PGC DESCRIPTIONS
   ═══════════════════════════════════════════════════════════════════════════════ */
const PGC = {
  '1':'FINANCIACIÓN BÁSICA','10':'CAPITAL','100':'CAPITAL SOCIAL',
  '11':'RESERVAS','12':'RESULTADOS PENDIENTES DE APLICACIÓN','129':'RESULTADO DEL EJERCICIO',
  '2':'ACTIVO NO CORRIENTE','20':'INMOVILIZADO INTANGIBLE','21':'INMOVILIZADO MATERIAL',
  '28':'AMORTIZACIÓN ACUMULADA DEL INMOVILIZADO','3':'EXISTENCIAS',
  '4':'ACREEDORES Y DEUDORES POR OPERACIONES COMERCIALES','40':'PROVEEDORES',
  '41':'ACREEDORES VARIOS','43':'CLIENTES','47':'ADMINISTRACIONES PÚBLICAS',
  '472':'HACIENDA PÚBLICA, IVA SOPORTADO','477':'HACIENDA PÚBLICA, IVA REPERCUTIDO',
  '5':'CUENTAS FINANCIERAS','57':'TESORERÍA','570':'CAJA',
  '572':'BANCOS E INSTITUCIONES DE CRÉDITO','6':'COMPRAS Y GASTOS',
  '60':'COMPRAS','62':'SERVICIOS EXTERIORES','621':'ARRENDAMIENTOS Y CÁNONES',
  '628':'SUMINISTROS','629':'OTROS SERVICIOS','64':'GASTOS DE PERSONAL',
  '640':'SUELDOS Y SALARIOS','642':'SEGURIDAD SOCIAL A CARGO DE LA EMPRESA',
  '7':'VENTAS E INGRESOS','70':'VENTAS DE MERCADERÍAS Y SERVICIOS',
  '700':'VENTAS DE MERCADERÍAS','705':'PRESTACIÓN DE SERVICIOS'
};
const descr = (code, accounts=[]) => {
  const a = accounts.find(x => x.code === code);
  if (a) return (a.name || '').toUpperCase();
  if (PGC[code]) return PGC[code];
  for (let l = code.length - 1; l > 0; l--) { if (PGC[code.slice(0, l)]) return PGC[code.slice(0, l)]; }
  return `CUENTA ${code}`;
};

const inferAccountType = (code, providedType) => {
  if (providedType) return providedType;
  if (!code) return 'Pasivo';
  const first = code.toString().charAt(0);
  if (['2', '3', '4', '5'].includes(first)) return 'Activo'; 
  if (first === '6' || first === '8') return 'Gasto';
  if (first === '7' || first === '9') return 'Ingreso';
  if (first === '1') return 'Pasivo';
  return 'Pasivo';
};

const getTransactionNet = (tx, account) => {
  const type = inferAccountType(account?.code, account?.type);
  const isAssetOrExpense = ['Activo', 'Gasto'].includes(type);
  const debit = parseFloat(tx.debit) || 0;
  const credit = parseFloat(tx.credit) || 0;
  return isAssetOrExpense ? (debit - credit) : (credit - debit);
};

const cleanNumericInput = (valStr) => {
  if (!valStr) return '';
  if (valStr.includes('.') && valStr.includes(',')) {
    if (valStr.lastIndexOf('.') < valStr.lastIndexOf(',')) {
      return valStr.replace(/\./g, '');
    } else {
      return valStr.replace(/,/g, '').replace('.', ',');
    }
  }
  return valStr.replace(/\./g, ',');
};

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_HDR  = ['ENE.','FEB.','MAR.','ABR.','MAY.','JUN.','JUL.','AGO.','SEP.','OCT.','NOV.','DIC.'];

/* ═══════════════════════════════════════════════════════════════════════════════
   TOOLBAR ICONS  – Exact visual match to the user's desktop app (Foto 1)
   ═══════════════════════════════════════════════════════════════════════════════ */
const IcoNuevo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <path d="M5 2h9l5 5v14H5V2z" fill="#fff" stroke="#555" strokeWidth="1.5"/>
    <path d="M14 2v5h5" fill="none" stroke="#555" strokeWidth="1.5"/>
    {/* Green plus sign at bottom right */}
    <rect x="12" y="12" width="9" height="9" fill="#fff" stroke="#22c55e" strokeWidth="1.5" rx="1"/>
    <line x1="16.5" y1="14" x2="16.5" y2="19" stroke="#22c55e" strokeWidth="2"/>
    <line x1="14" y1="16.5" x2="19" y2="16.5" stroke="#22c55e" strokeWidth="2"/>
  </svg>
);
const IcoModif = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <path d="M5 2h9l5 5v14H5V2z" fill="#fff" stroke="#555" strokeWidth="1.5"/>
    <path d="M14 2v5h5" fill="none" stroke="#555" strokeWidth="1.5"/>
    {/* Blue pencil drawing on the document */}
    <path d="M9 17l6-6-2-2-6 6v2h2z" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1"/>
  </svg>
);
const IcoElim = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    <path d="M5 2h9l5 5v14H5V2z" fill="#fff" stroke="#555" strokeWidth="1.5"/>
    <path d="M14 2v5h5" fill="none" stroke="#555" strokeWidth="1.5"/>
    {/* Red box with white minus at bottom right */}
    <rect x="12" y="12" width="9" height="9" fill="#ef4444" rx="1"/>
    <line x1="14" y1="16.5" x2="19" y2="16.5" stroke="#fff" strokeWidth="2"/>
  </svg>
);
const IcoSubir = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 20V4" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6 10l6-6 6 6" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoBajar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 4v16" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6 14l6 6 6-6" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoExpandir = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    {/* Yellow folder */}
    <path d="M2 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="#fcd34d" stroke="#b8860b" strokeWidth="1.5"/>
    {/* Green plus box at bottom right */}
    <rect x="12" y="11" width="9" height="9" fill="#fff" stroke="#22c55e" strokeWidth="1.5" rx="1"/>
    <line x1="16.5" y1="13" x2="16.5" y2="18" stroke="#22c55e" strokeWidth="1.5"/>
    <line x1="14" y1="15.5" x2="19" y2="15.5" stroke="#22c55e" strokeWidth="1.5"/>
  </svg>
);
const IcoColapsar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
    {/* Yellow folder */}
    <path d="M2 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" fill="#fcd34d" stroke="#b8860b" strokeWidth="1.5"/>
    {/* Red minus box at bottom right */}
    <rect x="12" y="11" width="9" height="9" fill="#fff" stroke="#ef4444" strokeWidth="1.5" rx="1"/>
    <line x1="14" y1="15.5" x2="19" y2="15.5" stroke="#ef4444" strokeWidth="1.5"/>
  </svg>
);
const IcoPage = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 1h7l3 3v11H3V1z" fill="#fff" stroke="#999" strokeWidth="1"/>
    <path d="M10 1v3h3" fill="none" stroke="#999" strokeWidth="1"/>
  </svg>
);
const IcoSidebarToggle = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[#333]">
    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   TOOLBAR BUTTON
   ═══════════════════════════════════════════════════════════════════════════════ */
function TBtn({ icon: Icon, label, hasChevron, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-center justify-center px-[6px] py-[3px] min-w-[56px]
                 border border-transparent rounded-[3px]
                 hover:bg-[#dce9f7] hover:border-[#b0cde8]
                 disabled:opacity-30 disabled:pointer-events-none
                 select-none cursor-default">
      <div className="h-[30px] flex items-center justify-center"><Icon /></div>
      <span className="text-[11px] text-[#44546a] leading-tight mt-[1px]">{label}</span>
      {hasChevron && (
        <svg width="7" height="4" viewBox="0 0 7 4" className="mt-[1px]">
          <path d="M0.5 0.5L3.5 3.5L6.5 0.5" stroke="#44546a" strokeWidth="1" fill="none"/>
        </svg>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SIDEBAR RADIO / CHECKBOX
   ═══════════════════════════════════════════════════════════════════════════════ */
function SideRadio({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-[6px] cursor-pointer select-none py-[1px]">
      <input type="radio" checked={checked} onChange={onChange}
             className="w-[13px] h-[13px] accent-[#4472c4] m-0" />
      <span className={`text-[11.5px] ${checked ? 'text-[#2b579a] font-semibold' : 'text-[#333]'}`}>{label}</span>
    </label>
  );
}
function SideCheck({ checked, onChange, label, bold }) {
  return (
    <label className="flex items-center gap-[6px] cursor-pointer select-none py-[1px]">
      <input type="checkbox" checked={checked} onChange={onChange}
             className="w-[13px] h-[13px] accent-[#4472c4] m-0" />
      <span className={`text-[11.5px] text-[#333] ${bold ? 'font-semibold text-[#2b579a]' : ''}`}>{label}</span>
    </label>
  );
}





/* ═══════════════════════════════════════════════════════════════════════════════
   ACCOUNT SELECTOR (simple popup for choosing account)
   ═══════════════════════════════════════════════════════════════════════════════ */
function AccountSelector({ accounts, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const list = accounts.filter(a => a.code);
    if (!q) return list;
    const lq = q.toLowerCase();
    return list.filter(a => a.code.includes(lq) || (a.name || '').toLowerCase().includes(lq));
  }, [accounts, q]);

  return (
    <WinDialog title="Selección de cuenta" onClose={onClose} width={500}>
      <div className="p-2 border-b border-[#ccc] flex gap-2 items-center bg-[#f0f0f0]">
        <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cuenta..."
               className="flex-1 border border-[#999] px-2 py-[3px] text-[12px] outline-none bg-white" autoFocus />
      </div>
      <div className="bg-white overflow-auto" style={{ height: 300 }}>
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-[#f0f0f0] border-b border-[#ccc] sticky top-0">
              <th className="text-left px-2 py-[3px] font-normal text-[#555] w-[100px]">CUENTA</th>
              <th className="text-left px-2 py-[3px] font-normal text-[#555]">DESCRIPCIÓN</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-[#eee] hover:bg-[#e5f1fb] cursor-pointer"
                  onDoubleClick={() => onSelect(a)}
                  onClick={() => onSelect(a)}>
                <td className="px-2 py-[3px]">{a.code}</td>
                <td className="px-2 py-[3px] uppercase">{a.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 p-2 bg-[#f0f0f0] border-t border-[#ccc]">
        <button onClick={onClose}
                className="px-4 py-[3px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d5d5d5] text-[12px] active:bg-[#ccc]">
          Cancelar
        </button>
      </div>
    </WinDialog>
  );
}

function SearchableSelect({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(opt =>
    (opt.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (opt.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative flex-grow flex items-center min-w-0">
      <div onClick={() => setIsOpen(!isOpen)}
           className="w-full border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer flex items-center justify-between select-none min-w-0">
        <span className="truncate">{value ? value : placeholder}</span>
        <span className="text-[9px] text-gray-500 ml-1">▼</span>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[1000] mt-[1px] bg-white border border-[#999] shadow-[2px_3px_8px_rgba(0,0,0,0.2)] flex flex-col">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            autoFocus
            className="border-b border-[#ccc] p-1.5 text-[12px] outline-none w-full bg-white font-sans"
          />
          <div className="max-h-[140px] overflow-y-auto">
            <div
              onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
              className="px-2 py-1.5 hover:bg-[#cce5ff] cursor-pointer text-[12px] text-gray-500"
            >
              {placeholder}
            </div>
            {filtered.map(opt => (
              <div
                key={opt.id}
                onClick={() => { onChange(opt.code); setIsOpen(false); setSearch(''); }}
                className={`px-2 py-1.5 hover:bg-[#cce5ff] cursor-pointer text-[12px] ${value === opt.code ? 'bg-[#cce5ff] font-semibold' : ''}`}
              >
                {opt.code}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1.5 text-gray-400 text-[12px]">No hay resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function Analitica() {
  const { user, queryUserIds } = useAuth();

  const [rawAccounts, setRawAccounts] = useState([]);
  const [rawTransactions, setRawTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [sidebarVisible, setSidebarVisible] = useState(true);
 
  const [viewMode, setViewMode] = useState('contable'); // 'contable' | 'analitica'
  const [associations, setAssociations] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
 
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [showPgc, setShowPgc] = useState(false);
  const [showAux, setShowAux] = useState(true);
  const [showObsolete, setShowObsolete] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedPeriods, setSelectedPeriods] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [desvYear, setDesvYear] = useState(2026);
 
  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formAccount, setFormAccount] = useState(null);
  const [formMonths, setFormMonths] = useState(() => Object.fromEntries([...Array(12)].map((_, i) => [i, 0])));
  const [formInputValues, setFormInputValues] = useState(() => Object.fromEntries([...Array(12)].map((_, i) => [i, '0,00'])));
  const [formCebe, setFormCebe] = useState('');
  const [formCeco, setFormCeco] = useState('');
  const [showAccountSel, setShowAccountSel] = useState(false);
  const [showCebeSel, setShowCebeSel] = useState(false);
  const [showCecoSel, setShowCecoSel] = useState(false);
 
  // Desviacion modal states
  const [showDesviacionModal, setShowDesviacionModal] = useState(false);
  const [desvFilterCuenta, setDesvFilterCuenta] = useState('');
  const [desvFilterCebe, setDesvFilterCebe] = useState('');
  const [desvFilterCeco, setDesvFilterCeco] = useState('');
  const [desvCalculatedData, setDesvCalculatedData] = useState(null);
  const [showDesvAccountSel, setShowDesvAccountSel] = useState(false);
  const [showDesvCebeSel, setShowDesvCebeSel] = useState(false);
  const [showDesvCecoSel, setShowDesvCecoSel] = useState(false);
 
  // Drag+Resize state for budget modal
  const budgetDR = useDragResize({ initW: 440, initH: 520, minW: 380, minH: 400, storageKey: 'analitica_budgetModal' });
  // Drag+Resize state for deviations modal
  const desvDR = useDragResize({ initW: 800, initH: 550, minW: 600, minH: 400, storageKey: 'analitica_desvModal' });
  // Drag+Resize state for account selector modal
  const accountDR = useDragResize({ initW: 900, initH: 650, minW: 500, minH: 400, storageKey: 'analitica_accountModal' });
  // Drag+Resize state for analytical center selector modal
  const centerDR = useDragResize({ initW: 700, initH: 500, minW: 400, minH: 300, storageKey: 'analitica_centerModal' });
 
  /* ── Firestore ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    const uids = queryUserIds?.length ? queryUserIds : [user.uid];
    const uA = onSnapshot(query(collection(db, 'accounts'), where('userId', 'in', uids)), s => setRawAccounts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const uTx = onSnapshot(query(collection(db, 'transactions'), where('userId', 'in', uids)), s => setRawTransactions(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const uB = onSnapshot(query(collection(db, 'budgets'), where('userId', 'in', uids)), s => setBudgets(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const uAssoc = onSnapshot(query(collection(db, 'analitica_associations'), where('userId', 'in', uids)), s => setAssociations(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const uCenters = onSnapshot(query(collection(db, 'analytical_centers'), where('userId', 'in', uids)), s => {
      const docs = s.docs.map(d => ({ id: d.id, ...d.data() }));
      setCebes(docs.filter(c => c.type === 'cebe'));
      setCecos(docs.filter(c => c.type === 'ceco'));
    });
    return () => { uA(); uTx(); uB(); uAssoc(); uCenters(); };
  }, [user, queryUserIds]);
 
  useEffect(() => {
    const handleOpenDesviaciones = () => {
      setShowDesviacionModal(true);
    };
    window.addEventListener('analitica:open-desviacion-modal', handleOpenDesviaciones);
    return () => {
      window.removeEventListener('analitica:open-desviacion-modal', handleOpenDesviaciones);
    };
  }, []);

  useEffect(() => {
    if (showDesviacionModal) {
      setDesvYear(selectedYear);
      setDesvCalculatedData(null);
    }
  }, [showDesviacionModal, selectedYear]);
 
  /* ── Budget data for selected year ────────────────────────────────────────── */
  const budgetsForYear = useMemo(() => budgets.filter(b => b.year === selectedYear), [budgets, selectedYear]);

  /* ── Build tree ONLY from budgets (table starts empty if no budgets) ─────── */
  // Real account codes from the DB (the ones the user actually created)
  const realAccountCodes = useMemo(() => new Set(rawAccounts.map(a => a.code).filter(Boolean)), [rawAccounts]);

  const budgetCodes = useMemo(() => {
    // Start with the exact codes that have a budget
    const leafCodes = new Set(budgetsForYear.map(b => b.accountCode).filter(Boolean));
    const codes = new Set(leafCodes);
    // Only add parent codes that actually exist in the user's account database
    leafCodes.forEach(c => {
      for (let l = 1; l < c.length; l++) {
        const parent = c.slice(0, l);
        if (realAccountCodes.has(parent)) codes.add(parent);
      }
    });
    return Array.from(codes).sort();
  }, [budgetsForYear, realAccountCodes]);

  // Set of codes that have a direct budget entry
  const leafBudgetCodes = useMemo(() => new Set(budgetsForYear.map(b => b.accountCode).filter(Boolean)), [budgetsForYear]);

  const treeRows = useMemo(() => {
    // If onlyAssigned, show only the exact leaf codes with budgets (no parents, no hierarchy)
    let codes = onlyAssigned
      ? Array.from(leafBudgetCodes).sort()
      : budgetCodes;
    if (groupFilter !== 'ALL') codes = codes.filter(c => c.startsWith(groupFilter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      codes = codes.filter(c => c.includes(q) || descr(c, rawAccounts).toLowerCase().includes(q));
    }
    return codes.map(code => {
      const isLeaf = leafBudgetCodes.has(code);
      const buds = budgetsForYear.filter(b => b.accountCode === code);
      const childBuds = onlyAssigned
        ? buds   // in flat mode, no children aggregation
        : budgetsForYear.filter(b => b.accountCode.startsWith(code));
      const total = (onlyAssigned ? buds : childBuds).reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
      const months = Object.fromEntries([...Array(12)].map((_, i) => [i,
        (onlyAssigned ? buds : childBuds).reduce((s, b) => s + (parseFloat(b.months?.[i]) || 0), 0)
      ]));
      let depth = 0;
      if (!onlyAssigned) {
        if (code.length === 2) depth = 1;
        else if (code.length === 3) depth = 2;
        else if (code.length === 4) depth = 3;
        else if (code.length > 4) depth = 4;
      }
      const hasChildren = !onlyAssigned && codes.some(o => o !== code && o.startsWith(code));
      return { id: code, code, name: descr(code, rawAccounts), depth, hasChildren, total, months, isLeaf };
    });
  }, [budgetCodes, leafBudgetCodes, budgetsForYear, rawAccounts, groupFilter, searchQuery, onlyAssigned]);

  const analyticalTreeRows = useMemo(() => {
    if (viewMode !== 'analitica') return [];

    // Find all unique CEBE codes present in budgetsForYear
    const cebeCodes = Array.from(new Set(budgetsForYear.map(b => b.cebe).filter(Boolean))).sort();
    
    const rows = [];
    cebeCodes.forEach(cebeCode => {
      const cebeCenter = cebes.find(c => c.code === cebeCode);
      const cebeName = cebeCenter ? cebeCenter.name : `CEBE ${cebeCode}`;
      
      const budsForCebe = budgetsForYear.filter(b => b.cebe === cebeCode);
      const cebeTotal = budsForCebe.reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
      const cebeMonths = Object.fromEntries([...Array(12)].map((_, i) => [
        i,
        budsForCebe.reduce((s, b) => s + (parseFloat(b.months?.[i]) || 0), 0)
      ]));

      const cecoCodes = Array.from(new Set(budsForCebe.map(b => b.ceco).filter(Boolean))).sort();
      const hasChildren = cecoCodes.length > 0;

      rows.push({
        id: cebeCode,
        code: cebeCode,
        name: cebeName.toUpperCase(),
        depth: 0,
        hasChildren,
        total: cebeTotal,
        months: cebeMonths,
        isCebe: true,
        isCeco: false,
        cebeCode
      });

      if (hasChildren && !collapsed[cebeCode]) {
        cecoCodes.forEach(cecoCode => {
          const cecoCenter = cecos.find(c => c.code === cecoCode);
          const cecoName = cecoCenter ? cecoCenter.name : `CECO ${cecoCode}`;

          const budsForCeco = budsForCebe.filter(b => b.ceco === cecoCode);
          const cecoTotal = budsForCeco.reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
          const cecoMonths = Object.fromEntries([...Array(12)].map((_, i) => [
            i,
            budsForCeco.reduce((s, b) => s + (parseFloat(b.months?.[i]) || 0), 0)
          ]));

          rows.push({
            id: `${cebeCode}_${cecoCode}`,
            code: cecoCode,
            name: cecoName.toUpperCase(),
            depth: 1,
            hasChildren: false,
            total: cecoTotal,
            months: cecoMonths,
            isCebe: false,
            isCeco: true,
            cebeCode,
            cecoCode
          });
        });
      }
    });

    return rows;
  }, [viewMode, budgetsForYear, cebes, cecos, collapsed]);

  const visibleRows = useMemo(() => {
    if (viewMode === 'analitica') {
      let rows = analyticalTreeRows;
      if (hideZero) rows = rows.filter(r => r.total !== 0);
      return rows;
    }
    let rows = treeRows;
    if (hideZero) rows = rows.filter(r => r.total !== 0);
    return rows.filter(r => {
      for (let l = 1; l < r.code.length; l++) {
        if (collapsed[r.code.slice(0, l)]) return false;
      }
      return true;
    });
  }, [treeRows, analyticalTreeRows, collapsed, hideZero, viewMode]);

  const performanceTotals = useMemo(() => {
    const monthsDiff = Array(12).fill(0);
    const monthsHaber = Array(12).fill(0);
    const monthsDebe = Array(12).fill(0);

    let totalHaber = 0;
    let totalDebe = 0;

    budgetsForYear.forEach(b => {
      const code = b.accountCode || '';
      const isHaber = code.startsWith('7');
      const isDebe = code.startsWith('6');

      if (isHaber) {
        totalHaber += parseFloat(b.total) || 0;
        for (let i = 0; i < 12; i++) {
          monthsHaber[i] += parseFloat(b.months?.[i]) || 0;
        }
      } else if (isDebe) {
        totalDebe += parseFloat(b.total) || 0;
        for (let i = 0; i < 12; i++) {
          monthsDebe[i] += parseFloat(b.months?.[i]) || 0;
        }
      }
    });

    for (let i = 0; i < 12; i++) {
      monthsDiff[i] = monthsHaber[i] - monthsDebe[i];
    }
    const totalDiff = totalHaber - totalDebe;

    return {
      monthsDiff,
      totalDiff
    };
  }, [budgetsForYear]);

  // Auto-fill account when CEBE and CECO are selected based on associations
  useEffect(() => {
    if (!formCebe || !formCeco) return;
    const assoc = associations.find(a => a.cebe === formCebe && a.ceco === formCeco);
    if (assoc) {
      const acc = rawAccounts.find(a => a.code === assoc.accountCode) || { id: assoc.accountCode, code: assoc.accountCode, name: assoc.accountName };
      setFormAccount(acc);
    }
  }, [formCebe, formCeco, associations, rawAccounts]);

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  const fmt = v => v === 0 ? '' : (v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shouldRenderMonth = (idx) => {
    if (selectedPeriods.length === 0) return true; // ALL
    if (selectedPeriods.includes(String(idx))) return true;
    const q = Math.floor(idx / 3) + 1;
    if (selectedPeriods.includes(`${q}T`)) return true;
    return false;
  };
  const formTotal = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const openNew = () => {
    setFormAccount(null);
    setFormMonths(Object.fromEntries([...Array(12)].map((_, i) => [i, 0])));
    setFormInputValues(Object.fromEntries([...Array(12)].map((_, i) => [i, '0,00'])));
    setFormCebe('');
    setFormCeco('');
    setIsEditing(false);
    setShowForm(true);
  };
  const openEdit = () => {
    if (!selectedRowId) return;
    const row = visibleRows.find(r => r.id === selectedRowId);
    if (!row) return;

    let bud;
    if (viewMode === 'analitica') {
      if (row.isCebe) {
        alert('Selecciona un CECO para modificar su presupuesto.');
        return;
      }
      bud = budgets.find(b => b.cebe === row.cebeCode && b.ceco === row.cecoCode && b.year === selectedYear);
    } else {
      bud = budgets.find(b => b.accountCode === row.code && b.year === selectedYear);
    }

    if (!bud) return;
    const acc = rawAccounts.find(a => a.code === bud.accountCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };
    setFormAccount(acc);
    setFormMonths({ ...bud.months });
    setFormInputValues(Object.fromEntries([...Array(12)].map((_, i) => [
      i,
      (bud.months?.[i] || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ])));
    setFormCebe(bud.cebe || '');
    setFormCeco(bud.ceco || '');
    setIsEditing(true);
    setShowForm(true);
  };
  const openDelete = async () => {
    if (!selectedRowId) return;
    const row = visibleRows.find(r => r.id === selectedRowId);
    if (!row) return;

    let bud;
    if (viewMode === 'analitica') {
      if (row.isCebe) {
        alert('Selecciona un CECO para eliminar su presupuesto.');
        return;
      }
      bud = budgets.find(b => b.cebe === row.cebeCode && b.ceco === row.cecoCode && b.year === selectedYear);
    } else {
      bud = budgets.find(b => b.accountCode === row.code && b.year === selectedYear);
    }

    if (!bud) { alert('No hay presupuesto para este registro/año.'); return; }
    if (!window.confirm(`¿Eliminar presupuesto seleccionado?`)) return;
    await deleteDoc(doc(db, 'budgets', bud.id));
    setSelectedRowId(null);
  };

  const handleProcederDesviaciones = () => {
    if (!desvFilterCuenta && !desvFilterCebe && !desvFilterCeco) {
      alert('Por favor, seleccione al menos un elemento para analizar.');
      return;
    }

    const calculatedMonths = [];
    let cumulativePresupuesto = 0;
    let cumulativeSaldo = 0;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11

    let monthsToShow = 12;
    if (desvYear === currentYear) {
      monthsToShow = currentMonth + 1;
    } else if (desvYear > currentYear) {
      monthsToShow = 0;
    }

    for (let m = 0; m < monthsToShow; m++) {
      const buds = budgets.filter(b => b.year === desvYear).filter(b => {
        if (desvFilterCuenta && (!b.accountCode || !b.accountCode.startsWith(desvFilterCuenta))) return false;
        if (desvFilterCebe && (!b.cebe || b.cebe.replace(/^(CEBE|CECO)/i, '').trim() !== desvFilterCebe.replace(/^(CEBE|CECO)/i, '').trim())) return false;
        if (desvFilterCeco && (!b.ceco || b.ceco.replace(/^(CEBE|CECO)/i, '').trim() !== desvFilterCeco.replace(/^(CEBE|CECO)/i, '').trim())) return false;
        return true;
      });
      const presupuesto_m = buds.reduce((s, b) => s + (parseFloat(b.months?.[m]) || 0), 0);

      const txsInMonth = rawTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDate = new Date(tx.date);
        if (txDate.getFullYear() !== desvYear) return false;
        if (txDate.getMonth() !== m) return false;
        
        if (desvFilterCuenta) {
          const account = rawAccounts.find(a => a.id === tx.accountId || a.code === tx.accountId);
          if (!account || !account.code || !account.code.startsWith(desvFilterCuenta)) return false;
        }
        if (desvFilterCebe && (!tx.cebe || tx.cebe.replace(/^(CEBE|CECO)/i, '').trim() !== desvFilterCebe.replace(/^(CEBE|CECO)/i, '').trim())) return false;
        if (desvFilterCeco && (!tx.ceco || tx.ceco.replace(/^(CEBE|CECO)/i, '').trim() !== desvFilterCeco.replace(/^(CEBE|CECO)/i, '').trim())) return false;
        return true;
      });

      const saldo_m = txsInMonth.reduce((sum, tx) => {
        const account = rawAccounts.find(a => a.id === tx.accountId || a.code === tx.accountId);
        return sum + getTransactionNet(tx, account);
      }, 0);

      const desviacion_m = saldo_m - presupuesto_m;

      let pctDesviacion_m = 0;
      if (presupuesto_m === 0) {
        if (saldo_m === 0) pctDesviacion_m = 0;
        else pctDesviacion_m = saldo_m > 0 ? 100 : -100;
      } else {
        pctDesviacion_m = (desviacion_m / presupuesto_m) * 100;
      }

      cumulativePresupuesto += presupuesto_m;
      cumulativeSaldo += saldo_m;
      const cumulativeDesviacion = cumulativeSaldo - cumulativePresupuesto;
      
      let pctDesvArrast_m = 0;
      if (cumulativePresupuesto === 0) {
        if (cumulativeSaldo === 0) pctDesvArrast_m = 0;
        else pctDesvArrast_m = cumulativeSaldo > 0 ? 100 : -100;
      } else {
        pctDesvArrast_m = (cumulativeDesviacion / cumulativePresupuesto) * 100;
      }

      calculatedMonths.push({
        mes: MONTHS_LONG[m],
        presupuesto: presupuesto_m,
        saldo: saldo_m,
        desviacion: desviacion_m,
        pctDesviacion: pctDesviacion_m,
        pctDesvArrast: pctDesvArrast_m
      });
    }

    const totalPresupuesto = calculatedMonths.reduce((s, x) => s + x.presupuesto, 0);
    const totalSaldo = calculatedMonths.reduce((s, x) => s + x.saldo, 0);
    const totalDesviacion = totalSaldo - totalPresupuesto;
    let totalPctDesviacion = 0;
    if (totalPresupuesto === 0) {
      if (totalSaldo === 0) totalPctDesviacion = 0;
      else totalPctDesviacion = totalSaldo > 0 ? 100 : -100;
    } else {
      totalPctDesviacion = (totalDesviacion / totalPresupuesto) * 100;
    }

    setDesvCalculatedData({
      months: calculatedMonths,
      totals: {
        presupuesto: totalPresupuesto,
        saldo: totalSaldo,
        desviacion: totalDesviacion,
        pctDesviacion: totalPctDesviacion,
        pctDesvArrast: totalPctDesviacion
      }
    });
  };

  const saveBudget = async () => {
    if (!formAccount) { alert('Selecciona una cuenta contable.'); return; }
    const total = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const id = `${user.uid}_${selectedYear}_${formAccount.code}${formCebe ? `_${formCebe}` : ''}${formCeco ? `_${formCeco}` : ''}`;
    
    if (isEditing && selectedRowId) {
      const row = visibleRows.find(r => r.id === selectedRowId);
      let oldBud;
      if (viewMode === 'analitica' && row?.isCeco) {
        oldBud = budgets.find(b => b.cebe === row.cebeCode && b.ceco === row.cecoCode && b.year === selectedYear);
      } else if (viewMode === 'contable') {
        oldBud = budgets.find(b => b.accountCode === row?.code && b.year === selectedYear);
      }
      if (oldBud && oldBud.id !== id) {
        await deleteDoc(doc(db, 'budgets', oldBud.id));
      }
    }

    await setDoc(doc(db, 'budgets', id), {
      id, accountId: formAccount.id, accountCode: formAccount.code, accountName: formAccount.name || '',
      year: selectedYear, total: parseFloat(total.toFixed(2)), months: formMonths,
      cebe: formCebe || '', ceco: formCeco || '',
      userId: user.uid, updatedAt: new Date().toISOString()
    }, { merge: true });
    setShowForm(false);
  };
  const distribute = () => {
    const total = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const each = parseFloat((total / 12).toFixed(2));
    setFormMonths(Object.fromEntries([...Array(12)].map((_, i) => [i, each])));
    setFormInputValues(Object.fromEntries([...Array(12)].map((_, i) => [
      i,
      each.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ])));
  };

  const visibleMonthsCount = useMemo(() => {
    if (selectedPeriods.length === 0) return 12;
    let count = 0;
    for (let i = 0; i < 12; i++) {
      if (shouldRenderMonth(i)) count++;
    }
    return count;
  }, [selectedPeriods]);
  const minWidth = 180 + 320 + 120 + visibleMonthsCount * 80;

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="w-full h-full flex flex-col bg-white font-[Segoe_UI,Tahoma,sans-serif] text-[12px] text-[#333] select-none">

      {/* ── TOOLBAR (Foto 1 exact) ──────────────────────────────────────────── */}
      <div className="bg-[#f3f3f3] border-b border-[#d6d6d6] flex items-end px-[6px] pb-[2px] pt-[6px] shrink-0">
        <TBtn icon={IcoNuevo}  label="Nuevo"     hasChevron onClick={openNew} />
        <TBtn icon={IcoModif}  label="Modificar" hasChevron onClick={openEdit} disabled={!selectedRowId} />
        <TBtn icon={IcoElim}   label="Eliminar"  hasChevron onClick={openDelete} disabled={!selectedRowId} />
        <div className="w-[1px] self-stretch my-[6px] bg-[#d6d6d6] mx-[6px]" />
        <TBtn icon={IcoSubir}  label="Subir"  onClick={() => {}} disabled={!selectedRowId} />
        <TBtn icon={IcoBajar}  label="Bajar"  onClick={() => {}} disabled={!selectedRowId} />
        <div className="w-[1px] self-stretch my-[6px] bg-[#d6d6d6] mx-[6px]" />
        <TBtn icon={IcoExpandir}  label="Expandir"  onClick={() => setCollapsed({})} />
        <TBtn icon={IcoColapsar}  label="Colapsar"  onClick={() => { const k = {}; treeRows.forEach(r => { if (r.hasChildren) k[r.code] = true; }); setCollapsed(k); }} />
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR (Foto 1 exact) ───────────────────────────────────── */}
        {sidebarVisible && (
          <div className="flex shrink-0 border-r border-[#d6d6d6]">
            {/* The main sidebar */}
            <div className="w-[150px] bg-[#f3f3f3] flex flex-col overflow-y-auto select-none border-r border-slate-300">
              {/* Lista actual */}
              <div className="bg-[#e6e8ec] text-[#333] text-[12px] font-bold px-3 py-[5px] border-b border-[#d6d6d6]">
                Lista actual
              </div>
              {/* Radio buttons */}
              <div className="px-3 pt-2 pb-1 flex flex-col">
                <SideRadio checked={groupFilter === 'ALL'} onChange={() => setGroupFilter('ALL')} label="Todos los grupos" />
                {['0','1','2','3','4','5','6','7','8','9'].map(n => (
                  <SideRadio key={n} checked={groupFilter === n} onChange={() => setGroupFilter(n)} label={`Mostrar grupo ${n}`} />
                ))}
              </div>
              {/* Checkboxes */}
              <div className="px-3 pt-1 pb-2 flex flex-col border-b border-[#d6d6d6]">
                <SideCheck checked={onlyAssigned} onChange={e => { setOnlyAssigned(e.target.checked); setCollapsed({}); }} label="Mostrar solo asignadas" bold={onlyAssigned} />
              </div>

              {/* Vista selector */}
              <div className="bg-[#e6e8ec] text-[#333] text-[12px] font-bold px-3 py-[5px] border-b border-[#d6d6d6]">
                Vista
              </div>
              <div className="px-3 py-2 flex flex-col gap-1 border-b border-[#d6d6d6]">
                <SideRadio checked={viewMode === 'contable'} onChange={() => { setViewMode('contable'); setSelectedRowId(null); setCollapsed({}); }} label="Cuentas Contables" />
                <SideRadio checked={viewMode === 'analitica'} onChange={() => { setViewMode('analitica'); setSelectedRowId(null); setCollapsed({}); }} label="Cuenta Analítica" />
              </div>
              
              {/* Bottom: Ver saldos */}
              <div className="bg-[#e6e8ec] border-t border-[#d6d6d6] p-2 mt-auto shrink-0">
                <div className="text-[11px] text-[#555] mb-1">Ver saldos del diario</div>
                <select className="w-full border border-[#aaa] bg-white text-[11px] px-1 py-[3px] outline-none">
                  <option>Todas</option>
                </select>
              </div>
            </div>

            {/* The date strip */}
            <div className="w-[50px] bg-white flex flex-col items-center py-2 gap-1.5 shrink-0 overflow-y-auto">
              {['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'].map((m, idx) => {
                const active = selectedPeriods.includes(String(idx));
                return (
                  <button key={m} onClick={() => setSelectedPeriods(prev => prev.includes(String(idx)) ? prev.filter(p => p !== String(idx)) : [...prev, String(idx)])}
                          className={`text-[9px] font-bold py-[3px] w-full text-center hover:bg-slate-100 ${active ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600' : 'text-slate-600'}`}>
                    {m}
                  </button>
                );
              })}
              <div className="w-full border-t border-slate-200 my-1" />
              {['1T', '2T', '3T', '4T'].map(q => {
                const active = selectedPeriods.includes(q);
                return (
                  <button key={q} onClick={() => setSelectedPeriods(prev => prev.includes(q) ? prev.filter(p => p !== q) : [...prev, q])}
                          className={`text-[9px] font-bold py-[3px] w-full text-center hover:bg-slate-100 ${active ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600' : 'text-slate-600'}`}>
                    {q}
                  </button>
                );
              })}
              <div className="w-full border-t border-slate-200 my-1" />
              {[2024, 2025, 2026, 2027].map(y => {
                const active = selectedYear === y;
                return (
                  <button key={y} onClick={() => { setSelectedYear(y); setSelectedPeriods([]); }}
                          className={`text-[9px] font-bold py-[3px] w-full text-center hover:bg-slate-100 ${active ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-600' : 'text-slate-600'}`}>
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TABLE AREA ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Thin bar above table with sidebar toggle and search */}
          <div className="flex items-center justify-between border-b border-[#e0e0e0] bg-[#f8f9fa] px-2 py-[4px] shrink-0">
            <button onClick={() => setSidebarVisible(p => !p)} title="Ocultar/Mostrar filtros"
                    className="hover:bg-[#e0e0e0] p-[2px] rounded-[2px] text-[#333] flex items-center justify-center border border-[#bbb] bg-white shadow-sm active:bg-[#ccc]">
              <IcoSidebarToggle />
            </button>
            <div className="relative flex items-center">
              <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                     value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                     className="w-[220px] pr-5 py-[2px] text-[11px] text-right border-b border-[#aaa] outline-none focus:border-b-[#4472c4] bg-transparent placeholder:text-[#aaa]" />
              <Search size={13} className="absolute right-0 text-[#aaa] pointer-events-none" />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white" onClick={() => setSelectedRowId(null)}>
            {/* Horizontal scroll wrapper for both tables */}
            <div className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden">
              <div style={{ minWidth }} className="flex-1 flex flex-col overflow-hidden">
                {/* Body Table */}
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse text-[11px]" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 180 }} />
                      <col style={{ width: 320 }} />
                      <col style={{ width: 120 }} />
                      {MONTHS_HDR.map((_, i) => shouldRenderMonth(i) && <col key={i} style={{ width: 80 }} />)}
                    </colgroup>
                    <thead>
                      <tr className="sticky top-0 bg-white border-b border-[#d6d6d6] z-10">
                        <th className="text-left font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">
                          <span>{viewMode === 'analitica' ? 'CEBE / CECO' : 'CUENTA'}</span>
                        </th>
                        <th className="text-left font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">DESCRIPCIÓN</th>
                        <th className="text-right font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">PRESUPUESTO</th>
                        {MONTHS_HDR.map((m, i) => shouldRenderMonth(i) && (
                          <th key={m} className="text-right font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => {
                        const sel = selectedRowId === row.id;
                        return (
                          <tr key={row.id}
                              className={`border-b border-[#f0f0f0] cursor-default ${sel ? 'bg-[#cce5ff]' : 'hover:bg-[#f5f7fa]'}`}
                              onClick={e => { e.stopPropagation(); setSelectedRowId(row.id); }}
                              onDoubleClick={() => { setSelectedRowId(row.id); setTimeout(openEdit, 0); }}>
                            <td className="py-[3px] px-2 whitespace-nowrap">
                              <div className="flex items-center" style={{ paddingLeft: row.depth * 16 }}>
                                {row.hasChildren ? (
                                  <button onClick={e => { e.stopPropagation(); setCollapsed(p => ({ ...p, [row.code]: !p[row.code] })); }}
                                          className="mr-[5px] text-[#999] hover:text-[#333] flex items-center justify-center w-[14px] h-[14px]">
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                      {collapsed[row.code]
                                        ? <path d="M2 0l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                        : <path d="M0 2l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />}
                                    </svg>
                                  </button>
                                ) : <span className="w-[19px] shrink-0" />}
                                <span className="text-[11px] text-[#333]">{row.code}</span>
                              </div>
                            </td>
                            <td className="py-[3px] px-2 text-[11px] uppercase text-[#333] whitespace-nowrap overflow-hidden text-ellipsis">{row.name}</td>
                            <td className="py-[3px] px-2 text-right text-[11px]">{fmt(row.total)}</td>
                            {[...Array(12)].map((_, i) => shouldRenderMonth(i) && (
                              <td key={i} className="py-[3px] px-2 text-right text-[11px]">{fmt(row.months[i])}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Fixed bottom footer table */}
                <div className="border-t-2 border-[#d6d6d6] bg-[#fcfbf9] shrink-0 select-text">
                  <table className="w-full border-collapse text-[11px]" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: 180 }} />
                      <col style={{ width: 320 }} />
                      <col style={{ width: 120 }} />
                      {MONTHS_HDR.map((_, i) => shouldRenderMonth(i) && <col key={i} style={{ width: 80 }} />)}
                    </colgroup>
                    <tbody>
                      <tr className="font-bold text-[11px]">
                        <td colSpan={2} className="text-right pr-4 py-1 text-[#2b579a]">TOTAL:</td>
                        <td className="text-right px-2 py-1 text-[#a51d24]">{fmt(performanceTotals.totalDiff)}</td>
                        {performanceTotals.monthsDiff.map((diff, i) => shouldRenderMonth(i) && (
                          <td key={i} className="text-right px-2 py-1 text-[#a51d24]">{fmt(diff)}</td>
                        ))}
                      </tr>
                      <tr className="font-bold text-[11px]">
                        <td colSpan={2} className="text-right pr-4 py-1 text-[#2b579a]">SALDO PUNTEADO:</td>
                        <td className="text-right px-2 py-1 text-[#a51d24]">{fmt(0)}</td>
                        {[...Array(12)].map((_, i) => shouldRenderMonth(i) && (
                          <td key={i} className="text-right px-2 py-1 text-[#a51d24]">{fmt(0)}</td>
                        ))}
                      </tr>
                      <tr className="font-bold text-[11px] border-b border-[#d6d6d6]">
                        <td colSpan={2} className="text-right pr-4 py-1 text-[#2b579a]">SALDO SIN PUNTEAR:</td>
                        <td className="text-right px-2 py-1 text-[#a51d24]">{fmt(performanceTotals.totalDiff)}</td>
                        {performanceTotals.monthsDiff.map((diff, i) => shouldRenderMonth(i) && (
                          <td key={i} className="text-right px-2 py-1 text-[#a51d24]">{fmt(diff)}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Ficha de presupuesto anual  (Foto 4 EXACT)
      ═══════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div style={{ position: 'absolute', left: budgetDR.pos.x, top: budgetDR.pos.y, width: budgetDR.size.w, height: budgetDR.size.h }}
               className="bg-[#f0f0f0] border border-[#888] shadow-[2px_3px_12px_rgba(0,0,0,0.35)] flex flex-col select-none relative overflow-hidden">
            {budgetDR.resizeHandles}
            {/* Title bar with image icons (Foto 2 exact) */}
            <div onMouseDown={budgetDR.onDragDown} className="flex items-center px-2 py-[5px] border-b border-[#ccc] gap-2 cursor-move shrink-0 bg-[#e1e1e1]">
              <div className="flex items-center shrink-0">
                {/* Two overlapping picture frames with diagonal hatching */}
                <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
                  {/* Back frame (offset right+up) */}
                  <rect x="10" y="1" width="24" height="18" stroke="#888" fill="#fff" strokeWidth="1"/>
                  {/* Diagonal hatching on back frame */}
                  <line x1="12" y1="1" x2="34" y2="19" stroke="#ccc" strokeWidth="0.5"/>
                  <line x1="18" y1="1" x2="34" y2="13" stroke="#ccc" strokeWidth="0.5"/>
                  <line x1="24" y1="1" x2="34" y2="7" stroke="#ccc" strokeWidth="0.5"/>
                  <line x1="10" y1="7" x2="28" y2="19" stroke="#ccc" strokeWidth="0.5"/>
                  <line x1="10" y1="13" x2="22" y2="19" stroke="#ccc" strokeWidth="0.5"/>

                  {/* Front frame (main, offset left+down) */}
                  <rect x="1" y="6" width="24" height="18" stroke="#888" fill="#fff" strokeWidth="1"/>
                  {/* Landscape icon inside front frame */}
                  <circle cx="9" cy="13" r="2" stroke="#999" fill="none" strokeWidth="0.8"/>
                  <polyline points="1,22 7,16 12,19 18,13 25,22" stroke="#999" fill="none" strokeWidth="0.8"/>

                  {/* Right-side icon: small document/list with colored bars */}
                  <rect x="30" y="2" width="22" height="28" stroke="#888" fill="#fff" strokeWidth="1"/>
                  {/* Diagonal hatching on right icon */}
                  <line x1="32" y1="2" x2="52" y2="22" stroke="#ddd" strokeWidth="0.5"/>
                  <line x1="38" y1="2" x2="52" y2="16" stroke="#ddd" strokeWidth="0.5"/>
                  <line x1="44" y1="2" x2="52" y2="10" stroke="#ddd" strokeWidth="0.5"/>
                  <line x1="30" y1="8" x2="50" y2="28" stroke="#ddd" strokeWidth="0.5"/>
                  <line x1="30" y1="14" x2="44" y2="28" stroke="#ddd" strokeWidth="0.5"/>
                  <line x1="30" y1="20" x2="38" y2="28" stroke="#ddd" strokeWidth="0.5"/>
                  {/* Small colored rectangles (chart bars) */}
                  <rect x="33" y="6" width="8" height="2.5" fill="#d63031" rx="0.5"/>
                  <rect x="33" y="10" width="12" height="2.5" fill="#0984e3" rx="0.5"/>
                  <rect x="33" y="14" width="6" height="2.5" fill="#00b894" rx="0.5"/>
                  <rect x="33" y="18" width="14" height="2.5" fill="#fdcb6e" rx="0.5"/>
                </svg>
              </div>
              <span className="text-[12px] text-[#333] font-normal flex-1 text-center font-bold">Ficha de presupuesto anual</span>
              <button onClick={() => setShowForm(false)} className="w-[20px] h-[20px] flex items-center justify-center hover:bg-red-500 hover:text-white text-[#666] rounded-[2px] shrink-0">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
              {/* Informative Year Note */}
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 text-[11.5px] rounded-[3px] font-semibold flex items-center gap-1.5 shrink-0">
                <Info size={14} className="text-blue-600 shrink-0" />
                <span>
                  {isEditing 
                    ? `Modificando presupuesto para el año ${selectedYear}` 
                    : `Creando nuevo presupuesto para el año ${selectedYear}`}
                </span>
              </div>

              {/* CEBE and CECO selection */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-[6px]">
                  <span className="border border-[#999] bg-[#f8f9fa] px-2 py-[3px] text-[12px] text-[#333] w-[65px] text-center shrink-0">CEBE:</span>
                  <input type="text" readOnly value={formCebe}
                         onClick={() => setShowCebeSel(true)}
                         placeholder="(Sin CEBE)"
                         className="flex-1 border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none placeholder:text-slate-400 font-mono font-bold" />
                </div>
                <div className="flex items-center gap-[6px]">
                  <span className="border border-[#999] bg-[#f8f9fa] px-2 py-[3px] text-[12px] text-[#333] w-[65px] text-center shrink-0">CECO:</span>
                  <input type="text" readOnly value={formCeco}
                         onClick={() => setShowCecoSel(true)}
                         placeholder="(Sin CECO)"
                         className="flex-1 border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none placeholder:text-slate-400 font-mono font-bold" />
                </div>
              </div>

              {/* Cuenta */}
              <div className="flex items-center gap-[6px]">
                <span className="border border-[#999] bg-[#f8f9fa] px-2 py-[3px] text-[12px] text-[#333] w-[65px] text-center shrink-0 font-bold">Cuenta:</span>
                <input type="text" readOnly value={formAccount?.code || ''}
                       onClick={() => setShowAccountSel(true)}
                       className="w-[80px] border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none font-mono" />
                <span className="text-[12px] text-[#333] uppercase truncate flex-1 font-semibold">{formAccount?.name || ''}</span>
              </div>

              {/* Presupuesto anual + Repartir */}
              <div className="flex items-center gap-[6px]">
                <span className="border border-[#999] bg-[#f8f9fa] px-2 py-[3px] text-[12px] font-semibold text-[#333] whitespace-nowrap">Presupuesto anual:</span>
                <input type="text" readOnly value={formTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       className="w-[80px] border border-[#999] px-2 py-[3px] text-[12px] text-right bg-white outline-none font-bold" />
                <button onClick={distribute}
                        className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] px-3 py-[3px] text-[12px] whitespace-nowrap active:bg-[#c0c0c0]">
                  Repartir proporcionalmente
                </button>
              </div>

              {/* Months grid: 2 columns, 6 rows with separators */}
              <div className="border border-[#bbb] bg-white shrink-0">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`grid grid-cols-2 gap-x-4 px-3 py-[5px] ${i < 5 ? 'border-b border-[#e0e0e0]' : ''}`}>
                    {/* Left column month */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[#333] font-semibold w-[85px]">{MONTHS_LONG[i]}</span>
                      <input type="text"
                             value={formInputValues[i] || ''}
                             onChange={e => {
                               let valStr = e.target.value;
                               valStr = cleanNumericInput(valStr);
                               if (/^-?[0-9]*([,][0-9]*)?$/.test(valStr)) {
                                 setFormInputValues(p => ({ ...p, [i]: valStr }));
                                 const normalized = valStr.replace(',', '.');
                                 const valNum = parseFloat(normalized) || 0;
                                 setFormMonths(p => ({ ...p, [i]: valNum }));
                               }
                             }}
                             onFocus={e => {
                               const normalized = (formInputValues[i] || '').replace(/\./g, '').replace(',', '.');
                               const valNum = parseFloat(normalized) || 0;
                               setFormInputValues(p => ({ ...p, [i]: valNum === 0 ? '' : valNum.toString().replace('.', ',') }));
                               e.target.select();
                             }}
                             onBlur={() => {
                               const normalized = (formInputValues[i] || '').replace(/\./g, '').replace(',', '.');
                               const valNum = parseFloat(normalized) || 0;
                               setFormInputValues(p => ({ ...p, [i]: valNum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));
                               setFormMonths(p => ({ ...p, [i]: valNum }));
                             }}
                             className="w-[65px] border border-[#999] px-2 py-[2px] text-[12px] text-right outline-none bg-white font-mono" />
                    </div>
                    {/* Right column month */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[#333] font-semibold w-[85px]">{MONTHS_LONG[i + 6]}</span>
                      <input type="text"
                             value={formInputValues[i + 6] || ''}
                             onChange={e => {
                               let valStr = e.target.value;
                               valStr = cleanNumericInput(valStr);
                               if (/^-?[0-9]*([,][0-9]*)?$/.test(valStr)) {
                                 setFormInputValues(p => ({ ...p, [i + 6]: valStr }));
                                 const normalized = valStr.replace(',', '.');
                                 const valNum = parseFloat(normalized) || 0;
                                 setFormMonths(p => ({ ...p, [i + 6]: valNum }));
                               }
                             }}
                             onFocus={e => {
                               const normalized = (formInputValues[i + 6] || '').replace(/\./g, '').replace(',', '.');
                               const valNum = parseFloat(normalized) || 0;
                               setFormInputValues(p => ({ ...p, [i + 6]: valNum === 0 ? '' : valNum.toString().replace('.', ',') }));
                               e.target.select();
                             }}
                             onBlur={() => {
                               const normalized = (formInputValues[i + 6] || '').replace(/\./g, '').replace(',', '.');
                               const valNum = parseFloat(normalized) || 0;
                               setFormInputValues(p => ({ ...p, [i + 6]: valNum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));
                               setFormMonths(p => ({ ...p, [i + 6]: valNum }));
                             }}
                             className="w-[65px] border border-[#999] px-2 py-[2px] text-[12px] text-right outline-none bg-white font-mono" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sticky footer buttons at the very bottom of the window box */}
            <div className="flex justify-end gap-2 p-3 bg-[#e1e1e1] border-t border-[#ccc] shrink-0">
              <button onClick={saveBudget}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Aceptar
              </button>
              <button onClick={() => setShowForm(false)}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account selector - Full Accounts modal (same as Plan de Cuentas) */}
      {showAccountSel && (
        <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', left: accountDR.pos.x, top: accountDR.pos.y, width: accountDR.size.w, height: accountDR.size.h }}
               className="flex flex-col bg-white border border-[#888] shadow-[2px_3px_16px_rgba(0,0,0,0.4)] relative">
            {accountDR.resizeHandles}
            {/* Blue header bar - draggable */}
            <div onMouseDown={accountDR.onDragDown}
                 className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
              <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de cuenta</span>
              <button onClick={() => setShowAccountSel(false)}
                      className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            {/* Accounts component in modal mode */}
            <div className="flex-1 overflow-hidden">
              <Accounts
                isModal={true}
                onAccountSelect={(code, name) => {
                  const acc = rawAccounts.find(a => a.code === code) || { id: code, code, name };
                  setFormAccount(acc);
                  setShowAccountSel(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showCebeSel && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto shadow-2xl relative" style={{ width: centerDR.size.w, height: centerDR.size.h, left: centerDR.pos.x, top: centerDR.pos.y, position: 'absolute' }}>
            <div onMouseDown={e => centerDR.onDragDown(e)} className="h-[30px] bg-[#4472c4] flex items-center justify-between px-3 cursor-move shrink-0">
              <span className="text-white text-[12px] font-bold">Selección de CEBE</span>
              <button onClick={() => setShowCebeSel(false)} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="bg-white" style={{ height: 'calc(100% - 30px)' }}>
              <AnalyticalCenters type="cebe" isModal={true} onSelect={(val) => { setFormCebe(val); setShowCebeSel(false); }} />
            </div>
            
            {/* Resize Handles */}
            <div onMouseDown={e => centerDR.onResizeDown(e, 'e')} className="absolute top-0 right-0 w-2 h-full cursor-e-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 's')} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" />
          </div>
        </div>
      )}

      {showCecoSel && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto shadow-2xl relative" style={{ width: centerDR.size.w, height: centerDR.size.h, left: centerDR.pos.x, top: centerDR.pos.y, position: 'absolute' }}>
            <div onMouseDown={e => centerDR.onDragDown(e)} className="h-[30px] bg-[#4472c4] flex items-center justify-between px-3 cursor-move shrink-0">
              <span className="text-white text-[12px] font-bold">Selección de CECO</span>
              <button onClick={() => setShowCecoSel(false)} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="bg-white" style={{ height: 'calc(100% - 30px)' }}>
              <AnalyticalCenters type="ceco" isModal={true} onSelect={(val) => { setFormCeco(val); setShowCecoSel(false); }} />
            </div>
            
            {/* Resize Handles */}
            <div onMouseDown={e => centerDR.onResizeDown(e, 'e')} className="absolute top-0 right-0 w-2 h-full cursor-e-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 's')} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Desviación de presupuestos
      ═══════════════════════════════════════════════════════════════════════ */}
      {showDesviacionModal && (
        <div className="fixed inset-0 z-[3000]" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div style={{ position: 'absolute', left: desvDR.pos.x, top: desvDR.pos.y, width: desvDR.size.w, height: desvDR.size.h }}
               className="bg-[#f0f0f0] border border-[#888] shadow-[2px_3px_12px_rgba(0,0,0,0.35)] flex flex-col select-none relative overflow-hidden">
            {desvDR.resizeHandles}
            {/* Title bar */}
            <div onMouseDown={desvDR.onDragDown} className="flex items-center px-2 py-[5px] border-b border-[#ccc] gap-2 cursor-move shrink-0 bg-[#e1e1e1]">
              <div className="flex items-center shrink-0">
                <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
                  <rect x="8" y="2" width="22" height="28" stroke="#999" fill="#fff" strokeWidth="1"/>
                  <line x1="12" y1="8" x2="26" y2="8" stroke="#ccc" strokeWidth="1"/>
                  <line x1="12" y1="13" x2="26" y2="13" stroke="#ccc" strokeWidth="1"/>
                  <rect x="2" y="8" width="22" height="28" stroke="#666" fill="#fff" strokeWidth="1"/>
                  <line x1="6" y1="14" x2="20" y2="14" stroke="#aaa" strokeWidth="1"/>
                  <line x1="6" y1="19" x2="20" y2="19" stroke="#aaa" strokeWidth="1"/>
                  <line x1="6" y1="24" x2="20" y2="24" stroke="#aaa" strokeWidth="1"/>
                  <circle cx="28" cy="24" r="8" stroke="#333" fill="#fff" strokeWidth="1.5"/>
                  <line x1="33.5" y1="29.5" x2="42" y2="38" stroke="#333" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="26" cy="22" r="2" fill="#999" fillOpacity="0.3"/>
                </svg>
              </div>
              <span className="text-[12px] text-[#333] font-normal flex-1 text-center font-bold">Desviación de presupuestos</span>
              <button onClick={() => setShowDesviacionModal(false)} className="w-[20px] h-[20px] flex items-center justify-center hover:bg-red-500 hover:text-white text-[#666] rounded-[2px] shrink-0">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Filter and controls */}
            <div className="flex items-center gap-4 p-3 bg-[#f8f9fa] border-b border-[#ccc] shrink-0 flex-wrap">
              {/* Año */}
              <div className="flex items-center gap-1">
                <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[50px] text-center shrink-0 font-bold">Año:</span>
                <select value={desvYear} onChange={e => { setDesvYear(parseInt(e.target.value)); setDesvCalculatedData(null); }}
                        className="w-[70px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-bold">
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Cuenta */}
              <div className="flex items-center gap-1">
                <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold">Cuenta:</span>
                <input type="text" readOnly value={desvFilterCuenta || ''}
                    onClick={() => setShowDesvAccountSel(true)}
                    className="w-[70px] border border-[#999] px-2 py-[3px] text-[11px] bg-white cursor-pointer outline-none font-mono" placeholder="Todas" />
                <button onClick={() => setShowDesvAccountSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
                {desvFilterCuenta && <button onClick={() => { setDesvFilterCuenta(''); setDesvCalculatedData(null); }} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
              </div>
              
              {/* CEBE */}
              <div className="flex items-center gap-1">
                <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[50px] text-center shrink-0 font-bold">CEBE:</span>
                <input type="text" readOnly value={desvFilterCebe || ''}
                    onClick={() => setShowDesvCebeSel(true)}
                    className="w-[70px] border border-[#999] px-2 py-[3px] text-[11px] bg-white cursor-pointer outline-none font-mono" placeholder="Todos" />
                <button onClick={() => setShowDesvCebeSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
                {desvFilterCebe && <button onClick={() => { setDesvFilterCebe(''); setDesvCalculatedData(null); }} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
              </div>
              
              {/* CECO */}
              <div className="flex items-center gap-1">
                <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[50px] text-center shrink-0 font-bold">CECO:</span>
                <input type="text" readOnly value={desvFilterCeco || ''}
                    onClick={() => setShowDesvCecoSel(true)}
                    className="w-[70px] border border-[#999] px-2 py-[3px] text-[11px] bg-white cursor-pointer outline-none font-mono" placeholder="Todos" />
                <button onClick={() => setShowDesvCecoSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
                {desvFilterCeco && <button onClick={() => { setDesvFilterCeco(''); setDesvCalculatedData(null); }} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white p-2">
              <table className="w-full border-collapse text-[11px] border border-[#ccc]">
                <thead>
                  <tr className="bg-[#f0f0f0] border-b border-[#ccc] text-[#333]">
                    <th className="py-1 px-2 text-left font-bold border-r border-[#ccc]">MES</th>
                    <th className="py-1 px-2 text-right font-bold border-r border-[#ccc]">PRESUPUESTO</th>
                    <th className="py-1 px-2 text-right font-bold border-r border-[#ccc]">SALDO</th>
                    <th className="py-1 px-2 text-right font-bold border-r border-[#ccc]">DESVIACIÓN</th>
                    <th className="py-1 px-2 text-right font-bold border-r border-[#ccc]">% DESVIACIÓN</th>
                    <th className="py-1 px-2 text-right font-bold">% DESV.ARRAST</th>
                  </tr>
                </thead>
                <tbody>
                  {(desvCalculatedData?.months || [...Array(12)].map((_, i) => ({ mes: MONTHS_LONG[i], presupuesto: 0, saldo: 0, desviacion: 0, pctDesviacion: 0, pctDesvArrast: 0 }))).map((row, idx) => (
                    <tr key={idx} className="border-b border-[#eee] hover:bg-[#f5f7fa]">
                      <td className="py-1 px-2 font-semibold border-r border-[#eee]">{row.mes}</td>
                      <td className="py-1 px-2 text-right font-mono border-r border-[#eee]">{row.presupuesto.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-1 px-2 text-right font-mono border-r border-[#eee]">{row.saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-1 px-2 text-right font-mono border-r border-[#eee]">
                        {row.desviacion.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-1 px-2 text-right font-mono border-r border-[#eee]">
                        {row.pctDesviacion.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </td>
                      <td className="py-1 px-2 text-right font-mono">
                        {row.pctDesvArrast.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="bg-[#fcfbf9] border-t-2 border-[#ccc] font-bold">
                    <td className="py-1 px-2 text-right border-r border-[#ccc] text-[#2b579a]">TOTALES</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#ccc]">{(desvCalculatedData?.totals?.presupuesto || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#ccc]">{(desvCalculatedData?.totals?.saldo || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#ccc]">
                      {(desvCalculatedData?.totals?.desviacion || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1 px-2 text-right font-mono border-r border-[#ccc]">
                      {(desvCalculatedData?.totals?.pctDesviacion || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </td>
                    <td className="py-1 px-2 text-right font-mono">
                      {(desvCalculatedData?.totals?.pctDesvArrast || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-2 p-3 bg-[#e1e1e1] border-t border-[#ccc] shrink-0">
              <button onClick={handleProcederDesviaciones}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Proceder
              </button>
              <button onClick={() => setShowDesviacionModal(false)}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selectores específicos para el modal de Desviación */}
      {showDesvAccountSel && (
        <div className="fixed inset-0 z-[3100]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', left: accountDR.pos.x, top: accountDR.pos.y, width: accountDR.size.w, height: accountDR.size.h }}
               className="flex flex-col bg-white border border-[#888] shadow-[2px_3px_16px_rgba(0,0,0,0.4)] relative">
            {accountDR.resizeHandles}
            <div onMouseDown={accountDR.onDragDown}
                 className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
              <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de cuenta</span>
              <button onClick={() => setShowDesvAccountSel(false)}
                      className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Accounts
                isModal={true}
                onAccountSelect={(code, name) => {
                  setDesvFilterCode(code);
                  setDesvFilterName(name);
                  setShowDesvAccountSel(false);
                  setDesvCalculatedData(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showDesvCebeSel && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto shadow-2xl relative" style={{ width: centerDR.size.w, height: centerDR.size.h, left: centerDR.pos.x, top: centerDR.pos.y, position: 'absolute' }}>
            <div onMouseDown={e => centerDR.onDragDown(e)} className="h-[30px] bg-[#4472c4] flex items-center justify-between px-3 cursor-move shrink-0">
              <span className="text-white text-[12px] font-bold">Selección de CEBE</span>
              <button onClick={() => setShowDesvCebeSel(false)} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="bg-white" style={{ height: 'calc(100% - 30px)' }}>
              <AnalyticalCenters type="cebe" isModal={true} onSelect={(val) => { setDesvFilterCebe(val); setDesvCalculatedData(null); setShowDesvCebeSel(false); }} />
            </div>
            
            {/* Resize Handles */}
            <div onMouseDown={e => centerDR.onResizeDown(e, 'e')} className="absolute top-0 right-0 w-2 h-full cursor-e-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 's')} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" />
          </div>
        </div>
      )}

      {showDesvCecoSel && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto shadow-2xl relative" style={{ width: centerDR.size.w, height: centerDR.size.h, left: centerDR.pos.x, top: centerDR.pos.y, position: 'absolute' }}>
            <div onMouseDown={e => centerDR.onDragDown(e)} className="h-[30px] bg-[#4472c4] flex items-center justify-between px-3 cursor-move shrink-0">
              <span className="text-white text-[12px] font-bold">Selección de CECO</span>
              <button onClick={() => setShowDesvCecoSel(false)} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="bg-white" style={{ height: 'calc(100% - 30px)' }}>
              <AnalyticalCenters type="ceco" isModal={true} onSelect={(val) => { setDesvFilterCeco(val); setDesvCalculatedData(null); setShowDesvCecoSel(false); }} />
            </div>
            
            {/* Resize Handles */}
            <div onMouseDown={e => centerDR.onResizeDown(e, 'e')} className="absolute top-0 right-0 w-2 h-full cursor-e-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 's')} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize" />
            <div onMouseDown={e => centerDR.onResizeDown(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-10" />
          </div>
        </div>
      )}
    </div>
  );
}

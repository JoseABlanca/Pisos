import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, X } from 'lucide-react';

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

const MONTHS_LONG = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_HDR  = ['ENE.','FEB.','MAR.','ABR.','MAY.','JUN.','JUL.','AGO.','SEP.','OCT.','NOV.','DIC.'];

/* ═══════════════════════════════════════════════════════════════════════════════
   TOOLBAR ICONS  – Exact visual match to the user's desktop app (Foto 1)
   ═══════════════════════════════════════════════════════════════════════════════ */
const IcoNuevo = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M8 3h10l6 6v20H8V3z" fill="#fff" stroke="#888" strokeWidth="1"/>
    <path d="M18 3v6h6" fill="none" stroke="#888" strokeWidth="1"/>
    <line x1="12" y1="20" x2="20" y2="20" stroke="#22c55e" strokeWidth="2.5"/>
    <line x1="16" y1="16" x2="16" y2="24" stroke="#22c55e" strokeWidth="2.5"/>
  </svg>
);
const IcoModif = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M8 3h10l6 6v20H8V3z" fill="#fff" stroke="#888" strokeWidth="1"/>
    <path d="M18 3v6h6" fill="none" stroke="#888" strokeWidth="1"/>
    <path d="M12 25l7-7-2-2-7 7v2h2z" fill="#60a5fa" stroke="#3b82f6" strokeWidth="0.8"/>
  </svg>
);
const IcoElim = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M8 3h10l6 6v20H8V3z" fill="#fff" stroke="#888" strokeWidth="1"/>
    <path d="M18 3v6h6" fill="none" stroke="#888" strokeWidth="1"/>
    <line x1="13" y1="17" x2="19" y2="23" stroke="#ef4444" strokeWidth="2.2"/>
    <line x1="19" y1="17" x2="13" y2="23" stroke="#ef4444" strokeWidth="2.2"/>
  </svg>
);
const IcoSubir = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 20V6" stroke="#555" strokeWidth="1.5"/>
    <path d="M7 11l5-5 5 5" stroke="#555" strokeWidth="1.5" fill="none"/>
  </svg>
);
const IcoBajar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 4v14" stroke="#555" strokeWidth="1.5"/>
    <path d="M7 13l5 5 5-5" stroke="#555" strokeWidth="1.5" fill="none"/>
  </svg>
);
const IcoExpandir = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M4 12v14h22V14H14l-3-2H4z" fill="#fcd34d" stroke="#b8860b" strokeWidth="1"/>
    <rect x="17" y="17" width="9" height="9" rx="1" fill="#fff" stroke="#666" strokeWidth="1"/>
    <path d="M19 21.5l1.5 1.5 3-3.5" stroke="#22c55e" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcoColapsar = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M4 12v14h22V14H14l-3-2H4z" fill="#fcd34d" stroke="#b8860b" strokeWidth="1"/>
    <rect x="17" y="17" width="9" height="9" rx="1" fill="#fff" stroke="#666" strokeWidth="1"/>
    <line x1="19" y1="21.5" x2="24" y2="21.5" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);
const IcoPage = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 1h7l3 3v11H3V1z" fill="#fff" stroke="#999" strokeWidth="1"/>
    <path d="M10 1v3h3" fill="none" stroke="#999" strokeWidth="1"/>
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
   CLASSIC DIALOG (Foto 4 – "Ficha de presupuesto anual")
   ═══════════════════════════════════════════════════════════════════════════════ */
function WinDialog({ title, children, onClose, width = 440 }) {
  const ref = useRef(null);
  const drag = useRef({ active: false, ox: 0, oy: 0 });
  const [pos, setPos] = useState({ x: Math.max(0, (window.innerWidth - width) / 2), y: 120 });

  const onDown = e => {
    drag.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    const up = () => { drag.current.active = false; window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
    const mv = e => { if (drag.current.active) setPos({ x: e.clientX - drag.current.ox, y: e.clientY - drag.current.oy }); };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', mv);
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(0,0,0,0.08)' }}>
      <div ref={ref} style={{ position: 'absolute', left: pos.x, top: pos.y, width }}
           className="bg-[#f0f0f0] border border-[#888] shadow-[2px_3px_12px_rgba(0,0,0,0.35)] flex flex-col select-none">
        {/* Title bar */}
        <div onMouseDown={onDown}
             className="flex items-center justify-between px-2 py-[5px] cursor-move border-b border-[#ccc]">
          <div className="flex-1" />
          <span className="text-[12px] text-[#333] font-normal">{title}</span>
          <div className="flex-1 flex justify-end">
            <button onClick={onClose} className="w-[20px] h-[20px] flex items-center justify-center hover:bg-red-500 hover:text-white text-[#666] rounded-[2px]">
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
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

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function Analitica() {
  const { user, queryUserIds } = useAuth();

  const [rawAccounts, setRawAccounts] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const [groupFilter, setGroupFilter] = useState('ALL');
  const [showPgc, setShowPgc] = useState(false);
  const [showAux, setShowAux] = useState(true);
  const [showObsolete, setShowObsolete] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [collapsed, setCollapsed] = useState({});
  const [selectedCode, setSelectedCode] = useState(null);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formAccount, setFormAccount] = useState(null);
  const [formMonths, setFormMonths] = useState(() => Object.fromEntries([...Array(12)].map((_, i) => [i, 0])));
  const [showAccountSel, setShowAccountSel] = useState(false);

  /* ── Firestore ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    const uids = queryUserIds?.length ? queryUserIds : [user.uid];
    const uA = onSnapshot(query(collection(db, 'accounts'), where('userId', 'in', uids)), s => setRawAccounts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const uB = onSnapshot(query(collection(db, 'budgets'), where('userId', 'in', uids)), s => setBudgets(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { uA(); uB(); };
  }, [user, queryUserIds]);

  /* ── Budget data for selected year ────────────────────────────────────────── */
  const budgetsForYear = useMemo(() => budgets.filter(b => b.year === selectedYear), [budgets, selectedYear]);

  /* ── Build tree ONLY from budgets (table starts empty if no budgets) ─────── */
  const budgetCodes = useMemo(() => {
    const codes = new Set(budgetsForYear.map(b => b.accountCode).filter(Boolean));
    // Add parent codes so hierarchy shows
    const parents = new Set();
    codes.forEach(c => { for (let l = 1; l < c.length; l++) parents.add(c.slice(0, l)); });
    parents.forEach(p => codes.add(p));
    return Array.from(codes).sort();
  }, [budgetsForYear]);

  const treeRows = useMemo(() => {
    let codes = budgetCodes;
    if (groupFilter !== 'ALL') codes = codes.filter(c => c.startsWith(groupFilter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      codes = codes.filter(c => c.includes(q) || descr(c, rawAccounts).toLowerCase().includes(q));
    }
    return codes.map(code => {
      const buds = budgetsForYear.filter(b => b.accountCode === code);
      const childBuds = budgetsForYear.filter(b => b.accountCode.startsWith(code));
      const total = childBuds.reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
      const months = Object.fromEntries([...Array(12)].map((_, i) => [i,
        childBuds.reduce((s, b) => s + (parseFloat(b.months?.[i]) || 0), 0)
      ]));
      let depth = 0;
      if (code.length === 2) depth = 1;
      else if (code.length === 3) depth = 2;
      else if (code.length === 4) depth = 3;
      else if (code.length > 4) depth = 4;
      const hasChildren = codes.some(o => o !== code && o.startsWith(code));
      return { code, name: descr(code, rawAccounts), depth, hasChildren, total, months, isLeaf: buds.length > 0 };
    });
  }, [budgetCodes, budgetsForYear, rawAccounts, groupFilter, searchQuery]);

  const visibleRows = useMemo(() => {
    let rows = treeRows;
    if (hideZero) rows = rows.filter(r => r.total !== 0);
    return rows.filter(r => {
      for (let l = 1; l < r.code.length; l++) {
        if (collapsed[r.code.slice(0, l)]) return false;
      }
      return true;
    });
  }, [treeRows, collapsed, hideZero]);

  /* ── Helpers ──────────────────────────────────────────────────────────────── */
  const fmt = v => v === 0 ? '' : (v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formTotal = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const openNew = () => {
    setFormAccount(null);
    setFormMonths(Object.fromEntries([...Array(12)].map((_, i) => [i, 0])));
    setIsEditing(false);
    setShowForm(true);
  };
  const openEdit = () => {
    if (!selectedCode) return;
    const bud = budgets.find(b => b.accountCode === selectedCode && b.year === selectedYear);
    if (!bud) return;
    const acc = rawAccounts.find(a => a.code === selectedCode) || { id: bud.accountId, code: bud.accountCode, name: bud.accountName };
    setFormAccount(acc);
    setFormMonths({ ...bud.months });
    setIsEditing(true);
    setShowForm(true);
  };
  const openDelete = async () => {
    if (!selectedCode) return;
    const bud = budgets.find(b => b.accountCode === selectedCode && b.year === selectedYear);
    if (!bud) { alert('No hay presupuesto para esta cuenta/año.'); return; }
    if (!window.confirm(`¿Eliminar presupuesto de ${selectedCode}?`)) return;
    await deleteDoc(doc(db, 'budgets', bud.id));
    setSelectedCode(null);
  };
  const saveBudget = async () => {
    if (!formAccount) { alert('Selecciona una cuenta contable.'); return; }
    const total = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const id = `${user.uid}_${selectedYear}_${formAccount.code}`;
    await setDoc(doc(db, 'budgets', id), {
      id, accountId: formAccount.id, accountCode: formAccount.code, accountName: formAccount.name || '',
      year: selectedYear, total: parseFloat(total.toFixed(2)), months: formMonths,
      userId: user.uid, updatedAt: new Date().toISOString()
    }, { merge: true });
    setShowForm(false);
  };
  const distribute = () => {
    const total = Object.values(formMonths).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const each = parseFloat((total / 12).toFixed(2));
    setFormMonths(Object.fromEntries([...Array(12)].map((_, i) => [i, each])));
  };

  /* ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="w-full h-full flex flex-col bg-white font-[Segoe_UI,Tahoma,sans-serif] text-[12px] text-[#333] select-none">

      {/* ── TOOLBAR (Foto 1 exact) ──────────────────────────────────────────── */}
      <div className="bg-[#f3f3f3] border-b border-[#d6d6d6] flex items-end px-[6px] pb-[2px] pt-[6px] shrink-0">
        <TBtn icon={IcoNuevo}  label="Nuevo"     hasChevron onClick={openNew} />
        <TBtn icon={IcoModif}  label="Modificar" hasChevron onClick={openEdit} disabled={!selectedCode} />
        <TBtn icon={IcoElim}   label="Eliminar"  hasChevron onClick={openDelete} disabled={!selectedCode} />
        <div className="w-[1px] self-stretch my-[6px] bg-[#d6d6d6] mx-[6px]" />
        <TBtn icon={IcoSubir}  label="Subir"  onClick={() => {}} disabled={!selectedCode} />
        <TBtn icon={IcoBajar}  label="Bajar"  onClick={() => {}} disabled={!selectedCode} />
        <div className="w-[1px] self-stretch my-[6px] bg-[#d6d6d6] mx-[6px]" />
        <TBtn icon={IcoExpandir}  label="Expandir"  onClick={() => setCollapsed({})} />
        <TBtn icon={IcoColapsar}  label="Colapsar"  onClick={() => { const k = {}; treeRows.forEach(r => { if (r.hasChildren) k[r.code] = true; }); setCollapsed(k); }} />
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR (Foto 1 exact) ───────────────────────────────────── */}
        {sidebarVisible && (
          <div className="w-[200px] bg-[#f3f3f3] border-r border-[#d6d6d6] flex flex-col shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {/* Header */}
              <div className="bg-[#e6e8ec] text-[#333] text-[12px] font-bold px-3 py-[5px]">
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
              <div className="px-3 pt-1 pb-1 flex flex-col">
                <SideCheck checked={showPgc} onChange={e => setShowPgc(e.target.checked)} label="Mostrar cuentas del PGC" />
                <SideCheck checked={showAux} onChange={e => setShowAux(e.target.checked)} label="Mostrar cuentas auxiliares" bold />
                <SideCheck checked={showObsolete} onChange={e => setShowObsolete(e.target.checked)} label="Mostrar cuentas obsoletas" />
              </div>
            </div>
            {/* Bottom: Ver saldos */}
            <div className="bg-[#e6e8ec] border-t border-[#d6d6d6] p-2 shrink-0">
              <div className="text-[11px] text-[#555] mb-1">Ver saldos del diario</div>
              <select className="w-full border border-[#aaa] bg-white text-[11px] px-1 py-[3px] outline-none">
                <option>Todas</option>
              </select>
            </div>
          </div>
        )}

        {/* ── TABLE AREA ────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Title bar (Foto 3: "Presupuestos de cuentas" + search) */}
          <div className="flex items-center justify-between border-b border-[#e0e0e0] bg-white px-2 py-[3px] shrink-0">
            <span className="text-[12px] text-[#333]">Presupuestos de cuentas</span>
            <div className="relative flex items-center">
              <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                     value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                     className="w-[220px] pr-5 py-[2px] text-[11px] text-right border-b border-[#aaa] outline-none focus:border-b-[#4472c4] bg-transparent placeholder:text-[#aaa]" />
              <Search size={13} className="absolute right-0 text-[#aaa] pointer-events-none" />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto" onClick={() => setSelectedCode(null)}>
            <table className="w-full border-collapse text-[11px]" style={{ tableLayout: 'auto' }}>
              <colgroup>
                <col style={{ minWidth: 120 }} />
                <col style={{ minWidth: 200 }} />
                <col style={{ minWidth: 100 }} />
                {MONTHS_HDR.map((_, i) => <col key={i} style={{ minWidth: 60 }} />)}
              </colgroup>
              <thead>
                <tr className="sticky top-0 bg-white border-b border-[#d6d6d6] z-10">
                  <th className="text-left font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">
                    <div className="flex items-center gap-[6px]">
                      <button onClick={() => setSidebarVisible(p => !p)} title="Ocultar/Mostrar filtros"
                              className="hover:bg-[#e0e0e0] p-[1px] rounded-[2px]">
                        <IcoPage />
                      </button>
                      <span>CUENTA</span>
                    </div>
                  </th>
                  <th className="text-left font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">DESCRIPCIÓN</th>
                  <th className="text-right font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">PRESUPUESTO</th>
                  {MONTHS_HDR.map(m => (
                    <th key={m} className="text-right font-normal text-[#555] text-[10px] uppercase tracking-wider py-[5px] px-2">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const sel = selectedCode === row.code;
                  return (
                    <tr key={row.code}
                        className={`border-b border-[#f0f0f0] cursor-default ${sel ? 'bg-[#cce5ff]' : 'hover:bg-[#f5f7fa]'}`}
                        onClick={e => { e.stopPropagation(); setSelectedCode(row.code); }}
                        onDoubleClick={() => { setSelectedCode(row.code); setTimeout(openEdit, 0); }}>
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
                      {[...Array(12)].map((_, i) => (
                        <td key={i} className="py-[3px] px-2 text-right text-[11px]">{fmt(row.months[i])}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL: Ficha de presupuesto anual  (Foto 4 EXACT)
      ═══════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(0,0,0,0.08)' }}>
          <div style={{ position: 'absolute', left: Math.max(0, (window.innerWidth - 440) / 2), top: 120, width: 440 }}
               className="bg-[#f0f0f0] border border-[#888] shadow-[2px_3px_12px_rgba(0,0,0,0.35)] flex flex-col select-none">
            {/* Title bar with image icons (Foto 2 exact) */}
            <div className="flex items-center px-2 py-[5px] border-b border-[#ccc] gap-2">
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
              <span className="text-[12px] text-[#333] font-normal flex-1 text-center">Ficha de presupuesto anual</span>
              <button onClick={() => setShowForm(false)} className="w-[20px] h-[20px] flex items-center justify-center hover:bg-red-500 hover:text-white text-[#666] rounded-[2px]">
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {/* Cuenta */}
              <div className="flex items-center gap-[6px]">
                <span className="border border-[#999] bg-white px-2 py-[3px] text-[12px] text-[#333] text-center">Cuenta:</span>
                <input type="text" readOnly value={formAccount?.code || ''}
                       onClick={() => setShowAccountSel(true)}
                       className="w-[70px] border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none" />
                <span className="text-[12px] text-[#333] uppercase truncate flex-1">{formAccount?.name || ''}</span>
              </div>

              {/* Presupuesto anual + Repartir */}
              <div className="flex items-center gap-[6px]">
                <span className="border border-[#999] bg-white px-2 py-[3px] text-[12px] font-semibold text-[#333] whitespace-nowrap">Presupuesto anual:</span>
                <input type="text" readOnly value={formTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       className="w-[70px] border border-[#999] px-2 py-[3px] text-[12px] text-right bg-white outline-none" />
                <button onClick={distribute}
                        className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] px-3 py-[3px] text-[12px] whitespace-nowrap active:bg-[#c0c0c0]">
                  Repartir proporcionalmente
                </button>
              </div>

              {/* Months grid: 2 columns, 6 rows with separators */}
              <div className="border border-[#bbb] bg-white">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`grid grid-cols-2 gap-x-4 px-3 py-[5px] ${i < 5 ? 'border-b border-[#e0e0e0]' : ''}`}>
                    {/* Left column month */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[#333] font-semibold w-[85px]">{MONTHS_LONG[i]}</span>
                      <input type="text" value={(parseFloat(formMonths[i]) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             onChange={e => { const v = e.target.value.replace(/[^0-9,.-]/g, '').replace(',', '.'); setFormMonths(p => ({ ...p, [i]: parseFloat(v) || 0 })); }}
                             className="w-[65px] border border-[#999] px-2 py-[2px] text-[12px] text-right outline-none bg-white" />
                    </div>
                    {/* Right column month */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[#333] font-semibold w-[85px]">{MONTHS_LONG[i + 6]}</span>
                      <input type="text" value={(parseFloat(formMonths[i + 6]) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             onChange={e => { const v = e.target.value.replace(/[^0-9,.-]/g, '').replace(',', '.'); setFormMonths(p => ({ ...p, [i + 6]: parseFloat(v) || 0 })); }}
                             className="w-[65px] border border-[#999] px-2 py-[2px] text-[12px] text-right outline-none bg-white" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 mt-2">
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
        </div>
      )}

      {/* Account selector */}
      {showAccountSel && (
        <AccountSelector
          accounts={rawAccounts}
          onSelect={acc => { setFormAccount(acc); setShowAccountSel(false); }}
          onClose={() => setShowAccountSel(false)}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, ChevronRight, ChevronDown, X, Minus, Plus } from 'lucide-react';

// ── PGC descriptions ──────────────────────────────────────────────────────────
const PGC = {
  '1':'Financiación básica','10':'Capital','100':'Capital social',
  '11':'Reservas','12':'Resultados pendientes de aplicación','129':'Resultado del ejercicio',
  '2':'Activo no corriente','20':'Inmovilizado intangible','21':'Inmovilizado material',
  '28':'Amortización acumulada del inmovilizado','3':'Existencias',
  '4':'Acreedores y deudores por operaciones comerciales','40':'Proveedores',
  '41':'Acreedores varios','43':'Clientes','47':'Administraciones públicas',
  '472':'Hacienda Pública, IVA soportado','477':'Hacienda Pública, IVA repercutido',
  '5':'Cuentas financieras','57':'Tesorería','570':'Caja',
  '572':'Bancos e instituciones de crédito','6':'Compras y gastos',
  '60':'Compras','62':'Servicios exteriores','621':'Arrendamientos y cánones',
  '628':'Suministros','629':'Otros servicios','64':'Gastos de personal',
  '640':'Sueldos y salarios','642':'Seguridad Social a cargo de la empresa',
  '7':'Ventas e ingresos','70':'Ventas de mercaderías y servicios',
  '700':'Ventas de mercaderías','705':'Prestación de servicios'
};

const desc = (code, accounts=[]) => {
  const d = accounts.find(x=>x.code===code);
  if(d) return d.name;
  if(PGC[code]) return PGC[code];
  for(let l=code.length-1;l>0;l--){
    const p=code.slice(0,l);
    if(PGC[p]) return PGC[p];
  }
  return `Cuenta ${code}`;
};

const MONTHS_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const YEARS = [2023,2024,2025,2026,2027,2028];

// ── Tiny SVG icons (matching photo style) ────────────────────────────────────
const IcoNuevo    = ()=><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 3v22h18V10l-7-7H5z" fill="white" stroke="#555" strokeWidth="1"/><path d="M12 3v7h7" stroke="#555" strokeWidth="1"/><path d="M10 17h8M14 13v8" stroke="#2563eb" strokeWidth="2"/></svg>;
const IcoModif    = ()=><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 3v22h18V10l-7-7H5z" fill="white" stroke="#555" strokeWidth="1"/><path d="M12 3v7h7" stroke="#555" strokeWidth="1"/><path d="M10 19l8-8-2-2-8 8v2h2z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5"/></svg>;
const IcoElim     = ()=><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 3v22h18V10l-7-7H5z" fill="white" stroke="#555" strokeWidth="1"/><path d="M12 3v7h7" stroke="#555" strokeWidth="1"/><path d="M10 14l8 8M18 14l-8 8" stroke="#dc2626" strokeWidth="1.5"/></svg>;
const IcoSubir    = ()=><svg width="24" height="28" viewBox="0 0 24 28" fill="none" stroke="#555" strokeWidth="1.5"><path d="M12 22V6M6 12l6-6 6 6"/></svg>;
const IcoBajar    = ()=><svg width="24" height="28" viewBox="0 0 24 28" fill="none" stroke="#555" strokeWidth="1.5"><path d="M12 6v16M6 16l6 6 6-6"/></svg>;
const IcoExp      = ()=><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M3 10v14h22V12H13l-3-2H3z" fill="#fde68a" stroke="#ca8a04" strokeWidth="1"/><path d="M11 17h6M14 14v6" stroke="#16a34a" strokeWidth="2"/></svg>;
const IcoCol      = ()=><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M3 10v14h22V12H13l-3-2H3z" fill="#fde68a" stroke="#ca8a04" strokeWidth="1"/><path d="M11 19h6" stroke="#dc2626" strokeWidth="2"/></svg>;

// ── Floating Window (classic dialog) ─────────────────────────────────────────
function Dialog({ title, children, onClose, width='480px', height='auto' }) {
  const [pos, setPos] = useState({ x: window.innerWidth/2 - parseInt(width)/2, y: 80 });
  const dragging = useRef(false);
  const dragOffset = useRef({x:0,y:0});

  const onMouseDown = e => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const up   = () => { dragging.current = false; window.removeEventListener('mouseup',up); window.removeEventListener('mousemove',move); };
    const move = e => { if(dragging.current) setPos({ x: e.clientX-dragOffset.current.x, y: e.clientY-dragOffset.current.y }); };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
  };

  return (
    <div style={{ position:'fixed', left:pos.x, top:pos.y, width, zIndex:200 }}
         className="shadow-2xl border border-gray-400 flex flex-col bg-white select-none">
      {/* Title bar */}
      <div onMouseDown={onMouseDown}
           className="bg-gradient-to-r from-[#4a4a9c] to-[#6060b0] text-white text-[12px] font-normal py-1.5 px-3 flex items-center justify-between cursor-move">
        <span>{title}</span>
        <button onClick={onClose} className="hover:bg-white/20 rounded p-0.5"><X size={13}/></button>
      </div>
      {children}
    </div>
  );
}

// ── ToolbarBtn ────────────────────────────────────────────────────────────────
function TBtn({ icon: Icon, label, onClick, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled}
            className="flex flex-col items-center gap-0.5 px-2.5 py-1 hover:bg-gray-200 rounded disabled:opacity-40 min-w-[44px]">
      <Icon/>
      <span className="text-[10px] text-gray-700 leading-none">{label}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Analitica() {
  const { user, queryUserIds } = useAuth();
  const [searchParams] = useSearchParams();

  // Data
  const [rawAccounts, setRawAccounts] = useState([]);
  const [budgets,     setBudgets]     = useState([]);

  // Layout
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Sidebar filters
  const [groupFilter,      setGroupFilter]      = useState('ALL');
  const [showPgc,          setShowPgc]          = useState(false);
  const [showAux,          setShowAux]          = useState(true);
  const [showObsolete,     setShowObsolete]     = useState(false);
  const [hideZero,         setHideZero]         = useState(false);
  const [dateFilterYear,   setDateFilterYear]   = useState('ALL');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedYear,     setSelectedYear]     = useState(2026);
  const [collapsed,        setCollapsed]        = useState({});
  const [selectedCode,     setSelectedCode]     = useState(null);

  // Form (assignment)
  const [showForm,      setShowForm]      = useState(false);
  const [isEditing,     setIsEditing]     = useState(false);
  const [formAccount,   setFormAccount]   = useState(null);
  const [formYear,      setFormYear]      = useState(2026);
  const [formMonths,    setFormMonths]    = useState(Object.fromEntries([...Array(12)].map((_,i)=>[i,0])));

  // Deviation modal
  const [showDev,     setShowDev]     = useState(false);
  const [devAccount,  setDevAccount]  = useState(null);

  // Account selector
  const [showSel,         setShowSel]         = useState(false);
  const [selTarget,       setSelTarget]       = useState('budget');
  const [selGroup,        setSelGroup]        = useState('ALL');
  const [selShowPgc,      setSelShowPgc]      = useState(false);
  const [selShowAux,      setSelShowAux]      = useState(true);
  const [selShowObs,      setSelShowObs]      = useState(false);
  const [selQuery,        setSelQuery]        = useState('');
  const [selCollapsed,    setSelCollapsed]    = useState({});
  const [selSelected,     setSelSelected]     = useState(null);
  const [selZoom,         setSelZoom]         = useState(50);

  // ── Firestore ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if(!user) return;
    const uids = queryUserIds?.length ? queryUserIds : [user.uid];
    const uA = onSnapshot(query(collection(db,'accounts'),where('userId','in',uids)), s => setRawAccounts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const uB = onSnapshot(query(collection(db,'budgets'), where('userId','in',uids)), s => setBudgets(s.docs.map(d=>({id:d.id,...d.data()}))));
    return ()=>{ uA(); uB(); };
  },[user,queryUserIds]);

  // Listen to ribbon event for Desviación
  useEffect(()=>{
    const h = ()=>{ setDevAccount(null); setShowDev(true); };
    window.addEventListener('analitica:open-desviacion-modal',h);
    return ()=>window.removeEventListener('analitica:open-desviacion-modal',h);
  },[]);

  // ── Budget helpers ─────────────────────────────────────────────────────────
  const budgetsForYear = useMemo(()=> budgets.filter(b=>b.year===selectedYear), [budgets,selectedYear]);

  // ── Tree builder ───────────────────────────────────────────────────────────
  const allCodes = useMemo(()=>{
    const s = new Set(rawAccounts.map(a=>a.code).filter(Boolean));
    const parents = new Set();
    s.forEach(code=>{ for(let l=1;l<code.length;l++) parents.add(code.slice(0,l)); });
    parents.forEach(p=>s.add(p));
    return Array.from(s).sort();
  },[rawAccounts]);

  const filteredCodes = useMemo(()=>{
    let codes = allCodes;
    if(groupFilter !== 'ALL') codes = codes.filter(c=>c.startsWith(groupFilter));
    codes = codes.filter(c=>{
      const isPgc = c.length<=4;
      if(isPgc && !showPgc) return false;
      if(!isPgc && !showAux) return false;
      return true;
    });
    if(searchQuery){
      const q=searchQuery.toLowerCase();
      codes = codes.filter(c=>{
        const n=desc(c,rawAccounts).toLowerCase();
        const matchSelf = c.includes(q)||n.includes(q);
        const matchChild = codes.some(o=>o!==c&&o.startsWith(c)&&(o.toLowerCase().includes(q)||desc(o,rawAccounts).toLowerCase().includes(q)));
        return matchSelf||matchChild;
      });
    }
    return codes;
  },[allCodes,groupFilter,showPgc,showAux,searchQuery,rawAccounts]);

  const treeRows = useMemo(()=>{
    return filteredCodes.map(code=>{
      const budRecs = budgetsForYear.filter(b=>b.accountCode===code);
      const total   = budRecs.reduce((s,b)=>s+(parseFloat(b.total)||0),0);
      const months  = Object.fromEntries([...Array(12)].map((_,i)=>[i, budRecs.reduce((s,b)=>s+(parseFloat(b.months?.[i])||0),0)]));

      let depth=0;
      if(code.length===2) depth=1;
      else if(code.length===3) depth=2;
      else if(code.length===4) depth=3;
      else if(code.length>4) depth=4;

      const hasChildren = filteredCodes.some(o=>o!==code&&o.startsWith(code));
      return { code, name:desc(code,rawAccounts), depth, hasChildren, total, months };
    });
  },[filteredCodes,budgetsForYear,rawAccounts]);

  const visibleRows = useMemo(()=>{
    let rows = treeRows;
    if(hideZero) rows = rows.filter(r=>r.total!==0);
    return rows.filter(r=>{
      for(let l=1;l<r.code.length;l++){
        if(collapsed[r.code.slice(0,l)]) return false;
      }
      return true;
    });
  },[treeRows,collapsed,hideZero]);

  // ── Selector tree ─────────────────────────────────────────────────────────
  const selAllCodes = useMemo(()=>{
    const s = new Set(rawAccounts.map(a=>a.code).filter(Boolean));
    const par=new Set();
    s.forEach(c=>{for(let l=1;l<c.length;l++) par.add(c.slice(0,l));});
    par.forEach(p=>s.add(p));
    let arr=Array.from(s).sort();
    if(selGroup!=='ALL') arr=arr.filter(c=>c.startsWith(selGroup));
    arr=arr.filter(c=>{
      const isPgc=c.length<=4;
      if(isPgc&&!selShowPgc) return false;
      if(!isPgc&&!selShowAux) return false;
      return true;
    });
    if(selQuery){
      const q=selQuery.toLowerCase();
      arr=arr.filter(c=>{
        const n=desc(c,rawAccounts).toLowerCase();
        return c.includes(q)||n.includes(q);
      });
    }
    return arr.map(code=>{
      const db2=rawAccounts.find(x=>x.code===code);
      let depth=0;
      if(code.length===2)depth=1;
      else if(code.length===3)depth=2;
      else if(code.length===4)depth=3;
      else if(code.length>4)depth=4;
      const allS=Array.from(new Set([...rawAccounts.map(a=>a.code).filter(Boolean)]));
      const hasChildren=allS.some(o=>o!==code&&o.startsWith(code));
      return {id:db2?db2.id:`pgc_${code}`,code,name:desc(code,rawAccounts),depth,hasChildren};
    });
  },[rawAccounts,selGroup,selShowPgc,selShowAux,selQuery]);

  const visibleSelRows = useMemo(()=>
    selAllCodes.filter(r=>{
      for(let l=1;l<r.code.length;l++){
        if(selCollapsed[r.code.slice(0,l)]) return false;
      }
      return true;
    })
  ,[selAllCodes,selCollapsed]);

  // ── CRUD helpers ──────────────────────────────────────────────────────────
  const openNew = ()=>{
    setFormAccount(null);
    setFormYear(selectedYear);
    setFormMonths(Object.fromEntries([...Array(12)].map((_,i)=>[i,0])));
    setIsEditing(false);
    setShowForm(true);
  };
  const openEdit = ()=>{
    if(!selectedCode) return;
    const bud=budgets.find(b=>b.accountCode===selectedCode&&b.year===selectedYear);
    const acc=rawAccounts.find(a=>a.code===selectedCode);
    if(bud){
      setFormAccount(acc||{id:bud.accountId,code:bud.accountCode,name:bud.accountName});
      setFormYear(bud.year);
      setFormMonths({...bud.months});
      setIsEditing(true);
      setShowForm(true);
    } else if(acc){
      setFormAccount(acc);
      setFormYear(selectedYear);
      setFormMonths(Object.fromEntries([...Array(12)].map((_,i)=>[i,0])));
      setIsEditing(false);
      setShowForm(true);
    }
  };
  const openDelete = async ()=>{
    if(!selectedCode) return;
    const bud=budgets.find(b=>b.accountCode===selectedCode&&b.year===selectedYear);
    if(!bud){alert('No hay presupuesto asignado para esta cuenta/año.');return;}
    if(!window.confirm(`¿Eliminar presupuesto de ${selectedCode} - ${bud.accountName} (${bud.year})?`)) return;
    await deleteDoc(doc(db,'budgets',bud.id));
    if(selectedCode===bud.accountCode) setSelectedCode(null);
  };
  const saveBudget = async ()=>{
    if(!formAccount){alert('Elige una cuenta contable.');return;}
    const total=Object.values(formMonths).reduce((s,v)=>s+(parseFloat(v)||0),0);
    const id=`${user.uid}_${formYear}_${formAccount.id}`;
    await setDoc(doc(db,'budgets',id),{
      id,accountId:formAccount.id,accountCode:formAccount.code,accountName:formAccount.name,
      year:parseInt(formYear,10),total:parseFloat(total.toFixed(2)),months:formMonths,
      userId:user.uid,updatedAt:new Date().toISOString()
    },{merge:true});
    setShowForm(false);
  };
  const distributeMonths = ()=>{
    const total=Object.values(formMonths).reduce((s,v)=>s+(parseFloat(v)||0),0);
    const each=parseFloat((total/12).toFixed(2));
    setFormMonths(Object.fromEntries([...Array(12)].map((_,i)=>[i,each])));
  };
  const setMonth=(idx,val)=>{
    const v=parseFloat(val)||0;
    setFormMonths(p=>({...p,[idx]:v}));
  };
  const formTotal = Object.values(formMonths).reduce((s,v)=>s+(parseFloat(v)||0),0);

  // ── Account selector helpers ───────────────────────────────────────────────
  const openSelector = target=>{
    setSelTarget(target);
    setSelSelected(null);
    setSelQuery('');
    setShowSel(true);
  };
  const acceptSelector = row=>{
    const acc={id:row.id.startsWith('pgc_')?row.code:row.id,code:row.code,name:row.name};
    if(selTarget==='budget') setFormAccount(acc);
    else setDevAccount(acc);
    setShowSel(false);
  };

  // ── Format helpers ────────────────────────────────────────────────────────
  const fmt  = v=>(v===0?'0,00':(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}));
  const fmtD = v=>{ const s=v>0?'+':v<0?'− ':''; return s+(Math.abs(v)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}); };
  const pctStr = v=>{ const s=v>0?'+':v<0?'− ':''; return s+(Math.abs(v)||0).toFixed(2).replace('.',',')+'%'; };

  const toggleCollapsed = (code,e)=>{
    e.stopPropagation();
    setCollapsed(p=>({...p,[code]:!p[code]}));
  };

  // ── Deviation rows ────────────────────────────────────────────────────────
  const devRows = useMemo(()=>{
    if(!devAccount?.code) return [];
    const code=devAccount.code;
    const directBuds=budgetsForYear.filter(b=>b.accountCode.startsWith(code));
    let cumBud=0, cumAct=0;
    return [...Array(12)].map((_,m)=>{
      const b=directBuds.reduce((s,bd)=>s+(parseFloat(bd.months?.[m])||0),0);
      const a=0; // actuals not implemented (no transactions linked)
      const dev=a-b;
      const pct=b!==0?(dev/b)*100:a!==0?( dev>0?100:-100 ):0;
      cumBud+=b; cumAct+=a;
      const cumDev=cumAct-cumBud;
      const cumPct=cumBud!==0?(cumDev/cumBud)*100:cumAct!==0?(cumDev>0?100:-100):0;
      return {month:MONTHS_LONG[m],b,a,dev,pct,cumPct};
    });
  },[devAccount,budgetsForYear]);

  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full h-full flex flex-col bg-white font-sans text-[12px]">

      {/* ── PAGE TOOLBAR ──────────────────────────────────────────────────── */}
      <div className="bg-[#f0f0f0] border-b border-gray-300 flex items-start px-1 py-0.5 gap-0.5 shrink-0">
        <TBtn icon={IcoNuevo}  label="Nuevo"     onClick={openNew}/>
        <TBtn icon={IcoModif}  label="Modificar" onClick={openEdit}   disabled={!selectedCode}/>
        <TBtn icon={IcoElim}   label="Eliminar"  onClick={openDelete} disabled={!selectedCode}/>
        <div className="w-px h-10 bg-gray-300 mx-1 self-center"/>
        <TBtn icon={IcoSubir}  label="Subir"     onClick={()=>{}} disabled={!selectedCode}/>
        <TBtn icon={IcoBajar}  label="Bajar"     onClick={()=>{}} disabled={!selectedCode}/>
        <div className="w-px h-10 bg-gray-300 mx-1 self-center"/>
        <TBtn icon={IcoExp}    label="Expandir"  onClick={()=>setCollapsed({})}/>
        <TBtn icon={IcoCol}    label="Colapsar"  onClick={()=>{ const k={}; treeRows.forEach(r=>{ if(r.hasChildren) k[r.code]=true; }); setCollapsed(k); }}/>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        {sidebarVisible && (
          <div className="w-48 bg-[#f0f0f0] border-r border-gray-300 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-2 flex flex-col gap-3 flex-1">

              {/* Year selector */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 border-b border-gray-300 pb-0.5">Ejercicio</div>
                <select value={selectedYear} onChange={e=>setSelectedYear(parseInt(e.target.value,10))}
                        className="w-full border border-gray-400 bg-white text-[11px] px-1.5 py-0.5 outline-none">
                  {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Date range filter */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 border-b border-gray-300 pb-0.5">Filtrar por fecha</div>
                <select value={dateFilterYear} onChange={e=>setDateFilterYear(e.target.value)}
                        className="w-full border border-gray-400 bg-white text-[11px] px-1.5 py-0.5 outline-none">
                  <option value="ALL">Todo el ejercicio</option>
                  {MONTHS_LONG.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select>
              </div>

              {/* Group filter */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 border-b border-gray-300 pb-0.5">Lista actual</div>
                <div className="flex flex-col gap-0.5">
                  {[{v:'ALL',l:'Todos los grupos'},...['0','1','2','3','4','5','6','7','8','9'].map(n=>({v:n,l:`Mostrar grupo ${n}`}))].map(({v,l})=>(
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                      <input type="radio" name="grp" checked={groupFilter===v} onChange={()=>setGroupFilter(v)} className="scale-90"/>
                      <span className={groupFilter===v?'text-[#4a4a9c] font-semibold':'text-gray-600'}>{l}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Account type filters */}
              <div className="border-t border-gray-300 pt-2 flex flex-col gap-1">
                {[
                  [showPgc,      setShowPgc,      'Mostrar cuentas del PGC'],
                  [showAux,      setShowAux,       'Mostrar cuentas auxiliares'],
                  [showObsolete, setShowObsolete,  'Mostrar cuentas obsoletas'],
                  [hideZero,     setHideZero,      'Ocultar cuentas a 0'],
                ].map(([val,set,label])=>(
                  <label key={label} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                    <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)} className="scale-90"/>
                    <span className={val?'text-[#4a4a9c] font-semibold':'text-gray-600'}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MAIN TABLE AREA */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Table toolbar row */}
          <div className="bg-white border-b border-gray-200 flex items-center px-1 py-1 gap-2 shrink-0">
            {/* Toggle sidebar button */}
            <button onClick={()=>setSidebarVisible(p=>!p)}
                    className="w-6 h-6 border border-gray-400 bg-[#f0f0f0] flex items-center justify-center hover:bg-gray-200 shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#555" strokeWidth="1.2">
                <rect x="1" y="1" width="12" height="12"/>
                <line x1="5" y1="1" x2="5" y2="13"/>
              </svg>
            </button>
            <div className="flex-1"/>
            {/* Search */}
            <div className="relative flex items-center">
              <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                     value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                     className="w-56 text-right pr-7 py-0.5 text-[11px] border-b border-gray-400 outline-none bg-transparent"/>
              <Search size={13} className="absolute right-1 text-gray-400 pointer-events-none"/>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto" onClick={()=>setSelectedCode(null)}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 bg-white border-b border-gray-300 z-10">
                  <th className="text-left font-normal text-gray-500 uppercase text-[10px] tracking-wide py-1.5 px-2 border-r border-gray-200 w-36">Cuenta</th>
                  <th className="text-left font-normal text-gray-500 uppercase text-[10px] tracking-wide py-1.5 px-2 border-r border-gray-200">Descripción</th>
                  <th className="text-right font-normal text-gray-500 uppercase text-[10px] tracking-wide py-1.5 px-2 border-r border-gray-200 w-24">Presupuesto</th>
                  {MONTHS_SHORT.map(m=>(
                    <th key={m} className="text-right font-normal text-gray-500 uppercase text-[10px] tracking-wide py-1.5 px-2 border-r border-gray-200 w-16">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length===0 ? (
                  <tr><td colSpan={15} className="text-center text-gray-400 py-10">No hay datos para mostrar.</td></tr>
                ) : visibleRows.map(row=>{
                  const isSel=selectedCode===row.code;
                  return (
                    <tr key={row.code}
                        className={`border-b border-gray-100 cursor-pointer ${isSel?'bg-blue-50':'hover:bg-gray-50'}`}
                        onClick={e=>{ e.stopPropagation(); setSelectedCode(row.code); }}
                        onDoubleClick={()=>openEdit()}>
                      <td className="py-1 px-2 border-r border-gray-100">
                        <div className="flex items-center" style={{paddingLeft:`${row.depth*14}px`}}>
                          {row.hasChildren ? (
                            <button onClick={e=>toggleCollapsed(row.code,e)} className="mr-1 hover:bg-gray-200 rounded p-0.5">
                              {collapsed[row.code] ? <ChevronRight size={11} className="text-gray-500"/> : <ChevronDown size={11} className="text-gray-500"/>}
                            </button>
                          ) : <span className="w-4 shrink-0"/>}
                          <span className={`font-mono text-[11px] ${row.total>0?'font-semibold text-blue-800':'text-gray-600'}`}>{row.code}</span>
                        </div>
                      </td>
                      <td className={`py-1 px-2 border-r border-gray-100 text-[11px] uppercase ${row.total>0?'font-semibold text-gray-800':'text-gray-600'}`}>{row.name}</td>
                      <td className={`py-1 px-2 border-r border-gray-100 text-right text-[11px] ${row.total>0?'font-semibold':'text-gray-400'}`}>{fmt(row.total)}</td>
                      {[...Array(12)].map((_,i)=>(
                        <td key={i} className={`py-1 px-2 border-r border-gray-100 text-right text-[11px] ${(row.months[i]||0)>0?'text-gray-800':'text-gray-300'}`}>
                          {(row.months[i]||0)>0 ? fmt(row.months[i]) : '0,00'}
                        </td>
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
          DIALOG: FICHA DE PRESUPUESTO ANUAL  (Foto 3)
      ════════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-start justify-center">
          <Dialog title="Ficha de presupuesto anual" width="460px" onClose={()=>setShowForm(false)}>
            <div className="bg-white p-4 flex flex-col gap-3">

              {/* Icon placeholder */}
              <div className="flex items-start gap-3 mb-1">
                <div className="w-16 h-14 border border-gray-300 bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="40" height="36" viewBox="0 0 40 36" fill="none" stroke="#aaa" strokeWidth="1">
                    <rect x="2" y="2" width="22" height="30"/>
                    <line x1="28" y1="8" x2="38" y2="8"/><line x1="28" y1="14" x2="38" y2="14"/>
                    <line x1="28" y1="20" x2="38" y2="20"/><line x1="28" y1="26" x2="38" y2="26"/>
                  </svg>
                </div>
              </div>

              {/* Cuenta row */}
              <div className="flex items-center gap-2">
                <span className="w-32 text-[12px]">Cuenta:</span>
                <input type="text" readOnly value={formAccount?.code||''}
                       onClick={()=>openSelector('budget')}
                       className="w-28 border border-gray-400 px-2 py-0.5 text-[12px] cursor-pointer outline-none"/>
                <span className="text-[11px] text-gray-600 uppercase truncate max-w-[120px]">{formAccount?.name||''}</span>
              </div>

              {/* Presupuesto anual row */}
              <div className="flex items-center gap-2">
                <span className="w-32 text-[12px]">Presupuesto anual:</span>
                <input type="number" readOnly value={formTotal.toFixed(2)}
                       className="w-28 border border-gray-400 px-2 py-0.5 text-right text-[12px] outline-none bg-white"/>
                <button onClick={distributeMonths}
                        className="border border-gray-400 bg-[#f0f0f0] hover:bg-gray-200 px-3 py-0.5 text-[11px] ml-1">
                  Repartir proporcionalmente
                </button>
              </div>

              {/* Months grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {[...Array(6)].map((_,i)=>(
                  <div key={i} className="flex items-center gap-1">
                    {/* left column: month i */}
                    <span className="w-24 text-right text-[12px] bg-[#f0f0f0] px-2 py-0.5 border border-gray-200">{MONTHS_LONG[i]}</span>
                    <input type="number" value={formMonths[i]??0} onChange={e=>setMonth(i,e.target.value)}
                           className="w-24 border border-gray-400 px-2 py-0.5 text-right text-[12px] outline-none"/>
                    {/* right column: month i+6 */}
                    <span className="w-24 text-right text-[12px] bg-[#f0f0f0] px-2 py-0.5 border border-gray-200">{MONTHS_LONG[i+6]}</span>
                    <input type="number" value={formMonths[i+6]??0} onChange={e=>setMonth(i+6,e.target.value)}
                           className="w-24 border border-gray-400 px-2 py-0.5 text-right text-[12px] outline-none"/>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
                <button onClick={saveBudget}
                        className="px-6 py-1 border border-gray-400 bg-[#f0f0f0] hover:bg-gray-200 text-[12px]">Aceptar</button>
                <button onClick={()=>setShowForm(false)}
                        className="px-6 py-1 border border-gray-400 bg-[#f0f0f0] hover:bg-gray-200 text-[12px]">Cancelar</button>
              </div>
            </div>
          </Dialog>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOG: DESVIACIÓN DE PRESUPUESTOS  (Foto 4)
      ════════════════════════════════════════════════════════════════════════ */}
      {showDev && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-start justify-center">
          <Dialog title="Desviación de presupuestos" width="640px" onClose={()=>setShowDev(false)}>
            <div className="bg-white flex flex-col" style={{height:'460px'}}>

              {/* Icon + Cuenta row */}
              <div className="flex items-center gap-3 p-3 border-b border-gray-200">
                <div className="w-16 h-12 border border-gray-300 bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="40" height="32" viewBox="0 0 40 32" fill="none" stroke="#aaa" strokeWidth="1">
                    <rect x="2" y="2" width="20" height="28"/>
                    <circle cx="32" cy="18" r="8"/>
                    <line x1="38" y1="24" x2="43" y2="30"/>
                  </svg>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[12px] bg-[#f0f0f0] border border-gray-300 px-2 py-0.5">Cuenta:</span>
                  <input type="text" readOnly value={devAccount?.code||''}
                         onClick={()=>openSelector('desviacion')}
                         className="w-28 border border-gray-400 px-2 py-0.5 text-[12px] cursor-pointer outline-none"/>
                  <span className="text-[11px] text-gray-600 uppercase flex-1 truncate">{devAccount?.name||''}</span>
                </div>
                {/* Column chooser icon */}
                <button className="border border-gray-400 bg-[#f0f0f0] p-1 hover:bg-gray-200">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#555" strokeWidth="1">
                    <line x1="2" y1="3" x2="12" y2="3"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="11" x2="12" y2="11"/>
                  </svg>
                </button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto border-b border-gray-300">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="sticky top-0 bg-white border-b border-gray-400 z-10">
                      {['MES','PRESUPUESTO','SALDO','DESVIACIÓN','% DESVIACIÓN','% DESV.ARRAST'].map(h=>(
                        <th key={h} className="text-left font-normal py-1.5 px-2 border-r border-gray-300 last:border-r-0 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {devRows.map((r,idx)=>(
                      <tr key={idx} className={`border-b border-gray-200 ${idx%2===0?'bg-[#f5f5f5]':'bg-white'}`}>
                        <td className="py-1.5 px-2 border-r border-gray-200 font-medium">{r.month}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right">{r.b!==0?fmt(r.b):''}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right">{r.a!==0?fmt(r.a):''}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right">{r.dev!==0?fmtD(r.dev):''}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right">{r.pct!==0?pctStr(r.pct):''}</td>
                        <td className="py-1.5 px-2 text-right">{r.cumPct!==0?pctStr(r.cumPct):''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 p-2.5">
                <button onClick={()=>alert('Calculando desviación...')}
                        className="px-6 py-1 border border-gray-400 bg-[#f0f0f0] hover:bg-gray-200 text-[12px]">Proceder</button>
                <button onClick={()=>setShowDev(false)}
                        className="px-6 py-1 border border-gray-400 bg-[#f0f0f0] hover:bg-gray-200 text-[12px]">Salir</button>
              </div>
            </div>
          </Dialog>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOG: SELECCIÓN DE CUENTA  (Foto 5)
      ════════════════════════════════════════════════════════════════════════ */}
      {showSel && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-start justify-center pt-8">
          <div className="shadow-2xl flex flex-col bg-white border border-gray-400" style={{width:'820px',height:'580px'}}>

            {/* Header */}
            <div className="bg-gradient-to-r from-[#4a4a9c] to-[#6060b0] text-white text-[13px] font-semibold py-2 px-4 flex items-center justify-between shrink-0">
              <span>SELECCIÓN DE CUENTA</span>
              <button onClick={()=>setShowSel(false)} className="hover:bg-white/20 rounded p-0.5"><X size={14}/></button>
            </div>

            {/* Selector toolbar */}
            <div className="bg-[#f0f0f0] border-b border-gray-300 flex items-start px-2 py-0.5 gap-0.5 shrink-0">
              <TBtn icon={IcoNuevo}  label="Nuevo"    onClick={()=>{}}/>
              <TBtn icon={IcoModif}  label="Modificar" onClick={()=>{}}/>
              <TBtn icon={IcoElim}   label="Eliminar"  onClick={()=>{}}/>
              <div className="w-px h-10 bg-gray-300 mx-1 self-center"/>
              <TBtn icon={IcoSubir}  label="Subir"  onClick={()=>{}}/>
              <TBtn icon={IcoBajar}  label="Bajar"  onClick={()=>{}}/>
              <div className="w-px h-10 bg-gray-300 mx-1 self-center"/>
              <TBtn icon={IcoExp}    label="Expandir" onClick={()=>setSelCollapsed({})}/>
              <TBtn icon={IcoCol}    label="Colapsar" onClick={()=>{ const k={}; selAllCodes.forEach(r=>{if(r.hasChildren)k[r.code]=true;}); setSelCollapsed(k); }}/>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT PANEL */}
              <div className="w-48 bg-white border-r border-gray-300 flex flex-col shrink-0">
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Lista actual</div>
                    <div className="flex flex-col gap-0.5">
                      {[{v:'ALL',l:'Todos los grupos'},...['0','1','2','3','4','5','6','7','8','9'].map(n=>({v:n,l:`Mostrar grupo ${n}`}))].map(({v,l})=>(
                        <label key={v} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                          <input type="radio" name="sel-grp" checked={selGroup===v} onChange={()=>setSelGroup(v)} className="scale-90"/>
                          <span className={selGroup===v?'text-[#4a4a9c] font-semibold':'text-gray-600'}>{l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-300 pt-2 flex flex-col gap-1">
                    {[
                      [selShowPgc, setSelShowPgc, 'Mostrar cuentas del PGC'],
                      [selShowAux, setSelShowAux, 'Mostrar cuentas auxiliares'],
                      [selShowObs, setSelShowObs, 'Mostrar cuentas obsoletas'],
                    ].map(([val,set,lbl])=>(
                      <label key={lbl} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                        <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)} className="scale-90"/>
                        <span className={val?'text-[#4a4a9c] font-semibold':'text-gray-600'}>{lbl}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Footer of left panel */}
                <div className="border-t border-gray-300 p-2 bg-[#f0f0f0]">
                  <div className="text-[10px] text-gray-500 mb-1">Ver saldos del diario</div>
                  <select className="w-full border border-gray-400 bg-white text-[11px] px-1 py-0.5 outline-none">
                    <option>Todos</option>
                    <option>Solo con saldo</option>
                    <option>Solo sin saldo</option>
                  </select>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="flex-1 flex flex-col overflow-hidden">

                {/* Table header toolbar */}
                <div className="bg-white border-b border-gray-200 flex items-center px-2 py-1 gap-2 shrink-0">
                  <button className="w-5 h-5 border border-gray-400 bg-[#f0f0f0] flex items-center justify-center hover:bg-gray-200">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#555" strokeWidth="1">
                      <rect x="1" y="1" width="10" height="10"/><line x1="4" y1="1" x2="4" y2="11"/>
                    </svg>
                  </button>
                  <div className="flex-1"/>
                  <div className="relative flex items-center">
                    <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                           value={selQuery} onChange={e=>setSelQuery(e.target.value)}
                           className="w-56 text-right pr-7 py-0.5 text-[11px] border-b border-gray-400 outline-none bg-transparent"/>
                    <Search size={13} className="absolute right-1 text-gray-400 pointer-events-none"/>
                  </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="sticky top-0 bg-white border-b border-gray-300 z-10">
                        <th className="text-left font-normal text-gray-500 text-[10px] uppercase tracking-wide py-1.5 px-2 border-r border-gray-200 w-36">Cuenta</th>
                        <th className="text-left font-normal text-gray-500 text-[10px] uppercase tracking-wide py-1.5 px-2">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSelRows.length===0 ? (
                        <tr><td colSpan={2} className="text-center text-gray-400 py-8">No hay cuentas que mostrar.</td></tr>
                      ) : visibleSelRows.map(row=>{
                        const isSel=selSelected===row.code;
                        const isCol=selCollapsed[row.code];
                        return (
                          <tr key={row.code}
                              className={`border-b border-gray-100 cursor-pointer ${isSel?'bg-blue-50 font-semibold':' hover:bg-gray-50'}`}
                              onClick={()=>setSelSelected(row.code)}
                              onDoubleClick={()=>acceptSelector(row)}>
                            <td className="py-1 px-2 border-r border-gray-100">
                              <div className="flex items-center" style={{paddingLeft:`${row.depth*14}px`}}>
                                {row.hasChildren ? (
                                  <button onClick={e=>{ e.stopPropagation(); setSelCollapsed(p=>({...p,[row.code]:!p[row.code]})); }}
                                          className="mr-1 hover:bg-gray-200 rounded p-0.5">
                                    {isCol ? <ChevronRight size={11} className="text-gray-500"/> : <ChevronDown size={11} className="text-gray-500"/>}
                                  </button>
                                ):<span className="w-4 shrink-0"/>}
                                <span className="font-mono text-[11px] text-gray-700">{row.code}</span>
                              </div>
                            </td>
                            <td className="py-1 px-2 text-[11px] uppercase text-gray-700">{row.name}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom zoom bar */}
                <div className="border-t border-gray-300 bg-[#f0f0f0] flex items-center justify-end gap-2 px-3 py-1 shrink-0">
                  <Minus size={12} className="text-gray-500 cursor-pointer" onClick={()=>setSelZoom(p=>Math.max(0,p-10))}/>
                  <input type="range" min="0" max="100" value={selZoom} onChange={e=>setSelZoom(parseInt(e.target.value,10))}
                         className="w-28 accent-[#4a4a9c]"/>
                  <Plus size={12} className="text-gray-500 cursor-pointer" onClick={()=>setSelZoom(p=>Math.min(100,p+10))}/>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="border-t border-gray-300 flex justify-end gap-2 p-2 bg-[#f0f0f0] shrink-0">
              <button disabled={!selSelected}
                      onClick={()=>{ const r=visibleSelRows.find(x=>x.code===selSelected); if(r) acceptSelector(r); }}
                      className="px-6 py-1 border border-gray-400 bg-white hover:bg-gray-100 text-[12px] disabled:opacity-40">Aceptar</button>
              <button onClick={()=>setShowSel(false)}
                      className="px-6 py-1 border border-gray-400 bg-white hover:bg-gray-100 text-[12px]">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

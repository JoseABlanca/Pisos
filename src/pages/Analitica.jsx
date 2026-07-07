import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, ChevronRight, ChevronDown, X } from 'lucide-react';

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

// ── Windows Desktop Icons (Precise replicas) ──────────────────────────────
const IcoNuevo    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M11 18h10M16 13v10' stroke='%2310b981' stroke-width='3'/></svg>" width="24" height="24" />;
const IcoModif    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M10 24l8-8-2-2-8 8v2h2z' fill='%233b82f6' stroke='%232563eb' stroke-width='1'/></svg>" width="24" height="24" />;
const IcoElim     = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M11 14l10 10M21 14L11 24' stroke='%23ef4444' stroke-width='2.5'/></svg>" width="24" height="24" />;
const IcoSubir    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 28V4M8 12l8-8 8 8' fill='none' stroke='%23555' stroke-width='2'/></svg>" width="24" height="24" />;
const IcoBajar    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 4v24M8 20l8 8 8-8' fill='none' stroke='%23555' stroke-width='2'/></svg>" width="24" height="24" />;
const IcoExp      = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 10v16h24V12H14l-3-2H4z' fill='%23fef08a' stroke='%23ca8a04' stroke-width='1.5'/><path d='M12 18h8M16 14v8' stroke='%2310b981' stroke-width='2.5'/></svg>" width="24" height="24" />;
const IcoCol      = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 10v16h24V12H14l-3-2H4z' fill='%23fef08a' stroke='%23ca8a04' stroke-width='1.5'/><path d='M12 18h8' stroke='%23ef4444' stroke-width='2.5'/></svg>" width="24" height="24" />;

const WinCheckbox = ({ checked, onChange, label, isRadio, name }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none mb-[3px]">
    <input type={isRadio?"radio":"checkbox"} name={name} checked={checked} onChange={onChange}
           className="m-0 p-0 w-[13px] h-[13px] accent-blue-600 outline-none" />
    <span className={`text-[12px] font-[Segoe_UI,Tahoma,sans-serif] ${checked&&isRadio?'text-blue-700 font-semibold':'text-gray-800'}`}>{label}</span>
  </label>
);

// ── Floating Window (classic dialog) ─────────────────────────────────────────
function Dialog({ title, children, onClose, width='480px', height='auto' }) {
  const [pos, setPos] = useState({ x: window.innerWidth/2 - parseInt(width)/2, y: window.innerHeight/2 - 200 });
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
         className="shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-gray-500 flex flex-col bg-white select-none">
      <div onMouseDown={onMouseDown}
           className="bg-white text-gray-800 text-[12px] font-[Segoe_UI] py-2 px-3 flex items-center justify-center relative cursor-move">
        <span>{title}</span>
        <button onClick={onClose} className="absolute right-2 hover:bg-red-500 hover:text-white rounded p-0.5 text-gray-500">
          <X size={14} strokeWidth={2}/>
        </button>
      </div>
      <div className="border-t border-gray-300">
        {children}
      </div>
    </div>
  );
}

// ── ToolbarBtn ────────────────────────────────────────────────────────────────
function TBtn({ icon: Icon, label, onClick, disabled=false, active=false }) {
  return (
    <button onClick={onClick} disabled={disabled}
            className={`flex flex-col items-center gap-[2px] px-2 py-1 border border-transparent rounded-[2px] disabled:opacity-40 min-w-[50px]
                       ${active?'bg-[#c1d9ff] border-[#8cb5f2]':'hover:bg-[#e5f1fb] hover:border-[#a0c5e8]'}`}>
      <Icon/>
      <span className="text-[11px] text-[#333] font-[Segoe_UI] leading-none">{label}</span>
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

  // ── Firestore ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if(!user) return;
    const uids = queryUserIds?.length ? queryUserIds : [user.uid];
    const uA = onSnapshot(query(collection(db,'accounts'),where('userId','in',uids)), s => setRawAccounts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const uB = onSnapshot(query(collection(db,'budgets'), where('userId','in',uids)), s => setBudgets(s.docs.map(d=>({id:d.id,...d.data()}))));
    return ()=>{ uA(); uB(); };
  },[user,queryUserIds]);

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
  const fmtD = v=>{ const s=v>0?'+':v<0?'-':''; return s+(Math.abs(v)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}); };
  const pctStr = v=>{ const s=v>0?'+':v<0?'-':''; return s+(Math.abs(v)||0).toFixed(2).replace('.',',')+'%'; };

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
      const a=0; // actuals not implemented
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
    <div className="w-full h-full flex flex-col bg-white font-[Segoe_UI,Tahoma,sans-serif] text-[12px] text-[#333]">

      {/* ── PAGE TOOLBAR ──────────────────────────────────────────────────── */}
      <div className="bg-[#f5f6f7] border-b border-[#d1d5db] flex items-center px-[4px] py-[2px] gap-1 shrink-0 h-[64px]">
        <TBtn icon={IcoNuevo}  label="Nuevo"     onClick={openNew}/>
        <TBtn icon={IcoModif}  label="Modificar" onClick={openEdit}   disabled={!selectedCode}/>
        <TBtn icon={IcoElim}   label="Eliminar"  onClick={openDelete} disabled={!selectedCode}/>
        <div className="w-[1px] h-10 bg-[#ccc] mx-1"/>
        <TBtn icon={IcoSubir}  label="Subir"     onClick={()=>{}} disabled={!selectedCode}/>
        <TBtn icon={IcoBajar}  label="Bajar"     onClick={()=>{}} disabled={!selectedCode}/>
        <div className="w-[1px] h-10 bg-[#ccc] mx-1"/>
        <TBtn icon={IcoExp}    label="Expandir"  onClick={()=>setCollapsed({})}/>
        <TBtn icon={IcoCol}    label="Colapsar"  onClick={()=>{ const k={}; treeRows.forEach(r=>{ if(r.hasChildren) k[r.code]=true; }); setCollapsed(k); }}/>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        {sidebarVisible && (
          <div className="w-[210px] bg-white border-r border-[#d1d5db] flex flex-col shrink-0 overflow-y-auto">
            <div className="flex flex-col flex-1 pb-4">
              
              <div className="bg-[#f0f0f0] border-b border-[#d1d5db] text-[#555] font-semibold text-[11px] px-2 py-1 mb-2">
                Filtros Generales
              </div>
              <div className="px-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#555]">Ejercicio</span>
                  <select value={selectedYear} onChange={e=>setSelectedYear(parseInt(e.target.value,10))}
                          className="border border-[#7a7a7a] bg-white text-[12px] px-1 py-[2px] outline-none">
                    {YEARS.map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#555]">Filtrar por fecha</span>
                  <select value={dateFilterYear} onChange={e=>setDateFilterYear(e.target.value)}
                          className="border border-[#7a7a7a] bg-white text-[12px] px-1 py-[2px] outline-none">
                    <option value="ALL">Todo el ejercicio</option>
                    {MONTHS_LONG.map((m,i)=><option key={i} value={i}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-[#f0f0f0] border-y border-[#d1d5db] text-[#555] font-semibold text-[11px] px-2 py-1 mt-4 mb-2">
                Lista actual
              </div>
              <div className="px-3 flex flex-col gap-0.5">
                {[{v:'ALL',l:'Todos los grupos'},...['0','1','2','3','4','5','6','7','8','9'].map(n=>({v:n,l:`Mostrar grupo ${n}`}))].map(({v,l})=>(
                  <WinCheckbox key={v} name="main-grp" isRadio checked={groupFilter===v} onChange={()=>setGroupFilter(v)} label={l} />
                ))}
              </div>

              <div className="border-t border-[#eee] mt-2 mb-2"/>
              <div className="px-3 flex flex-col gap-0.5">
                <WinCheckbox checked={showPgc}      onChange={e=>setShowPgc(e.target.checked)}      label="Mostrar cuentas del PGC" />
                <WinCheckbox checked={showAux}      onChange={e=>setShowAux(e.target.checked)}      label="Mostrar cuentas auxiliares" />
                <WinCheckbox checked={showObsolete} onChange={e=>setShowObsolete(e.target.checked)} label="Mostrar cuentas obsoletas" />
                <WinCheckbox checked={hideZero}     onChange={e=>setHideZero(e.target.checked)}     label="Ocultar cuentas a 0" />
              </div>

            </div>
          </div>
        )}

        {/* MAIN TABLE AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
          
          <div className="absolute top-0 right-0 z-20 flex items-center bg-white p-1 pb-0 shadow-[0_1px_0_#d1d5db]">
            <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                   value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                   className="w-[220px] text-right pr-6 pl-2 py-[2px] text-[11px] border border-transparent border-b-[#999] outline-none focus:border-b-blue-500 bg-transparent"/>
            <Search size={12} className="absolute right-2 text-gray-400 pointer-events-none"/>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto" onClick={()=>setSelectedCode(null)}>
            <table className="w-full border-collapse" style={{tableLayout:'fixed'}}>
              <thead>
                <tr className="sticky top-0 bg-white border-b border-[#ccc] z-10">
                  <th className="text-left font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2 border-r border-[#eee] w-[200px] flex items-center">
                    <button onClick={()=>setSidebarVisible(p=>!p)} title="Ocultar filtros"
                            className="w-[14px] h-[14px] border border-[#999] bg-[#f0f0f0] mr-2 flex items-center justify-center hover:bg-gray-200">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#333" strokeWidth="1">
                        <line x1="0" y1="4" x2="8" y2="4"/><line x1="4" y1="0" x2="4" y2="8"/>
                      </svg>
                    </button>
                    CUENTA
                  </th>
                  <th className="text-left font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2 border-r border-[#eee] w-[240px]">DESCRIPCIÓN</th>
                  <th className="text-right font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2 border-r border-[#eee] w-[100px]">PRESUPUESTO</th>
                  {MONTHS_SHORT.map(m=>(
                    <th key={m} className="text-right font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2 border-r border-[#eee] w-[70px]">{m}</th>
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
                        className={`border-b border-[#f5f5f5] cursor-default ${isSel?'bg-[#cce8ff]':'hover:bg-[#f3f9ff]'}`}
                        onClick={e=>{ e.stopPropagation(); setSelectedCode(row.code); }}
                        onDoubleClick={()=>openEdit()}>
                      <td className="py-[2px] px-2 border-r border-[#eee] whitespace-nowrap overflow-hidden text-ellipsis">
                        <div className="flex items-center" style={{paddingLeft:`${row.depth*12}px`}}>
                          {row.hasChildren ? (
                            <button onClick={e=>toggleCollapsed(row.code,e)} className="mr-1 w-[13px] h-[13px] border border-[#a0a0a0] flex items-center justify-center bg-white hover:border-[#333]">
                              {collapsed[row.code] ? <span className="text-[#333] text-[9px] leading-none mb-[1px]">+</span> : <span className="text-[#333] text-[9px] leading-none mb-[1px]">-</span>}
                            </button>
                          ) : <span className="w-[17px] shrink-0"/>}
                          <span className={`text-[12px] ${row.total>0?'font-semibold text-[#000]':'text-[#333]'}`}>{row.code}</span>
                        </div>
                      </td>
                      <td className={`py-[2px] px-2 border-r border-[#eee] text-[11px] uppercase whitespace-nowrap overflow-hidden text-ellipsis ${row.total>0?'font-semibold text-[#000]':'text-[#333]'}`}>{row.name}</td>
                      <td className={`py-[2px] px-2 border-r border-[#eee] text-right text-[11px] ${row.total>0?'font-semibold text-[#000]':'text-transparent'}`}>{fmt(row.total)}</td>
                      {[...Array(12)].map((_,i)=>(
                        <td key={i} className={`py-[2px] px-2 border-r border-[#eee] text-right text-[11px] ${(row.months[i]||0)>0?'text-[#333]':'text-transparent'}`}>
                          {(row.months[i]||0)>0 ? fmt(row.months[i]) : ''}
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
        <div className="fixed inset-0 bg-transparent z-50 flex items-start justify-center">
          <Dialog title="Ficha de presupuesto anual" width="460px" onClose={()=>setShowForm(false)}>
            <div className="bg-[#f0f0f0] p-4 flex flex-col gap-4">

              <div className="flex items-start gap-3">
                <div className="w-[100px] h-[70px] border border-[#a0a0a0] bg-white flex flex-col items-center justify-center shrink-0">
                  <div className="w-[60px] h-[40px] border border-[#ccc] flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc"><circle cx="8" cy="8" r="3"/><path d="M4 20l6-6 4 4 6-6"/></svg>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-[6px]">
                <span className="w-[100px] text-[12px] text-right text-[#333] border border-[#ccc] bg-white px-1">Cuenta:</span>
                <input type="text" readOnly value={formAccount?.code||''}
                       onClick={()=>openSelector('budget')}
                       className="w-[90px] border border-[#7a7a7a] px-1 py-[2px] text-[12px] cursor-pointer outline-none bg-white shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]"/>
                <span className="text-[12px] text-[#333] uppercase truncate flex-1">{formAccount?.name||''}</span>
              </div>

              <div className="flex items-center gap-[6px]">
                <span className="w-[100px] text-[12px] text-right font-semibold text-[#000] bg-[#e6e6e6] px-1 py-[1px]">Presupuesto anual:</span>
                <input type="text" readOnly value={fmt(formTotal)}
                       className="w-[90px] border border-[#7a7a7a] px-1 py-[2px] text-right text-[12px] outline-none bg-white shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)] text-[#000]"/>
                <button onClick={distributeMonths}
                        className="border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] px-3 py-[2px] text-[12px] text-[#000] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">
                  Repartir proporcionalmente
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-[3px]">
                {[...Array(6)].map((_,i)=>(
                  <div key={i} className="flex items-center gap-[4px]">
                    <span className="w-[85px] text-[12px] text-[#333] bg-[#e6e6e6] px-2 py-[2px] text-center">{MONTHS_LONG[i]}</span>
                    <input type="number" step="0.01" value={formMonths[i]??0} onChange={e=>setMonth(i,e.target.value)}
                           className="w-[85px] border border-[#7a7a7a] px-2 py-[2px] text-right text-[12px] outline-none shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]"/>
                    
                    <span className="w-[85px] text-[12px] text-[#333] bg-[#e6e6e6] px-2 py-[2px] text-center ml-2">{MONTHS_LONG[i+6]}</span>
                    <input type="number" step="0.01" value={formMonths[i+6]??0} onChange={e=>setMonth(i+6,e.target.value)}
                           className="w-[85px] border border-[#7a7a7a] px-2 py-[2px] text-right text-[12px] outline-none shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]"/>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 mt-2 pt-4 bg-[#f0f0f0]">
                <button onClick={saveBudget}
                        className="w-[80px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">Aceptar</button>
                <button onClick={()=>setShowForm(false)}
                        className="w-[80px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">Cancelar</button>
              </div>
            </div>
          </Dialog>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOG: DESVIACIÓN DE PRESUPUESTOS  (Foto 4)
      ════════════════════════════════════════════════════════════════════════ */}
      {showDev && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-start justify-center">
          <Dialog title="Desviación de presupuestos" width="700px" onClose={()=>setShowDev(false)}>
            <div className="bg-[#f0f0f0] flex flex-col p-[2px]" style={{height:'480px'}}>
              
              <div className="bg-white border border-[#ccc] flex flex-col flex-1">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-[70px] h-[50px] border border-[#ccc] bg-white flex flex-col items-center justify-center shrink-0 shadow-sm">
                    <div className="w-[40px] h-[30px] border border-[#eee] flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aaa"><circle cx="10" cy="10" r="5"/><line x1="14" y1="14" x2="20" y2="20"/><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="10" x2="6" y2="10"/><line x1="4" y1="14" x2="16" y2="14"/></svg>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] bg-white border border-[#ccc] px-2 py-[2px] shadow-sm">Cuenta:</span>
                    <input type="text" readOnly value={devAccount?.code||''}
                           onClick={()=>openSelector('desviacion')}
                           className="w-[100px] border border-[#7a7a7a] px-1 py-[2px] text-[12px] cursor-pointer outline-none bg-white shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]"/>
                    <span className="text-[12px] text-[#333] uppercase ml-1">{devAccount?.name||''}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto border-t border-[#ccc]">
                  <table className="w-full border-collapse text-[12px]" style={{tableLayout:'fixed'}}>
                    <thead>
                      <tr className="sticky top-0 bg-white border-b border-[#a0a0a0] z-10 shadow-[0_1px_0_#a0a0a0]">
                        {['MES','PRESUPUESTO','SALDO','DESVIACIÓN','% DESVIACIÓN','% DESV.ARRAST'].map(h=>(
                          <th key={h} className="text-left font-normal py-[4px] px-2 border-r border-[#e0e0e0] last:border-r-0 whitespace-nowrap text-[#333]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {devRows.map((r,idx)=>(
                        <tr key={idx} className={`border-b border-[#e0e0e0] ${idx%2===0?'bg-[#f2f2f2]':'bg-white'}`}>
                          <td className="py-[3px] px-2 border-r border-[#e0e0e0] text-[#000]">{r.month}</td>
                          <td className="py-[3px] px-2 border-r border-[#e0e0e0] text-right">{r.b!==0?fmt(r.b):''}</td>
                          <td className="py-[3px] px-2 border-r border-[#e0e0e0] text-right">{r.a!==0?fmt(r.a):''}</td>
                          <td className="py-[3px] px-2 border-r border-[#e0e0e0] text-right">{r.dev!==0?fmtD(r.dev):''}</td>
                          <td className="py-[3px] px-2 border-r border-[#e0e0e0] text-right">{r.pct!==0?pctStr(r.pct):''}</td>
                          <td className="py-[3px] px-2 text-right">{r.cumPct!==0?pctStr(r.cumPct):''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 p-3 bg-[#f0f0f0] border-t border-[#ccc]">
                  <button onClick={()=>alert('Calculando...')}
                          className="w-[90px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">Proceder</button>
                  <button onClick={()=>setShowDev(false)}
                          className="w-[90px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">Salir</button>
                </div>
              </div>

            </div>
          </Dialog>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOG: SELECCIÓN DE CUENTA  (Foto 5)
      ════════════════════════════════════════════════════════════════════════ */}
      {showSel && (
        <div className="fixed inset-0 bg-transparent z-[60] flex items-start justify-center pt-8">
          <div className="shadow-[0_4px_16px_rgba(0,0,0,0.3)] flex flex-col bg-white border border-[#555]" style={{width:'820px',height:'580px'}}>

            <div className="bg-[#6185c7] text-white text-[12px] font-semibold py-[6px] px-3 flex items-center justify-between shrink-0">
              <span>SELECCIÓN DE CUENTA</span>
              <button onClick={()=>setShowSel(false)} className="hover:bg-red-500 rounded-sm p-[2px]"><X size={14}/></button>
            </div>

            <div className="bg-[#f5f6f7] border-b border-[#d1d5db] flex items-center px-[4px] py-[2px] gap-1 shrink-0 h-[64px]">
              <TBtn icon={IcoNuevo}  label="Nuevo"    onClick={()=>{}}/>
              <TBtn icon={IcoModif}  label="Modificar" onClick={()=>{}}/>
              <TBtn icon={IcoElim}   label="Eliminar"  onClick={()=>{}}/>
              <div className="w-[1px] h-10 bg-[#ccc] mx-1"/>
              <TBtn icon={IcoSubir}  label="Subir"  onClick={()=>{}}/>
              <TBtn icon={IcoBajar}  label="Bajar"  onClick={()=>{}}/>
              <div className="w-[1px] h-10 bg-[#ccc] mx-1"/>
              <TBtn icon={IcoExp}    label="Expandir" onClick={()=>setSelCollapsed({})}/>
              <TBtn icon={IcoCol}    label="Colapsar" onClick={()=>{ const k={}; selAllCodes.forEach(r=>{if(r.hasChildren)k[r.code]=true;}); setSelCollapsed(k); }}/>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="w-[210px] bg-white border-r border-[#d1d5db] flex flex-col shrink-0 overflow-y-auto">
                <div className="flex-1 pb-4 flex flex-col">
                  <div className="bg-[#f0f0f0] border-b border-[#d1d5db] text-[#555] font-semibold text-[11px] px-2 py-1 mb-2">Lista actual</div>
                  <div className="px-3 flex flex-col gap-0.5">
                    {[{v:'ALL',l:'Todos los grupos'},...['0','1','2','3','4','5','6','7','8','9'].map(n=>({v:n,l:`Mostrar grupo ${n}`}))].map(({v,l})=>(
                      <WinCheckbox key={v} name="sel-grp" isRadio checked={selGroup===v} onChange={()=>setSelGroup(v)} label={l} />
                    ))}
                  </div>
                  <div className="border-t border-[#eee] mt-2 mb-2"/>
                  <div className="px-3 flex flex-col gap-0.5">
                    <WinCheckbox checked={selShowPgc} onChange={e=>setSelShowPgc(e.target.checked)} label="Mostrar cuentas del PGC" />
                    <WinCheckbox checked={selShowAux} onChange={e=>setSelShowAux(e.target.checked)} label="Mostrar cuentas auxiliares" />
                    <WinCheckbox checked={selShowObs} onChange={e=>setSelShowObs(e.target.checked)} label="Mostrar cuentas obsoletas" />
                  </div>
                </div>

                <div className="bg-[#f0f0f0] border-t border-[#d1d5db] p-2">
                  <div className="text-[11px] text-[#555] mb-1">Ver saldos del diario</div>
                  <select className="w-full border border-[#7a7a7a] bg-white text-[12px] px-1 py-[2px] outline-none shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]">
                    <option>Todos</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden relative bg-white">
                <div className="absolute top-0 right-0 z-20 flex items-center bg-white p-1 pb-0 shadow-[0_1px_0_#d1d5db]">
                  <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                         value={selQuery} onChange={e=>setSelQuery(e.target.value)}
                         className="w-[220px] text-right pr-6 pl-2 py-[2px] text-[11px] border border-transparent border-b-[#999] outline-none focus:border-b-blue-500 bg-transparent"/>
                  <Search size={12} className="absolute right-2 text-gray-400 pointer-events-none"/>
                </div>

                <div className="flex-1 overflow-auto">
                  <table className="w-full border-collapse" style={{tableLayout:'fixed'}}>
                    <thead>
                      <tr className="sticky top-0 bg-white border-b border-[#ccc] z-10">
                        <th className="text-left font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2 border-r border-[#eee] w-[140px] flex items-center">
                          <div className="w-[14px] h-[14px] border border-[#999] bg-[#f0f0f0] mr-2 flex items-center justify-center">
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#333" strokeWidth="1"><line x1="0" y1="4" x2="8" y2="4"/><line x1="4" y1="0" x2="4" y2="8"/></svg>
                          </div>
                          CUENTA
                        </th>
                        <th className="text-left font-normal text-[#555] uppercase text-[10px] tracking-wide py-[4px] px-2">DESCRIPCIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSelRows.length===0 ? (
                        <tr><td colSpan={2} className="text-center text-gray-400 py-10">No hay cuentas que mostrar.</td></tr>
                      ) : visibleSelRows.map(row=>{
                        const isSel=selSelected===row.code;
                        return (
                          <tr key={row.code}
                              className={`border-b border-[#f5f5f5] cursor-default ${isSel?'bg-[#cce8ff]':'hover:bg-[#f3f9ff]'}`}
                              onClick={()=>setSelSelected(row.code)}
                              onDoubleClick={()=>acceptSelector(row)}>
                            <td className="py-[2px] px-2 border-r border-[#eee]">
                              <div className="flex items-center" style={{paddingLeft:`${row.depth*12}px`}}>
                                {row.hasChildren ? (
                                  <button onClick={e=>{ e.stopPropagation(); setSelCollapsed(p=>({...p,[row.code]:!p[row.code]})); }}
                                          className="mr-1 w-[13px] h-[13px] border border-[#a0a0a0] flex items-center justify-center bg-white hover:border-[#333]">
                                    {selCollapsed[row.code] ? <span className="text-[#333] text-[9px] leading-none mb-[1px]">+</span> : <span className="text-[#333] text-[9px] leading-none mb-[1px]">-</span>}
                                  </button>
                                ):<span className="w-[17px] shrink-0"/>}
                                <span className="text-[12px] text-[#333]">{row.code}</span>
                              </div>
                            </td>
                            <td className="py-[2px] px-2 text-[11px] uppercase text-[#333]">{row.name}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-[#d1d5db] bg-[#f0f0f0] flex items-center justify-end gap-2 px-3 py-[4px] shrink-0">
                  <span className="text-[16px] text-gray-500 font-bold mb-[2px] cursor-pointer" onClick={()=>{}}>-</span>
                  <input type="range" min="0" max="100" defaultValue={50} className="w-[100px] h-[3px] accent-[#4a4a9c] bg-[#ccc] appearance-none"/>
                  <span className="text-[16px] text-gray-500 font-bold mb-[2px] cursor-pointer" onClick={()=>{}}>+</span>
                </div>
              </div>
            </div>

            <div className="border-t border-[#d1d5db] flex justify-end gap-2 p-[6px] bg-[#f0f0f0] shrink-0">
              <button disabled={!selSelected}
                      onClick={()=>{ const r=visibleSelRows.find(x=>x.code===selSelected); if(r) acceptSelector(r); }}
                      className="w-[80px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff] disabled:opacity-40">Aceptar</button>
              <button onClick={()=>setShowSel(false)}
                      className="w-[80px] py-[3px] border border-[#7a7a7a] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0] shadow-[inset_1px_1px_0_#fff]">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

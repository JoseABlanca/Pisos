import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';

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

const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const YEARS = [2023,2024,2025,2026,2027,2028];

// ── Windows Desktop Icons (Precise replicas) ──────────────────────────────
const IcoNuevo    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M11 18h10M16 13v10' stroke='%2310b981' stroke-width='3'/></svg>" width="22" height="22" />;
const IcoModif    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M10 24l8-8-2-2-8 8v2h2z' fill='%233b82f6' stroke='%232563eb' stroke-width='1'/></svg>" width="22" height="22" />;
const IcoElim     = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M6 2v28h20V10L16 2H6z' fill='%23fff' stroke='%23444' stroke-width='1.5'/><path d='M16 2v8h10' fill='none' stroke='%23444' stroke-width='1.5'/><path d='M11 14l10 10M21 14L11 24' stroke='%23ef4444' stroke-width='2.5'/></svg>" width="22" height="22" />;
const IcoSubir    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 28V4M8 12l8-8 8 8' fill='none' stroke='%23555' stroke-width='2'/></svg>" width="20" height="20" />;
const IcoBajar    = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M16 4v24M8 20l8 8 8-8' fill='none' stroke='%23555' stroke-width='2'/></svg>" width="20" height="20" />;
const IcoExp      = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 10v16h24V12H14l-3-2H4z' fill='%23fef08a' stroke='%23ca8a04' stroke-width='1.5'/><path d='M12 18h8M16 14v8' stroke='%2310b981' stroke-width='2.5'/></svg>" width="22" height="22" />;
const IcoCol      = ()=><img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><path d='M4 10v16h24V12H14l-3-2H4z' fill='%23fef08a' stroke='%23ca8a04' stroke-width='1.5'/><path d='M12 18h8' stroke='%23ef4444' stroke-width='2.5'/></svg>" width="22" height="22" />;

const WinCheckbox = ({ checked, onChange, label, isRadio, name }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none mb-[2px]">
    <input type={isRadio?"radio":"checkbox"} name={name} checked={checked} onChange={onChange}
           className="m-0 p-0 w-[12px] h-[12px] accent-blue-600 outline-none" />
    <span className={`text-[11px] font-[Segoe_UI,Tahoma,sans-serif] ${checked&&isRadio?'text-blue-700 font-semibold':'text-gray-600'}`}>{label}</span>
  </label>
);

// ── ToolbarBtn ────────────────────────────────────────────────────────────────
function TBtn({ icon: Icon, label, onClick, disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled}
            className={`flex flex-col items-center justify-center px-1.5 py-1 border border-transparent rounded-[2px] disabled:opacity-40 min-w-[50px]
                       hover:bg-[#e5f1fb] hover:border-[#a0c5e8]`}>
      <div className="h-[24px] flex items-center justify-center">
        <Icon/>
      </div>
      <span className="text-[10px] text-[#333] font-[Segoe_UI] leading-none mt-1">{label}</span>
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
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedYear,     setSelectedYear]     = useState(2026);
  const [collapsed,        setCollapsed]        = useState({});
  const [selectedCode,     setSelectedCode]     = useState(null);

  // ── Firestore ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if(!user) return;
    const uids = queryUserIds?.length ? queryUserIds : [user.uid];
    const uA = onSnapshot(query(collection(db,'accounts'),where('userId','in',uids)), s => setRawAccounts(s.docs.map(d=>({id:d.id,...d.data()}))));
    const uB = onSnapshot(query(collection(db,'budgets'), where('userId','in',uids)), s => setBudgets(s.docs.map(d=>({id:d.id,...d.data()}))));
    return ()=>{ uA(); uB(); };
  },[user,queryUserIds]);

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

  const fmt  = v=>(v===0?'':(v||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}));
  const toggleCollapsed = (code,e)=>{
    e.stopPropagation();
    setCollapsed(p=>({...p,[code]:!p[code]}));
  };

  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full h-full flex flex-col bg-white font-[Segoe_UI,Tahoma,sans-serif] text-[12px] text-[#333]">

      {/* ── PAGE TOOLBAR (Foto 1) ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e5e5e5] flex items-center px-2 py-[4px] shrink-0 h-[60px]">
        <TBtn icon={IcoNuevo}  label="Nuevo"     onClick={()=>{}}/>
        <TBtn icon={IcoModif}  label="Modificar" onClick={()=>{}} disabled={!selectedCode}/>
        <TBtn icon={IcoElim}   label="Eliminar"  onClick={()=>{}} disabled={!selectedCode}/>
        <div className="w-[1px] h-8 bg-[#e5e5e5] mx-2"/>
        <TBtn icon={IcoSubir}  label="Subir"     onClick={()=>{}} disabled={!selectedCode}/>
        <TBtn icon={IcoBajar}  label="Bajar"     onClick={()=>{}} disabled={!selectedCode}/>
        <div className="w-[1px] h-8 bg-[#e5e5e5] mx-2"/>
        <TBtn icon={IcoExp}    label="Expandir"  onClick={()=>setCollapsed({})}/>
        <TBtn icon={IcoCol}    label="Colapsar"  onClick={()=>{ const k={}; treeRows.forEach(r=>{ if(r.hasChildren) k[r.code]=true; }); setCollapsed(k); }}/>
        
        <div className="flex-1"/>
        
        {/* Right aligned search bar exactly as in Foto 1 */}
        <div className="relative flex items-center mr-2">
          <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                 value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                 className="w-[260px] text-left pl-2 pr-6 py-[2px] text-[11px] border-b border-[#ccc] outline-none focus:border-b-blue-500 bg-transparent placeholder-gray-400"/>
          <Search size={14} className="absolute right-1 text-gray-400 pointer-events-none"/>
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR (Foto 1) */}
        {sidebarVisible && (
          <div className="w-[230px] bg-[#f8f9fa] border-r border-[#e5e5e5] flex flex-col shrink-0 overflow-hidden">
            <div className="flex-1 flex flex-col overflow-y-auto">
              
              <div className="bg-[#f0f2f5] border-b border-[#e5e5e5] text-[#333] text-[12px] px-3 py-1.5 mb-2 font-semibold">
                Lista actual
              </div>
              <div className="px-4 flex flex-col gap-[3px]">
                {[{v:'ALL',l:'Todos los grupos'},...['0','1','2','3','4','5','6','7','8','9'].map(n=>({v:n,l:`Mostrar grupo ${n}`}))].map(({v,l})=>(
                  <WinCheckbox key={v} name="main-grp" isRadio checked={groupFilter===v} onChange={()=>setGroupFilter(v)} label={l} />
                ))}
              </div>

              <div className="border-t border-[#e5e5e5] mt-3 mb-3 mx-4"/>
              
              <div className="px-4 flex flex-col gap-[3px] pb-4">
                <WinCheckbox checked={showPgc}      onChange={e=>setShowPgc(e.target.checked)}      label="Mostrar cuentas del PGC" />
                <WinCheckbox checked={showAux}      onChange={e=>setShowAux(e.target.checked)}      label="Mostrar cuentas auxiliares" />
                <WinCheckbox checked={showObsolete} onChange={e=>setShowObsolete(e.target.checked)} label="Mostrar cuentas obsoletas" />
                
                {/* As requested in the previous message, I am keeping these filters here but matching Foto 1 styling */}
                <div className="border-t border-[#e5e5e5] mt-2 mb-2"/>
                <div className="flex flex-col gap-1 mt-1">
                  <span className="text-[11px] text-[#555]">Filtrar por fecha:</span>
                  <select value={selectedYear} onChange={e=>setSelectedYear(parseInt(e.target.value,10))}
                          className="border border-[#ccc] bg-white text-[11px] px-1 py-[2px] outline-none">
                    <option value={2026}>Año 2026</option>
                  </select>
                </div>
                <WinCheckbox checked={hideZero} onChange={e=>setHideZero(e.target.checked)} label="Ocultar cuentas a 0" />
              </div>

            </div>

            {/* Ver saldos del diario (Bottom of sidebar) */}
            <div className="bg-[#f0f2f5] border-t border-[#e5e5e5] p-3 shrink-0">
              <div className="text-[11px] text-[#555] mb-1">Ver saldos del diario</div>
              <select className="w-full border border-[#ccc] bg-white text-[11px] px-1 py-[3px] outline-none">
                <option>Todas</option>
              </select>
            </div>
          </div>
        )}

        {/* MAIN TABLE AREA */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex-1 overflow-auto" onClick={()=>setSelectedCode(null)}>
            <table className="w-full border-collapse" style={{tableLayout:'fixed'}}>
              <thead>
                <tr className="sticky top-0 bg-white border-y border-[#e5e5e5] z-10 shadow-[0_1px_0_#e5e5e5]">
                  <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[6px] px-2 w-[220px] flex items-center">
                    <button onClick={()=>setSidebarVisible(p=>!p)} title="Ocultar filtros"
                            className="w-[14px] h-[14px] border border-[#ccc] bg-white mr-2 flex items-center justify-center hover:bg-gray-100">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#666" strokeWidth="1">
                        <line x1="0" y1="4" x2="8" y2="4"/><line x1="4" y1="0" x2="4" y2="8"/>
                      </svg>
                    </button>
                    CUENTA
                  </th>
                  <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[6px] px-2 w-[260px]">DESCRIPCIÓN</th>
                  <th className="text-right font-normal text-[#555] text-[10px] uppercase py-[6px] px-2 w-[110px]">PRESUPUESTO</th>
                  {MONTHS_SHORT.map(m=>(
                    <th key={m} className="text-right font-normal text-[#555] text-[10px] uppercase py-[6px] px-2 w-[70px]">{m}</th>
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
                        className={`border-b border-[#f0f0f0] cursor-default ${isSel?'bg-[#e5f1fb]':'hover:bg-[#f9f9f9]'}`}
                        onClick={e=>{ e.stopPropagation(); setSelectedCode(row.code); }}>
                      <td className="py-[4px] px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                        <div className="flex items-center" style={{paddingLeft:`${row.depth*16}px`}}>
                          {row.hasChildren ? (
                            <button onClick={e=>toggleCollapsed(row.code,e)} className="mr-1.5 w-[14px] h-[14px] flex items-center justify-center text-gray-400 hover:text-gray-600">
                              {collapsed[row.code] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                            </button>
                          ) : <span className="w-[20px] shrink-0"/>}
                          <span className={`text-[11px] ${row.total>0?'font-semibold text-blue-700':'text-[#333]'}`}>{row.code}</span>
                        </div>
                      </td>
                      <td className={`py-[4px] px-2 text-[11px] uppercase whitespace-nowrap overflow-hidden text-ellipsis ${row.total>0?'font-semibold text-blue-700':'text-[#555]'}`}>{row.name}</td>
                      <td className={`py-[4px] px-2 text-right text-[11px] ${row.total>0?'font-semibold text-[#333]':'text-transparent'}`}>{fmt(row.total)}</td>
                      {[...Array(12)].map((_,i)=>(
                        <td key={i} className={`py-[4px] px-2 text-right text-[11px] ${(row.months[i]||0)>0?'text-[#333]':'text-transparent'}`}>
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
    </div>
  );
}

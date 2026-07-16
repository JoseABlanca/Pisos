import { useState, useEffect, useMemo, useRef } from 'react';
import ZoomControl from '../components/ZoomControl';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { X, Search } from 'lucide-react';
import Accounts from './Accounts';

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function useDrag(initX, initY) {
  const [pos, setPos] = useState({ x: initX, y: initY });
  const onDragDown = e => {
    e.preventDefault();
    const ox = e.clientX - pos.x, oy = e.clientY - pos.y;
    const mv = e => setPos({ x: e.clientX - ox, y: e.clientY - oy });
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };
  return [pos, onDragDown];
}

/* ── Icons ───────────────────────────────────────────────────────────────────── */
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

function TBtn({ icon: Icon, label, hasChevron, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-center justify-center px-[6px] py-[3px] min-w-[56px]
                 border border-transparent rounded-[3px] hover:bg-[#dce9f7] hover:border-[#b0cde8]
                 disabled:opacity-30 disabled:pointer-events-none select-none cursor-default">
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

/* ── Account selector modal ─────────────────────────────────────────────────── */
function AccountSelectorModal({ onSelect, onClose }) {
  const [pos, onDragDown] = useDrag(Math.max(0, (window.innerWidth - 900) / 2), 60);
  return (
    <div className="fixed inset-0 z-[300]" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: 900, height: 640 }}
           className="flex flex-col bg-white border border-[#888] shadow-xl relative">
        <div onMouseDown={onDragDown}
             className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
          <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de cuenta</span>
          <button onClick={onClose} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <Accounts isModal={true} onAccountSelect={(code, name) => { onSelect({ code, name }); onClose(); }} />
        </div>
      </div>
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-50">
        <ZoomControl />
      </div>
</div>
  );
}

/* ── CEBE/CECO selector modal ────────────────────────────────────────────────── */
function CenterSelectorModal({ type, items, onSelect, onClose }) {
  const [pos, onDragDown] = useDrag(Math.max(0, (window.innerWidth - 500) / 2), 100);
  const [searchQ, setSearchQ] = useState('');

  const filtered = useMemo(() => {
    if (!searchQ) return items;
    const q = searchQ.toLowerCase();
    return items.filter(x =>
      (x.code || '').toLowerCase().includes(q) ||
      (x.name || '').toLowerCase().includes(q)
    );
  }, [items, searchQ]);

  return (
    <div className="fixed inset-0 z-[300]" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: 500, height: 420 }}
           className="flex flex-col bg-white border border-[#888] shadow-xl relative select-none">
        <div onMouseDown={onDragDown}
             className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
          <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de {type.toUpperCase()}</span>
          <button onClick={onClose} className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Search bar inside selector */}
        <div className="flex justify-end items-center px-3 py-2 border-b border-[#d1d5db] bg-slate-50 shrink-0">
          <div className="relative flex items-center">
            <input type="text" placeholder="Buscar en el fichero (Alt+B)"
                   value={searchQ} onChange={e => setSearchQ(e.target.value)}
                   className="w-[250px] pr-5 py-[2px] text-[11px] text-right border-b border-[#aaa] outline-none focus:border-b-[#4472c4] bg-transparent placeholder:text-[#aaa]" />
            <Search size={13} className="absolute right-0 text-[#aaa] pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-1">
          <table style={{ zoom: tableZoom }} className="w-full border-collapse text-[11px] text-left">
            <thead>
              <tr className="sticky top-0 bg-[#f2f2f2] border-b border-slate-300 font-bold text-slate-700">
                <th className="py-2 px-3 font-bold">Código</th>
                <th className="py-2 px-3 font-bold">Descripción</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 hover:bg-slate-100 cursor-pointer"
                  onClick={() => { onSelect(''); onClose(); }}>
                <td colSpan={2} className="py-2 px-3 text-slate-500 italic">-- Sin {type.toUpperCase()} --</td>
              </tr>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center py-6 text-slate-400">No se encontraron resultados</td>
                </tr>
              ) : (
                filtered.map(x => (
                  <tr key={x.id} className="border-b border-slate-100 hover:bg-slate-100 cursor-pointer"
                      onClick={() => { onSelect(x.code); onClose(); }}>
                    <td className="py-2 px-3 font-mono font-bold text-slate-700">{x.code}</td>
                    <td className="py-2 px-3 text-slate-600 uppercase">{x.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Edit/New modal ─────────────────────────────────────────────────────────── */
function AssocModal({ initial, cebes, cecos, onSave, onClose }) {
  const [accountCode, setAccountCode] = useState(initial?.accountCode || '');
  const [accountName, setAccountName] = useState(initial?.accountName || '');
  const [cebe, setCebe] = useState(initial?.cebe || '');
  const [ceco, setCeco] = useState(initial?.ceco || '');
  const [showAccSel, setShowAccSel] = useState(false);
  const [showCebeSel, setShowCebeSel] = useState(false);
  const [showCecoSel, setShowCecoSel] = useState(false);
  const [pos, onDragDown] = useDrag(
    Math.max(0, (window.innerWidth - 420) / 2),
    Math.max(20, (window.innerHeight - 300) / 2)
  );

  const handleSave = () => {
    if (!accountCode) { alert('Selecciona una cuenta contable.'); return; }
    if (!cebe && !ceco) { alert('Introduce al menos un CEBE o CECO.'); return; }
    onSave({ accountCode, accountName, cebe, ceco });
  };

  return (
    <>
      <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ position: 'absolute', left: pos.x, top: pos.y, width: 420 }}
             className="bg-[#f0f0f0] border border-[#888] shadow-[2px_3px_12px_rgba(0,0,0,0.35)] flex flex-col select-none">
          {/* Title bar */}
          <div onMouseDown={onDragDown}
               className="flex items-center justify-between px-2 py-[5px] border-b border-[#ccc] cursor-move">
            <span className="flex-1 text-center text-[12px] text-[#333]">
              {initial ? 'Modificar asociación' : 'Nueva asociación'}
            </span>
            <button onClick={onClose} className="w-[20px] h-[20px] flex items-center justify-center hover:bg-red-500 hover:text-white text-[#666] rounded-[2px]">
              <X size={13} strokeWidth={2.5} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Cuenta contable */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#333] font-semibold w-[130px] shrink-0">Cuenta contable:</span>
              <input type="text" readOnly value={accountCode}
                     onClick={() => setShowAccSel(true)}
                     className="w-[80px] border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none" />
              <span className="text-[11px] text-[#555] uppercase truncate flex-1">{accountName}</span>
            </div>

            {/* CEBE */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#333] font-semibold w-[130px] shrink-0">CEBE:</span>
              <input type="text" readOnly value={cebe}
                     onClick={() => setShowCebeSel(true)}
                     placeholder="(Sin CEBE)"
                     className="flex-1 border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none placeholder:text-slate-400 font-mono font-bold" />
              {cebe && (
                <span className="text-[11px] text-[#555] uppercase truncate max-w-[120px]">
                  {cebes.find(c => c.code === cebe)?.name || ''}
                </span>
              )}
            </div>

            {/* CECO */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#333] font-semibold w-[130px] shrink-0">CECO:</span>
              <input type="text" readOnly value={ceco}
                     onClick={() => setShowCecoSel(true)}
                     placeholder="(Sin CECO)"
                     className="flex-1 border border-[#999] px-2 py-[3px] text-[12px] bg-white cursor-pointer outline-none placeholder:text-slate-400 font-mono font-bold" />
              {ceco && (
                <span className="text-[11px] text-[#555] uppercase truncate max-w-[120px]">
                  {cecos.find(c => c.code === ceco)?.name || ''}
                </span>
              )}
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={handleSave}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Aceptar
              </button>
              <button onClick={onClose}
                      className="w-[80px] py-[4px] border border-[#888] bg-[#e1e1e1] hover:bg-[#d0d0d0] text-[12px] active:bg-[#c0c0c0]">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAccSel && (
        <AccountSelectorModal
          onSelect={acc => { setAccountCode(acc.code); setAccountName(acc.name || ''); }}
          onClose={() => setShowAccSel(false)}
        />
      )}

      {showCebeSel && (
        <CenterSelectorModal
          type="cebe"
          items={cebes}
          onSelect={val => setCebe(val)}
          onClose={() => setShowCebeSel(false)}
        />
      )}

      {showCecoSel && (
        <CenterSelectorModal
          type="ceco"
          items={cecos}
          onSelect={val => setCeco(val)}
          onClose={() => setShowCecoSel(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function AnaliticaAssociations() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  const [associations, setAssociations] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchQ, setSearchQ] = useState('');

  const uids = queryUserIds?.length ? queryUserIds : (user ? [user.uid] : []);

  /* ── Firestore subscriptions ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!user) return;
    const uA = onSnapshot(
      query(collection(db, 'analitica_associations'), where('userId', 'in', uids)),
      s => setAssociations(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const uCebe = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', uids), where('type', '==', 'cebe')),
      s => setCebes(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code)))
    );
    const uCeco = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', uids), where('type', '==', 'ceco')),
      s => setCecos(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code)))
    );
    return () => { uA(); uCebe(); uCeco(); };
  }, [user]);

  /* ── Filtered rows ───────────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    if (!searchQ) return associations;
    const q = searchQ.toLowerCase();
    return associations.filter(a =>
      (a.accountCode || '').includes(q) ||
      (a.accountName || '').toLowerCase().includes(q) ||
      (a.cebe || '').toLowerCase().includes(q) ||
      (a.ceco || '').toLowerCase().includes(q)
    );
  }, [associations, searchQ]);

  const selectedItem = associations.find(a => a.id === selected);

  /* ── CRUD handlers ───────────────────────────────────────────────────────── */
  const openNew = () => { setEditingItem(null); setShowForm(true); };
  const openEdit = () => { if (!selectedItem) return; setEditingItem(selectedItem); setShowForm(true); };
  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!window.confirm(`¿Eliminar asociación de cuenta ${selectedItem.accountCode}?`)) return;
    await deleteDoc(doc(db, 'analitica_associations', selectedItem.id));
    setSelected(null);
  };
  const handleSave = async ({ accountCode, accountName, cebe, ceco }) => {
    const data = {
      accountCode, accountName, cebe: cebe || '', ceco: ceco || '',
      userId: user.uid, updatedAt: new Date().toISOString()
    };
    if (editingItem) {
      await updateDoc(doc(db, 'analitica_associations', editingItem.id), data);
    } else {
      const ref = await addDoc(collection(db, 'analitica_associations'), data);
      data.id = ref.id;
    }
    setShowForm(false);
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="w-full h-full flex flex-col bg-white font-[Segoe_UI,Tahoma,sans-serif] text-[12px] text-[#333] select-none">

      {/* Toolbar */}
      <div className="bg-[#f3f3f3] border-b border-[#d6d6d6] flex items-end px-[6px] pb-[2px] pt-[6px] shrink-0">
        <TBtn icon={IcoNuevo} label="Nuevo" hasChevron onClick={openNew} />
        <TBtn icon={IcoModif} label="Modificar" hasChevron onClick={openEdit} disabled={!selected} />
        <TBtn icon={IcoElim} label="Eliminar" hasChevron onClick={handleDelete} disabled={!selected} />
      </div>

      {/* Title + search */}
      <div className="flex items-center justify-between border-b border-[#e0e0e0] bg-white px-2 py-[3px] shrink-0">
        <span className="text-[12px] text-[#333]">Asociaciones cuenta analítica (CEBE / CECO)</span>
        <div className="relative flex items-center">
          <input type="text" placeholder="Buscar en el fichero (Alt+B)" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                 className="w-[220px] pr-5 py-[2px] text-[11px] text-right border-b border-[#aaa] outline-none focus:border-b-[#4472c4] bg-transparent placeholder:text-[#aaa]" />
          <Search size={13} className="absolute right-0 text-[#aaa] pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" onClick={() => setSelected(null)}>
        <table style={{ zoom: tableZoom }} className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="sticky top-0 bg-white border-b border-[#d6d6d6] z-10">
              <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[5px] px-2 w-[110px]">CUENTA</th>
              <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[5px] px-2">DESCRIPCIÓN</th>
              <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[5px] px-2 w-[140px]">CEBE</th>
              <th className="text-left font-normal text-[#555] text-[10px] uppercase py-[5px] px-2 w-[140px]">CECO</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-[#aaa] py-10 text-[11px]">
                No hay asociaciones. Pulsa "Nuevo" para crear una.
              </td></tr>
            ) : filtered.map(a => {
              const sel = selected === a.id;
              return (
                <tr key={a.id}
                    className={`border-b border-[#f0f0f0] cursor-default ${sel ? 'bg-[#cce5ff]' : 'hover:bg-[#f5f7fa]'}`}
                    onClick={e => { e.stopPropagation(); setSelected(a.id); }}
                    onDoubleClick={() => { setSelected(a.id); setEditingItem(a); setShowForm(true); }}>
                  <td className="py-[3px] px-2 font-mono">{a.accountCode}</td>
                  <td className="py-[3px] px-2 uppercase text-[#555]">{a.accountName}</td>
                  <td className="py-[3px] px-2">{a.cebe || '—'}</td>
                  <td className="py-[3px] px-2">{a.ceco || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <AssocModal
          initial={editingItem}
          cebes={cebes}
          cecos={cecos}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

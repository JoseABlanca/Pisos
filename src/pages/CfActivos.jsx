import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, PanelLeft } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';

const fmt = (v) => (v || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (v) => `${(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

const TYPES = ['Inmobiliario', 'Préstamo empresarial', 'Equity', 'Mixto', 'Otros'];
const STATUSES = ['activo', 'finalizado', 'moroso', 'amortizado'];
const SECTORS = ['Residencial', 'Comercial', 'Industrial', 'Hostelería', 'Tecnología', 'Energía', 'Salud', 'Otros'];
const GUARANTEES = ['Hipoteca 1ª', 'Hipoteca 2ª', 'Aval personal', 'Sin garantía', 'Garantía real', 'Otra'];

const EMPTY_FORM = {
  id: '',
  name: '',
  platformId: '',
  type: 'Inmobiliario',
  sector: 'Residencial',
  country: 'España',
  targetAmount: '',
  raisedAmount: '',
  annualRate: '',
  term: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  status: 'activo',
  guaranteeType: 'Sin garantía',
  ltv: '',
  notes: '',
};

export default function CfActivos() {
  const { user, queryUserIds } = useAuth();
  const [projects, setProjects] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeFormTab, setActiveFormTab] = useState('datos');
  const [showModalSidebar, setShowModalSidebar] = useState(true);

  const DEFAULT_COLUMNS = ['id', 'name', 'platformName', 'type', 'targetAmount', 'annualRate', 'term', 'status'];
  const { visibleColumns, columnWidths } = useTableColumns('cf-activos', DEFAULT_COLUMNS);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const u1 = onSnapshot(query(collection(db, 'cf_projects'), where('userId', 'in', qIds)), s => setProjects(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(query(collection(db, 'cf_platforms'), where('userId', 'in', qIds)), s => setPlatforms(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); };
  }, [user, queryUserIds]);

  const enriched = useMemo(() => projects.map(p => {
    const platform = platforms.find(pl => pl.id === p.platformId);
    return { ...p, platformName: platform?.name || p.platformId || '—' };
  }), [projects, platforms]);

  const filtered = useMemo(() => enriched.filter(p => {
    if (typeFilter !== 'todos' && p.type !== typeFilter) return false;
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.id?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q) || p.platformName?.toLowerCase().includes(q);
    }
    return true;
  }), [enriched, typeFilter, statusFilter, searchQuery]);

  useEffect(() => {
    const onNew    = () => { setIsEditing(false); setFormData(EMPTY_FORM); setActiveFormTab('datos'); setShowForm(true); };
    const onEdit   = () => { if (selected) { setIsEditing(true); setFormData({ ...selected }); setActiveFormTab('datos'); setShowForm(true); } else alert('Seleccione un activo primero.'); };
    const onDelete = () => { if (selected) handleDelete(selected); else alert('Seleccione un activo primero.'); };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const data = filtered.map(r => ({ ID: r.id, Nombre: r.name, Plataforma: r.platformName, Tipo: r.type, 'Objetivo (€)': r.targetAmount, 'TIR (%)': r.annualRate, 'Plazo (m)': r.term, Estado: r.status }));
      if (format === 'pdf') exportToPDF(data, [{ header: 'ID', dataKey: 'ID' }, { header: 'Nombre', dataKey: 'Nombre' }, { header: 'Plataforma', dataKey: 'Plataforma' }, { header: 'Tipo', dataKey: 'Tipo' }, { header: 'Objetivo (€)', dataKey: 'Objetivo (€)' }, { header: 'TIR (%)', dataKey: 'TIR (%)' }, { header: 'Plazo (m)', dataKey: 'Plazo (m)' }, { header: 'Estado', dataKey: 'Estado' }], 'Activos Crowdfunding', 'cf_activos.pdf');
      else handleExportFormat(data, 'Activos Crowdfunding', format);
    };
    window.addEventListener('cf-activo:new', onNew);
    window.addEventListener('cf-activo:edit', onEdit);
    window.addEventListener('cf-activo:delete', onDelete);
    window.addEventListener('cf-activo:export', onExport);
    return () => {
      window.removeEventListener('cf-activo:new', onNew);
      window.removeEventListener('cf-activo:edit', onEdit);
      window.removeEventListener('cf-activo:delete', onDelete);
      window.removeEventListener('cf-activo:export', onExport);
    };
  }, [selected, filtered]);

  const handleDelete = async (project) => {
    if (window.confirm(`¿Eliminar el proyecto ${project.name}?`)) {
      try { await deleteDoc(doc(db, 'cf_projects', project.id)); setSelected(null); }
      catch (e) { alert('Error al eliminar: ' + e.message); }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name) { alert('ID y Nombre son obligatorios.'); return; }
    try {
      await setDoc(doc(db, 'cf_projects', formData.id), {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount) || 0,
        raisedAmount: parseFloat(formData.raisedAmount) || 0,
        annualRate: parseFloat(formData.annualRate) || 0,
        term: parseInt(formData.term) || 0,
        ltv: parseFloat(formData.ltv) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      });
      setShowForm(false); setSelected(null);
    } catch (e) { alert('Error al guardar: ' + e.message); }
  };

  const statusColor = (s) => ({ activo: 'text-green-700', finalizado: 'text-blue-700', moroso: 'text-red-700', amortizado: 'text-gray-500' }[s] || '');

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-52 bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700">Filtros</div>
            <div className="p-3 text-[11px] space-y-4 flex-1 overflow-auto">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Tipo:</label>
                {['todos', ...TYPES].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="cfActType" checked={typeFilter === t} onChange={() => setTypeFilter(t)} className="text-indigo-600" />
                    <span className={typeFilter === t ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{t === 'todos' ? 'Todos' : t}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Estado:</label>
                {['todos', ...STATUSES].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="cfActStatus" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="text-indigo-600" />
                    <span className={statusFilter === s ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8fafc]">
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300">
              <PanelLeft className="w-4 h-4" />
            </button>
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input type="text" placeholder="Buscar proyecto..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-56 outline-none focus:border-blue-500 bg-transparent" />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div className="win-table-container">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id')           && <th>ID</th>}
                  {visibleColumns.includes('name')         && <th>Nombre</th>}
                  {visibleColumns.includes('platformName') && <th>Plataforma</th>}
                  {visibleColumns.includes('type')         && <th>Tipo</th>}
                  {visibleColumns.includes('targetAmount') && <th className="text-right">Objetivo</th>}
                  {visibleColumns.includes('annualRate')   && <th className="text-right">TIR %</th>}
                  {visibleColumns.includes('term')         && <th className="text-center">Plazo</th>}
                  {visibleColumns.includes('status')       && <th>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400">No hay proyectos registrados. Usa el ribbon para añadir uno nuevo.</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelected(selected?.id === p.id ? null : p)} className={selected?.id === p.id ? 'selected' : ''}>
                    {visibleColumns.includes('id')           && <td className="font-mono font-bold">{p.id}</td>}
                    {visibleColumns.includes('name')         && <td className="font-medium">{p.name}</td>}
                    {visibleColumns.includes('platformName') && <td>{p.platformName}</td>}
                    {visibleColumns.includes('type')         && <td>{p.type}</td>}
                    {visibleColumns.includes('targetAmount') && <td className="text-right">{fmt(parseFloat(p.targetAmount))}</td>}
                    {visibleColumns.includes('annualRate')   && <td className="text-right font-semibold text-green-700">{pct(parseFloat(p.annualRate))}</td>}
                    {visibleColumns.includes('term')         && <td className="text-center">{p.term ? `${p.term} m` : '—'}</td>}
                    {visibleColumns.includes('status')       && <td className={`font-semibold ${statusColor(p.status)}`}>{p.status}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] shrink-0">
        <span>{filtered.length} proyectos</span>
        <span className="text-gray-500">Crowdfunding · Activos</span>
      </div>

      {/* Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window title={isEditing ? `Modificar Proyecto: ${formData.id}` : 'Nuevo Proyecto Crowdfunding'} onClose={() => setShowForm(false)} width={isMobile ? '100%' : '850px'} height={isMobile ? '100%' : '580px'} initialPos={{ x: (window.innerWidth - 850) / 2, y: 60 }} onMenuClick={() => setShowModalSidebar(!showModalSidebar)}>
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
              {showModalSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-48' : 'w-48'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    {['datos', 'financiero', 'garantias'].map(tab => (
                      <button key={tab} onClick={() => { setActiveFormTab(tab); if (isMobile) setShowModalSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeFormTab === tab ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}>
                        {tab === 'datos' ? 'Datos' : tab === 'financiero' ? 'Financiero' : 'Garantías'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4">
                    <form id="cf-activo-form" onSubmit={handleSave} className="space-y-3">
                      {activeFormTab === 'datos' && (<>
                        <div className="win-form-row"><label className="win-form-label">ID Proyecto:</label><input type="text" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value.toUpperCase() })} placeholder="ej. CF001" required disabled={isEditing} className="win-input flex-1 uppercase" /></div>
                        <div className="win-form-row"><label className="win-form-label">Nombre:</label><input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nombre del proyecto" required className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Plataforma:</label>
                          <select value={formData.platformId} onChange={e => setFormData({ ...formData, platformId: e.target.value })} className="win-input flex-1">
                            <option value="">— Sin plataforma —</option>
                            {platforms.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row"><label className="win-form-label">Tipo:</label><select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="win-input flex-1">{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div className="win-form-row"><label className="win-form-label">Sector:</label><select value={formData.sector} onChange={e => setFormData({ ...formData, sector: e.target.value })} className="win-input flex-1">{SECTORS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                        <div className="win-form-row"><label className="win-form-label">País:</label><input type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} placeholder="España" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Estado:</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="win-input flex-1">{STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
                      </>)}
                      {activeFormTab === 'financiero' && (<>
                        <div className="win-form-row"><label className="win-form-label">Objetivo de financiación (€):</label><input type="number" step="0.01" value={formData.targetAmount} onChange={e => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Financiación obtenida (€):</label><input type="number" step="0.01" value={formData.raisedAmount} onChange={e => setFormData({ ...formData, raisedAmount: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">TIR / Tipo anual (%):</label><input type="number" step="0.01" value={formData.annualRate} onChange={e => setFormData({ ...formData, annualRate: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Plazo (meses):</label><input type="number" step="1" value={formData.term} onChange={e => setFormData({ ...formData, term: e.target.value })} placeholder="12" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Fecha inicio:</label><input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Fecha fin:</label><input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="win-input flex-1" /></div>
                      </>)}
                      {activeFormTab === 'garantias' && (<>
                        <div className="win-form-row"><label className="win-form-label">Tipo de garantía:</label><select value={formData.guaranteeType} onChange={e => setFormData({ ...formData, guaranteeType: e.target.value })} className="win-input flex-1">{GUARANTEES.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                        <div className="win-form-row"><label className="win-form-label">LTV (%):</label><input type="number" step="0.01" value={formData.ltv} onChange={e => setFormData({ ...formData, ltv: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                        <div className="win-form-row"><label className="win-form-label">Notas:</label><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={4} className="win-input flex-1 resize-none" /></div>
                      </>)}
                    </form>
                  </div>
                </div>
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  {activeFormTab === 'datos' ? (<>
                    <button type="submit" form="cf-activo-form" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Aceptar</button>
                    <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Cancelar</button>
                  </>) : (
                    <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Cerrar</button>
                  )}
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

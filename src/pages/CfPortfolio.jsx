import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, PanelLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';

const fmt = (v, dec = 2) => (v || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec });
const pct = (v) => `${(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

const EMPTY_FORM = {
  id: '',
  projectId: '',
  platformId: '',
  type: 'Inmobiliario',
  amount: '',
  currentValue: '',
  returnRate: '',
  status: 'activo',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  notes: '',
};

const TYPES = ['Inmobiliario', 'Préstamo', 'Equity', 'Otros'];
const STATUSES = ['activo', 'finalizado', 'moroso', 'amortizado'];

export default function CfPortfolio() {
  const { user, queryUserIds } = useAuth();
  const [investments, setInvestments] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const DEFAULT_COLUMNS = ['id', 'projectId', 'platformName', 'type', 'amount', 'currentValue', 'returnRate', 'status'];
  const { visibleColumns, columnWidths } = useTableColumns('cf-portfolio', DEFAULT_COLUMNS);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const u1 = onSnapshot(query(collection(db, 'cf_investments'), where('userId', 'in', qIds)), s => setInvestments(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u2 = onSnapshot(query(collection(db, 'cf_platforms'), where('userId', 'in', qIds)), s => setPlatforms(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    const u3 = onSnapshot(query(collection(db, 'cf_projects'), where('userId', 'in', qIds)), s => setProjects(s.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { u1(); u2(); u3(); };
  }, [user, queryUserIds]);

  const enriched = useMemo(() => investments.map(inv => {
    const platform = platforms.find(p => p.id === inv.platformId);
    const project  = projects.find(p => p.id === inv.projectId);
    return { ...inv, platformName: platform?.name || inv.platformId || '—', projectName: project?.name || inv.projectId || '—' };
  }), [investments, platforms, projects]);

  const filtered = useMemo(() => enriched.filter(inv => {
    if (typeFilter !== 'todos' && inv.type !== typeFilter) return false;
    if (statusFilter !== 'todos' && inv.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return inv.id?.toLowerCase().includes(q) || inv.projectName?.toLowerCase().includes(q) || inv.platformName?.toLowerCase().includes(q);
    }
    return true;
  }), [enriched, typeFilter, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const totalInvested = filtered.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const totalCurrent  = filtered.reduce((s, i) => s + (parseFloat(i.currentValue) || parseFloat(i.amount) || 0), 0);
    const totalReturn   = totalCurrent - totalInvested;
    const avgReturn     = filtered.length > 0 ? filtered.reduce((s, i) => s + (parseFloat(i.returnRate) || 0), 0) / filtered.length : 0;
    return { totalInvested, totalCurrent, totalReturn, avgReturn };
  }, [filtered]);

  // Ribbon events
  useEffect(() => {
    const onNew    = () => { setIsEditing(false); setFormData(EMPTY_FORM); setShowForm(true); };
    const onEdit   = () => { if (selected) { setIsEditing(true); setFormData({ ...selected }); setShowForm(true); } else alert('Seleccione una inversión primero.'); };
    const onDelete = () => { if (selected) handleDelete(selected); else alert('Seleccione una inversión primero.'); };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const data = filtered.map(r => ({ ID: r.id, Proyecto: r.projectName, Plataforma: r.platformName, Tipo: r.type, 'Invertido (€)': r.amount, 'Valor actual (€)': r.currentValue, 'Rentabilidad (%)': r.returnRate, Estado: r.status }));
      if (format === 'pdf') exportToPDF(data, [{ header: 'ID', dataKey: 'ID' }, { header: 'Proyecto', dataKey: 'Proyecto' }, { header: 'Plataforma', dataKey: 'Plataforma' }, { header: 'Tipo', dataKey: 'Tipo' }, { header: 'Invertido (€)', dataKey: 'Invertido (€)' }, { header: 'Valor actual (€)', dataKey: 'Valor actual (€)' }, { header: 'Rentabilidad (%)', dataKey: 'Rentabilidad (%)' }, { header: 'Estado', dataKey: 'Estado' }], 'CF Portfolio', 'cf_portfolio.pdf');
      else handleExportFormat(data, 'CF Portfolio', format);
    };
    window.addEventListener('cf-portfolio:new', onNew);
    window.addEventListener('cf-portfolio:edit', onEdit);
    window.addEventListener('cf-portfolio:delete', onDelete);
    window.addEventListener('cf-portfolio:export', onExport);
    return () => {
      window.removeEventListener('cf-portfolio:new', onNew);
      window.removeEventListener('cf-portfolio:edit', onEdit);
      window.removeEventListener('cf-portfolio:delete', onDelete);
      window.removeEventListener('cf-portfolio:export', onExport);
    };
  }, [selected, filtered]);

  const handleDelete = async (inv) => {
    if (window.confirm(`¿Eliminar la inversión ${inv.id}?`)) {
      try { await deleteDoc(doc(db, 'cf_investments', inv.id)); setSelected(null); }
      catch (e) { alert('Error al eliminar: ' + e.message); }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id) { alert('Introduce un ID para la inversión.'); return; }
    try {
      await setDoc(doc(db, 'cf_investments', formData.id), { ...formData, amount: parseFloat(formData.amount) || 0, currentValue: parseFloat(formData.currentValue) || 0, returnRate: parseFloat(formData.returnRate) || 0, userId: user.uid, updatedAt: new Date().toISOString() });
      setShowForm(false); setSelected(null);
    } catch (e) { alert('Error al guardar: ' + e.message); }
  };

  const statusColor = (s) => ({ activo: 'text-green-700', finalizado: 'text-blue-700', moroso: 'text-red-700', amortizado: 'text-gray-500' }[s] || '');

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-1 mb-1 shrink-0">
        {[
          { label: 'Total invertido', value: fmt(summary.totalInvested), icon: '💰', color: 'bg-blue-50 border-blue-200' },
          { label: 'Valor actual', value: fmt(summary.totalCurrent), icon: '📈', color: 'bg-green-50 border-green-200' },
          { label: 'Retorno total', value: fmt(summary.totalReturn), icon: summary.totalReturn >= 0 ? '▲' : '▼', color: summary.totalReturn >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200' },
          { label: 'Rentabilidad media', value: pct(summary.avgReturn), icon: '%', color: 'bg-purple-50 border-purple-200' },
        ].map(card => (
          <div key={card.label} className={`${card.color} border rounded p-2 flex items-center gap-2`}>
            <span className="text-lg">{card.icon}</span>
            <div>
              <div className="text-[9px] font-bold uppercase text-gray-500">{card.label}</div>
              <div className="text-[13px] font-bold text-gray-800">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

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
                    <input type="radio" name="cfType" checked={typeFilter === t} onChange={() => setTypeFilter(t)} className="text-indigo-600" />
                    <span className={typeFilter === t ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{t === 'todos' ? 'Todos' : t}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Estado:</label>
                {['todos', ...STATUSES].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="cfStatus" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="text-indigo-600" />
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
              <input type="text" placeholder="Buscar inversión..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-56 outline-none focus:border-blue-500 bg-transparent" />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div className="win-table-container">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id')           && <th>ID</th>}
                  {visibleColumns.includes('projectId')    && <th>Proyecto</th>}
                  {visibleColumns.includes('platformName') && <th>Plataforma</th>}
                  {visibleColumns.includes('type')         && <th>Tipo</th>}
                  {visibleColumns.includes('amount')       && <th className="text-right">Invertido</th>}
                  {visibleColumns.includes('currentValue') && <th className="text-right">Valor actual</th>}
                  {visibleColumns.includes('returnRate')   && <th className="text-right">Rentab. %</th>}
                  {visibleColumns.includes('status')       && <th>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400">No hay inversiones registradas. Usa el ribbon para añadir una nueva.</td></tr>
                ) : filtered.map(inv => (
                  <tr key={inv.id} onClick={() => setSelected(selected?.id === inv.id ? null : inv)} className={selected?.id === inv.id ? 'selected' : ''}>
                    {visibleColumns.includes('id')           && <td className="font-mono font-bold">{inv.id}</td>}
                    {visibleColumns.includes('projectId')    && <td>{inv.projectName}</td>}
                    {visibleColumns.includes('platformName') && <td>{inv.platformName}</td>}
                    {visibleColumns.includes('type')         && <td>{inv.type}</td>}
                    {visibleColumns.includes('amount')       && <td className="text-right">{fmt(parseFloat(inv.amount))}</td>}
                    {visibleColumns.includes('currentValue') && <td className="text-right">{fmt(parseFloat(inv.currentValue || inv.amount))}</td>}
                    {visibleColumns.includes('returnRate')   && <td className={`text-right font-semibold ${parseFloat(inv.returnRate) >= 0 ? 'text-green-700' : 'text-red-700'}`}>{pct(parseFloat(inv.returnRate))}</td>}
                    {visibleColumns.includes('status')       && <td className={`font-semibold ${statusColor(inv.status)}`}>{inv.status}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] shrink-0">
        <span>{filtered.length} inversiones</span>
        <span className="text-gray-500">Crowdfunding · Portfolio</span>
      </div>

      {/* Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window title={isEditing ? `Modificar Inversión: ${formData.id}` : 'Nueva Inversión Crowdfunding'} onClose={() => setShowForm(false)} width={isMobile ? '100%' : '780px'} height={isMobile ? '100%' : '540px'} initialPos={{ x: (window.innerWidth - 780) / 2, y: 80 }}>
            <div className="flex-1 bg-[#d4d0c8] flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto p-3">
                <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4">
                  <form id="cf-portfolio-form" onSubmit={handleSave} className="space-y-3">
                    <div className="win-form-row"><label className="win-form-label">ID Inversión:</label><input type="text" value={formData.id} onChange={e => setFormData({ ...formData, id: e.target.value })} placeholder="ej. CF-INV-001" required disabled={isEditing} className="win-input flex-1 uppercase" /></div>
                    <div className="win-form-row"><label className="win-form-label">ID Proyecto:</label>
                      <select value={formData.projectId} onChange={e => setFormData({ ...formData, projectId: e.target.value })} className="win-input flex-1">
                        <option value="">— Sin proyecto —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                      </select>
                    </div>
                    <div className="win-form-row"><label className="win-form-label">Plataforma:</label>
                      <select value={formData.platformId} onChange={e => setFormData({ ...formData, platformId: e.target.value })} className="win-input flex-1">
                        <option value="">— Sin plataforma —</option>
                        {platforms.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                      </select>
                    </div>
                    <div className="win-form-row"><label className="win-form-label">Tipo:</label><select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="win-input flex-1">{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div className="win-form-row"><label className="win-form-label">Importe invertido (€):</label><input type="number" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                    <div className="win-form-row"><label className="win-form-label">Valor actual (€):</label><input type="number" step="0.01" value={formData.currentValue} onChange={e => setFormData({ ...formData, currentValue: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                    <div className="win-form-row"><label className="win-form-label">Rentabilidad (%):</label><input type="number" step="0.01" value={formData.returnRate} onChange={e => setFormData({ ...formData, returnRate: e.target.value })} placeholder="0.00" className="win-input flex-1" /></div>
                    <div className="win-form-row"><label className="win-form-label">Estado:</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="win-input flex-1">{STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
                    <div className="win-form-row"><label className="win-form-label">Fecha inicio:</label><input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="win-input flex-1" /></div>
                    <div className="win-form-row"><label className="win-form-label">Fecha fin:</label><input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="win-input flex-1" /></div>
                    <div className="win-form-row"><label className="win-form-label">Notas:</label><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={2} className="win-input flex-1 resize-none" /></div>
                  </form>
                </div>
              </div>
              <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                <button type="submit" form="cf-portfolio-form" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Aceptar</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Cancelar</button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

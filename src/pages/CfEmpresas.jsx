import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, Building2 } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';

const TYPES = ['Inmobiliaria', 'P2P', 'Equity', 'Mixta', 'Otras'];
const STATUSES = ['activo', 'inactivo'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];

const EMPTY_FORM = {
  id: '',
  name: '',
  type: 'Inmobiliaria',
  country: 'España',
  regulation: '',
  website: '',
  status: 'activo',
  cashBalance: '',
  currency: 'EUR',
  notes: '',
};

export default function CfEmpresas() {
  const { user, queryUserIds } = useAuth();
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
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

  const DEFAULT_COLUMNS = ['id', 'name', 'type', 'country', 'regulation', 'currency', 'status'];
  const { visibleColumns, columnWidths } = useTableColumns('cf-empresas', DEFAULT_COLUMNS);

  // Filter and search - declared early to avoid TDZ
  const filteredPlatforms = platforms.filter((p) => {
    if (typeFilter !== 'todos' && p.type !== typeFilter) return false;
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.country || '').toLowerCase().includes(q) ||
        (p.regulation || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSaveField = async (platform, field, newVal) => {
    try {
      const docRef = doc(db, 'cf_platforms', platform.id);
      let updatedObj = { ...platform };
      
      let processedVal = newVal;
      if (field === 'cashBalance') {
        processedVal = parseFloat(newVal) || 0;
      }
      updatedObj[field] = processedVal;

      await setDoc(docRef, updatedObj);
    } catch (err) {
      console.error("Error updating platform field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = platforms.reduce((max, p) => {
        const num = parseInt((p.id || '').replace(/\D/g, '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `PLT${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        id: newId,
        name: 'Nueva Plataforma',
        type: 'Inmobiliaria',
        country: 'España',
        regulation: '',
        website: '',
        status: 'activo',
        cashBalance: 0,
        currency: 'EUR',
        notes: '',
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'cf_platforms', newId), newRecord);
      setSelectedPlatform(newRecord);
    } catch (err) {
      console.error("Error creating new platform:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedPlatform) {
          const displayed = filteredPlatforms;
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            if (selectedPlatform.id === lastItem.id) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPlatform, filteredPlatforms, platforms, user]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch cf_platforms from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const q = query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds));
    const unsub = onSnapshot(q,
      (snap) => setPlatforms(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_platforms:', err)
    );
    return () => unsub();
  }, [user, queryUserIds]);

  // Ribbon event listeners
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedPlatform) handleEdit(selectedPlatform);
      else alert('Por favor, seleccione una plataforma de la lista primero.');
    };
    const onDelete = () => {
      if (selectedPlatform) handleDelete(selectedPlatform);
      else alert('Por favor, seleccione una plataforma de la lista primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'País', dataKey: 'country' },
          { header: 'Regulación', dataKey: 'regulation' },
          { header: 'Divisa', dataKey: 'currency' },
          { header: 'Estado', dataKey: 'status' },
        ].filter((c) => visibleColumns.includes(c.dataKey));
        exportToPDF(filteredPlatforms, cols, 'Plataformas Crowdfunding', 'cf_plataformas.pdf');
      } else {
        handleExportFormat(filteredPlatforms, 'Plataformas Crowdfunding', format);
      }
    };
    window.addEventListener('cf-empresa:new', onNew);
    window.addEventListener('cf-empresa:edit', onEdit);
    window.addEventListener('cf-empresa:delete', onDelete);
    window.addEventListener('cf-empresa:export', onExport);
    return () => {
      window.removeEventListener('cf-empresa:new', onNew);
      window.removeEventListener('cf-empresa:edit', onEdit);
      window.removeEventListener('cf-empresa:delete', onDelete);
      window.removeEventListener('cf-empresa:export', onExport);
    };
  }, [platforms, selectedPlatform, filteredPlatforms, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setActiveFormTab('datos');
    const maxId = platforms.reduce((max, p) => {
      const num = parseInt((p.id || '').replace(/\D/g, '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({ ...EMPTY_FORM, id: `PLT${String(maxId + 1).padStart(3, '0')}`, cashBalance: '0' });
    setShowForm(true);
  };

  const handleEdit = (platform) => {
    setIsEditing(true);
    setActiveFormTab('datos');
    setFormData({ ...platform });
    setShowForm(true);
  };

  const handleDelete = async (platform) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la plataforma ${platform.name} (${platform.id})?`)) {
      try {
        await deleteDoc(doc(db, 'cf_platforms', platform.id));
        setSelectedPlatform(null);
      } catch (error) {
        console.error('Error deleting platform:', error);
        alert('Error al eliminar la plataforma: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name) {
      alert('Por favor, rellene el ID y el Nombre de la plataforma.');
      return;
    }
    try {
      const docId = formData.id.trim().toUpperCase();
      await setDoc(doc(db, 'cf_platforms', docId), {
        ...formData,
        id: docId,
        cashBalance: parseFloat(formData.cashBalance) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      });
      setShowForm(false);
      setSelectedPlatform(null);
    } catch (error) {
      console.error('Error saving platform:', error);
      alert('Error al guardar la plataforma: ' + error.message);
    }
  };

  const typeBadge = (type) => {
    const map = {
      Inmobiliaria: 'bg-blue-100 text-blue-800 border border-blue-200',
      P2P: 'bg-amber-100 text-amber-800 border border-amber-200',
      Equity: 'bg-purple-100 text-purple-800 border border-purple-200',
      Mixta: 'bg-teal-100 text-teal-800 border border-teal-200',
    };
    return map[type] || 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  const statusBadge = (status) =>
    status === 'activo'
      ? 'bg-green-100 text-green-800 border border-green-200'
      : 'bg-red-100 text-red-800 border border-red-200';

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">

        {/* Left Sidebar */}
        {showSidebar && (
          <div className="w-64 bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700 flex justify-between items-center">
              <span>Filtros</span>
            </div>
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold">Tipo de plataforma:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="cfEmpresaType" checked={typeFilter === 'todos'} onChange={() => setTypeFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={typeFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos los tipos</span>
                  </label>
                  {TYPES.map((t) => (
                    <label key={t} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfEmpresaType" checked={typeFilter === t} onChange={() => setTypeFilter(t)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                      <span className={typeFilter === t ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{t}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2 pt-2 border-t border-gray-300">
                <label className="text-slate-700 font-bold">Estado:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="cfEmpresaStatus" checked={statusFilter === 'todos'} onChange={() => setStatusFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={statusFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos</span>
                  </label>
                  {STATUSES.map((s) => (
                    <label key={s} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfEmpresaStatus" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                      <span className={statusFilter === s ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="pt-2 border-t border-gray-300 space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Resumen</p>
                <p className="text-slate-700">Total: <span className="font-bold text-slate-900">{platforms.length}</span></p>
                <p className="text-slate-700">Activas: <span className="font-bold text-green-700">{platforms.filter(p => p.status === 'activo').length}</span></p>
                <p className="text-slate-700">Inactivas: <span className="font-bold text-red-700">{platforms.filter(p => p.status === 'inactivo').length}</span></p>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8fafc]">
            <div className="flex items-center space-x-3">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300 flex items-center justify-center"
                title={showSidebar ? 'Ocultar panel' : 'Mostrar panel'}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                <Building2 className="w-3.5 h-3.5" />
                <span>Plataformas / Empresas Crowdfunding</span>
              </div>
            </div>
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar en el fichero (Alt+B)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          <div className="win-table-container">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '100px' }}>ID</th>}
                  {visibleColumns.includes('name') && <th style={{ width: columnWidths['name'] || '180px' }}>Nombre</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '110px' }}>Tipo</th>}
                  {visibleColumns.includes('country') && <th style={{ width: columnWidths['country'] || '100px' }}>País</th>}
                  {visibleColumns.includes('regulation') && <th style={{ width: columnWidths['regulation'] || '150px' }}>Regulación</th>}
                  {visibleColumns.includes('currency') && <th style={{ width: columnWidths['currency'] || '80px' }}>Divisa</th>}
                  {visibleColumns.includes('status') && <th style={{ width: columnWidths['status'] || '80px' }}>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filteredPlatforms.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron plataformas. Añade una nueva desde el menú superior.
                    </td>
                  </tr>
                ) : (
                  filteredPlatforms.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPlatform(selectedPlatform?.id === p.id ? null : p)}
                      onDoubleClick={() => handleEdit(p)}
                      className={selectedPlatform?.id === p.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td className="font-mono font-bold">{p.id}</td>}
                      {visibleColumns.includes('name') && (
                        <EditableCell
                          className="font-semibold"
                          value={p.name}
                          onSave={(val) => handleSaveField(p, 'name', val)}
                        />
                      )}
                      {visibleColumns.includes('type') && (
                        <EditableCell
                          value={p.type}
                          options={TYPES}
                          onSave={(val) => handleSaveField(p, 'type', val)}
                        >
                          <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${typeBadge(p.type)}`}>
                            {p.type}
                          </span>
                        </EditableCell>
                      )}
                      {visibleColumns.includes('country') && (
                        <EditableCell
                          value={p.country}
                          onSave={(val) => handleSaveField(p, 'country', val)}
                        />
                      )}
                      {visibleColumns.includes('regulation') && (
                        <EditableCell
                          className="text-gray-600 text-[11px]"
                          value={p.regulation}
                          onSave={(val) => handleSaveField(p, 'regulation', val)}
                        />
                      )}
                      {visibleColumns.includes('currency') && (
                        <EditableCell
                          className="font-mono"
                          value={p.currency}
                          options={CURRENCIES}
                          onSave={(val) => handleSaveField(p, 'currency', val)}
                        />
                      )}
                      {visibleColumns.includes('status') && (
                        <EditableCell
                          value={p.status}
                          options={STATUSES}
                          onSave={(val) => handleSaveField(p, 'status', val)}
                        >
                          <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${statusBadge(p.status)}`}>
                            {p.status}
                          </span>
                        </EditableCell>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-1 border-t border-gray-200 bg-[#f8fafc] text-[10px] text-gray-500 shrink-0">
            <span>{filteredPlatforms.length} registro(s){platforms.length !== filteredPlatforms.length ? ` de ${platforms.length}` : ''}</span>
            {selectedPlatform && <span className="font-semibold text-slate-600">Seleccionado: {selectedPlatform.name}</span>}
          </div>
        </div>
      </div>

      {/* Platform Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Plataforma: ${formData.id}` : 'Nueva Plataforma Crowdfunding'}
            onClose={() => setShowForm(false)}
            width={isMobile ? '100%' : '850px'}
            height={isMobile ? '100%' : '580px'}
            initialPos={{ x: (window.innerWidth - (isMobile ? window.innerWidth : 850)) / 2, y: 100 }}
            onMenuClick={() => setShowModalSidebar(!showModalSidebar)}
          >
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
              {/* Modal Sidebar */}
              {showModalSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    <button
                      onClick={() => { setActiveFormTab('datos'); if (isMobile) setShowModalSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeFormTab === 'datos' ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}
                    >
                      Datos
                    </button>
                  </div>
                </div>
              )}
              {isMobile && showModalSidebar && (
                <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowModalSidebar(false)} />
              )}

              {/* Form Content */}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full flex flex-col">
                    {activeFormTab === 'datos' && (
                      <form id="cfempresa-form" onSubmit={handleSave} className="space-y-3 flex-1">
                        <div className="win-form-row">
                          <label className="win-form-label">ID Plataforma:</label>
                          <input type="text" value={formData.id} onChange={(e) => setFormData({ ...formData, id: e.target.value })} placeholder="ej. HOUZEO, HOUSERS" disabled={isEditing} required className="win-input flex-1 uppercase font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Nombre:</label>
                          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="ej. Housers, Urbanitae" required className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Tipo:</label>
                          <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="win-input flex-1">
                            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">País:</label>
                          <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="ej. España, Portugal" className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Regulación:</label>
                          <input type="text" value={formData.regulation} onChange={(e) => setFormData({ ...formData, regulation: e.target.value })} placeholder="ej. CNMV, Banco de España" className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Sitio Web:</label>
                          <input type="text" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://..." className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Saldo efectivo:</label>
                          <input type="number" value={formData.cashBalance} onChange={(e) => setFormData({ ...formData, cashBalance: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Divisa:</label>
                          <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="win-input flex-1">
                            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Estado:</label>
                          <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="win-input flex-1">
                            <option value="activo">Activo</option>
                            <option value="inactivo">Inactivo</option>
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Notas:</label>
                          <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Comentarios adicionales..." rows={3} className="win-input flex-1 resize-none" />
                        </div>
                      </form>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  <button type="submit" form="cfempresa-form" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">
                    Aceptar
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

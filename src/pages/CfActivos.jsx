import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, TrendingUp } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';

const fmt = (v, dec = 2) =>
  (v || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const TYPES = ['Inmobiliario', 'Préstamo empresarial', 'Equity', 'Otros'];
const SECTORS = ['Residencial', 'Comercial', 'Industrial', 'Tecnología', 'Energía', 'Otros'];
const STATUSES = ['activo', 'finalizado', 'moroso', 'amortizado'];
const GUARANTEE_TYPES = ['Hipoteca 1ª', 'Hipoteca 2ª', 'Garantía personal', 'Sin garantía', 'Aval'];

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
  const [selectedProject, setSelectedProject] = useState(null);
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

  // Enriched projects with platform name - declared early to avoid TDZ
  const enrichedProjects = projects.map(proj => {
    const platform = platforms.find(p => p.id === proj.platformId);
    return { ...proj, platformName: platform?.name || proj.platformId || '-' };
  });

  // Filtered projects - declared early to avoid TDZ
  const filteredProjects = enrichedProjects.filter((proj) => {
    if (typeFilter !== 'todos' && proj.type !== typeFilter) return false;
    if (statusFilter !== 'todos' && proj.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (proj.id || '').toLowerCase().includes(q) ||
        (proj.name || '').toLowerCase().includes(q) ||
        (proj.platformName || '').toLowerCase().includes(q) ||
        (proj.sector || '').toLowerCase().includes(q) ||
        (proj.country || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSaveField = async (project, field, newVal) => {
    try {
      const docRef = doc(db, 'cf_projects', project.id);
      let updatedObj = { ...project };
      
      let processedVal = newVal;
      const numFields = ['targetAmount', 'raisedAmount', 'annualRate', 'term', 'ltv'];
      if (numFields.includes(field)) {
        processedVal = parseFloat(newVal) || 0;
      }
      if (field === 'term') {
        processedVal = parseInt(newVal) || 0;
      }
      updatedObj[field] = processedVal;

      if (field === 'platformId') {
        const matched = platforms.find(p => p.id === newVal);
        updatedObj.platformName = matched ? matched.name : newVal;
      }

      await setDoc(docRef, updatedObj);
    } catch (err) {
      console.error("Error updating project field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = projects.reduce((max, p) => {
        const num = parseInt((p.id || '').replace(/\D/g, '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `CF${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        id: newId,
        name: 'Nuevo Proyecto',
        platformId: platforms[0]?.id || '',
        platformName: platforms[0]?.name || '',
        type: 'Inmobiliario',
        sector: 'Residencial',
        country: 'España',
        targetAmount: 0,
        raisedAmount: 0,
        annualRate: 0,
        term: 12,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        status: 'activo',
        guaranteeType: 'Sin garantía',
        ltv: 0,
        notes: '',
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'cf_projects', newId), newRecord);
      setSelectedProject(newRecord);
    } catch (err) {
      console.error("Error creating new project:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedProject) {
          const displayed = filteredProjects;
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            if (selectedProject.id === lastItem.id) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProject, filteredProjects, projects, user]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubProj = onSnapshot(
      query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds)),
      (snap) => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_projects:', err)
    );
    const unsubPlt = onSnapshot(
      query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds)),
      (snap) => setPlatforms(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_platforms:', err)
    );

    return () => { unsubProj(); unsubPlt(); };
  }, [user, queryUserIds]);

  // Ribbon event listeners
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedProject) handleEdit(selectedProject);
      else alert('Por favor, seleccione un proyecto de la lista primero.');
    };
    const onDelete = () => {
      if (selectedProject) handleDelete(selectedProject);
      else alert('Por favor, seleccione un proyecto de la lista primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Plataforma', dataKey: 'platformName' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Objetivo (€)', dataKey: 'targetAmount' },
          { header: 'Tasa anual (%)', dataKey: 'annualRate' },
          { header: 'Plazo (m)', dataKey: 'term' },
          { header: 'Estado', dataKey: 'status' },
        ].filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filteredProjects, cols, 'Activos / Proyectos Crowdfunding', 'cf_activos.pdf');
      } else {
        handleExportFormat(filteredProjects, 'Activos Crowdfunding', format);
      }
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
  }, [projects, selectedProject, filteredProjects, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setActiveFormTab('datos');
    const maxId = projects.reduce((max, p) => {
      const num = parseInt((p.id || '').replace(/\D/g, '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({ ...EMPTY_FORM, id: `CF${String(maxId + 1).padStart(3, '0')}` });
    setShowForm(true);
  };

  const handleEdit = (project) => {
    setIsEditing(true);
    setActiveFormTab('datos');
    setFormData({ ...project });
    setShowForm(true);
  };

  const handleDelete = async (project) => {
    if (window.confirm(`¿Está seguro de que desea eliminar el proyecto ${project.name} (${project.id})?`)) {
      try {
        await deleteDoc(doc(db, 'cf_projects', project.id));
        setSelectedProject(null);
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Error al eliminar el proyecto: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id || !formData.name) {
      alert('Por favor, rellene el ID y el Nombre del proyecto.');
      return;
    }
    try {
      const docId = formData.id.trim().toUpperCase();
      const selectedPlatform = platforms.find(p => p.id === formData.platformId);
      await setDoc(doc(db, 'cf_projects', docId), {
        ...formData,
        id: docId,
        platformName: selectedPlatform?.name || formData.platformId,
        targetAmount: parseFloat(formData.targetAmount) || 0,
        raisedAmount: parseFloat(formData.raisedAmount) || 0,
        annualRate: parseFloat(formData.annualRate) || 0,
        term: parseInt(formData.term) || 0,
        ltv: parseFloat(formData.ltv) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      });
      setShowForm(false);
      setSelectedProject(null);
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error al guardar el proyecto: ' + error.message);
    }
  };

  const statusBadge = (status) => {
    const map = {
      activo: 'bg-green-100 text-green-800 border border-green-200',
      finalizado: 'bg-blue-100 text-blue-800 border border-blue-200',
      moroso: 'bg-red-100 text-red-800 border border-red-200',
      amortizado: 'bg-gray-100 text-gray-700 border border-gray-200',
    };
    return map[status] || 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  const typeBadge = (type) => {
    const map = {
      Inmobiliario: 'bg-blue-100 text-blue-800 border border-blue-200',
      'Préstamo empresarial': 'bg-amber-100 text-amber-800 border border-amber-200',
      Equity: 'bg-purple-100 text-purple-800 border border-purple-200',
    };
    return map[type] || 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">

        {/* Left Sidebar */}
        {showSidebar && (
          <div className="w-64 bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700">
              Filtros
            </div>
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold">Tipo de proyecto:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="cfActivoType" checked={typeFilter === 'todos'} onChange={() => setTypeFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={typeFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos los tipos</span>
                  </label>
                  {TYPES.map((t) => (
                    <label key={t} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfActivoType" checked={typeFilter === t} onChange={() => setTypeFilter(t)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
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
                    <input type="radio" name="cfActivoStatus" checked={statusFilter === 'todos'} onChange={() => setStatusFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={statusFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos</span>
                  </label>
                  {STATUSES.map((s) => (
                    <label key={s} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfActivoStatus" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                      <span className={statusFilter === s ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="pt-2 border-t border-gray-300 space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Estadísticas</p>
                <p className="text-slate-700">Total proyectos: <span className="font-bold text-slate-900">{projects.length}</span></p>
                <p className="text-slate-700">Activos: <span className="font-bold text-green-700">{projects.filter(p => p.status === 'activo').length}</span></p>
                <p className="text-slate-700">Finalizados: <span className="font-bold text-blue-700">{projects.filter(p => p.status === 'finalizado').length}</span></p>
                <p className="text-slate-700">Morosos: <span className="font-bold text-red-700">{projects.filter(p => p.status === 'moroso').length}</span></p>
                {projects.length > 0 && (
                  <p className="text-slate-700 pt-1 border-t border-gray-200">
                    Tasa media: <span className="font-bold text-slate-900">
                      {fmt(projects.reduce((s, p) => s + (parseFloat(p.annualRate) || 0), 0) / projects.length)} %
                    </span>
                  </p>
                )}
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
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Proyectos / Activos Crowdfunding</span>
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
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '80px' }}>ID</th>}
                  {visibleColumns.includes('name') && <th style={{ width: columnWidths['name'] || '200px' }}>Nombre</th>}
                  {visibleColumns.includes('platformName') && <th style={{ width: columnWidths['platformName'] || '130px' }}>Plataforma</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '140px' }}>Tipo</th>}
                  {visibleColumns.includes('targetAmount') && <th style={{ width: columnWidths['targetAmount'] || '120px' }} className="text-right">Objetivo (€)</th>}
                  {visibleColumns.includes('annualRate') && <th style={{ width: columnWidths['annualRate'] || '110px' }} className="text-right">Tasa anual (%)</th>}
                  {visibleColumns.includes('term') && <th style={{ width: columnWidths['term'] || '80px' }} className="text-right">Plazo (m)</th>}
                  {visibleColumns.includes('status') && <th style={{ width: columnWidths['status'] || '90px' }}>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron proyectos. Añade uno nuevo desde el menú superior.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((proj) => (
                    <tr
                      key={proj.id}
                      onClick={() => setSelectedProject(selectedProject?.id === proj.id ? null : proj)}
                      onDoubleClick={() => handleEdit(proj)}
                      className={selectedProject?.id === proj.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td className="font-mono font-bold">{proj.id}</td>}
                      {visibleColumns.includes('name') && (
                        <EditableCell
                          className="font-semibold"
                          value={proj.name}
                          onSave={(val) => handleSaveField(proj, 'name', val)}
                        />
                      )}
                      {visibleColumns.includes('platformName') && (
                        <EditableCell
                          value={proj.platformId}
                          options={platforms.map(p => ({ id: p.id, name: p.name }))}
                          onSave={(val) => handleSaveField(proj, 'platformId', val)}
                        />
                      )}
                      {visibleColumns.includes('type') && (
                        <EditableCell
                          value={proj.type}
                          options={TYPES}
                          onSave={(val) => handleSaveField(proj, 'type', val)}
                        >
                          <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${typeBadge(proj.type)}`}>
                            {proj.type}
                          </span>
                        </EditableCell>
                      )}
                      {visibleColumns.includes('targetAmount') && (
                        <EditableCell
                          type="number"
                          className="font-mono text-right"
                          value={proj.targetAmount}
                          onSave={(val) => handleSaveField(proj, 'targetAmount', val)}
                        >
                          {fmt(parseFloat(proj.targetAmount) || 0)}
                        </EditableCell>
                      )}
                      {visibleColumns.includes('annualRate') && (
                        <EditableCell
                          type="number"
                          className="font-mono text-right font-bold text-emerald-700"
                          value={proj.annualRate}
                          onSave={(val) => handleSaveField(proj, 'annualRate', val)}
                        >
                          {fmt(parseFloat(proj.annualRate) || 0)} %
                        </EditableCell>
                      )}
                      {visibleColumns.includes('term') && (
                        <EditableCell
                          type="number"
                          className="font-mono text-right"
                          value={proj.term}
                          onSave={(val) => handleSaveField(proj, 'term', val)}
                        />
                      )}
                      {visibleColumns.includes('status') && (
                        <EditableCell
                          value={proj.status}
                          options={STATUSES}
                          onSave={(val) => handleSaveField(proj, 'status', val)}
                        >
                          <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${statusBadge(proj.status)}`}>
                            {proj.status}
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
            <span>{filteredProjects.length} registro(s){projects.length !== filteredProjects.length ? ` de ${projects.length}` : ''}</span>
            {selectedProject && <span className="font-semibold text-slate-600">Seleccionado: {selectedProject.name}</span>}
          </div>
        </div>
      </div>

      {/* Project Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Proyecto: ${formData.id}` : 'Nuevo Proyecto Crowdfunding'}
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
                    <button
                      onClick={() => { setActiveFormTab('financiero'); if (isMobile) setShowModalSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeFormTab === 'financiero' ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}
                    >
                      Financiero
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
                      <form id="cfactivo-form" onSubmit={handleSave} className="space-y-3 flex-1">
                        <div className="win-form-row">
                          <label className="win-form-label">ID Proyecto:</label>
                          <input type="text" value={formData.id} onChange={(e) => setFormData({ ...formData, id: e.target.value })} placeholder="ej. CF001" disabled={isEditing} required className="win-input flex-1 uppercase font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Nombre:</label>
                          <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="ej. Residencial Madrid Norte" required className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Plataforma:</label>
                          <select value={formData.platformId} onChange={(e) => setFormData({ ...formData, platformId: e.target.value })} className="win-input flex-1">
                            <option value="">-- Seleccionar --</option>
                            {platforms.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Tipo:</label>
                          <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="win-input flex-1">
                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Sector:</label>
                          <select value={formData.sector} onChange={(e) => setFormData({ ...formData, sector: e.target.value })} className="win-input flex-1">
                            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">País:</label>
                          <input type="text" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="ej. España" className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Estado:</label>
                          <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="win-input flex-1">
                            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Notas:</label>
                          <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Comentarios adicionales..." rows={3} className="win-input flex-1 resize-none" />
                        </div>
                      </form>
                    )}

                    {activeFormTab === 'financiero' && (
                      <form id="cfactivo-form" onSubmit={handleSave} className="space-y-3 flex-1">
                        <div className="win-form-row">
                          <label className="win-form-label">Objetivo (€):</label>
                          <input type="number" value={formData.targetAmount} onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Captado (€):</label>
                          <input type="number" value={formData.raisedAmount} onChange={(e) => setFormData({ ...formData, raisedAmount: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Tasa anual (%):</label>
                          <input type="number" value={formData.annualRate} onChange={(e) => setFormData({ ...formData, annualRate: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Plazo (meses):</label>
                          <input type="number" value={formData.term} onChange={(e) => setFormData({ ...formData, term: e.target.value })} placeholder="ej. 24" step="1" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Fecha inicio:</label>
                          <input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Fecha fin:</label>
                          <input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="win-input flex-1" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Tipo de garantía:</label>
                          <select value={formData.guaranteeType} onChange={(e) => setFormData({ ...formData, guaranteeType: e.target.value })} className="win-input flex-1">
                            {GUARANTEE_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">LTV (%):</label>
                          <input type="number" value={formData.ltv} onChange={(e) => setFormData({ ...formData, ltv: e.target.value })} placeholder="ej. 70.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                      </form>
                    )}

                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  <button type="submit" form="cfactivo-form" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Aceptar</button>
                  <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Cancelar</button>
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

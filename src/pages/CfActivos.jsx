import { useState, useEffect, useMemo } from 'react';
import ZoomControl from '../components/ZoomControl';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, TrendingUp, Building2, Key, Upload, FileText } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import AccountingEntryModal from '../components/AccountingEntryModal';
import { deleteJournalEntry } from '../services/accounting';
import { uploadFileToStorage } from '../utils/storageUtils';
import Accounts from './Accounts';
import ResizableSidebar from '../components/ResizableSidebar';

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
  incomeCebeId: '',
  expenseCecoId: '',
};

export default function CfActivos() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
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

  const [cecos, setCecos] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showAccountingModal, setShowAccountingModal] = useState(false);
  const [accountingModalConfig, setAccountingModalConfig] = useState({
    linkedAccountId: null,
    defaultDescription: '',
    defaultAmount: 0,
    defaultAnalytics: {}
  });
  const [activeRentasSubTab, setActiveRentasSubTab] = useState('ingresos');
  const [previewDocument, setPreviewDocument] = useState(null);

  const DEFAULT_COLUMNS = ['id', 'name', 'platformName', 'type', 'targetAmount', 'annualRate', 'term', 'status'];
  const { visibleColumns, columnWidths } = useTableColumns('cf-activos', DEFAULT_COLUMNS);

  const netRentsSum = useMemo(() => {
    if (!formData.incomeCebeId && !formData.expenseCecoId) return 0;
    
    const incomeCebe = String(formData.incomeCebeId || '').trim().replace(/^(CEBE|CECO)/i, '');
    const expenseCeco = String(formData.expenseCecoId || '').trim().replace(/^(CEBE|CECO)/i, '');
    
    let gross = 0;
    let expenses = 0;
    
    journalEntries.forEach(entry => {
      // Match income entries by CEBE
      if (incomeCebe) {
        const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
        if (entryCebe && entryCebe.startsWith(incomeCebe)) {
          gross += parseFloat(entry.total) || 0;
        }
      }
      
      // Match expense entries by CECO
      if (expenseCeco) {
        const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
        if (entryCeco && entryCeco.startsWith(expenseCeco)) {
          expenses += parseFloat(entry.total) || 0;
        }
      }
    });
    
    return gross - expenses;
  }, [journalEntries, formData.incomeCebeId, formData.expenseCecoId]);

  const projectTransactions = useMemo(() => {
    if (!formData.id) return [];
    return transactions
      .filter(tx => tx.projectId === formData.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, formData.id]);

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

  const handleOpenAccounting = (type) => {
    if (type === 'ingresos') {
      if (!formData.incomeCebeId) {
        alert("Por favor, selecciona primero un CEBE de Ingresos.");
        return;
      }
      setAccountingModalConfig({
        linkedAccountId: null,
        defaultDescription: `Ingresos Crowdfunding - ${formData.name || formData.id || 'Nuevo'}`,
        defaultAmount: 0,
        defaultAnalytics: { cebe: formData.incomeCebeId }
      });
    } else {
      if (!formData.expenseCecoId) {
        alert("Por favor, selecciona primero un CECO de Gastos.");
        return;
      }
      setAccountingModalConfig({
        linkedAccountId: null,
        defaultDescription: `Gastos Crowdfunding - ${formData.name || formData.id || 'Nuevo'}`,
        defaultAmount: 0,
        defaultAnalytics: { ceco: formData.expenseCecoId }
      });
    }
    setShowAccountingModal(true);
  };

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

    const qCecos = query(
      collection(db, 'analytical_centers'),
      where('userId', 'in', targetUserIds),
      where('type', '==', 'ceco')
    );
    const unsubCecos = onSnapshot(qCecos, (snap) => {
      setCecos(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    const qCebes = query(
      collection(db, 'analytical_centers'),
      where('userId', 'in', targetUserIds),
      where('type', '==', 'cebe')
    );
    const unsubCebes = onSnapshot(qCebes, (snap) => {
      setCebes(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    });

    const unsubJournal = onSnapshot(
      query(collection(db, 'journal_entries'), where('userId', 'in', targetUserIds)),
      (snap) => setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching journal_entries:', err)
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'cf_transactions'), where('userId', 'in', targetUserIds)),
      (snap) => setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_transactions:', err)
    );

    return () => { 
      unsubProj(); 
      unsubPlt(); 
      unsubCecos();
      unsubCebes();
      unsubJournal();
      unsubTx();
    };
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
    setFormData({ ...EMPTY_FORM, ...project });
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
          <ResizableSidebar className=" bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
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
          </ResizableSidebar>
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
            <table style={{ zoom: tableZoom }} className="clean-table">
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
                      {visibleColumns.includes('id') && <td className="font-mono">{proj.id}</td>}
                      {visibleColumns.includes('name') && (
                        <EditableCell
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
                          <span>{proj.type}</span>
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
                          className="font-mono text-right"
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
                          <span className="uppercase">{proj.status}</span>
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
                    <button
                      onClick={() => { setActiveFormTab('rentas'); if (isMobile) setShowModalSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeFormTab === 'rentas' ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}
                    >
                      Rentas
                    </button>
                    <button
                      onClick={() => { setActiveFormTab('movimientos'); if (isMobile) setShowModalSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeFormTab === 'movimientos' ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}
                    >
                      Movimientos
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
                          <label className="win-form-label">Total Rentas:</label>
                          <input 
                            type="text" 
                            value={`${fmt(netRentsSum)} €`} 
                            disabled 
                            className="win-input flex-1 font-mono bg-slate-100 font-bold text-slate-800" 
                          />
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

                    {activeFormTab === 'rentas' && (
                      <div className="flex-1 flex flex-col min-h-0 space-y-3">
                        {/* Sub-tabs */}
                        <div className="flex gap-0 border-b border-gray-400">
                          <button
                            type="button"
                            onClick={() => setActiveRentasSubTab('ingresos')}
                            className={`px-4 py-1.5 text-[11px] font-bold border-t border-x cursor-pointer select-none transition-colors ${activeRentasSubTab === 'ingresos' ? 'bg-[#d4d0c8] text-[#000080] border-gray-400 border-b-transparent z-10' : 'bg-[#c0c0c0] text-slate-700 border-gray-400 hover:bg-[#d4d0c8]'}`}
                          >
                            Ingresos
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveRentasSubTab('gastos')}
                            className={`px-4 py-1.5 text-[11px] font-bold border-t border-x cursor-pointer select-none transition-colors ${activeRentasSubTab === 'gastos' ? 'bg-[#d4d0c8] text-[#000080] border-gray-400 border-b-transparent z-10' : 'bg-[#c0c0c0] text-slate-700 border-gray-400 hover:bg-[#d4d0c8]'}`}
                          >
                            Gastos
                          </button>
                        </div>

                        <div className="flex-1 overflow-auto bg-[#d4d0c8] p-1">
                          {activeRentasSubTab === 'ingresos' && (
                            <div className="space-y-4 max-w-xl">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">CEBE Asociado (Ingresos):</label>
                                <p className="text-[11px] text-gray-600 mb-2 font-sans">
                                  Selecciona el CEBE al que se imputarán los ingresos de este activo.
                                </p>
                                <div className="win-form-row">
                                  <label className="win-form-label">CEBE Ingresos:</label>
                                  <SearchableSelect
                                    options={cebes}
                                    value={formData.incomeCebeId || ''}
                                    onChange={(val) => setFormData({ ...formData, incomeCebeId: val })}
                                    placeholder="-- Seleccionar CEBE --"
                                  />
                                </div>
                              </div>
                              <div className="pt-2">
                                <button 
                                  type="button"
                                  className="px-4 py-1.5 bg-[#4a69bd] hover:bg-[#3b5598] text-white text-[11px] font-bold uppercase shadow-sm cursor-pointer"
                                  onClick={() => handleOpenAccounting('ingresos')}
                                >
                                  Añadir Asiento
                                </button>
                              </div>
                              <AnalyticsJournalViewer type="cebe" value={formData.incomeCebeId} userIds={queryUserIds?.length > 0 ? queryUserIds : [user.uid]} setPreviewDocument={setPreviewDocument} />
                            </div>
                          )}

                          {activeRentasSubTab === 'gastos' && (
                            <div className="space-y-4 max-w-xl">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">CECO Asociado (Gastos):</label>
                                <p className="text-[11px] text-gray-600 mb-2 font-sans">
                                  Selecciona el CECO al que se imputarán los gastos fijos de este activo.
                                </p>
                                <div className="win-form-row">
                                  <label className="win-form-label">CECO Gastos:</label>
                                  <SearchableSelect
                                    options={cecos}
                                    value={formData.expenseCecoId || ''}
                                    onChange={(val) => setFormData({ ...formData, expenseCecoId: val })}
                                    placeholder="-- Seleccionar CECO --"
                                  />
                                </div>
                              </div>
                              <div className="pt-2">
                                <button 
                                  type="button"
                                  className="px-4 py-1.5 bg-[#4a69bd] hover:bg-[#3b5598] text-white text-[11px] font-bold uppercase shadow-sm cursor-pointer"
                                  onClick={() => handleOpenAccounting('gastos')}
                                >
                                  Añadir Asiento
                                </button>
                              </div>
                              <AnalyticsJournalViewer type="ceco" value={formData.expenseCecoId} userIds={queryUserIds?.length > 0 ? queryUserIds : [user.uid]} setPreviewDocument={setPreviewDocument} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeFormTab === 'movimientos' && (
                      <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
                        {/* Capital Transactions Extract */}
                        <div className="space-y-1.5 shrink-0">
                          <label className="text-[10px] font-bold text-slate-700 uppercase select-none">Historial de Transacciones (Capital):</label>
                          <div className="border border-gray-300 max-h-[160px] overflow-auto bg-white rounded-sm">
                            <table style={{ zoom: tableZoom }} className="clean-table select-none w-full text-[11px]">
                              <thead>
                                <tr>
                                  <th className="px-2 py-1 text-left w-24">Fecha</th>
                                  <th className="px-2 py-1 text-left w-32">Plataforma</th>
                                  <th className="px-2 py-1 text-left w-20">Tipo</th>
                                  <th className="px-2 py-1 text-right w-28">Importe</th>
                                  <th className="px-2 py-1 text-left">Notas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectTransactions.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="text-center py-4 text-gray-400 italic">No hay transacciones registradas para este activo.</td>
                                  </tr>
                                ) : (
                                  projectTransactions.map(tx => {
                                    const platform = platforms.find(p => p.id === tx.platformId);
                                    const platName = platform ? platform.name : (tx.platformId || '-');
                                    return (
                                      <tr key={tx.id}>
                                        <td className="font-mono px-2 py-0.5">{tx.date}</td>
                                        <td className="px-2 py-0.5">{platName}</td>
                                        <td className="px-2 py-0.5 font-bold uppercase">{tx.type}</td>
                                        <td className="font-mono px-2 py-0.5 text-right font-semibold text-slate-800">{fmt(tx.amount)} €</td>
                                        <td className="px-2 py-0.5 truncate max-w-[200px]" title={tx.notes}>{tx.notes || '-'}</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Exploitation Movements (CEBE/CECO) */}
                        <div className="flex-1 flex flex-col min-h-0 space-y-1.5 border-t border-gray-300 pt-2 overflow-hidden">
                          <label className="text-[10px] font-bold text-slate-700 uppercase select-none">Movimientos de Explotación (CEBE / CECO):</label>
                          <div className="flex-1 overflow-auto bg-[#d4d0c8] p-1">
                            <AnalyticsJournalViewer type="combined" value={{ cebe: formData.incomeCebeId, ceco: formData.expenseCecoId }} userIds={queryUserIds?.length > 0 ? queryUserIds : [user.uid]} setPreviewDocument={setPreviewDocument} />
                          </div>
                        </div>
                      </div>
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

      {showAccountingModal && (
        <AccountingEntryModal 
          isOpen={true} 
          onClose={() => setShowAccountingModal(false)}
          onSaveSuccess={(id) => {
            console.log("Asiento vinculado en activo CF:", id);
            setShowAccountingModal(false);
          }}
          userId={user.uid}
          defaultDate={new Date().toISOString().split('T')[0]}
          defaultDescription={accountingModalConfig.defaultDescription}
          defaultAmount={accountingModalConfig.defaultAmount}
          linkedAccountId={accountingModalConfig.linkedAccountId}
          defaultAnalytics={accountingModalConfig.defaultAnalytics}
        />
      )}

      {previewDocument && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-[9999]" onClick={() => setPreviewDocument(null)}>
          <div className="bg-white border-2 border-slate-700 shadow-2xl w-[90%] h-[90%] max-w-[1000px] flex flex-col p-1" onClick={e => e.stopPropagation()}>
            <div className="bg-[#000080] text-white px-3 py-1 flex items-center justify-between text-[11px] font-bold shrink-0 select-none">
              <span>DOCUMENTO ASOCIADO: {previewDocument.name}</span>
              <button onClick={() => setPreviewDocument(null)} className="hover:bg-red-500 p-0.5 rounded transition-colors text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 overflow-hidden p-1 relative flex items-center justify-center">
              {previewDocument.url.match(/\.(jpeg|jpg|gif|png)$/i) || previewDocument.url.includes('image') ? (
                <img src={previewDocument.url} alt={previewDocument.name} className="max-w-full max-h-full object-contain" />
              ) : (
                <iframe src={previewDocument.url} title={previewDocument.name} className="w-full h-full border-0 bg-white" />
              )}
            </div>
          </div>
        </div>
      )}
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-50">
        <ZoomControl />
      </div>
</div>
  );
}

function SearchableSelect({ options, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = options.filter(opt =>
    (opt.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (opt.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedOpt = options.find(o => o.code === value);

  const handleOpen = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 250)
    });
    setIsOpen(true);
  };

  return (
    <div className="relative flex-1">
      <div 
        onClick={handleOpen}
        className="win-input w-full h-[28px] flex items-center justify-between px-2 bg-white border border-[#808080] cursor-pointer hover:bg-slate-50 text-[11px] font-mono"
      >
        <span className={selectedOpt ? 'text-black font-semibold' : 'text-gray-400 italic'}>
          {selectedOpt ? `${selectedOpt.code} - ${selectedOpt.name}` : placeholder}
        </span>
        <span className="text-[10px] text-gray-500">▼</span>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[10000]" onClick={() => setIsOpen(false)}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              top: dropdownPos.top, 
              left: dropdownPos.left, 
              width: dropdownPos.width,
              position: 'fixed'
            }}
            className="bg-[#f0f0f0] border border-gray-400 shadow-md flex flex-col p-1 mt-0.5"
          >
            <input 
              autoFocus
              type="text"
              placeholder="Buscar..."
              className="win-input w-full text-[11px] px-2 py-1.5 focus:border-blue-500 font-sans"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[150px] overflow-y-auto bg-white border border-gray-300">
              <div 
                onClick={() => { onChange(''); setIsOpen(false); setSearch(''); }}
                className="px-2 py-1 text-[11px] hover:bg-blue-500 hover:text-white cursor-pointer italic text-gray-500"
              >
                -- Ninguno --
              </div>
              {filtered.map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.code);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="px-2 py-1 text-[11px] hover:bg-blue-500 hover:text-white cursor-pointer font-mono"
                >
                  {opt.code} - {opt.name}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-gray-400 italic text-center">Sin resultados</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsJournalViewer({ type, value, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  
  useEffect(() => {
    if (type === 'combined') {
      if (!value.cebe && !value.ceco) {
        setEntries([]);
        return;
      }
    } else if (!value) {
      setEntries([]);
      return;
    }

    if (!userIds || userIds.length === 0) {
      setEntries([]);
      return;
    }

    const q = query(
      collection(db, 'journal_entries'), 
      where('userId', 'in', userIds)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const filtered = all.filter(entry => {
        if (type === 'combined') {
          const entryCebe = entry.cebe;
          const entryCeco = entry.ceco;
          const matchCebe = value.cebe && entryCebe && String(entryCebe).trim().replace(/^CEBE/i, '').startsWith(String(value.cebe).trim().replace(/^CEBE/i, ''));
          const matchCeco = value.ceco && entryCeco && String(entryCeco).trim().replace(/^CECO/i, '').startsWith(String(value.ceco).trim().replace(/^CECO/i, ''));
          return matchCebe || matchCeco;
        } else if (type === 'account') {
          if (!value) return false;
          const lines = entry.lines || [];
          return lines.some(line => line.account && String(line.account).startsWith(String(value)));
        } else {
          const fieldValue = entry[type];
          if (!fieldValue) return false;
          const normField = String(fieldValue).trim().replace(/^(CEBE|CECO)/i, '');
          const normValue = String(value).trim().replace(/^(CEBE|CECO)/i, '');
          return normField.startsWith(normValue);
        }
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [type, value, userIds]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`¿Eliminar el asiento "${entry.description}"? Esta acción revertirá los saldos contables.`)) return;
    try {
      await deleteJournalEntry(entry.userId || userIds[0], entry.id, entry.lines || []);
    } catch (err) {
      alert('Error al eliminar el asiento: ' + err.message);
    }
  };

  const handleTaxToggle = async (entry) => {
    try {
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, { isImpuesto: !entry.isImpuesto });
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    }
  };

  const handleUploadDoc = async (e, entry) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(entry.id);
    try {
      const url = await uploadFileToStorage(file, entry.userId || userIds[0], 'journal_entries', entry.id, 'docs');
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: url,
        documentName: file.name
      });
    } catch (err) {
      console.error(err);
      alert('Error al subir el documento: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteDoc = async (entry) => {
    if (!window.confirm('¿Eliminar el documento asociado a este asiento?')) return;
    try {
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: null,
        documentName: null
      });
    } catch (err) {
      alert('Error al eliminar el documento: ' + err.message);
    }
  };

  if (type !== 'combined' && !value) return null;
  if (type === 'combined' && !value.cebe && !value.ceco) {
    return <p className="text-[11px] text-gray-500 italic">Asocia primero un CEBE o un CECO al proyecto para ver sus movimientos.</p>;
  }

  const regular = entries.filter(e => !e.isImpuesto);
  const impuestos = entries.filter(e => e.isImpuesto);
  const totalRegular = regular.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const totalImpuestos = impuestos.reduce((s, e) => s + (Number(e.total) || 0), 0);

  return (
    <div className="mt-4 border-t border-gray-300 pt-3">
      <div className="flex items-center justify-between mb-3 select-none">
        <h3 className="text-[11px] font-bold text-slate-800 uppercase">
          {type === 'combined' ? 'Historial de Movimientos' : 'Asientos Contables Asociados'}
        </h3>
        {entries.length > 0 && (
          <div className="flex gap-3 text-[10px]">
            <span className="text-slate-700 font-bold">
              {type === 'ceco' ? 'Gastos' : 'Ingresos'}: {totalRegular.toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;
            </span>
            {impuestos.length > 0 && (
              <span className="text-slate-700 font-bold">
                Impuestos: {totalImpuestos.toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;
              </span>
            )}
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados.</p>
      ) : (
        <div className="overflow-x-auto border border-[#808080]">
          <table style={{ zoom: tableZoom }} className="w-full win-table bg-white">
            <thead className="bg-[#d4d0c8] select-none text-[10px]">
              <tr className="border-b border-[#808080]">
                <th className="p-1.5 text-left font-bold border-r border-[#808080]">Fecha</th>
                <th className="p-1.5 text-left font-bold border-r border-[#808080]">Concepto</th>
                <th className="p-1.5 text-left font-bold border-r border-[#808080]">Documento</th>
                <th className="p-1.5 text-right font-bold border-r border-[#808080]">Importe</th>
                <th className="p-1.5 text-center font-bold border-r border-[#808080] w-16">Impuesto</th>
                <th className="p-1.5 text-center font-bold w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-gray-200 hover:bg-blue-50 text-[10px] text-slate-800">
                  <td className="p-1.5 whitespace-nowrap font-mono">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="p-1.5 truncate max-w-[150px]" title={e.description}>{e.description}</td>
                  
                  {/* Attached Document cell */}
                  <td className="p-1.5 border-r border-gray-200">
                    <div className="flex items-center gap-1.5">
                      {e.documentUrl ? (
                        <>
                          <button 
                            type="button"
                            onClick={() => setPreviewDocument?.({ url: e.documentUrl, name: e.documentName || 'Documento' })} 
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium underline cursor-pointer"
                            title="Previsualizar documento"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[90px]" title={e.documentName}>{e.documentName}</span>
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteDoc(e)} 
                            className="text-red-500 hover:text-red-700 ml-auto p-0.5 hover:bg-red-50 rounded cursor-pointer"
                            title="Quitar documento"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-blue-600 select-none">
                          {uploadingId === e.id ? (
                            <span className="text-[9px] text-slate-500 animate-pulse">Subiendo...</span>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-[9px]">Adjuntar doc</span>
                            </>
                          )}
                          <input 
                            type="file" 
                            className="hidden" 
                            onChange={(evt) => handleUploadDoc(evt, e)} 
                            disabled={uploadingId === e.id}
                          />
                        </label>
                      )}
                    </div>
                  </td>

                  <td className="p-1.5 text-right font-mono font-bold text-[#000080]">
                    {Number(e.total).toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;
                  </td>
                  <td className="p-1.5 text-center">
                    <input 
                      type="checkbox" 
                      checked={!!e.isImpuesto} 
                      onChange={() => handleTaxToggle(e)} 
                      title="Marcar como Impuesto" 
                      className="cursor-pointer w-3.5 h-3.5 accent-orange-500" 
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button 
                      type="button"
                      onClick={() => handleDelete(e)} 
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 cursor-pointer" 
                      title="Eliminar asiento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

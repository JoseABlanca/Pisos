import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';

const fmt = (v, dec = 2) =>
  (v || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const TYPES = ['Inmobiliario', 'Préstamo', 'Equity', 'Otros'];
const STATUSES = ['activo', 'finalizado', 'moroso', 'amortizado'];

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

export default function CfPortfolio() {
  const { user, queryUserIds } = useAuth();
  const [investments, setInvestments] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedInv, setSelectedInv] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [platformFilter, setPlatformFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeFormTab, setActiveFormTab] = useState('datos');
  const [showModalSidebar, setShowModalSidebar] = useState(true);

  const handleSaveField = async (inv, field, newVal) => {
    try {
      const docRef = doc(db, 'cf_investments', inv.id);
      let updatedObj = { ...inv };
      
      let processedVal = newVal;
      const numFields = ['amount', 'currentValue', 'returnRate'];
      if (numFields.includes(field)) {
        processedVal = parseFloat(newVal) || 0;
      }
      updatedObj[field] = processedVal;

      // Update platformName / projectName if platformId or projectId changed
      if (field === 'platformId') {
        const matched = platforms.find(p => p.id === newVal);
        updatedObj.platformName = matched ? matched.name : newVal;
      }
      if (field === 'projectId') {
        const matched = projects.find(p => p.id === newVal);
        updatedObj.projectName = matched ? matched.name : newVal;
      }

      await setDoc(docRef, updatedObj);
    } catch (err) {
      console.error("Error updating investment field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = investments.reduce((max, inv) => {
        const num = parseInt((inv.id || '').replace(/\D/g, '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `INV${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        id: newId,
        projectId: projects[0]?.id || '',
        platformId: platforms[0]?.id || '',
        platformName: platforms[0]?.name || '',
        type: 'Inmobiliario',
        amount: 0,
        currentValue: 0,
        returnRate: 0,
        status: 'activo',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        notes: '',
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'cf_investments', newId), newRecord);
      setSelectedInv(newRecord);
    } catch (err) {
      console.error("Error creating new investment:", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedInv) {
          const displayed = filteredInvestments;
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            if (selectedInv.id === lastItem.id) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedInv, filteredInvestments, investments, platforms, projects, user]);

  const DEFAULT_COLUMNS = ['id', 'projectId', 'platformName', 'type', 'amount', 'currentValue', 'returnRate', 'status'];
  const { visibleColumns, columnWidths } = useTableColumns('cf-portfolio', DEFAULT_COLUMNS);

  // Enriched investments with platform/project name - declared early to avoid TDZ
  const enrichedInvestments = useMemo(() => {
    const platMap = new Map(platforms.map(p => [p.id, p]));
    const projMap = new Map(projects.map(p => [p.id, p]));
    return investments.map(inv => ({
      ...inv,
      platformName: platMap.get(inv.platformId)?.name || inv.platformId || '-',
      projectName: projMap.get(inv.projectId)?.name || inv.projectId || '-',
    }));
  }, [investments, platforms, projects]);

  // Summary cards - declared early to avoid TDZ
  const summary = useMemo(() => {
    const totalInvested = enrichedInvestments.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const totalCurrentValue = enrichedInvestments.reduce((s, i) => s + (parseFloat(i.currentValue) || parseFloat(i.amount) || 0), 0);
    const totalReturn = totalCurrentValue - totalInvested;
    const avgReturn = enrichedInvestments.length > 0
      ? enrichedInvestments.reduce((s, i) => s + (parseFloat(i.returnRate) || 0), 0) / enrichedInvestments.length
      : 0;
    return { totalInvested, totalCurrentValue, totalReturn, avgReturn };
  }, [enrichedInvestments]);

  // Filtered investments - declared early to avoid TDZ
  const filteredInvestments = useMemo(() => {
    return enrichedInvestments.filter((inv) => {
      if (typeFilter !== 'todos' && inv.type !== typeFilter) return false;
      if (statusFilter !== 'todos' && inv.status !== statusFilter) return false;
      if (platformFilter !== 'todos' && inv.platformId !== platformFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          (inv.id || '').toLowerCase().includes(q) ||
          (inv.projectId || '').toLowerCase().includes(q) ||
          (inv.platformName || '').toLowerCase().includes(q) ||
          (inv.type || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enrichedInvestments, typeFilter, statusFilter, platformFilter, searchQuery]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Fetch from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubInv = onSnapshot(
      query(collection(db, 'cf_investments'), where('userId', 'in', targetUserIds)),
      (snap) => setInvestments(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_investments:', err)
    );
    const unsubPlt = onSnapshot(
      query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds)),
      (snap) => setPlatforms(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_platforms:', err)
    );
    const unsubProj = onSnapshot(
      query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds)),
      (snap) => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_projects:', err)
    );

    return () => { unsubInv(); unsubPlt(); unsubProj(); };
  }, [user, queryUserIds]);

  // Ribbon event listeners
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedInv) handleEdit(selectedInv);
      else alert('Por favor, seleccione una inversión de la lista primero.');
    };
    const onDelete = () => {
      if (selectedInv) handleDelete(selectedInv);
      else alert('Por favor, seleccione una inversión de la lista primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Proyecto', dataKey: 'projectId' },
          { header: 'Plataforma', dataKey: 'platformName' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Invertido (€)', dataKey: 'amount' },
          { header: 'Valor actual (€)', dataKey: 'currentValue' },
          { header: 'Rentabilidad (%)', dataKey: 'returnRate' },
          { header: 'Estado', dataKey: 'status' },
        ].filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filteredInvestments, cols, 'Portfolio Crowdfunding', 'cf_portfolio.pdf');
      } else {
        handleExportFormat(filteredInvestments, 'Portfolio Crowdfunding', format);
      }
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
  }, [investments, selectedInv, filteredInvestments, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setActiveFormTab('datos');
    const maxId = investments.reduce((max, inv) => {
      const num = parseInt((inv.id || '').replace(/\D/g, '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({ ...EMPTY_FORM, id: `INV${String(maxId + 1).padStart(3, '0')}` });
    setShowForm(true);
  };

  const handleEdit = (inv) => {
    setIsEditing(true);
    setActiveFormTab('datos');
    setFormData({ ...inv });
    setShowForm(true);
  };

  const handleDelete = async (inv) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la inversión ${inv.id}?`)) {
      try {
        await deleteDoc(doc(db, 'cf_investments', inv.id));
        setSelectedInv(null);
      } catch (error) {
        console.error('Error deleting investment:', error);
        alert('Error al eliminar la inversión: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id) {
      alert('Por favor, defina un ID de inversión válido.');
      return;
    }
    try {
      const docId = formData.id.trim().toUpperCase();
      const selectedPlatform = platforms.find(p => p.id === formData.platformId);
      await setDoc(doc(db, 'cf_investments', docId), {
        ...formData,
        id: docId,
        platformName: selectedPlatform?.name || formData.platformId,
        amount: parseFloat(formData.amount) || 0,
        currentValue: parseFloat(formData.currentValue) || parseFloat(formData.amount) || 0,
        returnRate: parseFloat(formData.returnRate) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      });
      setShowForm(false);
      setSelectedInv(null);
    } catch (error) {
      console.error('Error saving investment:', error);
      alert('Error al guardar la inversión: ' + error.message);
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
      Préstamo: 'bg-amber-100 text-amber-800 border border-amber-200',
      Equity: 'bg-purple-100 text-purple-800 border border-purple-200',
    };
    return map[type] || 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-1 p-1.5 bg-[#f0f4f9] border border-gray-300 rounded-sm">
        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-full text-blue-600"><Building2 className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Total Invertido</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">{fmt(summary.totalInvested)} €</p>
          </div>
        </div>
        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Valor Actual</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">{fmt(summary.totalCurrentValue)} €</p>
          </div>
        </div>
        <div className={`p-2 border rounded-sm shadow-sm flex items-center space-x-3 bg-white ${summary.totalReturn >= 0 ? 'border-green-300' : 'border-red-300'}`}>
          <div className={`p-2 rounded-full ${summary.totalReturn >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {summary.totalReturn >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Retorno Total</p>
            <p className={`text-[13px] font-bold font-mono ${summary.totalReturn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {summary.totalReturn >= 0 ? '+' : ''}{fmt(summary.totalReturn)} €
            </p>
          </div>
        </div>
        <div className="bg-[#4e80c8] p-2 border border-blue-600 rounded-sm shadow-sm flex items-center space-x-3 text-white">
          <div className="p-2 bg-white/20 rounded-full text-white"><TrendingUp className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-white/80">Rentabilidad Media</p>
            <p className="text-[13px] font-bold font-mono">{fmt(summary.avgReturn, 2)} %</p>
          </div>
        </div>
      </div>

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
                <label className="text-slate-700 font-bold">Tipo de inversión:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="cfPortType" checked={typeFilter === 'todos'} onChange={() => setTypeFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={typeFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos los tipos</span>
                  </label>
                  {TYPES.map((t) => (
                    <label key={t} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfPortType" checked={typeFilter === t} onChange={() => setTypeFilter(t)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
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
                    <input type="radio" name="cfPortStatus" checked={statusFilter === 'todos'} onChange={() => setStatusFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                    <span className={statusFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos</span>
                  </label>
                  {STATUSES.map((s) => (
                    <label key={s} className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfPortStatus" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                      <span className={statusFilter === s ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Platform Filter */}
              {platforms.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-300">
                  <label className="text-slate-700 font-bold">Plataforma:</label>
                  <div className="space-y-1">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="cfPortPlatform" checked={platformFilter === 'todos'} onChange={() => setPlatformFilter('todos')} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                      <span className={platformFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todas</span>
                    </label>
                    {platforms.map((p) => (
                      <label key={p.id} className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name="cfPortPlatform" checked={platformFilter === p.id} onChange={() => setPlatformFilter(p.id)} className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" />
                        <span className={platformFilter === p.id ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="pt-2 border-t border-gray-300 space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Estadísticas</p>
                <p className="text-slate-700">Inversiones: <span className="font-bold text-slate-900">{investments.length}</span></p>
                <p className="text-slate-700">Activas: <span className="font-bold text-green-700">{investments.filter(i => i.status === 'activo').length}</span></p>
                <p className="text-slate-700">Morosas: <span className="font-bold text-red-700">{investments.filter(i => i.status === 'moroso').length}</span></p>
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
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '90px' }}>ID</th>}
                  {visibleColumns.includes('projectId') && <th style={{ width: columnWidths['projectId'] || '100px' }}>Proyecto</th>}
                  {visibleColumns.includes('platformName') && <th style={{ width: columnWidths['platformName'] || '140px' }}>Plataforma</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '110px' }}>Tipo</th>}
                  {visibleColumns.includes('amount') && <th style={{ width: columnWidths['amount'] || '110px' }} className="text-right">Invertido (€)</th>}
                  {visibleColumns.includes('currentValue') && <th style={{ width: columnWidths['currentValue'] || '120px' }} className="text-right">Valor actual (€)</th>}
                  {visibleColumns.includes('returnRate') && <th style={{ width: columnWidths['returnRate'] || '100px' }} className="text-right">Rentab. (%)</th>}
                  {visibleColumns.includes('status') && <th style={{ width: columnWidths['status'] || '90px' }}>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filteredInvestments.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron inversiones. Registra una nueva desde el menú superior.
                    </td>
                  </tr>
                ) : (
                  filteredInvestments.map((inv) => {
                    const returnVal = (parseFloat(inv.currentValue) || 0) - (parseFloat(inv.amount) || 0);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedInv(selectedInv?.id === inv.id ? null : inv)}
                        onDoubleClick={() => handleEdit(inv)}
                        className={selectedInv?.id === inv.id ? 'selected' : ''}
                      >
                        {visibleColumns.includes('id') && <td className="font-mono font-bold">{inv.id}</td>}
                        {visibleColumns.includes('projectId') && (
                          <EditableCell
                            className="font-semibold"
                            value={inv.projectId}
                            options={projects.map(p => ({ id: p.id, name: `${p.id} - ${p.name}` }))}
                            onSave={(val) => handleSaveField(inv, 'projectId', val)}
                          />
                        )}
                        {visibleColumns.includes('platformName') && (
                          <EditableCell
                            value={inv.platformId}
                            options={platforms.map(p => ({ id: p.id, name: p.name }))}
                            onSave={(val) => handleSaveField(inv, 'platformId', val)}
                          />
                        )}
                        {visibleColumns.includes('type') && (
                          <EditableCell
                            value={inv.type}
                            options={TYPES}
                            onSave={(val) => handleSaveField(inv, 'type', val)}
                          >
                            <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${typeBadge(inv.type)}`}>
                              {inv.type}
                            </span>
                          </EditableCell>
                        )}
                        {visibleColumns.includes('amount') && (
                          <EditableCell
                            type="number"
                            className="font-mono text-right"
                            value={inv.amount}
                            onSave={(val) => handleSaveField(inv, 'amount', val)}
                          >
                            {fmt(parseFloat(inv.amount) || 0)}
                          </EditableCell>
                        )}
                        {visibleColumns.includes('currentValue') && (
                          <EditableCell
                            type="number"
                            className={`font-mono text-right font-bold ${returnVal >= 0 ? 'text-green-700' : 'text-red-600'}`}
                            value={inv.currentValue}
                            onSave={(val) => handleSaveField(inv, 'currentValue', val)}
                          >
                            {fmt(parseFloat(inv.currentValue) || parseFloat(inv.amount) || 0)}
                          </EditableCell>
                        )}
                        {visibleColumns.includes('returnRate') && (
                          <EditableCell
                            type="number"
                            className={`font-mono text-right ${parseFloat(inv.returnRate) >= 0 ? 'text-green-700' : 'text-red-600'}`}
                            value={inv.returnRate}
                            onSave={(val) => handleSaveField(inv, 'returnRate', val)}
                          >
                            {fmt(parseFloat(inv.returnRate) || 0)} %
                          </EditableCell>
                        )}
                        {visibleColumns.includes('status') && (
                          <EditableCell
                            value={inv.status}
                            options={STATUSES}
                            onSave={(val) => handleSaveField(inv, 'status', val)}
                          >
                            <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${statusBadge(inv.status)}`}>
                              {inv.status}
                            </span>
                          </EditableCell>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-1 border-t border-gray-200 bg-[#f8fafc] text-[10px] text-gray-500 shrink-0">
            <span>{filteredInvestments.length} registro(s){investments.length !== filteredInvestments.length ? ` de ${investments.length}` : ''}</span>
            {selectedInv && <span className="font-semibold text-slate-600">Seleccionado: {selectedInv.id}</span>}
          </div>
        </div>
      </div>

      {/* Investment Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Inversión: ${formData.id}` : 'Nueva Inversión Crowdfunding'}
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
                      <form id="cfportfolio-form" onSubmit={handleSave} className="space-y-3 flex-1">
                        <div className="win-form-row">
                          <label className="win-form-label">ID Inversión:</label>
                          <input type="text" value={formData.id} onChange={(e) => setFormData({ ...formData, id: e.target.value })} placeholder="ej. INV001" disabled={isEditing} required className="win-input flex-1 uppercase font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Plataforma:</label>
                          <select value={formData.platformId} onChange={(e) => setFormData({ ...formData, platformId: e.target.value })} className="win-input flex-1">
                            <option value="">-- Seleccionar --</option>
                            {platforms.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Proyecto:</label>
                          <select value={formData.projectId} onChange={(e) => setFormData({ ...formData, projectId: e.target.value })} className="win-input flex-1">
                            <option value="">-- Seleccionar --</option>
                            {projects.filter(p => !formData.platformId || p.platformId === formData.platformId).map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                            ))}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Tipo:</label>
                          <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="win-input flex-1">
                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Importe invertido (€):</label>
                          <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" step="0.01" required className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Valor actual (€):</label>
                          <input type="number" value={formData.currentValue} onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Rentabilidad (%):</label>
                          <input type="number" value={formData.returnRate} onChange={(e) => setFormData({ ...formData, returnRate: e.target.value })} placeholder="0.00" step="0.01" className="win-input flex-1 font-mono" />
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
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  <button type="submit" form="cfportfolio-form" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Aceptar</button>
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

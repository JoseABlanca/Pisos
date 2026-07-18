import { useState, useEffect } from 'react';
import { useTableFilters } from '../hooks/useTableFilters';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import ZoomControl from '../components/ZoomControl';
import ResizableSidebar from '../components/ResizableSidebar';

const fmt = (v, dec = 2) =>
  (v || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const TYPES = ['Compra', 'Venta'];

const EMPTY_FORM = {
  id: '',
  date: new Date().toISOString().split('T')[0],
  projectId: '',
  platformId: '',
  type: 'Compra',
  amount: '',
  notes: ''
};

export default function CfTransactions() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  
  // Data State
  const [transactions, setTransactions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [platforms, setPlatforms] = useState([]);

  // UI State
  const [selectedTx, setSelectedTx] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');

  // Sidebar Filters
  const [platformFilter, setPlatformFilter] = useState('todos');
  const [projectFilter, setProjectFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const DEFAULT_COLUMNS = ['id', 'date', 'projectName', 'platformName', 'type', 'amount', 'notes'];
  const { visibleColumns, columnWidths , updateColumnWidth} = useTableColumns('cf-transactions', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubTx = onSnapshot(
      query(collection(db, 'cf_transactions'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching cf_transactions:', err)
    );

    const unsubProj = onSnapshot(
      query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching cf_projects:', err)
    );

    const unsubPlt = onSnapshot(
      query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setPlatforms(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching cf_platforms:', err)
    );

    return () => {
      unsubTx();
      unsubProj();
      unsubPlt();
    };
  }, [user, queryUserIds]);

  // Enrich transactions with project/platform names
  const enrichedTransactions = transactions.map(tx => {
    const proj = projects.find(p => p.id === tx.projectId);
    const plat = platforms.find(p => p.id === tx.platformId);
    return {
      ...tx,
      projectName: proj?.name || tx.projectId || '-',
      platformName: plat?.name || tx.platformId || '-'
    };
  });

  // Filtered transactions
  const filteredTransactions = enrichedTransactions.filter((tx) => {
    if (platformFilter !== 'todos' && tx.platformId !== platformFilter) return false;
    if (projectFilter !== 'todos' && tx.projectId !== projectFilter) return false;
    if (typeFilter !== 'todos' && tx.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (tx.id || '').toLowerCase().includes(q) ||
        (tx.projectName || '').toLowerCase().includes(q) ||
        (tx.platformName || '').toLowerCase().includes(q) ||
        (tx.notes || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSaveField = async (tx, field, newVal) => {
    try {
      const docRef = doc(db, 'cf_transactions', tx.id);
      let updatedObj = { ...tx };
      
      let processedVal = newVal;
      if (field === 'amount') {
        processedVal = parseFloat(newVal) || 0;
      }
      updatedObj[field] = processedVal;

      await setDoc(docRef, updatedObj);
    } catch (err) {
      console.error("Error updating transaction field:", err);
    }
  };

  const handleNew = () => {
    setIsEditing(false);
    const maxId = transactions.reduce((max, t) => {
      const num = parseInt((t.id || '').replace(/\D/g, '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({ ...EMPTY_FORM, id: `CFT${String(maxId + 1).padStart(3, '0')}` });
    setShowForm(true);
  };

  const handleEdit = (tx) => {
    setIsEditing(true);
    setFormData({ ...EMPTY_FORM, ...tx });
    setShowForm(true);
  };

  const handleDelete = async (tx) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la transacción ${tx.id}?`)) {
      try {
        await deleteDoc(doc(db, 'cf_transactions', tx.id));
        setSelectedTx(null);
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error al eliminar la transacción: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id || !formData.projectId || !formData.platformId || !formData.amount) {
      alert('Por favor, rellene todos los campos obligatorios.');
      return;
    }

    try {
      const docId = formData.id.trim().toUpperCase();
      const newRecord = {
        ...formData,
        id: docId,
        amount: parseFloat(formData.amount) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'cf_transactions', docId), newRecord);
      setShowForm(false);
      setSelectedTx(newRecord);
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error al guardar la transacción: ' + error.message);
    }
  };

  // Ribbon Event Dispatchers
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedTx) handleEdit(selectedTx);
      else alert('Por favor, seleccione una transacción primero.');
    };
    const onDelete = () => {
      if (selectedTx) handleDelete(selectedTx);
      else alert('Por favor, seleccione una transacción primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Fecha', dataKey: 'date' },
          { header: 'Proyecto', dataKey: 'projectName' },
          { header: 'Plataforma', dataKey: 'platformName' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Importe (€)', dataKey: 'amount' },
          { header: 'Notas', dataKey: 'notes' }
        ].filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filteredTransactions, cols, 'Transacciones Crowdfunding', 'cf_transacciones.pdf');
      } else {
        handleExportFormat(filteredTransactions, 'Transacciones Crowdfunding', format);
      }
    };

    window.addEventListener('cf-transactions-new', onNew);
    window.addEventListener('cf-transactions-edit', onEdit);
    window.addEventListener('cf-transactions-delete', onDelete);
    window.addEventListener('cf-transactions-export', onExport);

    return () => {
      window.removeEventListener('cf-transactions-new', onNew);
      window.removeEventListener('cf-transactions-edit', onEdit);
      window.removeEventListener('cf-transactions-delete', onDelete);
      window.removeEventListener('cf-transactions-export', onExport);
    };
  }, [selectedTx, filteredTransactions, visibleColumns]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden font-sans">
      
      {/* Main Container */}
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        
        {/* Collapsible Sidebar */}
        {showSidebar && (
          <ResizableSidebar className=" bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all select-none">
            
            {/* Header */}
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700 flex justify-between items-center select-none">
              <span>Filtros</span>
              {isMobile && (
                <button onClick={() => setShowSidebar(false)} className="hover:bg-red-500 p-0.5 rounded text-white"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>

            {/* Filters Body */}
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">
              
              {/* Platform Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold">Filtrar por Plataforma:</label>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Brokers</option>
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Project Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold">Filtrar por Activo:</label>
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Activos</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Type Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold">Tipo de Operación:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Tipos</option>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

            </div>
          </ResizableSidebar>
        )}

        {isMobile && showSidebar && (
          <div className="absolute inset-0 z-45 bg-black/30" onClick={() => setShowSidebar(false)} />
        )}

        {/* Main Content Table Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8fafc] select-none shrink-0">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300 flex items-center justify-center cursor-pointer"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar transacción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent font-sans"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto border-b border-gray-200 bg-white relative">
            <table style={{ zoom: tableZoom }} className="clean-table">
              <thead>
                <tr>
                  
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<th
 key="id" style={{ width: columnWidths['id'] || '90px' }}>ID</th>);
                    case 'date': return (<th
 key="date" style={{ width: columnWidths['date'] || '100px' }}>Fecha</th>);
                    case 'projectName': return (<th
 key="projectName" style={{ width: columnWidths['projectName'] || '150px' }}>Activo / Proyecto</th>);
                    case 'platformName': return (<th
 key="platformName" style={{ width: columnWidths['platformName'] || '150px' }}>Plataforma</th>);
                    case 'type': return (<th
 key="type" style={{ width: columnWidths['type'] || '100px' }}>Tipo</th>);
                    case 'amount': return (<th
 key="amount" style={{ width: columnWidths['amount'] || '110px' }} className="text-right">Importe (€)</th>);
                    case 'notes': return (<th
 key="notes" style={{ width: columnWidths['notes'] || '200px' }}>Notas</th>);
                    default: return null;
                    }
                  })}
    
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">No se encontraron transacciones.</td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      onDoubleClick={() => handleEdit(tx)}
                      onClick={() => setSelectedTx(selectedTx?.id === tx.id ? null : tx)}
                      className={selectedTx?.id === tx.id ? 'selected' : ''}
                    >
                      
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<td
 key="id" className="font-mono">{tx.id}</td>);
                    case 'date': return (<td
 key="date" className="font-mono">{new Date(tx.date).toLocaleDateString()}</td>);
                    case 'projectName': return (<td
 key="projectName">
                          <EditableCell
                            value={tx.projectName}
                            onSave={(val) => handleSaveField(tx, 'projectId', val)}
                            isEditing={false}
                          />
                        </td>);
                    case 'platformName': return (<td
 key="platformName">
                          <EditableCell
                            value={tx.platformName}
                            onSave={(val) => handleSaveField(tx, 'platformId', val)}
                            isEditing={false}
                          />
                        </td>);
                    case 'type': return (<td
 key="type">{tx.type}</td>);
                    case 'amount': return (<td
 key="amount" className="text-right font-mono font-bold">
                          <EditableCell
                            value={tx.amount}
                            type="number"
                            onSave={(val) => handleSaveField(tx, 'amount', val)}
                            isEditing={false}
                            formatter={(v) => fmt(v, 2)}
                          />
                        </td>);
                    case 'notes': return (<td
 key="notes" className="max-w-[200px] truncate" title={tx.notes}>
                          <EditableCell
                            value={tx.notes || ''}
                            onSave={(val) => handleSaveField(tx, 'notes', val)}
                            isEditing={false}
                          />
                        </td>);
                    default: return null;
                    }
                  })}
    
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Status Bar */}
          <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] select-none">
            <div>{filteredTransactions.length} transacciones encontradas</div>
            <ZoomControl />
          </div>
        </div>
      </div>

      {/* Transaction Entry Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Transacción: ${formData.id}` : 'Nueva Transacción Crowdfunding'}
            onClose={() => setShowForm(false)}
            width={isMobile ? '100%' : '500px'}
            height="auto"
          >
            <form onSubmit={handleSave} className="bg-[#d4d0c8] p-3 border border-white shadow-[1px_1px_0px_#000] space-y-4">
              
              <div className="win-form-row">
                <label className="win-form-label">ID Transacción:</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="ej. CFT001"
                  disabled={isEditing}
                  required
                  className="win-input flex-1 uppercase font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Fecha:</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="win-input flex-1 font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Activo CF:</label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="">-- Seleccionar Activo --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Plataforma:</label>
                <select
                  value={formData.platformId}
                  onChange={(e) => setFormData({ ...formData, platformId: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="">-- Seleccionar Plataforma --</option>
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo:</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Importe (€):</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  required
                  className="win-input flex-1 font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Notas:</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Detalles de la compra/venta..."
                  rows={3}
                  className="win-input flex-1 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-400">
                <button type="submit" className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Aceptar</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer">Cancelar</button>
              </div>

            </form>
          </Window>
        </div>
      )}

    </div>
  );
}

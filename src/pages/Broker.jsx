import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';

export default function Broker() {
  const { user, queryUserIds } = useAuth();
  const [brokers, setBrokers] = useState([]);
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [formData, setFormData] = useState({
    id: '', // Format BR001
    name: '',
    regulation: 'CNMV (España)',
    currency: 'EUR',
    cashBalance: '',
    accountingAccount: '',
    status: 'activo',
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'name', 'regulation', 'currency', 'cashBalance', 'accountingAccount', 'status'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-brokers', DEFAULT_COLUMNS);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Brokers from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'rv_brokers'),
      where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setBrokers(data);
      },
      (err) => console.error('Error fetching brokers:', err)
    );

    return () => unsub();
  }, [user, queryUserIds]);

  // Handle ribbon actions
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedBroker) handleEdit(selectedBroker);
      else alert('Por favor, seleccione un broker de la lista primero.');
    };
    const onDelete = () => {
      if (selectedBroker) handleDelete(selectedBroker);
      else alert('Por favor, seleccione un broker de la lista primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const filtered = filteredBrokers;
      if (format === 'pdf') {
        const allColumns = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Regulación', dataKey: 'regulation' },
          { header: 'Divisa', dataKey: 'currency' },
          { header: 'Efectivo', dataKey: 'cashBalance' },
          { header: 'Cta. Contable', dataKey: 'accountingAccount' },
          { header: 'Estado', dataKey: 'status' }
        ];
        const colsToExport = allColumns.filter((c) => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Brokers', 'brokers.pdf');
      } else {
        handleExportFormat(filtered, 'Brokers Renta Variable', format);
      }
    };
    const onToggleColumn = (e) => {
      toggleColumn(e.detail.columnId);
    };

    window.addEventListener('rv-broker:new', onNew);
    window.addEventListener('rv-broker:edit', onEdit);
    window.addEventListener('rv-broker:delete', onDelete);
    window.addEventListener('rv-broker:export', onExport);
    window.addEventListener('toggle-column', onToggleColumn);

    return () => {
      window.removeEventListener('rv-broker:new', onNew);
      window.removeEventListener('rv-broker:edit', onEdit);
      window.removeEventListener('rv-broker:delete', onDelete);
      window.removeEventListener('rv-broker:export', onExport);
      window.removeEventListener('toggle-column', onToggleColumn);
    };
  }, [brokers, selectedBroker, filteredBrokers, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    // Find highest ID to auto-generate
    const maxId = brokers.reduce((max, b) => {
      const num = parseInt(b.id.replace('BR', '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({
      id: `BR${String(maxId + 1).padStart(3, '0')}`,
      name: '',
      regulation: 'CNMV (España)',
      currency: 'EUR',
      cashBalance: '0',
      accountingAccount: '',
      status: 'activo',
      notes: ''
    });
    setShowForm(true);
  };

  const handleEdit = (broker) => {
    setIsEditing(true);
    setFormData({ ...broker });
    setShowForm(true);
  };

  const handleDelete = async (broker) => {
    if (window.confirm(`¿Está seguro de que desea eliminar el broker ${broker.name} (${broker.id})?`)) {
      try {
        await deleteDoc(doc(db, 'rv_brokers', broker.id));
        setSelectedBroker(null);
      } catch (error) {
        console.error('Error deleting broker:', error);
        alert('Error al eliminar el broker: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id) {
      alert('Por favor, defina un ID de Broker válido.');
      return;
    }
    if (!formData.name) {
      alert('Por favor, introduzca el Nombre del broker.');
      return;
    }

    try {
      const docId = formData.id.trim().toUpperCase();
      const cleanData = {
        ...formData,
        id: docId,
        cashBalance: parseFloat(formData.cashBalance) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rv_brokers', docId), cleanData);
      setShowForm(false);
      setSelectedBroker(null);
    } catch (error) {
      console.error('Error saving broker:', error);
      alert('Error al guardar el broker: ' + error.message);
    }
  };

  const getFilteredBrokers = () => {
    return brokers.filter((broker) => {
      // Status Filter
      if (statusFilter !== 'todos' && broker.status !== statusFilter) return false;

      // Search Query
      if (searchQuery) {
        const queryStr = searchQuery.toLowerCase();
        return (
          broker.id.toLowerCase().includes(queryStr) ||
          broker.name.toLowerCase().includes(queryStr) ||
          (broker.regulation || '').toLowerCase().includes(queryStr) ||
          (broker.accountingAccount || '').toLowerCase().includes(queryStr)
        );
      }

      return true;
    });
  };

  const filteredBrokers = getFilteredBrokers();

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
              {/* Search Box */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold">Buscar broker:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ID, Nombre, Regulación..."
                    className="win-input w-full pl-7"
                  />
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2 pt-2 border-t border-gray-300">
                <label className="text-slate-700 font-bold">Estado:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brokerStatus"
                      checked={statusFilter === 'todos'}
                      onChange={() => setStatusFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={statusFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todos
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brokerStatus"
                      checked={statusFilter === 'activo'}
                      onChange={() => setStatusFilter('activo')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={statusFilter === 'activo' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Activos
                    </span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brokerStatus"
                      checked={statusFilter === 'inactivo'}
                      onChange={() => setStatusFilter('inactivo')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={statusFilter === 'inactivo' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Inactivos
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Table Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="p-2 border-b border-gray-200 flex justify-between items-center bg-[#f8fafc]">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="px-2 py-1 bg-slate-200 border border-slate-300 text-[10px] font-bold text-slate-700 rounded hover:bg-slate-300 transition-colors"
            >
              {showSidebar ? 'Ocultar Panel' : 'Mostrar Panel'}
            </button>
            <div className="text-[11px] text-gray-500 font-semibold">
              Brokers encontrados: <span className="text-blue-600">{filteredBrokers.length}</span>
            </div>
          </div>

          <div className="win-table-container">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '80px' }}>ID</th>}
                  {visibleColumns.includes('name') && <th style={{ width: columnWidths['name'] || '180px' }}>Nombre</th>}
                  {visibleColumns.includes('regulation') && <th style={{ width: columnWidths['regulation'] || '150px' }}>Regulación</th>}
                  {visibleColumns.includes('currency') && <th style={{ width: columnWidths['currency'] || '80px' }}>Divisa</th>}
                  {visibleColumns.includes('cashBalance') && <th style={{ width: columnWidths['cashBalance'] || '120px' }}>Saldo Efectivo</th>}
                  {visibleColumns.includes('accountingAccount') && <th style={{ width: columnWidths['accountingAccount'] || '120px' }}>Cta. Contable</th>}
                  {visibleColumns.includes('status') && <th style={{ width: columnWidths['status'] || '90px' }}>Estado</th>}
                </tr>
              </thead>
              <tbody>
                {filteredBrokers.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron brokers. Ve a la pestaña de Configuración para cargar datos de ejemplo.
                    </td>
                  </tr>
                ) : (
                  filteredBrokers.map((broker) => (
                    <tr
                      key={broker.id}
                      onClick={() => setSelectedBroker(selectedBroker?.id === broker.id ? null : broker)}
                      className={selectedBroker?.id === broker.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td>{broker.id}</td>}
                      {visibleColumns.includes('name') && <td>{broker.name}</td>}
                      {visibleColumns.includes('regulation') && <td>{broker.regulation}</td>}
                      {visibleColumns.includes('currency') && <td>{broker.currency}</td>}
                      {visibleColumns.includes('cashBalance') && (
                        <td className="font-mono text-right font-bold text-slate-800">
                          {broker.cashBalance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {broker.currency}
                        </td>
                      )}
                      {visibleColumns.includes('accountingAccount') && <td>{broker.accountingAccount || '-'}</td>}
                      {visibleColumns.includes('status') && (
                        <td>
                          <span
                            className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${
                              broker.status === 'activo'
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-red-100 text-red-800 border border-red-200'
                            }`}
                          >
                            {broker.status}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Broker Maintenance Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Broker: ${formData.id}` : 'Nuevo Broker de Renta Variable'}
            onClose={() => setShowForm(false)}
            width="500px"
            height="auto"
            initialPos={{ x: (window.innerWidth - 500) / 2, y: 120 }}
          >
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div className="win-form-row">
                <label className="win-form-label">ID Broker:</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="ej. BR001"
                  disabled={isEditing}
                  required
                  className="win-input flex-1 uppercase font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Nombre Broker:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Interactive Brokers"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Regulación:</label>
                <input
                  type="text"
                  value={formData.regulation}
                  onChange={(e) => setFormData({ ...formData, regulation: e.target.value })}
                  placeholder="ej. CNMV (España), SEC (EEUU)"
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Divisa Base:</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="win-input flex-1"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CHF">CHF (Fr.)</option>
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Saldo Efectivo:</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cashBalance}
                  onChange={(e) => setFormData({ ...formData, cashBalance: e.target.value })}
                  placeholder="ej. 5000.00"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Cuenta Contable:</label>
                <input
                  type="text"
                  value={formData.accountingAccount}
                  onChange={(e) => setFormData({ ...formData, accountingAccount: e.target.value })}
                  placeholder="ej. 572001 (BBVA Broker)"
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Estado:</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="win-input flex-1"
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>

              <div className="win-form-row items-start">
                <label className="win-form-label pt-1.5">Notas:</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Comentarios adicionales..."
                  rows={2}
                  className="win-input flex-1 font-sans resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 rounded cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </Window>
        </div>
      )}
    </div>
  );
}

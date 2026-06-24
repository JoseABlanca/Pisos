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

export default function RvAssets() {
  const { user, queryUserIds } = useAuth();
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [formData, setFormData] = useState({
    id: '', // Ticker symbol
    name: '',
    isin: '',
    type: 'Acción',
    sector: 'Tecnología',
    currency: 'EUR',
    currentPrice: '',
    country: 'España',
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'name', 'isin', 'type', 'sector', 'currency', 'currentPrice', 'country'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-assets', DEFAULT_COLUMNS);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Assets from Firestore
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'rv_assets'),
      where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setAssets(data);
      },
      (err) => console.error('Error fetching assets:', err)
    );

    return () => unsub();
  }, [user, queryUserIds]);

  // Handle ribbon actions
  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedAsset) handleEdit(selectedAsset);
      else alert('Por favor, seleccione un activo de la lista primero.');
    };
    const onDelete = () => {
      if (selectedAsset) handleDelete(selectedAsset);
      else alert('Por favor, seleccione un activo de la lista primero.');
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const filtered = filteredAssets;
      if (format === 'pdf') {
        const allColumns = [
          { header: 'Ticker', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'ISIN', dataKey: 'isin' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Sector', dataKey: 'sector' },
          { header: 'Divisa', dataKey: 'currency' },
          { header: 'Precio', dataKey: 'currentPrice' },
          { header: 'País', dataKey: 'country' }
        ];
        const colsToExport = allColumns.filter((c) => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Activos de Renta Variable', 'activos_rv.pdf');
      } else {
        handleExportFormat(filtered, 'Activos Renta Variable', format);
      }
    };
    const onToggleColumn = (e) => {
      toggleColumn(e.detail.columnId);
    };

    window.addEventListener('rv-asset:new', onNew);
    window.addEventListener('rv-asset:edit', onEdit);
    window.addEventListener('rv-asset:delete', onDelete);
    window.addEventListener('rv-asset:export', onExport);
    window.addEventListener('toggle-column', onToggleColumn);

    return () => {
      window.removeEventListener('rv-asset:new', onNew);
      window.removeEventListener('rv-asset:edit', onEdit);
      window.removeEventListener('rv-asset:delete', onDelete);
      window.removeEventListener('rv-asset:export', onExport);
      window.removeEventListener('toggle-column', onToggleColumn);
    };
  }, [assets, selectedAsset, filteredAssets, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      name: '',
      isin: '',
      type: 'Acción',
      sector: 'Tecnología',
      currency: 'EUR',
      currentPrice: '',
      country: 'España',
      notes: ''
    });
    setShowForm(true);
  };

  const handleEdit = (asset) => {
    setIsEditing(true);
    setFormData({ ...asset });
    setShowForm(true);
  };

  const handleDelete = async (asset) => {
    if (window.confirm(`¿Está seguro de que desea eliminar el activo ${asset.name} (${asset.id})?`)) {
      try {
        await deleteDoc(doc(db, 'rv_assets', asset.id));
        setSelectedAsset(null);
      } catch (error) {
        console.error('Error deleting asset:', error);
        alert('Error al eliminar el activo: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id) {
      alert('Por favor, introduzca un Ticker/Símbolo válido (ej. AAPL, TEF.MC).');
      return;
    }
    if (!formData.name) {
      alert('Por favor, introduzca el Nombre de la empresa.');
      return;
    }

    try {
      const docId = formData.id.trim().toUpperCase();
      const cleanData = {
        ...formData,
        id: docId,
        currentPrice: parseFloat(formData.currentPrice) || 0,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rv_assets', docId), cleanData);
      setShowForm(false);
      setSelectedAsset(null);
    } catch (error) {
      console.error('Error saving asset:', error);
      alert('Error al guardar el activo: ' + error.message);
    }
  };

  // Filter and search computation
  const getFilteredAssets = () => {
    return assets.filter((asset) => {
      // Type Filter
      if (typeFilter !== 'todos' && asset.type !== typeFilter) return false;

      // Search Query
      if (searchQuery) {
        const queryStr = searchQuery.toLowerCase();
        return (
          asset.id.toLowerCase().includes(queryStr) ||
          asset.name.toLowerCase().includes(queryStr) ||
          (asset.isin || '').toLowerCase().includes(queryStr) ||
          (asset.sector || '').toLowerCase().includes(queryStr)
        );
      }

      return true;
    });
  };

  const filteredAssets = getFilteredAssets();

  const assetTypes = ['Acción', 'ETF', 'Fondo de Inversión', 'Criptomoneda', 'Otros'];

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
                <label className="text-slate-700 font-bold">Buscar activo:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ticker, Nombre, ISIN..."
                    className="win-input w-full pl-7"
                  />
                  <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" />
                </div>
              </div>

              {/* Type Filter */}
              <div className="space-y-2 pt-2 border-t border-gray-300">
                <label className="text-slate-700 font-bold">Tipo de activo:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="assetType"
                      checked={typeFilter === 'todos'}
                      onChange={() => setTypeFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={typeFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todos los tipos
                    </span>
                  </label>
                  {assetTypes.map((type) => (
                    <label key={type} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assetType"
                        checked={typeFilter === type}
                        onChange={() => setTypeFilter(type)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                      />
                      <span className={typeFilter === type ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {type}s
                      </span>
                    </label>
                  ))}
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
              Activos encontrados: <span className="text-blue-600">{filteredAssets.length}</span>
            </div>
          </div>

          <div className="win-table-container">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '100px' }}>Ticker</th>}
                  {visibleColumns.includes('name') && <th style={{ width: columnWidths['name'] || '200px' }}>Nombre</th>}
                  {visibleColumns.includes('isin') && <th style={{ width: columnWidths['isin'] || '120px' }}>ISIN</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '120px' }}>Tipo</th>}
                  {visibleColumns.includes('sector') && <th style={{ width: columnWidths['sector'] || '130px' }}>Sector</th>}
                  {visibleColumns.includes('currency') && <th style={{ width: columnWidths['currency'] || '80px' }}>Divisa</th>}
                  {visibleColumns.includes('currentPrice') && <th style={{ width: columnWidths['currentPrice'] || '100px' }}>Precio</th>}
                  {visibleColumns.includes('country') && <th style={{ width: columnWidths['country'] || '110px' }}>País</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron activos. Ve a la pestaña de Configuración para cargar datos de ejemplo.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
                      className={selectedAsset?.id === asset.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td>{asset.id}</td>}
                      {visibleColumns.includes('name') && <td>{asset.name}</td>}
                      {visibleColumns.includes('isin') && <td>{asset.isin || '-'}</td>}
                      {visibleColumns.includes('type') && <td>{asset.type}</td>}
                      {visibleColumns.includes('sector') && <td>{asset.sector}</td>}
                      {visibleColumns.includes('currency') && <td>{asset.currency}</td>}
                      {visibleColumns.includes('currentPrice') && (
                        <td className="font-mono text-right font-bold text-slate-800">
                          {asset.currentPrice.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {asset.currency}
                        </td>
                      )}
                      {visibleColumns.includes('country') && <td>{asset.country}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Asset Maintenance Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Activo: ${formData.id}` : 'Nuevo Activo de Renta Variable'}
            onClose={() => setShowForm(false)}
            width="550px"
            height="auto"
            initialPos={{ x: (window.innerWidth - 550) / 2, y: 120 }}
          >
            <form onSubmit={handleSave} className="p-4 space-y-3">
              <div className="win-form-row">
                <label className="win-form-label">Ticker / Símbolo:</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="ej. AAPL, TEF.MC, MSFT"
                  disabled={isEditing}
                  required
                  className="win-input flex-1 uppercase"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Nombre empresa:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ej. Apple Inc."
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Código ISIN:</label>
                <input
                  type="text"
                  value={formData.isin}
                  onChange={(e) => setFormData({ ...formData, isin: e.target.value })}
                  placeholder="ej. US0378331005"
                  className="win-input flex-1 uppercase"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo de Activo:</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="win-input flex-1"
                >
                  {assetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Sector:</label>
                <input
                  type="text"
                  value={formData.sector}
                  onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                  placeholder="ej. Tecnología, Salud, Telecomunicaciones"
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Divisa:</label>
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
                <label className="win-form-label">Precio Actual:</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.currentPrice}
                  onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                  placeholder="ej. 175.50"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">País:</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="ej. EE.UU., España"
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row items-start">
                <label className="win-form-label pt-1.5">Notas:</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas adicionales..."
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

import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, Upload, RefreshCw, Calendar, FileText, PanelLeft } from 'lucide-react';
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
  
  // Modal states
  const [activeFormTab, setActiveFormTab] = useState('datos'); // 'datos' | 'historico' | 'extracto'
  const [tempHistory, setTempHistory] = useState([]); // holds parsed CSV or API generated prices
  const [dbHistory, setDbHistory] = useState([]); // holds loaded prices from Firestore
  const [isGenerating, setIsGenerating] = useState(false);
  const [originalId, setOriginalId] = useState(null); // tracks original ticker when editing

  const [formData, setFormData] = useState({
    id: '', // Ticker symbol
    name: '',
    isin: '',
    type: 'Acción',
    sector: 'Tecnología',
    currency: 'EUR',
    currentPrice: '',
    country: 'España',
    apiSource: 'Yahoo Finance',
    startDate: '2024-01-01',
    endDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'name', 'type', 'sector', 'currency', 'apiSource'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-assets', DEFAULT_COLUMNS);

  // Filter and search computation - declared early to avoid Temporal Dead Zone (TDZ)
  const filteredAssets = assets.filter((asset) => {
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Assets from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const q = query(
      collection(db, 'rv_assets'),
      where('userId', 'in', targetUserIds)
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

  // Fetch asset historical prices when opening the form
  useEffect(() => {
    if (showForm && isEditing && formData.id && user) {
      const q = query(
        collection(db, 'rv_asset_history'),
        where('assetId', '==', formData.id),
        where('userId', '==', user.uid)
      );
      const unsub = onSnapshot(q, (snap) => {
        const records = snap.docs.map(d => d.data());
        records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setDbHistory(records);
      });
      return () => unsub();
    } else {
      setDbHistory([]);
    }
  }, [showForm, isEditing, formData.id, user]);

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
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Sector', dataKey: 'sector' },
          { header: 'Divisa', dataKey: 'currency' },
          { header: 'Origen API', dataKey: 'apiSource' }
        ];
        const colsToExport = allColumns.filter((c) => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Activos de Renta Variable', 'activos_rv.pdf');
      } else {
        handleExportFormat(filtered, 'Activos Renta Variable', format);
      }
    };

    window.addEventListener('rv-asset:new', onNew);
    window.addEventListener('rv-asset:edit', onEdit);
    window.addEventListener('rv-asset:delete', onDelete);
    window.addEventListener('rv-asset:export', onExport);

    return () => {
      window.removeEventListener('rv-asset:new', onNew);
      window.removeEventListener('rv-asset:edit', onEdit);
      window.removeEventListener('rv-asset:delete', onDelete);
      window.removeEventListener('rv-asset:export', onExport);
    };
  }, [assets, selectedAsset, filteredAssets, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setActiveFormTab('datos');
    setTempHistory([]);
    setFormData({
      id: '',
      name: '',
      isin: '',
      type: 'Acción',
      sector: 'Tecnología',
      currency: 'EUR',
      currentPrice: '',
      country: 'España',
      apiSource: 'Yahoo Finance',
      startDate: '2024-01-01',
      endDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setShowForm(true);
  };

  const handleEdit = (asset) => {
    setIsEditing(true);
    setOriginalId(asset.id); // track original doc ID for rename handling
    setActiveFormTab('datos');
    setTempHistory([]);
    setFormData({
      ...asset,
      apiSource: asset.apiSource || 'Yahoo Finance',
      startDate: asset.startDate || '2024-01-01',
      endDate: asset.endDate || new Date().toISOString().split('T')[0]
    });
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

  // CSV/Excel upload reader
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n');
        const parsed = [];

        // Simple parser assuming headers (Date, Close / Fecha, Cierre)
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(',');
          if (parts.length >= 2) {
            const rawDate = parts[0].trim();
            const rawClose = parseFloat(parts[1].trim());
            if (rawDate && !isNaN(rawClose)) {
              parsed.push({
                date: rawDate,
                close: rawClose
              });
            }
          }
        }

        if (parsed.length > 0) {
          setTempHistory(parsed);
          alert(`✓ Se leyeron con éxito ${parsed.length} filas del archivo CSV. Pulsa 'Guardar' para almacenarlas.`);
        } else {
          alert('No se pudo encontrar ninguna fila válida. El archivo debe contener columnas: Fecha, Cierre.');
        }
      } catch (error) {
        console.error('Error parsing CSV:', error);
        alert('Error al leer el archivo CSV: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  // Real Yahoo Finance API fetch via CORS proxy
  const handleFetchFromApi = async () => {
    if (!formData.id) {
      alert('Por favor, ingresa el Ticker primero.');
      return;
    }
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (end < start) {
      alert('La fecha final debe ser posterior a la fecha de inicio.');
      return;
    }

    setIsGenerating(true);
    
    try {
      const ticker = formData.id.trim().toUpperCase();
      const period1 = Math.floor(start.getTime() / 1000);
      const period2 = Math.floor(end.getTime() / 1000);

      let data = null;
      let errorMsg = '';

      if (formData.apiSource === 'Yahoo Finance') {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
        
        // Try multiple CORS proxies in cascade
        const proxies = [
          { url: `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
          { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`, mode: 'wrapped' },
        ];
        
        let json = null;
        let lastError = 'No se pudo conectar con ningún proxy CORS';
        
        for (const proxy of proxies) {
          try {
            const resp = await fetch(proxy.url, { signal: AbortSignal.timeout(10000) });
            if (!resp.ok) continue;
            const text = await resp.text();
            if (proxy.mode === 'wrapped') {
              const outer = JSON.parse(text);
              json = JSON.parse(outer.contents);
            } else {
              json = JSON.parse(text);
            }
            if (json?.chart?.result) break; // success
            json = null;
          } catch (e) {
            lastError = e.message;
            continue;
          }
        }
        
        if (!json) throw new Error(lastError);
        
        const result = json?.chart?.result?.[0];
        if (!result) {
          const errDetail = json?.chart?.error?.description || 'Ticker no encontrado';
          throw new Error(`Yahoo Finance: ${errDetail}. Verifica el ticker (ej. SOFI, AAPL, TEF.MC).`);
        }
        
        const timestamps = result.timestamp || [];
        const closes = result.indicators?.quote?.[0]?.close || [];
        
        data = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            close: closes[i] != null ? parseFloat(closes[i].toFixed(4)) : null
          }))
          .filter(r => r.close !== null);
          
      } else if (formData.apiSource === 'Alpha Vantage') {
        errorMsg = 'Alpha Vantage requiere una API key. Por favor usa la carga por CSV.';
      } else if (formData.apiSource === 'CoinGecko') {
        // CoinGecko free API (for crypto, by coin ID, no key needed)
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
        const cgUrl = `https://api.coingecko.com/api/v3/coins/${ticker.toLowerCase()}/market_chart?vs_currency=${formData.currency.toLowerCase()}&days=${days}`;
        const response = await fetch(cgUrl, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
        const json = await response.json();
        data = (json.prices || []).map(([ts, price]) => ({
          date: new Date(ts).toISOString().split('T')[0],
          close: parseFloat(price.toFixed(4))
        }));
      } else {
        errorMsg = `La API '${formData.apiSource}' no está implementada. Por favor usa Yahoo Finance o carga un CSV.`;
      }

      if (errorMsg) {
        alert(errorMsg);
        return;
      }

      if (!data || data.length === 0) {
        alert('No se encontraron datos para el ticker y rango de fechas indicados.\nVerifica el ticker (ejemplos: SOFI, AAPL, TEF.MC para España).');
        return;
      }

      setTempHistory(data);
      alert(`✓ Se han descargado ${data.length} registros desde ${formData.apiSource} para ${ticker}.\nPulsa 'Guardar' para almacenarlos.`);

    } catch (e) {
      console.error('API fetch error:', e);
      alert('Error al obtener datos de la API: ' + e.message + '\n\nSi el error persiste, descarga los datos manualmente y usa la opción de cargar CSV/Excel.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.id) {
      alert('Por favor, introduzca un Ticker/Símbolo válido.');
      return;
    }
    if (!formData.name) {
      alert('Por favor, introduzca el Nombre del activo.');
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

      // If ticker changed while editing, delete old document first
      if (isEditing && originalId && originalId !== docId) {
        await deleteDoc(doc(db, 'rv_assets', originalId));
      }

      await setDoc(doc(db, 'rv_assets', docId), cleanData);

      // Save historical prices if any were parsed/generated
      if (tempHistory.length > 0) {
        const batch = writeBatch(db);
        tempHistory.forEach((record) => {
          const recId = `${docId}_${record.date}`;
          const ref = doc(db, 'rv_asset_history', recId);
          batch.set(ref, {
            id: recId,
            assetId: docId,
            date: record.date,
            close: record.close,
            userId: user.uid,
            updatedAt: new Date().toISOString()
          });
        });
        await batch.commit();
      }

      setShowForm(false);
      setSelectedAsset(null);
    } catch (error) {
      console.error('Error saving asset:', error);
      alert('Error al guardar el activo: ' + error.message);
    }
  };

  const displayedHistory = useMemo(() => {
    if (tempHistory.length > 0) {
      return [...tempHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return dbHistory;
  }, [tempHistory, dbHistory]);

  const assetTypes = ['Acción', 'ETF', 'Fondo de Inversión', 'Criptomoneda', 'Otros'];
  const apiSources = ['Yahoo Finance', 'Alpha Vantage', 'Google Finance', 'Bloomberg', 'CoinGecko'];

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
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8fafc]">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300 flex items-center justify-center"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
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
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '100px' }}>Ticker</th>}
                  {visibleColumns.includes('name') && <th style={{ width: columnWidths['name'] || '200px' }}>Nombre</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '130px' }}>Tipo de activo</th>}
                  {visibleColumns.includes('sector') && <th style={{ width: columnWidths['sector'] || '140px' }}>Sector</th>}
                  {visibleColumns.includes('currency') && <th style={{ width: columnWidths['currency'] || '90px' }}>Divisa</th>}
                  {visibleColumns.includes('apiSource') && <th style={{ width: columnWidths['apiSource'] || '130px' }}>Origen API</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron activos. Registra un nuevo activo en el menú superior.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
                      className={selectedAsset?.id === asset.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td className="font-mono font-bold">{asset.id}</td>}
                      {visibleColumns.includes('name') && <td>{asset.name}</td>}
                      {visibleColumns.includes('type') && <td>{asset.type}</td>}
                      {visibleColumns.includes('sector') && <td>{asset.sector}</td>}
                      {visibleColumns.includes('currency') && <td>{asset.currency}</td>}
                      {visibleColumns.includes('apiSource') && <td className="text-gray-500">{asset.apiSource || '-'}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Asset Maintenance Form Window with 3 Tabs: Datos, Histórico, Extracto cuentas */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Activo: ${formData.id}` : 'Nuevo Activo de Renta Variable'}
            onClose={() => setShowForm(false)}
            width="650px"
            height="auto"
            initialPos={{ x: (window.innerWidth - 650) / 2, y: 100 }}
            menuItems={[
              { label: 'Datos', onClick: () => setActiveFormTab('datos') },
              { label: 'Histórico', onClick: () => setActiveFormTab('historico') },
              { label: 'Extracto cuentas', onClick: () => setActiveFormTab('extracto') },
            ]}
          >

            {/* Modal Content */}
            <div className="flex-1 overflow-auto bg-white">
              {activeFormTab === 'datos' && (
                <form onSubmit={handleSave} className="p-4 space-y-3">
                  <div className="win-form-row">
                    <label className="win-form-label">Ticker / Símbolo:</label>
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      placeholder="ej. AAPL, TEF.MC"
                      required
                      className="win-input flex-1 uppercase"
                    />
                  </div>

                  <div className="win-form-row">
                    <label className="win-form-label">Nombre:</label>
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
                    <label className="win-form-label">Tipo de activo:</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="win-input flex-1"
                    >
                      {assetTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="win-form-row">
                    <label className="win-form-label">Sector:</label>
                    <input
                      type="text"
                      value={formData.sector}
                      onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                      placeholder="ej. Tecnología, Salud"
                      className="win-input flex-1"
                    />
                  </div>

                  <div className="win-form-row">
                    <label className="win-form-label">Divisa histórico:</label>
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
                    <label className="win-form-label">Origen API:</label>
                    <select
                      value={formData.apiSource}
                      onChange={(e) => setFormData({ ...formData, apiSource: e.target.value })}
                      className="win-input flex-1"
                    >
                      {apiSources.map((src) => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>

                  <div className="win-form-row">
                    <label className="win-form-label">Rango de fechas:</label>
                    <div className="flex-1 flex space-x-2">
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        className="win-input flex-1"
                      />
                      <span className="text-[11px] self-center text-gray-500">hasta</span>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="win-input flex-1"
                      />
                    </div>
                  </div>

                  <div className="win-form-row">
                    <span className="win-form-label"></span>
                    <button
                      type="button"
                      onClick={handleFetchFromApi}
                      disabled={isGenerating}
                      className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-300 rounded text-[11px] font-bold cursor-pointer hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                      <span>{isGenerating ? 'Descargando de API...' : 'Obtener Datos de API'}</span>
                    </button>
                  </div>

                  <div className="win-form-row">
                    <label className="win-form-label">Cargar CSV/Excel:</label>
                    <label className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-slate-50 border border-slate-300 text-slate-700 rounded text-[11px] font-bold cursor-pointer hover:bg-slate-100 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Subir Archivo (.csv)</span>
                      <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                    </label>
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
              )}

              {activeFormTab === 'historico' && (
                <div className="p-4 flex flex-col h-[350px]">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Datos Históricos de Precios ({formData.id || 'NUEVO'})
                    </h4>
                    <span className="text-[10px] text-gray-500 font-bold">
                      Filas cargadas: <span className="text-blue-600">{displayedHistory.length}</span>
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto border border-gray-300 rounded-sm">
                    <table className="clean-table">
                      <thead className="sticky top-0 bg-[#f8fafc] z-10">
                        <tr>
                          <th>Fecha</th>
                          <th className="text-right">Precio de Cierre ({formData.currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedHistory.length === 0 ? (
                          <tr>
                            <td colSpan="2" className="text-center py-8 text-gray-400 font-medium">
                              No hay histórico de precios cargado. Usa el formulario Datos para importar de API o CSV.
                            </td>
                          </tr>
                        ) : (
                          displayedHistory.map((row, idx) => (
                            <tr key={idx}>
                              <td className="font-mono">{row.date}</td>
                              <td className="font-mono text-right font-bold text-slate-800">
                                {row.close.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end pt-3 mt-auto">
                    <button
                      type="button"
                      onClick={() => setActiveFormTab('datos')}
                      className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 rounded cursor-pointer transition-colors"
                    >
                      Volver a Datos
                    </button>
                  </div>
                </div>
              )}

              {activeFormTab === 'extracto' && (
                <div className="p-8 flex flex-col items-center justify-center h-[350px] text-center space-y-2">
                  <FileText className="w-10 h-10 text-gray-400" />
                  <h4 className="text-[13px] font-bold text-slate-700 uppercase">
                    Extracto de cuentas
                  </h4>
                  <p className="text-[11px] text-gray-500 max-w-sm">
                    Esta pestaña se desarrollará más adelante para consolidar los extractos y saldos de cuentas asociados a este activo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveFormTab('datos')}
                    className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 rounded cursor-pointer mt-4 transition-colors"
                  >
                    Volver a Datos
                  </button>
                </div>
              )}
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

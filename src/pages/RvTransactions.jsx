import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, Filter, RefreshCw } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';

export default function RvTransactions() {
  const { user, queryUserIds } = useAuth();
  
  // Data State
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [brokers, setBrokers] = useState([]);
  
  // UI State
  const [selectedTx, setSelectedTx] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sidebar Filters
  const [brokerFilter, setBrokerFilter] = useState('todos');
  const [assetFilter, setAssetFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    assetId: '',
    brokerId: '',
    type: 'Compra',
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    price: '',
    fee: '0',
    exchangeRate: '1.0',
    currency: 'EUR',
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'date', 'assetId', 'brokerName', 'type', 'quantity', 'price', 'fee', 'currency', 'exchangeRate', 'totalAmount'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-transactions', DEFAULT_COLUMNS);

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
      query(collection(db, 'rv_transactions'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching transactions:', err)
    );

    const unsubAssets = onSnapshot(
      query(collection(db, 'rv_assets'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setAssets(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching assets:', err)
    );

    const unsubBrokers = onSnapshot(
      query(collection(db, 'rv_brokers'), where('userId', 'in', targetUserIds)),
      (snap) => {
        setBrokers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching brokers:', err)
    );

    return () => {
      unsubTx();
      unsubAssets();
      unsubBrokers();
    };
  }, [user, queryUserIds]);

  // Read broker currency on change
  useEffect(() => {
    if (formData.brokerId) {
      const selectedBroker = brokers.find(b => b.id === formData.brokerId);
      if (selectedBroker) {
        setFormData(prev => ({
          ...prev,
          currency: selectedBroker.currency || 'EUR'
        }));
      }
    }
  }, [formData.brokerId, brokers]);

  // Filter & Search
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (brokerFilter !== 'todos' && tx.brokerId !== brokerFilter) return false;
        if (assetFilter !== 'todos' && tx.assetId !== assetFilter) return false;
        if (typeFilter !== 'todos' && tx.type !== typeFilter) return false;

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            tx.id.toLowerCase().includes(q) ||
            tx.assetId.toLowerCase().includes(q) ||
            (tx.assetName || '').toLowerCase().includes(q) ||
            (tx.brokerName || '').toLowerCase().includes(q) ||
            tx.type.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, brokerFilter, assetFilter, typeFilter, searchQuery]);

  // Ribbon Actions
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
          { header: 'Activo', dataKey: 'assetId' },
          { header: 'Broker', dataKey: 'brokerName' },
          { header: 'Tipo', dataKey: 'type' },
          { header: 'Cant.', dataKey: 'quantity' },
          { header: 'Precio', dataKey: 'price' },
          { header: 'Comis.', dataKey: 'fee' },
          { header: 'Cambio', dataKey: 'exchangeRate' },
          { header: 'Divisa', dataKey: 'currency' },
          { header: 'Total', dataKey: 'totalAmount' }
        ];
        exportToPDF(filteredTransactions, cols, 'Historial de Transacciones de Renta Variable', 'transacciones.pdf');
      } else {
        handleExportFormat(filteredTransactions, 'Transacciones Renta Variable', format);
      }
    };

    window.addEventListener('rv-transaction:new', onNew);
    window.addEventListener('rv-transaction:edit', onEdit);
    window.addEventListener('rv-transaction:delete', onDelete);
    window.addEventListener('rv-transaction:export', onExport);

    return () => {
      window.removeEventListener('rv-transaction:new', onNew);
      window.removeEventListener('rv-transaction:edit', onEdit);
      window.removeEventListener('rv-transaction:delete', onDelete);
      window.removeEventListener('rv-transaction:export', onExport);
    };
  }, [filteredTransactions, selectedTx]);

  const handleNew = () => {
    setIsEditing(false);
    const maxId = transactions.reduce((max, t) => {
      const num = parseInt(t.id.replace('TX', '')) || 0;
      return num > max ? num : max;
    }, 0);

    setFormData({
      id: `TX${String(maxId + 1).padStart(3, '0')}`,
      assetId: assets[0]?.id || '',
      brokerId: brokers[0]?.id || '',
      type: 'Compra',
      date: new Date().toISOString().split('T')[0],
      quantity: '',
      price: '',
      fee: '0',
      exchangeRate: '1.0',
      currency: brokers[0]?.currency || 'EUR',
      notes: ''
    });
    setShowForm(true);
  };

  const handleEdit = (tx) => {
    setIsEditing(true);
    setFormData({ ...tx });
    setShowForm(true);
  };

  const handleDelete = async (tx) => {
    if (window.confirm(`¿Está seguro de que desea eliminar la transacción ${tx.id}?`)) {
      try {
        await deleteDoc(doc(db, 'rv_transactions', tx.id));
        setSelectedTx(null);
      } catch (error) {
        console.error('Error deleting transaction:', error);
        alert('Error al eliminar transacción: ' + error.message);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.assetId || !formData.brokerId) {
      alert('Debe seleccionar un activo y un broker.');
      return;
    }

    try {
      const selectedAsset = assets.find(a => a.id === formData.assetId);
      const selectedBroker = brokers.find(b => b.id === formData.brokerId);

      const qty = parseFloat(formData.quantity) || 0;
      const prc = parseFloat(formData.price) || 0;
      const feeVal = parseFloat(formData.fee) || 0;
      const rate = parseFloat(formData.exchangeRate) || 1.0;

      const totalAmt = formData.type === 'Compra'
        ? qty * prc + feeVal
        : formData.type === 'Venta'
        ? qty * prc - feeVal
        : qty * prc; // Dividendo total bruto/neto

      const cleanData = {
        ...formData,
        assetName: selectedAsset?.name || formData.assetId,
        brokerName: selectedBroker?.name || formData.brokerId,
        quantity: qty,
        price: prc,
        fee: feeVal,
        exchangeRate: rate,
        totalAmount: totalAmt,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'rv_transactions', formData.id), cleanData);
      setShowForm(false);
      setSelectedTx(null);
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error al guardar la transacción: ' + error.message);
    }
  };

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
              {/* Broker Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold block mb-1">Filtrar por Broker:</label>
                <select
                  value={brokerFilter}
                  onChange={(e) => setBrokerFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Brokers</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Asset Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold block mb-1">Filtrar por Activo:</label>
                <select
                  value={assetFilter}
                  onChange={(e) => setAssetFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Activos</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>{a.id} - {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Type Filter */}
              <div className="space-y-1">
                <label className="text-slate-700 font-bold block mb-1">Tipo de Operación:</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="win-input w-full"
                >
                  <option value="todos">Todos los Tipos</option>
                  <option value="Compra">Compra</option>
                  <option value="Venta">Venta</option>
                  <option value="Dividendo">Dividendo</option>
                </select>
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
                placeholder="Buscar transacción..."
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
                  {visibleColumns.includes('id') && <th style={{ width: columnWidths['id'] || '100px' }}>ID Transacción</th>}
                  {visibleColumns.includes('date') && <th style={{ width: columnWidths['date'] || '110px' }}>Fecha</th>}
                  {visibleColumns.includes('assetId') && <th style={{ width: columnWidths['assetId'] || '110px' }}>Activo (Ticker)</th>}
                  {visibleColumns.includes('brokerName') && <th style={{ width: columnWidths['brokerName'] || '180px' }}>Broker</th>}
                  {visibleColumns.includes('type') && <th style={{ width: columnWidths['type'] || '100px' }}>Tipo</th>}
                  {visibleColumns.includes('quantity') && <th style={{ width: columnWidths['quantity'] || '100px', textAlign: 'right' }}>Cantidad</th>}
                  {visibleColumns.includes('price') && <th style={{ width: columnWidths['price'] || '110px', textAlign: 'right' }}>Precio Unit.</th>}
                  {visibleColumns.includes('fee') && <th style={{ width: columnWidths['fee'] || '90px', textAlign: 'right' }}>Comisiones</th>}
                  {visibleColumns.includes('currency') && <th style={{ width: columnWidths['currency'] || '80px' }}>Divisa</th>}
                  {visibleColumns.includes('exchangeRate') && <th style={{ width: columnWidths['exchangeRate'] || '90px', textAlign: 'right' }}>Cambio</th>}
                  {visibleColumns.includes('totalAmount') && <th style={{ width: columnWidths['totalAmount'] || '130px', textAlign: 'right' }}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron transacciones. Añada una nueva desde el menú superior.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(selectedTx?.id === tx.id ? null : tx)}
                      onDoubleClick={() => handleEdit(tx)}
                      className={selectedTx?.id === tx.id ? 'selected' : ''}
                    >
                      {visibleColumns.includes('id') && <td className="font-mono">{tx.id}</td>}
                      {visibleColumns.includes('date') && <td>{tx.date}</td>}
                      {visibleColumns.includes('assetId') && <td className="font-bold">{tx.assetId}</td>}
                      {visibleColumns.includes('brokerName') && <td>{tx.brokerName}</td>}
                      {visibleColumns.includes('type') && (
                        <td>
                          <span
                            className={`px-1.5 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-wider ${
                              tx.type === 'Compra'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : tx.type === 'Venta'
                                ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                : 'bg-green-100 text-green-800 border border-green-200'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('quantity') && <td className="font-mono text-right">{tx.quantity.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 6 })}</td>}
                      {visibleColumns.includes('price') && <td className="font-mono text-right">{tx.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>}
                      {visibleColumns.includes('fee') && <td className="font-mono text-right">{tx.fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>}
                      {visibleColumns.includes('currency') && <td>{tx.currency}</td>}
                      {visibleColumns.includes('exchangeRate') && <td className="font-mono text-right">{tx.exchangeRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>}
                      {visibleColumns.includes('totalAmount') && (
                        <td className="font-mono text-right font-bold text-slate-800">
                          {tx.totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
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

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{filteredTransactions.length} transacciones encontradas</div>
        <ZoomControl />
      </div>

      {/* Transaction Entry Form Modal Window (Photo 3 design) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Transacción: ${formData.id}` : 'Nueva Transacción de Renta Variable'}
            onClose={() => setShowForm(false)}
            width="550px"
            height="auto"
            initialPos={{ x: (window.innerWidth - 550) / 2, y: 100 }}
          >
            <form onSubmit={handleSave} className="p-4 space-y-3 bg-white">
              
              <div className="win-form-row">
                <label className="win-form-label">ID Transacción:</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  placeholder="ej. TX001"
                  disabled={isEditing}
                  required
                  className="win-input flex-1 uppercase font-mono"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Activo (Ticker):</label>
                <select
                  value={formData.assetId}
                  onChange={(e) => setFormData({ ...formData, assetId: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="" disabled>-- Seleccione un Activo --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Broker:</label>
                <select
                  value={formData.brokerId}
                  onChange={(e) => setFormData({ ...formData, brokerId: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="" disabled>-- Seleccione un Broker --</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo Operación:</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="Compra">Compra</option>
                  <option value="Venta">Venta</option>
                  <option value="Dividendo">Dividendo</option>
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Fecha:</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Cantidad (Títulos):</label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="ej. 10"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">
                  {formData.type === 'Dividendo' ? 'Importe bruto por Título:' : 'Precio Unitario:'}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="ej. 150.25"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Comisiones:</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.fee}
                  onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                  placeholder="0"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Tipo Cambio (USD/EUR...):</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.exchangeRate}
                  onChange={(e) => setFormData({ ...formData, exchangeRate: e.target.value })}
                  placeholder="1,0"
                  required
                  className="win-input flex-1"
                />
              </div>

              <div className="win-form-row">
                <label className="win-form-label">Divisa:</label>
                <input
                  type="text"
                  value={formData.currency}
                  readOnly
                  disabled
                  className="win-input flex-1 bg-slate-100 font-bold text-slate-800"
                />
              </div>

              {/* Action Buttons (Photo 3 design) */}
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
                  className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold rounded cursor-pointer transition-colors flex items-center space-x-1"
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

import { useState, useEffect, useMemo } from 'react';
import { useTableFilters } from '../hooks/useTableFilters';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, Filter, RefreshCw } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import ResizableSidebar from '../components/ResizableSidebar';
import { useOutletContext } from 'react-router-dom';

export default function RvTransactions() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
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
    divisaAssetId: '',
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'date', 'assetId', 'brokerName', 'type', 'quantity', 'price', 'fee', 'currency', 'exchangeRate', 'totalAmount'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-transactions', DEFAULT_COLUMNS);
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

  // Default currency to asset currency when assetId changes
  useEffect(() => {
    if (formData.assetId) {
      const selectedAsset = assets.find(a => a.id === formData.assetId);
      if (selectedAsset) {
        setFormData(prev => ({
          ...prev,
          currency: selectedAsset.currency || 'EUR'
        }));
      }
    }
  }, [formData.assetId, assets]);

  const [divisaHistory, setDivisaHistory] = useState([]);

  // Fetch history for selected Divisa asset
  useEffect(() => {
    if (!formData.divisaAssetId || !user) {
      setDivisaHistory([]);
      return;
    }
    const q = query(
      collection(db, 'rv_asset_history'),
      where('assetId', '==', formData.divisaAssetId),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => d.data());
      records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDivisaHistory(records);
    });
    return () => unsub();
  }, [formData.divisaAssetId, user]);

  // Suggest exchange rate based on date and divisa history
  useEffect(() => {
    if (divisaHistory.length > 0 && formData.date) {
      const txTime = new Date(formData.date).getTime();
      const match = divisaHistory.find(r => new Date(r.date).getTime() <= txTime);
      if (match) {
        setFormData(prev => ({
          ...prev,
          exchangeRate: String(match.close)
        }));
      }
    }
  }, [formData.date, divisaHistory]);

  const handleSaveField = async (tx, field, newVal) => {
    try {
      const docRef = doc(db, 'rv_transactions', tx.id);
      let updatedObj = { ...tx };
      
      let processedVal = newVal;
      const numFields = ['quantity', 'price', 'fee', 'exchangeRate'];
      if (numFields.includes(field)) {
        processedVal = parseFloat(newVal) || 0;
      }
      updatedObj[field] = processedVal;

      // Recalculate totalAmount
      const qty = parseFloat(updatedObj.quantity) || 0;
      const prc = parseFloat(updatedObj.price) || 0;
      const feeVal = parseFloat(updatedObj.fee) || 0;
      const rate = parseFloat(updatedObj.exchangeRate) || 1.0;
      const isCompra = updatedObj.type === 'Compra';
      const isVenta = updatedObj.type === 'Venta';

      let totalAmt = 0;
      if (isCompra) {
        totalAmt = qty * prc + feeVal;
      } else if (isVenta) {
        totalAmt = qty * prc - feeVal;
      } else {
        totalAmt = qty * prc;
      }
      updatedObj.totalAmount = totalAmt;

      // Also set assetName/brokerName if assetId or brokerId changed
      if (field === 'assetId') {
        const matched = assets.find(a => a.id === newVal);
        updatedObj.assetName = matched ? matched.name : newVal;
      }
      if (field === 'brokerId') {
        const matched = brokers.find(b => b.id === newVal);
        updatedObj.brokerName = matched ? matched.name : newVal;
        updatedObj.currency = matched ? (matched.currency || 'EUR') : 'EUR';
      }

      await setDoc(docRef, updatedObj);
    } catch (err) {
      console.error("Error updating transaction field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = transactions.reduce((max, tx) => {
        const num = parseInt(tx.id?.replace('TX', '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `TX${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        id: newId,
        assetId: assets[0]?.id || '',
        assetName: assets[0]?.name || '',
        brokerId: brokers[0]?.id || '',
        brokerName: brokers[0]?.name || '',
        type: 'Compra',
        date: new Date().toISOString().split('T')[0],
        quantity: 0,
        price: 0,
        fee: 0,
        exchangeRate: 1.0,
        currency: 'EUR',
        totalAmount: 0,
        notes: '',
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'rv_transactions', newId), newRecord);
      setSelectedTx(newRecord);
    } catch (err) {
      console.error("Error creating new transaction:", err);
    }
  };

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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedTx) {
          const displayed = filteredTransactions;
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            if (selectedTx.id === lastItem.id) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTx, filteredTransactions, transactions, assets, brokers, user]);

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

    const defaultAsset = assets[0];
    const defaultCurrency = defaultAsset?.currency || 'EUR';

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
      currency: defaultCurrency,
      divisaAssetId: '',
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
          <ResizableSidebar className=" bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
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
          </ResizableSidebar>
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
            <table style={{ zoom: tableZoom }} className="clean-table">
              <thead>
                <tr>
                  
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<th
 key="id" style={{ width: columnWidths['id'] || '100px' }}>ID Transacción</th>);
                    case 'date': return (<th
 key="date" style={{ width: columnWidths['date'] || '110px' }}>Fecha</th>);
                    case 'assetId': return (<th
 key="assetId" style={{ width: columnWidths['assetId'] || '110px' }}>Activo (Ticker)</th>);
                    case 'brokerName': return (<th
 key="brokerName" style={{ width: columnWidths['brokerName'] || '180px' }}>Broker</th>);
                    case 'type': return (<th
 key="type" style={{ width: columnWidths['type'] || '100px' }}>Tipo</th>);
                    case 'quantity': return (<th
 key="quantity" style={{ width: columnWidths['quantity'] || '100px', textAlign: 'right' }}>Cantidad</th>);
                    case 'price': return (<th
 key="price" style={{ width: columnWidths['price'] || '110px', textAlign: 'right' }}>Precio Unit.</th>);
                    case 'fee': return (<th
 key="fee" style={{ width: columnWidths['fee'] || '90px', textAlign: 'right' }}>Comisiones</th>);
                    case 'currency': return (<th
 key="currency" style={{ width: columnWidths['currency'] || '80px' }}>Divisa</th>);
                    case 'exchangeRate': return (<th
 key="exchangeRate" style={{ width: columnWidths['exchangeRate'] || '90px', textAlign: 'right' }}>Cambio</th>);
                    case 'totalAmount': return (<th
 key="totalAmount" style={{ width: columnWidths['totalAmount'] || '130px', textAlign: 'right' }}>Total</th>);
                    default: return null;
                    }
                  })}
    
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
                      
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<td
 key="id" className="font-mono">{tx.id}</td>);
                    case 'date': return (<EditableCell
 key="date"
                          type="date"
                          value={tx.date}
                          onSave={(val) => handleSaveField(tx, 'date', val)}
                        />);
                    case 'assetId': return (<EditableCell
 key="assetId"
                          className="font-bold"
                          value={tx.assetId}
                          options={assets.map((a) => ({ id: a.id, name: `${a.id} - ${a.name}` }))}
                          onSave={(val) => handleSaveField(tx, 'assetId', val)}
                        />);
                    case 'brokerName': return (<EditableCell
 key="brokerName"
                          value={tx.brokerId}
                          options={brokers.map((b) => ({ id: b.id, name: b.name }))}
                          onSave={(val) => handleSaveField(tx, 'brokerId', val)}
                        />);
                    case 'type': return (<EditableCell
 key="type"
                          value={tx.type}
                          options={['Compra', 'Venta', 'Dividendo']}
                          onSave={(val) => handleSaveField(tx, 'type', val)}
                        >
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
                        </EditableCell>);
                    case 'quantity': return (<EditableCell
 key="quantity"
                          type="number"
                          className="font-mono text-right"
                          value={tx.quantity}
                          onSave={(val) => handleSaveField(tx, 'quantity', val)}
                        >
                          {tx.quantity.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 6 })}
                        </EditableCell>);
                    case 'price': return (<EditableCell
 key="price"
                          type="number"
                          className="font-mono text-right"
                          value={tx.price}
                          onSave={(val) => handleSaveField(tx, 'price', val)}
                        >
                          {tx.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </EditableCell>);
                    case 'fee': return (<EditableCell
 key="fee"
                          type="number"
                          className="font-mono text-right"
                          value={tx.fee}
                          onSave={(val) => handleSaveField(tx, 'fee', val)}
                        >
                          {tx.fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                        </EditableCell>);
                    case 'currency': return (<EditableCell
 key="currency"
                          value={tx.currency}
                          options={['EUR', 'USD', 'GBP', 'CHF']}
                          onSave={(val) => handleSaveField(tx, 'currency', val)}
                        />);
                    case 'exchangeRate': return (<EditableCell
 key="exchangeRate"
                          type="number"
                          className="font-mono text-right"
                          value={tx.exchangeRate}
                          onSave={(val) => handleSaveField(tx, 'exchangeRate', val)}
                        >
                          {tx.exchangeRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </EditableCell>);
                    case 'totalAmount': return (<td
 key="totalAmount" className="font-mono text-right font-bold text-slate-800">
                          {tx.totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
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
                <label className="win-form-label">Divisa:</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  required
                  className="win-input flex-1"
                >
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CHF">CHF (Fr.)</option>
                  <option value="JPY">JPY (¥)</option>
                </select>
              </div>

              <div className="win-form-row">
                <label className="win-form-label font-bold text-blue-800">Ref. Divisa (Tipo Cambio):</label>
                <select
                  value={formData.divisaAssetId || ''}
                  onChange={(e) => setFormData({ ...formData, divisaAssetId: e.target.value })}
                  className="win-input flex-1"
                >
                  <option value="">-- Sin referencia de Divisa --</option>
                  {assets
                    .filter(a => a.type && a.type.toLowerCase() === 'divisa')
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.id} - {a.name}
                      </option>
                    ))
                  }
                </select>
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

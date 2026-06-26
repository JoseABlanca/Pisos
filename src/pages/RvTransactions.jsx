import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft, Filter, RefreshCw } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import RvTransactionModal from '../components/RvTransactionModal';

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



  const DEFAULT_COLUMNS = ['id', 'date', 'assetId', 'brokerName', 'type', 'quantity', 'price', 'priceEUR', 'fee', 'currency', 'exchangeRate', 'totalAmount', 'totalAmountEUR'];
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



  // Filter & Search
  const filteredTransactions = useMemo(() => {
    const basicFiltered = transactions
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

    return applyTableFilters(basicFiltered, 'rv-transactions');
  }, [transactions, brokerFilter, assetFilter, typeFilter, searchQuery, applyTableFilters]);

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
    setShowForm(true);
  };

  const handleEdit = (tx) => {
    setIsEditing(true);
    setShowForm(true);
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
            
            <div className="p-4 text-[11px] space-y-5 flex-1 overflow-auto">
              {/* Broker Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold block border-b border-gray-200 pb-1">Filtrar por Broker:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brokerFilter"
                      checked={brokerFilter === 'todos'}
                      onChange={() => setBrokerFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={brokerFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todos los Brokers
                    </span>
                  </label>
                  {brokers.map((b) => (
                    <label key={b.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="brokerFilter"
                        checked={brokerFilter === b.id}
                        onChange={() => setBrokerFilter(b.id)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                      />
                      <span className={brokerFilter === b.id ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {b.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Asset Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold block border-b border-gray-200 pb-1">Filtrar por Activo:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="assetFilter"
                      checked={assetFilter === 'todos'}
                      onChange={() => setAssetFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={assetFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todos los Activos
                    </span>
                  </label>
                  {assets.map((a) => (
                    <label key={a.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="assetFilter"
                        checked={assetFilter === a.id}
                        onChange={() => setAssetFilter(a.id)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                      />
                      <span className={assetFilter === a.id ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {a.id} - {a.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold block border-b border-gray-200 pb-1">Tipo de Operación:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="typeFilter"
                      checked={typeFilter === 'todos'}
                      onChange={() => setTypeFilter('todos')}
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                    />
                    <span className={typeFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                      Todos los Tipos
                    </span>
                  </label>
                  {['Compra', 'Venta', 'Dividendo'].map((t) => (
                    <label key={t} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="typeFilter"
                        checked={typeFilter === t}
                        onChange={() => setTypeFilter(t)}
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs"
                      />
                      <span className={typeFilter === t ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {t}
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
                  {visibleColumns.includes('id') && (
                    <TableHeaderWithFilter 
                      label="ID Transacción" 
                      columnKey="id" 
                      data={transactions} 
                      tableId="rv-transactions" 
                    />
                  )}
                  {visibleColumns.includes('date') && (
                    <TableHeaderWithFilter 
                      label="Fecha" 
                      columnKey="date" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-left"
                    />
                  )}
                  {visibleColumns.includes('assetId') && (
                    <TableHeaderWithFilter 
                      label="Activo (Ticker)" 
                      columnKey="assetId" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-left"
                    />
                  )}
                  {visibleColumns.includes('brokerName') && (
                    <TableHeaderWithFilter 
                      label="Broker" 
                      columnKey="brokerName" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-left"
                    />
                  )}
                  {visibleColumns.includes('type') && (
                    <TableHeaderWithFilter 
                      label="Tipo" 
                      columnKey="type" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-left"
                    />
                  )}
                  {visibleColumns.includes('quantity') && (
                    <TableHeaderWithFilter 
                      label="Cantidad" 
                      columnKey="quantity" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('price') && (
                    <TableHeaderWithFilter 
                      label="Precio Unit." 
                      columnKey="price" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('priceEUR') && (
                    <TableHeaderWithFilter 
                      label="Precio (EUR)" 
                      columnKey="priceEUR" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('fee') && (
                    <TableHeaderWithFilter 
                      label="Comisiones" 
                      columnKey="fee" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('exchangeRate') && (
                    <TableHeaderWithFilter 
                      label="Cambio" 
                      columnKey="exchangeRate" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('currency') && (
                    <TableHeaderWithFilter 
                      label="Divisa" 
                      columnKey="currency" 
                      data={transactions} 
                      tableId="rv-transactions" 
                    />
                  )}
                  {visibleColumns.includes('totalAmount') && (
                    <TableHeaderWithFilter 
                      label="Total" 
                      columnKey="totalAmount" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
                  {visibleColumns.includes('totalAmountEUR') && (
                    <TableHeaderWithFilter 
                      label="Total (EUR)" 
                      columnKey="totalAmountEUR" 
                      data={transactions} 
                      tableId="rv-transactions" 
                      className="text-right"
                    />
                  )}
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
                            className={`text-[9px] font-bold uppercase tracking-wider ${
                              tx.type === 'Compra'
                                ? 'text-blue-600'
                                : tx.type === 'Venta'
                                ? 'text-orange-600'
                                : 'text-green-600'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('quantity') && <td className="font-mono text-right">{tx.quantity.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 6 })}</td>}
                      {visibleColumns.includes('price') && <td className="font-mono text-right">{tx.price.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>}
                      {visibleColumns.includes('priceEUR') && (
                        <td className="font-mono text-right text-blue-800 font-semibold">
                          {(tx.priceEUR !== undefined ? tx.priceEUR : (tx.price / (tx.exchangeRate || 1))).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
                        </td>
                      )}
                      {visibleColumns.includes('fee') && <td className="font-mono text-right">{tx.fee.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>}
                      {visibleColumns.includes('exchangeRate') && <td className="font-mono text-right">{tx.exchangeRate.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>}
                      {visibleColumns.includes('currency') && <td>{tx.currency}</td>}
                      {visibleColumns.includes('totalAmount') && (
                        <td className="font-mono text-right font-bold text-slate-800">
                          {tx.totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
                        </td>
                      )}
                      {visibleColumns.includes('totalAmountEUR') && (
                        <td className="font-mono text-right font-bold text-blue-900">
                          {(tx.totalAmountEUR !== undefined ? tx.totalAmountEUR : (tx.totalAmount / (tx.exchangeRate || 1))).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
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

      {/* Transaction Entry Form Modal Window */}
      <RvTransactionModal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedTx(null);
        }}
        userId={user.uid}
        assets={assets}
        brokers={brokers}
        transactions={transactions}
        editTx={isEditing ? selectedTx : null}
      />
      {renderFilterMenu()}
    </div>
  );
}

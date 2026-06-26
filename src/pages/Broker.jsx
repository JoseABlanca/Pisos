import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Search, Plus, Trash2, Edit, Save, X, Download, PanelLeft } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import AccountingEntryModal from '../components/AccountingEntryModal';
import { deleteJournalEntry } from '../services/accounting';

export default function Broker() {
  const { user, queryUserIds } = useAuth();
  const [brokers, setBrokers] = useState([]);
  const [transactions, setTransactions] = useState([]); // to show ledger in Extractos tab
  const [selectedBroker, setSelectedBroker] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [activeFormTab, setActiveFormTab] = useState('datos'); // 'datos' | 'extractos' | 'transacciones'
  const [showModalSidebar, setShowModalSidebar] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editEntryForModal, setEditEntryForModal] = useState(null);

  const [formData, setFormData] = useState({
    id: '', // Format BR001
    name: '',
    accountNumber: '', // cash account number
    regulation: 'CNMV (España)',
    currency: 'EUR',
    cashBalance: '',
    accountingAccount: '',
    status: 'activo',
    notes: ''
  });

  const DEFAULT_COLUMNS = ['id', 'name', 'accountNumber', 'currency', 'status'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rv-brokers', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  // Filter and search computation - declared early to avoid Temporal Dead Zone (TDZ)
  const filteredBrokers = useMemo(() => {
    const basicFiltered = brokers.filter((broker) => {
      // Status Filter
      if (statusFilter !== 'todos' && broker.status !== statusFilter) return false;

      // Search Query
      if (searchQuery) {
        const queryStr = searchQuery.toLowerCase();
        return (
          broker.id.toLowerCase().includes(queryStr) ||
          broker.name.toLowerCase().includes(queryStr) ||
          (broker.accountNumber || '').toLowerCase().includes(queryStr) ||
          (broker.regulation || '').toLowerCase().includes(queryStr)
        );
      }

      return true;
    });

    return applyTableFilters(basicFiltered, 'rv-brokers');
  }, [brokers, statusFilter, searchQuery, applyTableFilters]);

  // Filter transactions for the active broker in the modal
  const brokerTransactions = transactions
    .filter(t => t.brokerId === formData.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate accounting account balance (Suma cargos (debit) - Suma abonos (credit))
  const accountBalance = useMemo(() => {
    if (!formData.accountingAccount || journalEntries.length === 0) return 0;
    let totalDebit = 0;
    let totalCredit = 0;
    
    journalEntries.forEach(entry => {
      if (!entry.lines) return;
      entry.lines.forEach(line => {
        const code = line.accountCode || accounts.find(a => a.id === line.accountId)?.code;
        if (code === formData.accountingAccount) {
          totalDebit += parseFloat(line.debit) || 0;
          totalCredit += parseFloat(line.credit) || 0;
        }
      });
    });
    
    return totalDebit - totalCredit;
  }, [formData.accountingAccount, journalEntries, accounts]);

  // Filter journal entries for the active linked account in the modal
  const accountEntries = useMemo(() => {
    if (!formData.accountingAccount || journalEntries.length === 0) return [];
    return journalEntries
      .filter(entry => {
        if (!entry.lines) return false;
        return entry.lines.some(line => {
          const code = line.accountCode || accounts.find(a => a.id === line.accountId)?.code;
          return code === formData.accountingAccount;
        });
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [formData.accountingAccount, journalEntries, accounts]);

  const handleModifyEntry = (entry) => {
    setEditEntryForModal(entry);
    setShowEntryModal(true);
  };

  const handleDeleteEntry = async (entry) => {
    if (window.confirm(`¿Está seguro de que desea eliminar el asiento contable con concepto "${entry.description}"?`)) {
      try {
        await deleteJournalEntry(user.uid, entry.id, entry.lines);
        alert('Asiento eliminado con éxito.');
      } catch (error) {
        console.error('Error deleting journal entry:', error);
        alert('Error al eliminar asiento: ' + error.message);
      }
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Brokers from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const q = query(
      collection(db, 'rv_brokers'),
      where('userId', 'in', targetUserIds)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setBrokers(data);
      },
      (err) => console.error('Error fetching brokers:', err)
    );

    // Also fetch transactions to feed the Extractos tab
    const qTx = query(
      collection(db, 'rv_transactions'),
      where('userId', 'in', targetUserIds)
    );

    const unsubTx = onSnapshot(
      qTx,
      (snap) => {
        setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      },
      (err) => console.error('Error fetching transactions for brokers:', err)
    );

    // Fetch accounts
    const qAcc = query(
      collection(db, 'accounts'),
      where('userId', 'in', targetUserIds)
    );
    const unsubAcc = onSnapshot(
      qAcc,
      (snap) => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('Error fetching accounts for brokers:', err)
    );

    // Fetch journal entries
    const qJe = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', targetUserIds)
    );
    const unsubJe = onSnapshot(
      qJe,
      (snap) => {
        setJournalEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error('Error fetching journal entries for brokers:', err)
    );

    return () => {
      unsub();
      unsubTx();
      unsubAcc();
      unsubJe();
    };
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
          { header: 'ID Broker', dataKey: 'id' },
          { header: 'Nombre Broker', dataKey: 'name' },
          { header: 'Nº de Cuenta', dataKey: 'accountNumber' },
          { header: 'Tipo de divisa', dataKey: 'currency' },
          { header: 'Estado', dataKey: 'status' }
        ];
        const colsToExport = allColumns.filter((c) => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Brokers', 'brokers.pdf');
      } else {
        handleExportFormat(filtered, 'Brokers Renta Variable', format);
      }
    };

    window.addEventListener('rv-broker:new', onNew);
    window.addEventListener('rv-broker:edit', onEdit);
    window.addEventListener('rv-broker:delete', onDelete);
    window.addEventListener('rv-broker:export', onExport);

    return () => {
      window.removeEventListener('rv-broker:new', onNew);
      window.removeEventListener('rv-broker:edit', onEdit);
      window.removeEventListener('rv-broker:delete', onDelete);
      window.removeEventListener('rv-broker:export', onExport);
    };
  }, [brokers, selectedBroker, filteredBrokers, visibleColumns]);

  const handleNew = () => {
    setIsEditing(false);
    setActiveFormTab('datos');
    // Find highest ID to auto-generate
    const maxId = brokers.reduce((max, b) => {
      const num = parseInt(b.id.replace('BR', '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({
      id: `BR${String(maxId + 1).padStart(3, '0')}`,
      name: '',
      accountNumber: '',
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
    setActiveFormTab('datos');
    setFormData({
      ...broker,
      accountNumber: broker.accountNumber || '',
      accountingAccount: broker.accountingAccount || ''
    });
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
              {/* Status Filter */}
              <div className="space-y-2">
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
                  {visibleColumns.includes('id') && (
                    <TableHeaderWithFilter 
                      label="ID Broker" 
                      columnKey="id" 
                      data={brokers} 
                      tableId="rv-brokers" 
                    />
                  )}
                  {visibleColumns.includes('name') && (
                    <TableHeaderWithFilter 
                      label="Nombre Broker" 
                      columnKey="name" 
                      data={brokers} 
                      tableId="rv-brokers" 
                    />
                  )}
                  {visibleColumns.includes('accountNumber') && (
                    <TableHeaderWithFilter 
                      label="Número de cuenta" 
                      columnKey="accountNumber" 
                      data={brokers} 
                      tableId="rv-brokers" 
                    />
                  )}
                  {visibleColumns.includes('currency') && (
                    <TableHeaderWithFilter 
                      label="Tipo de divisa" 
                      columnKey="currency" 
                      data={brokers} 
                      tableId="rv-brokers" 
                    />
                  )}
                  {visibleColumns.includes('status') && (
                    <TableHeaderWithFilter 
                      label="Estado" 
                      columnKey="status" 
                      data={brokers} 
                      tableId="rv-brokers" 
                    />
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredBrokers.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No se encontraron brokers. Añade uno nuevo desde el menú superior.
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
                      {visibleColumns.includes('accountNumber') && <td>{broker.accountNumber || '-'}</td>}
                      {visibleColumns.includes('currency') && <td>{broker.currency}</td>}
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
          <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
            <div>{filteredBrokers.length} brokers encontrados</div>
            <ZoomControl />
          </div>
        </div>
      </div>

      {/* Broker Maintenance Form Window (Modal with persistent Sidebar) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-xs flex items-center justify-center z-[200]">
          <Window
            title={isEditing ? `Modificar Broker: ${formData.id}` : 'Nuevo Broker de Renta Variable'}
            onClose={() => setShowForm(false)}
            width={isMobile ? "100%" : "850px"}
            height={isMobile ? "100%" : "600px"}
            initialPos={{ x: (window.innerWidth - (isMobile ? window.innerWidth : 850)) / 2, y: 100 }}
            onMenuClick={() => setShowModalSidebar(!showModalSidebar)}
          >
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
              {/* Sidebar */}
              {showModalSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    <button
                      onClick={() => { setActiveFormTab('datos'); if (isMobile) setShowModalSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                        activeFormTab === 'datos'
                          ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                          : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                      }`}
                    >
                      Datos
                    </button>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => { setActiveFormTab('extractos'); if (isMobile) setShowModalSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                          activeFormTab === 'extractos'
                            ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                            : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                        }`}
                      >
                        Extractos
                      </button>
                    )}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => { setActiveFormTab('transacciones'); if (isMobile) setShowModalSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                          activeFormTab === 'transacciones'
                            ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                            : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                        }`}
                      >
                        Transacciones
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Mobile backdrop */}
              {isMobile && showModalSidebar && (
                <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowModalSidebar(false)} />
              )}

              {/* Main Content Area */}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full flex flex-col">
                    
                    {activeFormTab === 'datos' && (
                      <form id="broker-form" onSubmit={handleSave} className="space-y-3 flex-1">
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
                          <label className="win-form-label">Número de cuenta:</label>
                          <input
                            type="text"
                            value={formData.accountNumber}
                            onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                            placeholder="ej. U1234567-A (nexo o efectivo)"
                            className="win-input flex-1"
                          />
                        </div>

                        <div className="win-form-row">
                          <label className="win-form-label">Tipo de divisa:</label>
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

                        <div className="win-form-row">
                          <label className="win-form-label">Cuenta Contable:</label>
                          <SearchableAccountSelect
                            accounts={accounts}
                            value={formData.accountingAccount || ''}
                            onChange={(val) => setFormData({ ...formData, accountingAccount: val })}
                          />
                        </div>

                        <div className="win-form-row">
                          <label className="win-form-label">Total de la cuenta:</label>
                          <input
                            type="text"
                            value={`${accountBalance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                            readOnly
                            disabled
                            className="win-input flex-1 bg-slate-100 font-bold text-blue-900 font-mono"
                          />
                        </div>

                        {isEditing && formData.accountingAccount && (
                          <div className="win-form-row">
                            <span className="win-form-label">Asiento Contable:</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditEntryForModal(null);
                                setShowEntryModal(true);
                              }}
                              className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[11px] font-bold rounded cursor-pointer transition-colors"
                            >
                              Crear asiento contable
                            </button>
                          </div>
                        )}
                      </form>
                    )}

                    {activeFormTab === 'extractos' && (
                      <div className="flex flex-col flex-1 min-h-0">
                        <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Extracto de movimientos para {formData.name}
                        </h4>
                        <div className="flex-1 overflow-auto border border-gray-300 rounded-sm">
                          <table className="clean-table">
                            <thead className="sticky top-0 bg-[#f8fafc] z-10">
                              <tr>
                                <th style={{ width: '90px' }}>Fecha</th>
                                <th style={{ width: '80px' }}>Activo</th>
                                <th style={{ width: '80px' }}>Tipo</th>
                                <th style={{ width: '90px' }}>Cantidad</th>
                                <th style={{ width: '100px' }}>Precio</th>
                                <th style={{ width: '110px' }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {brokerTransactions.length === 0 ? (
                                <tr>
                                  <td colSpan="6" className="text-center py-8 text-gray-400 font-medium">
                                    No hay transacciones registradas para este broker.
                                  </td>
                                </tr>
                              ) : (
                                brokerTransactions.map((tx) => (
                                  <tr key={tx.id}>
                                    <td>{tx.date}</td>
                                    <td className="font-bold">{tx.assetId}</td>
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
                                    <td className="font-mono text-right">{tx.quantity}</td>
                                    <td className="font-mono text-right">
                                      {tx.price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="font-mono text-right font-bold text-slate-800">
                                      {tx.totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {tx.currency}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {activeFormTab === 'transacciones' && (
                      <div className="flex flex-col flex-1 min-h-0">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Asientos Contables para {formData.accountingAccount}
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEditEntryForModal(null);
                              setShowEntryModal(true);
                            }}
                            className="px-3 py-1 bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[10px] font-bold rounded cursor-pointer transition-colors flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Crear asiento</span>
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto border border-gray-300 rounded-sm">
                          <table className="clean-table">
                            <thead className="sticky top-0 bg-[#f8fafc] z-10">
                              <tr>
                                <th style={{ width: '90px' }}>Fecha</th>
                                <th style={{ width: '120px' }}>Asiento ID</th>
                                <th>Concepto</th>
                                <th style={{ width: '90px', textAlign: 'right' }}>Debe</th>
                                <th style={{ width: '90px', textAlign: 'right' }}>Haber</th>
                                <th style={{ width: '120px', textAlign: 'center' }}>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accountEntries.length === 0 ? (
                                <tr>
                                  <td colSpan="6" className="text-center py-8 text-gray-400 font-medium">
                                    No hay asientos contables registrados para esta cuenta.
                                  </td>
                                </tr>
                              ) : (
                                accountEntries.map((entry) => {
                                  const relevantLines = entry.lines.filter(l => {
                                    const code = l.accountCode || accounts.find(a => a.id === l.accountId)?.code;
                                    return code === formData.accountingAccount;
                                  });
                                  const debitVal = relevantLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
                                  const creditVal = relevantLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
                                  
                                  return (
                                    <tr key={entry.id}>
                                      <td>{entry.date}</td>
                                      <td className="font-mono text-gray-500">{entry.id}</td>
                                      <td>{entry.description}</td>
                                      <td className="font-mono text-right text-green-700">
                                        {debitVal > 0 ? `${debitVal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '-'}
                                      </td>
                                      <td className="font-mono text-right text-red-700">
                                        {creditVal > 0 ? `${creditVal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '-'}
                                      </td>
                                      <td className="text-center space-x-2">
                                        <button
                                          type="button"
                                          onClick={() => handleModifyEntry(entry)}
                                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline"
                                        >
                                          Modificar
                                        </button>
                                        <span className="text-gray-300">|</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteEntry(entry)}
                                          className="text-[10px] text-red-600 hover:text-red-800 font-bold hover:underline"
                                        >
                                          Eliminar
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                </div>

                {/* Action Buttons (styled like RealEstate.jsx) */}
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  {activeFormTab === 'datos' ? (
                    <>
                      <button
                        type="submit"
                        form="broker-form"
                        className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer"
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase cursor-pointer"
                    >
                      Cerrar
                    </button>
                  )}
                </div>

              </div>
            </div>
          </Window>
        </div>
      )}
      {showEntryModal && (
        <AccountingEntryModal
          isOpen={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          onSaveSuccess={() => {}}
          userId={user.uid}
          defaultDate={new Date().toISOString().split('T')[0]}
          defaultDescription={`Ajuste broker ${formData.name}`}
          defaultAccountCode={formData.accountingAccount}
          editEntry={editEntryForModal}
        />
      )}
      {renderFilterMenu()}
    </div>
  );
}

function SearchableAccountSelect({ accounts, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAccounts = useMemo(() => {
    if (!searchTerm) return accounts;
    const term = searchTerm.toLowerCase();
    return accounts.filter(acc => 
      (acc.code || '').toLowerCase().includes(term) || 
      (acc.name || '').toLowerCase().includes(term)
    );
  }, [accounts, searchTerm]);

  const selectedAccount = useMemo(() => {
    return accounts.find(acc => acc.code === value);
  }, [accounts, value]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.account-select-dropdown-container')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  return (
    <div className="relative flex-1 min-w-0 account-select-dropdown-container">
      {/* Trigger display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="win-input flex items-center justify-between cursor-pointer bg-white min-h-[30px] pr-2 select-none"
      >
        <span className="truncate pr-1 text-slate-800 font-medium">
          {selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : '-- Sin cuenta contable --'}
        </span>
        <span className="text-[9px] text-slate-400 font-sans">▼</span>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-[#f8fafc] border border-outline rounded-md shadow-lg p-2 flex flex-col gap-2 min-w-[280px]">
          {/* Search bar inside the dropdown */}
          <div className="relative flex items-center border border-outline rounded-md bg-white px-2 py-1 shadow-sm">
            <Search className="w-4 h-4 text-slate-400 mr-1.5 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por código o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs outline-none bg-transparent"
              autoFocus
              onClick={(e) => e.stopPropagation()} // keep dropdown open when clicking/typing
            />
            {searchTerm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                }}
                className="hover:bg-slate-100 p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Accounts list */}
          <div className="max-h-[180px] overflow-y-auto border border-outline-variant rounded bg-white">
            <div
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setSearchTerm('');
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 border-b border-outline-variant cursor-pointer transition-colors"
            >
              -- Sin cuenta contable --
            </div>
            {filteredAccounts.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-slate-400 italic">
                No se encontraron cuentas
              </div>
            ) : (
              filteredAccounts
                .sort((a, b) => (a.code || '').localeCompare(b.code || ''))
                .map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => {
                      onChange(acc.code);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50 border-b border-outline-variant last:border-b-0 flex justify-between items-center transition-colors ${
                      value === acc.code ? 'bg-blue-50 text-primary font-bold' : 'text-slate-700'
                    }`}
                  >
                    <span className="font-mono">{acc.code}</span>
                    <span className="truncate max-w-[70%] font-sans text-right">{acc.name}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

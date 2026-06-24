import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  Building2, User, Landmark, Zap, Users as UsersIcon,
  Download, Filter, ChevronLeft, ChevronRight, PanelLeft
} from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';

export default function Customers() {
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFormTab, setActiveFormTab] = useState('general');
  const [showModalSidebar, setShowModalSidebar] = useState(true);
  const formTabs = [
    { id: 'general', name: 'DETALLES GENERALES' },
    { id: 'docs', name: 'DOCUMENTOS' },
    { id: 'trans', name: 'TRANSACCIONES' }
  ];
  const [filterColumn, setFilterColumn] = useState('name');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);

  const [statusFilter, setStatusFilter] = useState('todos');
  const [propertyFilter, setPropertyFilter] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultProperties = [
    { 
      id: 'RE001', 
      name: 'Edificio Gran Vía', 
      address: 'Calle Gran Vía 123, Madrid', 
      cp: '28013'
    },
    { 
      id: 'RE002', 
      name: 'Piso Retiro', 
      address: 'Calle Alfonso XII 4, Madrid', 
      cp: '28014'
    }
  ];

  const [availableProperties, setAvailableProperties] = useState(() => {
    const saved = localStorage.getItem('app_properties');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return defaultProperties; }
    }
    return defaultProperties;
  });

  // Efecto para sincronizar las propiedades cuando se abre el formulario
  useEffect(() => {
    if (showForm) {
      const saved = localStorage.getItem('app_properties');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setAvailableProperties(parsed);
          }
        } catch (e) {
          console.error("Error parsing properties", e);
        }
      }
    }
  }, [showForm]);


  const { user, queryUserIds } = useAuth();
  const [customers, setCustomers] = useState(() => {
    const saved = localStorage.getItem('app_customers');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'D00001', name: 'Otros Clientes', address: 'Calle Mayor 1', dni: '12345678A', phone: '912345678', cp: '28001', floor: '1A', email: 'otros@email.com', status: 'activo' },
      { id: 'D00002', name: 'Ventas en Efectivo', address: 'Av. Gran Vía 22', dni: 'B87654321', phone: '915554433', cp: '28013', floor: 'Bajo', email: 'ventas@email.com', status: 'activo' },
      { id: 'D00003', name: 'Inmobiliaria del Sol', address: 'Plaza España 5', dni: 'A11223344', phone: '916667788', cp: '28008', floor: '4C', email: 'inmo@email.com', status: 'activo' },
      { id: 'C00004', name: 'Laura Gómez', address: 'Av. Libertad 34', dni: '87654321B', phone: '600111222', email: 'laura@email.com', cp: '28002', floor: '2B', status: 'activo' },
      { id: 'C00005', name: 'Juan Pérez García', address: 'C/ Ejemplo 1', dni: '12345678Z', phone: '+34 600 000 000', email: 'juan.perez@email.com', cp: '28001', floor: '1', status: 'activo' }
    ];
  });
  const DEFAULT_COLUMNS = ['id', 'name', 'address', 'status'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('customers', DEFAULT_COLUMNS);
  const { activeTableFilters, applyTableFilters, clearAllFilters, TableHeaderWithFilter, renderFilterMenu, openFilterMenu, setOpenFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });
  const [rentals, setRentals] = useState([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'customers'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        const cloudData = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        console.log("Syncing customers from cloud. Count:", cloudData.length);
        setCustomers(cloudData);
        localStorage.setItem('customers', JSON.stringify(cloudData));
      },
      (err) => console.error("Customers snapshot error:", err)
    );
    
    const unsubRentals = onSnapshot(
      query(collection(db, 'rentals'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setRentals(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    return () => {
      unsub();
      unsubRentals();
    };
  }, [user, queryUserIds]);

  const saveCustomerToCloud = async (customer) => {
    if (!user) {
      alert("ERROR: No hay usuario autenticado. user = null");
      return;
    }
    try {
      console.log("saveCustomerToCloud - user.uid:", user.uid);
      console.log("saveCustomerToCloud - customer:", customer);
      const docId = customer.id || doc(collection(db, 'customers')).id;
      
      const cleanCustomer = Object.fromEntries(
        Object.entries(customer).filter(([_, v]) => v !== undefined)
      );

      console.log("Attempting setDoc to customers/" + docId);
      await setDoc(doc(db, 'customers', docId), {
        ...cleanCustomer,
        id: docId,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      console.log("setDoc succeeded!");
    } catch (error) {
      console.error("FULL ERROR OBJECT:", error);
      console.error("error.code:", error.code);
      console.error("error.message:", error.message);
      console.error("error.name:", error.name);
      alert(
        "Error al guardar:\n" +
        "code: " + error.code + "\n" +
        "message: " + error.message + "\n" +
        "name: " + error.name
      );
      throw error;
    }
  };

  const deleteCustomerFromCloud = async (customerId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'customers', customerId));
    } catch (error) {
      console.error("Error deleting customer from cloud:", error);
    }
  };

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    address: '',
    dni: '',
    phone: '',
    email: '',
    city: '',
    cp: '',
    floor: '',
    status: 'activo',
    notes: '',
    documents: [],
    transactions: []
  });

  useEffect(() => {
    const editName = searchParams.get('editName');
    if (editName && customers.length > 0) {
      const cust = customers.find(c => c.name.toLowerCase() === editName.toLowerCase());
      if (cust) {
        setSelectedCustomer(cust);
        setFormData(cust);
        setIsEditing(true);
        setShowForm(true);
        searchParams.delete('editName');
        setSearchParams(searchParams);
      }
    }
  }, [searchParams, customers]);


  const handleNew = () => {
    setFormData({
      id: `D${String(customers.length + 1).padStart(5, '0')}`,
      name: '',
      address: '',
      dni: '',
      phone: '',
      email: '',
      city: '',
      cp: '',
      floor: '',
      floors: [],
      status: 'activo',
      notes: '',
      documents: [],
      transactions: []
    });
    setIsEditing(false);
    setShowForm(true);
  };

  const handleEdit = () => {
    if (!selectedCustomer) return;
    const floorList = selectedCustomer.floor ? selectedCustomer.floor.split(', ') : [];
    setFormData({ 
      ...selectedCustomer,
      floors: selectedCustomer.floors || floorList
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert("El nombre es obligatorio");
      return;
    }

    let updatedCustomer;
    try {
      if (isEditing) {
        updatedCustomer = { ...formData };
        setCustomers(customers.map(c => c.id === formData.id ? updatedCustomer : c));
      } else {
        // Generate a new ID if not present or just let Firestore do it, 
        // but we want the D0000X format if possible or a UUID
        const newId = formData.id && !customers.find(c => c.id === formData.id) 
          ? formData.id 
          : doc(collection(db, 'customers')).id;
        updatedCustomer = { ...formData, id: newId };
        setCustomers([...customers, updatedCustomer]);
      }
      
      console.log("Attempting to save customer:", updatedCustomer);
      await saveCustomerToCloud(updatedCustomer);
      console.log("Customer saved successfully");
      setShowForm(false);
    } catch (error) {
      console.error("Error saving customer:", error);
      alert("Error al guardar cliente: " + error.message);
    }
  };

  const handleDelete = () => {
    if (!selectedCustomer) return;
    if (window.confirm(`¿Está seguro de que desea eliminar al cliente ${selectedCustomer.name}?`)) {
      const customerId = selectedCustomer.id;
      setCustomers(customers.filter(c => c.id !== customerId));
      deleteCustomerFromCloud(customerId);
      setSelectedCustomer(null);
    }
  };

  const handleFilter = () => {
    setIsFilterActive(true);
  };

  const handleClear = () => {
    setFilterValue('');
    setFilterOperator('contains');
    setIsFilterActive(false);
  };

  const filteredCustomers = customers.filter(c => {
    // Status filter
    if (statusFilter !== 'todos' && (c.status || 'activo') !== statusFilter) return false;

    // Property filter
    if (propertyFilter.length > 0) {
      const floors = Array.isArray(c.floors) ? c.floors : (c.floor ? c.floor.split(', ') : []);
      if (!propertyFilter.some(pf => floors.includes(pf))) return false;
    }

    if (!isFilterActive && !filterValue) return true;
    
    const val = String(c[filterColumn] || '').toLowerCase();
    const searchVal = filterValue.toLowerCase();

    switch (filterOperator) {
      case '=': return val === searchVal;
      case '<': return val < searchVal;
      case '>': return val > searchVal;
      case '<=': return val <= searchVal;
      case '>=': return val >= searchVal;
      case '<>': return val !== searchVal;
      case 'contains': 
      default:
        return val.includes(searchVal);
    }
  });

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedCustomer) handleEdit();
      else alert('Por favor, seleccione un cliente primero.');
    };
    const onDelete = () => {
      if (selectedCustomer) handleDelete();
      else alert('Por favor, seleccione un cliente primero.');
    };
    const onFilter = () => handleFilter();
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const filtered = applyTableFilters(filteredCustomers, 'customers');
      if (format === 'pdf') {
        const allColumns = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Dirección', dataKey: 'address' },
          { header: 'Estado', dataKey: 'status' }
        ];
        const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Clientes', 'clientes.pdf');
      } else {
        handleExportFormat(filtered, 'Clientes', format);
      }
    };

    window.addEventListener('customer:new', onNew);
    window.addEventListener('customer:edit', onEdit);
    window.addEventListener('customer:delete', onDelete);
    window.addEventListener('customer:filter', onFilter);
    window.addEventListener('customer:export', onExport);

    return () => {
      window.removeEventListener('customer:new', onNew);
      window.removeEventListener('customer:edit', onEdit);
      window.removeEventListener('customer:delete', onDelete);
      window.removeEventListener('customer:filter', onFilter);
      window.removeEventListener('customer:export', onExport);
    };
  }, [customers, selectedCustomer, filterColumn, filterOperator, filterValue]);

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">

      <div className={`flex flex-row flex-1 overflow-hidden bg-white relative`}>
        {/* Left Sidebar (Lista actual) - Photo 2 */}
        {showSidebar && (
          <div className="w-64 bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700 flex justify-between items-center">
              <span>Lista actual</span>
            </div>
          <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">
            <div className="space-y-2 pb-4 border-b border-gray-300">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  checked={statusFilter === 'todos'} 
                  onChange={() => setStatusFilter('todos')}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className={statusFilter === 'todos' ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                  Todos los estados
                </span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  checked={statusFilter === 'activo'} 
                  onChange={() => setStatusFilter('activo')}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className={statusFilter === 'activo' ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                  Mostrar activos
                </span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  checked={statusFilter === 'inactivo'} 
                  onChange={() => setStatusFilter('inactivo')}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className={statusFilter === 'inactivo' ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                  Mostrar inactivos
                </span>
              </label>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={propertyFilter.length === 0} 
                  onChange={() => setPropertyFilter([])} 
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className={propertyFilter.length === 0 ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                  Todas las propiedades
                </span>
              </label>
              {availableProperties.map(p => (
                <label key={p.id} className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={propertyFilter.includes(p.name)} 
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPropertyFilter([...propertyFilter, p.name]);
                      } else {
                        setPropertyFilter(propertyFilter.filter(x => x !== p.name));
                      }
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className={propertyFilter.includes(p.name) ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                    Mostrar {p.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* Table View */}
        <div 
          className="flex-1 flex flex-col bg-white overflow-hidden relative"
          onClick={() => setSelectedCustomer(null)}
        >
          {/* Header with Title and Search */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <input 
                type="text" 
                placeholder="Buscar en el fichero (Alt+B)"
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setIsFilterActive(e.target.value.length > 0);
                }}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div 
            className="flex-1 overflow-auto bg-white relative"
            onClick={(e) => e.stopPropagation()}
          >
            {renderFilterMenu()}
            <table className="clean-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="CUENTA" columnKey="id" data={filteredCustomers} tableId="customers" className="w-20" />}
                  {visibleColumns.includes('name') && <TableHeaderWithFilter label="DESCRIPCIÓN" columnKey="name" data={filteredCustomers} tableId="customers" className="w-48" />}
                  {visibleColumns.includes('address') && <TableHeaderWithFilter label="DIRECCIÓN" columnKey="address" data={filteredCustomers} tableId="customers" className="w-48" />}
                  {visibleColumns.includes('dni') && <TableHeaderWithFilter label="DNI/NIF" columnKey="dni" data={filteredCustomers} tableId="customers" className="w-32" />}
                  {visibleColumns.includes('phone') && <TableHeaderWithFilter label="TELÉFONO" columnKey="phone" data={filteredCustomers} tableId="customers" className="w-32" />}
                  {visibleColumns.includes('email') && <TableHeaderWithFilter label="EMAIL" columnKey="email" data={filteredCustomers} tableId="customers" className="w-48" />}
                  {visibleColumns.includes('city') && <TableHeaderWithFilter label="POBLACIÓN" columnKey="city" data={filteredCustomers} tableId="customers" className="w-32" />}
                  {visibleColumns.includes('cp') && <TableHeaderWithFilter label="CP" columnKey="cp" data={filteredCustomers} tableId="customers" className="w-24" />}
                  {visibleColumns.includes('status') && <TableHeaderWithFilter label="ESTADO" columnKey="status" data={filteredCustomers} tableId="customers" className="w-24" />}
                  {visibleColumns.includes('notes') && <TableHeaderWithFilter label="NOTAS" columnKey="notes" data={filteredCustomers} tableId="customers" className="w-48" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(filteredCustomers, 'customers').map(c => (
                  <tr 
                    key={c.id} 
                    className={selectedCustomer?.id === c.id ? 'selected' : ''}
                    onClick={() => setSelectedCustomer(c)}
                    onDoubleClick={handleEdit}
                  >
                    {visibleColumns.includes('id') && <td>{c.id}</td>}
                    {visibleColumns.includes('name') && <td>{c.name}</td>}
                    {visibleColumns.includes('address') && <td>{c.address}</td>}
                    {visibleColumns.includes('dni') && <td>{c.dni}</td>}
                    {visibleColumns.includes('phone') && <td>{c.phone}</td>}
                    {visibleColumns.includes('email') && <td>{c.email}</td>}
                    {visibleColumns.includes('city') && <td>{c.city}</td>}
                    {visibleColumns.includes('cp') && <td>{c.cp}</td>}
                    {visibleColumns.includes('status') && <td>{c.status || 'activo'}</td>}
                    {visibleColumns.includes('notes') && <td>{c.notes}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>Página 1 de 1</div>
        <ZoomControl />
      </div>

      {/* Form Window (Photo 1) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/5 backdrop-blur-sm flex items-center justify-center z-50">
          <Window 
            title={isEditing ? `Edición de Cliente: ${formData.id}` : "Nuevo Cliente"} 
            width={isMobile ? "100%" : "950px"}
            height={isMobile ? "100%" : "650px"}
            initialPos={{ x: isMobile ? 0 : 100, y: isMobile ? 0 : 50 }}
            onClose={() => setShowForm(false)}
            onMenuClick={() => setShowModalSidebar(!showModalSidebar)}
          >
            <div className="flex h-[800px] bg-[#d4d0c8] relative">
              {/* Sidebar */}
              {showModalSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    {formTabs.map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => { setActiveFormTab(tab.id); if (isMobile) setShowModalSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                          activeFormTab === tab.id 
                            ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' 
                            : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                        }`}
                      >
                        {tab.name}
                      </button>
                    ))}
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
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full flex flex-col space-y-4">
                      
              {/* Header Fields (Photo 1) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="space-y-1">
                  <div className="win-form-row">
                    <label className="win-form-label">Nombre:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="win-form-row">
                    <label className="win-form-label">Estado:</label>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-1 text-[11px]">
                        <input 
                          type="radio" 
                          name="customer-status" 
                          checked={formData.status === 'activo'} 
                          onChange={() => setFormData({...formData, status: 'activo'})}
                        />
                        <span>Activo</span>
                      </label>
                      <label className="flex items-center space-x-1 text-[11px]">
                        <input 
                          type="radio" 
                          name="customer-status" 
                          checked={formData.status === 'inactivo'} 
                          onChange={() => setFormData({...formData, status: 'inactivo'})}
                        />
                        <span>Inactivo</span>
                      </label>
                    </div>
                             <div className="win-form-row">
                    <label className="win-form-label">Dirección:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                  <div className="win-form-row">
                    <label className="win-form-label">DNI / NIF:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1"
                      value={formData.dni}
                      onChange={(e) => setFormData({...formData, dni: e.target.value})}
                    />
                  </div>
                  <div className="win-form-row">
                    <label className="win-form-label">Email:</label>
                    <input 
                      type="email" 
                      className="win-input flex-1"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="win-form-row">
                    <label className="win-form-label">Teléfono:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div className="win-form-row">
                    <label className="win-form-label">Código Postal:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1"
                      value={formData.cp}
                      onChange={(e) => setFormData({...formData, cp: e.target.value})}
                    />
                  </div>
                  <div className="win-form-row">
                    <label className="win-form-label">Población:</label>
                    <input 
                      type="text" 
                      className="win-input flex-1"
                      value={formData.city || ''}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                    />
                  </div>             </div>
                  <div className="win-form-row flex flex-col items-start gap-1 w-full">
                    <label className="win-form-label font-bold text-slate-700 uppercase">Pisos/Propiedades Asociadas:</label>
                    <div className="w-full bg-white border border-[#808080] p-1.5 win-bevel max-h-[100px] overflow-auto">
                      {availableProperties.map(p => {
                        const propKey = p.name || p.address;
                        const isChecked = Array.isArray(formData.floors) 
                          ? formData.floors.includes(propKey)
                          : formData.floor === propKey || (formData.floor || '').split(', ').includes(propKey);
                        
                        return (
                          <label key={p.id} className="flex items-center gap-1.5 text-[10px] p-0.5 hover:bg-slate-100 cursor-pointer w-full">
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              className="w-3.5 h-3.5 cursor-pointer"
                              onChange={(e) => {
                                let updatedFloors = Array.isArray(formData.floors) ? [...formData.floors] : (formData.floor ? formData.floor.split(', ') : []);
                                if (e.target.checked) {
                                  if (!updatedFloors.includes(propKey)) updatedFloors.push(propKey);
                                } else {
                                  updatedFloors = updatedFloors.filter(f => f !== propKey);
                                }
                                setFormData({
                                  ...formData,
                                  floors: updatedFloors,
                                  floor: updatedFloors.join(', ')
                                });
                              }}
                            />
                            <span>{p.name || p.address}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submenu Tabs Content */}
              <div className="flex-1 flex flex-col mt-4 min-h-[200px] overflow-hidden">
                <div className="flex-1 bg-white border border-[#808080] p-4 win-bevel overflow-auto">
                  {activeFormTab === 'general' && (
                    <div className="text-[11px] space-y-2">
                      <p className="font-bold text-blue-800">Información adicional del cliente</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-2 border border-slate-200">
                          <label className="block mb-1">Referencia de alquiler:</label>
                          <select 
                            className="win-input w-full"
                            value={formData.rentalReference || ''}
                            onChange={(e) => setFormData({...formData, rentalReference: e.target.value})}
                          >
                            <option value="">-- Seleccionar Referencia --</option>
                            {rentals.map(r => (
                              <option key={r.id} value={r.reference || r.id}>
                                {r.reference || '(Sin ref)'} - {availableProperties.find(p => p.id === r.propertyId)?.name || 'Propiedad desconocida'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="space-y-1 mt-4">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">Notas:</label>
                        <textarea 
                          className="win-input w-full h-24 p-1.5 resize-none" 
                          value={formData.notes || ''} 
                          onChange={(e) => setFormData({...formData, notes: e.target.value})}
                          placeholder="Notas o comentarios sobre el inquilino..."
                        />
                      </div>
                    </div>
                  )}
                  {activeFormTab === 'docs' && (
                    <div className="flex flex-col h-full">
                      <div className="flex justify-end mb-2 relative">
                        <input 
                          type="file" 
                          id="file-upload" 
                          multiple 
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              const newDocs = Array.from(e.target.files).map(file => ({
                                name: file.name,
                                type: file.type || file.name.split('.').pop().toUpperCase() + ' Document',
                                date: new Date().toLocaleDateString('es-ES'),
                                size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                                url: URL.createObjectURL(file)
                              }));
                              setFormData({
                                ...formData,
                                documents: [...(formData.documents || []), ...newDocs]
                              });
                            }
                            e.target.value = null; // reset input
                          }}
                        />
                        <button 
                          className="btn-classic px-3 h-5 text-[10px] flex items-center cursor-pointer mr-1"
                          onClick={() => exportToCSV(formData.documents || [], 'Documentos_Cliente')}
                          title="Exportar a Excel (CSV)"
                        >
                          <Download className="w-3 h-3 mr-1 text-green-800" /> Exportar
                        </button>
                        <label 
                          htmlFor="file-upload" 
                          className="btn-classic px-3 h-5 text-[10px] flex items-center cursor-pointer"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Adjuntar
                        </label>
                      </div>
                      <div 
                        className={`flex-1 overflow-auto border border-[#808080] transition-colors duration-200 ${dragOverZone === 'customerDocs' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 ring-inset' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOverZone('customerDocs'); }}
                        onDragLeave={() => setDragOverZone(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverZone(null);
                          const files = Array.from(e.dataTransfer.files);
                          if (files.length > 0) {
                            const newDocs = files.map(file => ({
                              name: file.name,
                              type: file.type || file.name.split('.').pop().toUpperCase() + ' Document',
                              date: new Date().toLocaleDateString('es-ES'),
                              size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                              url: URL.createObjectURL(file)
                            }));
                            setFormData({
                              ...formData,
                              documents: [...(formData.documents || []), ...newDocs]
                            });
                          }
                        }}
                      >
                        <table className="win-table min-w-full">
                        <thead>
                          <tr>
                            <th>Nombre del Archivo</th>
                            <th>Tipo</th>
                            <th>Fecha</th>
                            <th>Tamaño</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(formData.documents || []).length === 0 ? (
                            <tr>
                              <td colSpan="5" className="text-center text-slate-500 italic py-4">No hay documentos adjuntos</td>
                            </tr>
                          ) : (
                            (formData.documents || []).map((doc, idx) => (
                              <tr key={idx}>
                                <td>
                                  {doc.url ? (
                                    <span 
                                      className="text-blue-600 underline cursor-pointer hover:text-blue-800"
                                      onClick={() => setPreviewDocument(doc)}
                                    >
                                      {doc.name}
                                    </span>
                                  ) : (
                                    doc.name
                                  )}
                                </td>
                                <td>{doc.type}</td>
                                <td>{doc.date}</td>
                                <td>{doc.size}</td>
                                <td className="text-center">
                                  <button 
                                    className="p-0.5 hover:bg-slate-200"
                                    onClick={() => {
                                      const newDocs = [...formData.documents];
                                      newDocs.splice(idx, 1);
                                      setFormData({...formData, documents: newDocs});
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                  {activeFormTab === 'trans' && (
                    <div className="flex flex-col h-full">
                      <div className="flex justify-end mb-2">
                        <button 
                          className="btn-classic px-3 h-5 text-[10px] flex items-center mr-1"
                          onClick={() => exportToCSV(formData.transactions || [], 'Transacciones_Cliente')}
                          title="Exportar a Excel (CSV)"
                        >
                          <Download className="w-3 h-3 mr-1 text-green-800" /> Exportar
                        </button>
                        <button 
                          className="btn-classic px-3 h-5 text-[10px] flex items-center"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              transactions: [...(formData.transactions || []), { date: '', reference: '', concept: '', amount: '', status: '', doc: null }]
                            });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Añadir Transacción
                        </button>
                      </div>
                      <table className="win-table">
                        <thead>
                          <tr>
                            <th className="w-24">Fecha</th>
                            <th className="w-24">Referencia</th>
                            <th>Concepto</th>
                            <th className="w-24 text-right">Importe</th>
                            <th className="w-28">Estado</th>
                            <th className="w-24 text-center">Documento</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(formData.transactions || []).length === 0 ? (
                            <tr>
                              <td colSpan="7" className="text-center text-slate-500 italic py-4">No hay transacciones asociadas</td>
                            </tr>
                          ) : (
                            (formData.transactions || []).map((tr, idx) => (
                              <tr 
                                key={idx}
                                className={`transition-colors duration-200 ${dragOverZone === `trans-${idx}` ? 'bg-blue-50 ring-1 ring-blue-400 ring-inset' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setDragOverZone(`trans-${idx}`); }}
                                onDragLeave={() => setDragOverZone(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setDragOverZone(null);
                                  const file = e.dataTransfer.files[0];
                                  if (file) {
                                    const newTrs = [...formData.transactions];
                                    newTrs[idx].doc = file.name;
                                    newTrs[idx].docUrl = URL.createObjectURL(file);
                                    setFormData({...formData, transactions: newTrs});
                                  }
                                }}
                              >
                                <td className="p-0 border-r border-[#d4d0c8]">
                                  <input 
                                    type="date" 
                                    className="w-full h-full text-[10px] px-1 outline-none border-none bg-transparent"
                                    value={tr.date}
                                    onChange={(e) => {
                                      const newTrs = [...formData.transactions];
                                      newTrs[idx].date = e.target.value;
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  />
                                </td>
                                <td className="p-0 border-r border-[#d4d0c8]">
                                  <input 
                                    type="text" 
                                    className="w-full h-full text-[10px] px-1 outline-none border-none bg-transparent"
                                    value={tr.reference}
                                    onChange={(e) => {
                                      const newTrs = [...formData.transactions];
                                      newTrs[idx].reference = e.target.value;
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  />
                                </td>
                                <td className="p-0 border-r border-[#d4d0c8]">
                                  <input 
                                    type="text" 
                                    className="w-full h-full text-[10px] px-1 outline-none border-none bg-transparent"
                                    value={tr.concept}
                                    onChange={(e) => {
                                      const newTrs = [...formData.transactions];
                                      newTrs[idx].concept = e.target.value;
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  />
                                </td>
                                <td className="p-0 border-r border-[#d4d0c8]">
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    className="w-full h-full text-[10px] px-1 outline-none border-none bg-transparent text-right font-bold text-blue-800"
                                    value={tr.amount}
                                    onChange={(e) => {
                                      const newTrs = [...formData.transactions];
                                      newTrs[idx].amount = e.target.value;
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  />
                                </td>
                                <td className="p-0 border-r border-[#d4d0c8]">
                                  <select 
                                    className="w-full h-full text-[10px] px-1 outline-none border-none bg-transparent"
                                    value={tr.status}
                                    onChange={(e) => {
                                      const newTrs = [...formData.transactions];
                                      newTrs[idx].status = e.target.value;
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  >
                                    <option value=""></option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Cobrado">Cobrado</option>
                                    <option value="Devuelto">Devuelto</option>
                                    <option value="Depositado">Depositado</option>
                                  </select>
                                </td>
                                <td className="p-1 text-center relative">
                                  {tr.doc ? (
                                    <div className="flex items-center justify-between px-1 bg-blue-50 text-blue-700 whitespace-nowrap overflow-hidden text-ellipsis w-full max-w-[80px]">
                                      {tr.docUrl ? (
                                        <span 
                                          className="text-[9px] truncate cursor-pointer underline hover:text-blue-800" 
                                          title={`Ver ${tr.doc}`}
                                          onClick={() => setPreviewDocument({ name: tr.doc, url: tr.docUrl, type: tr.docUrl.includes('image') ? 'image/jpeg' : 'application/pdf' })}
                                        >
                                          {tr.doc}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] truncate" title={tr.doc}>{tr.doc}</span>
                                      )}
                                      <button 
                                        className="ml-1 text-red-600 hover:text-red-800 shrink-0"
                                        title="Eliminar adjunto"
                                        onClick={() => {
                                          const newTrs = [...formData.transactions];
                                          newTrs[idx].doc = null;
                                          setFormData({...formData, transactions: newTrs});
                                        }}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <input 
                                        type="file" 
                                        id={`trans-file-${idx}`} 
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                                        onChange={(e) => {
                                          if (e.target.files && e.target.files.length > 0) {
                                            const newTrs = [...formData.transactions];
                                            const file = e.target.files[0];
                                            newTrs[idx].doc = file.name;
                                            newTrs[idx].docUrl = URL.createObjectURL(file);
                                            setFormData({...formData, transactions: newTrs});
                                          }
                                        }}
                                      />
                                      <label 
                                        htmlFor={`trans-file-${idx}`} 
                                        className="btn-classic px-1 py-0.5 text-[9px] flex items-center justify-center cursor-pointer mx-auto w-16"
                                        title="Adjuntar Documento"
                                      >
                                        <FileText className="w-3 h-3 mr-1" /> PDF
                                      </label>
                                    </>
                                  )}
                                </td>
                                <td className="text-center p-0">
                                  <button 
                                    className="p-1 hover:bg-slate-200"
                                    title="Eliminar fila"
                                    onClick={() => {
                                      const newTrs = [...formData.transactions];
                                      newTrs.splice(idx, 1);
                                      setFormData({...formData, transactions: newTrs});
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                    </div>
                  </div>

                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" onClick={handleSave}>Aceptar</button>
                  <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}

      {/* Preview Modal */}
      {previewDocument && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60]">
          <Window 
            title={`Vista Previa: ${previewDocument.name}`}
            width="800px"
            initialPos={{ x: 100, y: 50 }}
            onClose={() => setPreviewDocument(null)}
          >
            <div className="bg-[#d4d0c8] p-1 h-[600px] flex flex-col">
              <div className="flex-1 bg-white border border-[#808080] border-t-0 p-1 win-bevel overflow-hidden flex flex-col">
                <div className="bg-[#cbd5e0] font-bold p-1 mb-1 uppercase text-[10px] border-b border-[#808080] shrink-0">
                  Previsualización
                </div>
                <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center relative">
                  {(previewDocument.type?.toLowerCase().includes('pdf') || previewDocument.name.toLowerCase().endsWith('.pdf')) ? (
                    <object 
                      data={previewDocument.url} 
                      type="application/pdf"
                      className="absolute inset-0 w-full h-full border-none" 
                      title={previewDocument.name} 
                    >
                      <iframe 
                        src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewDocument.url)}&embedded=true`} 
                        className="absolute inset-0 w-full h-full border-none" 
                        title={previewDocument.name} 
                      />
                    </object>
                  ) : (previewDocument.type?.toLowerCase().includes('image') || previewDocument.name.toLowerCase().match(/\.(jpg|jpeg|png)$/)) ? (
                    <img 
                      src={previewDocument.url} 
                      alt={previewDocument.name} 
                      className="max-w-full max-h-full object-contain" 
                    />
                  ) : (
                    <div className="text-slate-500 font-bold p-10 text-center flex flex-col items-center">
                      <FileText className="w-16 h-16 text-slate-300 mb-4" />
                      Vista previa no disponible en el navegador para este tipo de archivo.<br/>
                      <a href={previewDocument.url} download={previewDocument.name} className="text-blue-600 underline mt-2 block">
                        Haz clic aquí para descargarlo manualmente
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

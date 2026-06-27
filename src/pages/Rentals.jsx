import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { deleteJournalEntry } from '../services/accounting';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  FileText, Building2, User, Key, Users, PanelLeft, Download, Filter,
  Upload, Eye, RefreshCw
} from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import { handleExportFormat } from '../utils/exportUtils';
import AccountingEntryModal from '../components/AccountingEntryModal';
import EditableCell from '../components/EditableCell';
import Accounts from './Accounts';
import ExtractoContableTab from '../components/ExtractoContableTab';

export default function Rentals() {
  const { user, queryUserIds } = useAuth();
  const navigate = useNavigate();
  const [rentals, setRentals] = useState([]);
  const [properties, setProperties] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRental, setSelectedRental] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleRentalFileUpload = async (files) => {
    if (!files.length || !user || !formData.docId) return;
    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'rentals', formData.docId, 'docs');
        newDocs.push({
          id: Date.now() + Math.random().toString(36).substring(7),
          name: file.name,
          type: file.type || file.name.split('.').pop().toUpperCase() + ' Document',
          date: new Date().toLocaleDateString('es-ES'),
          size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          url
        });
      }
      setFormData(prev => ({
        ...prev,
        documents: [...(prev.documents || []), ...newDocs]
      }));
    } catch (error) {
      console.error('Error uploading rental document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };
  
  const DEFAULT_COLUMNS = ['id', 'propertyDisplay', 'tenantDisplay', 'rent', 'status'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('rentals', DEFAULT_COLUMNS);
  const { activeTableFilters, applyTableFilters, clearAllFilters, TableHeaderWithFilter, renderFilterMenu, openFilterMenu, setOpenFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  const [showSidebar, setShowSidebar] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [propertyFilter, setPropertyFilter] = useState([]);
  
  const [showModalSidebar, setShowModalSidebar] = useState(true);
  const [activeFormTab, setActiveFormTab] = useState('general');
  const [activeRoomTab, setActiveRoomTab] = useState(0);

  const [showAccountingModal, setShowAccountingModal] = useState(false);
  const [accountingModalConfig, setAccountingModalConfig] = useState({});
  const [showAccountsOverlay, setShowAccountsOverlay] = useState(false);

  const initialFormState = {
    reference: '',
    propertyId: '',
    tenantId: '',
    tenantIds: [],
    status: 'activo',
    rentalType: 'vivienda habitual',
    duration: 'fijo',
    rentAmount: 0,
    depositAmount: 0,
    paymentPeriod: 'mensual',
    incomeAccountId: '',
    incomeCebeId: '',
    expenseAccountId: '',
    expenseCecoId: '',
    notes: '',
    expenses: [],
    actualizaIpc: false,
    rooms: []
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    const unsubRentals = onSnapshot(
      query(collection(db, 'rentals'), where('userId', 'in', userIds)),
      (snap) => {
        setRentals(snap.docs.map(d => ({ ...d.data(), docId: d.id, _originalId: d.data().id })));
      }
    );

    const unsubProps = onSnapshot(
      query(collection(db, 'properties'), where('userId', 'in', userIds)),
      (snap) => {
        setProperties(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubCusts = onSnapshot(
      query(collection(db, 'customers'), where('userId', 'in', userIds)),
      (snap) => {
        setCustomers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubTenants = onSnapshot(
      query(collection(db, 'partners'), where('userId', 'in', userIds)),
      (snap) => {
        setTenants(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubCebes = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', userIds), where('type', '==', 'cebe')),
      (snap) => {
        setCebes(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubCecos = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', userIds), where('type', '==', 'ceco')),
      (snap) => {
        setCecos(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    return () => {
      unsubRentals();
      unsubProps();
      unsubCusts();
      unsubTenants();
      unsubCebes();
      unsubCecos();
    };
  }, [user, queryUserIds]);

  // Window event listeners
  useEffect(() => {
    const onNew = () => {
      setFormData({
        ...initialFormState,
        docId: doc(collection(db, 'rentals')).id
      });
      setIsEditing(false);
      setShowForm(true);
      setActiveFormTab('general');
    };
    const onEdit = () => {
      if (selectedRental) handleEdit(selectedRental);
      else alert('Por favor, seleccione un alquiler primero.');
    };
    const onDelete = () => {
      if (selectedRental) handleDelete(selectedRental.id || selectedRental.docId);
      else alert('Por favor, seleccione un alquiler primero.');
    };

    window.addEventListener('rentals:new', onNew);
    window.addEventListener('rentals:edit', onEdit);
    window.addEventListener('rentals:delete', onDelete);
    return () => {
      window.removeEventListener('rentals:new', onNew);
      window.removeEventListener('rentals:edit', onEdit);
      window.removeEventListener('rentals:delete', onDelete);
    };
  }, [initialFormState, selectedRental]);

  const handleSave = async () => {
    if (!formData.propertyId) {
      alert('La Propiedad es obligatoria.');
      return;
    }
    
    try {
      const docRef = isEditing 
        ? doc(db, 'rentals', formData.docId)
        : doc(collection(db, 'rentals'));
        
      const cleanFormData = JSON.parse(JSON.stringify(formData));
      delete cleanFormData.docId;
      delete cleanFormData._originalId;
      
      if (cleanFormData.rentalType === 'alquiler por habitaciones' && Array.isArray(cleanFormData.rooms)) {
        cleanFormData.rentAmount = cleanFormData.rooms.reduce((sum, r) => sum + (r.isActive !== false ? (Number(r.amount) || 0) : 0), 0);
        cleanFormData.depositAmount = cleanFormData.rooms.reduce((sum, r) => sum + (r.isActive !== false ? (Number(r.depositAmount) || 0) : 0), 0);
      }
        
      await setDoc(docRef, {
        ...cleanFormData,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
        ...(isEditing ? {} : { createdAt: new Date().toISOString() })
      }, { merge: true });
      
      setShowForm(false);
    } catch (error) {
      console.error('Error saving rental:', error);
      alert('Error al guardar el alquiler.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Eliminar este alquiler?')) {
      try {
        await deleteDoc(doc(db, 'rentals', id));
        if (isEditing && formData.docId === id) setShowForm(false);
      } catch (error) {
        console.error('Error deleting rental:', error);
      }
    }
  };

  const handleSaveField = async (rental, field, newVal) => {
    try {
      const docId = rental.docId || rental.id || rental.reference;
      const docRef = doc(db, 'rentals', docId);
      let processedVal = newVal;
      if (field === 'rentAmount' || field === 'depositAmount') {
        processedVal = parseFloat(newVal) || 0;
      } else if (field === 'actualizaIpc') {
        processedVal = newVal === 'SÍ' || newVal === true;
      }
      await setDoc(docRef, { [field]: processedVal }, { merge: true });
    } catch (err) {
      console.error("Error updating rental field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = rentals.reduce((max, r) => {
        const ref = r.reference || '';
        const num = parseInt(ref.replace('CONT-', '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `CONT-${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        reference: newId,
        propertyId: properties[0]?.id || '',
        tenantId: '',
        tenantIds: [],
        status: 'activo',
        rentalType: 'vivienda habitual',
        duration: 'fijo',
        rentAmount: 0,
        depositAmount: 0,
        paymentPeriod: 'mensual',
        notes: '',
        expenses: [],
        actualizaIpc: false,
        rooms: [],
        userId: user.uid,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'rentals', newId), newRecord);
      setSelectedRental(newRecord);
    } catch (err) {
      console.error("Error creating new rental:", err);
    }
  };


  const handleEdit = (rental) => {
    setFormData(rental);
    setIsEditing(true);
    setShowForm(true);
    setActiveFormTab('general');
  };

  const handleOpenAccounting = (type) => {
    if (type === 'ingresos') {
      if (!formData.incomeCebeId) {
        alert("Por favor, selecciona primero un CEBE de Ingresos y pulsa 'Aceptar' para guardar el alquiler.");
        return;
      }
      setAccountingModalConfig({
        linkedAccountId: formData.incomeAccountId || null,
        defaultDescription: `Ingresos Alquiler - ${formData.reference || formData.id || 'Nuevo'}`,
        defaultAmount: formData.rentAmount || 0,
        defaultAnalytics: { cebe: formData.incomeCebeId }
      });
    } else {
      if (!formData.expenseCecoId) {
        alert("Por favor, selecciona primero un CECO de Gastos y pulsa 'Aceptar' para guardar el alquiler.");
        return;
      }
      setAccountingModalConfig({
        linkedAccountId: formData.expenseAccountId || null,
        defaultDescription: `Gastos Alquiler - ${formData.reference || formData.id || 'Nuevo'}`,
        defaultAmount: 0,
        defaultAnalytics: { ceco: formData.expenseCecoId }
      });
    }
    setShowAccountingModal(true);
  };

  const formTabs = [
    { id: 'general', name: 'Datos Generales', icon: FileText },
    { id: 'docs', name: 'Documentos', icon: FileText },
    { id: 'ingresos', name: 'Ingresos / Facturación', icon: Building2 },
    { id: 'gastos', name: 'Gastos Asociados', icon: Key },
    { id: 'extracto', name: 'Extracto', icon: FileText }
  ];



  const renderCebeSelector = (field, label) => (
    <div className="win-form-row">
      <label className="win-form-label">{label}:</label>
      <select 
        className="win-input flex-1 min-w-0" 
        value={formData[field] || ""} 
        onChange={(e) => setFormData(prev => ({...prev, [field]: e.target.value}))}
      >
        <option value="">-- Seleccionar CEBE --</option>
        {cebes.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
      </select>
    </div>
  );

  const renderCecoSelector = (field, label) => (
    <div className="win-form-row">
      <label className="win-form-label">{label}:</label>
      <select 
        className="win-input flex-1 min-w-0" 
        value={formData[field] || ""} 
        onChange={(e) => setFormData(prev => ({...prev, [field]: e.target.value}))}
      >
        <option value="">-- Seleccionar CECO --</option>
        {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
      </select>
    </div>
  );

  const filteredRentals = useMemo(() => {
    return rentals.filter(r => {
      if (statusFilter !== 'todos' && (r.status || 'activo') !== statusFilter) return false;
      
      const prop = properties.find(p => p.id === r.propertyId);
      const propName = prop ? prop.name : 'Desconocido';
      
      if (propertyFilter.length > 0) {
        if (!propertyFilter.includes(propName)) return false;
      }
      
      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        const customer = customers.find(c => c.id === r.tenantId);
        const tNames = r.tenants?.length > 0 ? r.tenants.map(t => t.name).join(' ') : (customer ? customer.name : '');
        const match = (r._originalId || r.reference || '').toLowerCase().includes(sq) ||
                      propName.toLowerCase().includes(sq) ||
                      tNames.toLowerCase().includes(sq);
        if (!match) return false;
      }
      
      return true;
    });
  }, [rentals, statusFilter, propertyFilter, properties, searchQuery, customers]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedRental) {
          const displayed = applyTableFilters(filteredRentals, 'rentals');
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            const lastId = lastItem.reference;
            const currentId = selectedRental.reference;
            if (currentId === lastId) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRental, filteredRentals, rentals, properties, user]);

  useEffect(() => {
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const filtered = applyTableFilters(filteredRentals, 'rentals');
      if (format === 'pdf') {
        const allColumns = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Inmueble', dataKey: 'propertyTitle' },
          { header: 'Inquilino', dataKey: 'customerName' },
          { header: 'Renta', dataKey: 'rentAmount' },
          { header: 'Fianza', dataKey: 'depositAmount' },
          { header: 'F. Inicio', dataKey: 'startDate' },
          { header: 'F. Fin', dataKey: 'endDate' },
          { header: 'Estado', dataKey: 'status' }
        ];
        const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Alquileres', 'alquileres.pdf');
      } else {
        handleExportFormat(filtered, 'Alquileres', format);
      }
    };
    window.addEventListener('rentals:export', onExport);
    return () => window.removeEventListener('rentals:export', onExport);
  }, [filteredRentals, visibleColumns, applyTableFilters]);

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        {/* Left Sidebar (Lista actual) */}
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
                {properties.map(p => (
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
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative" onClick={() => setSelectedRental(null)}>
          {/* Header with Title and Search */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8f9fa]">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-200 rounded text-gray-500 border border-transparent hover:border-gray-300"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Buscar alquileres..." 
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white relative" onClick={(e) => e.stopPropagation()}>
            {renderFilterMenu()}
            <table className="clean-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="ID" columnKey="id" data={rentals.map(r => ({ ...r, id: r._originalId || r.id || '' }))} tableId="rentals" className="w-24" />}
                  {visibleColumns.includes('reference') && <TableHeaderWithFilter label="Referencia" columnKey="reference" data={rentals} tableId="rentals" className="w-32" />}
                  {visibleColumns.includes('propertyDisplay') && <TableHeaderWithFilter label="Propiedad" columnKey="propertyDisplay" data={rentals.map(r => { const p = properties.find(p => p.id === r.propertyId); return { ...r, propertyDisplay: p ? p.name : r.propertyName || r.propertyId || 'Desconocido' }; })} tableId="rentals" className="w-48" />}
                  {visibleColumns.includes('tenantDisplay') && <TableHeaderWithFilter label="Inquilino" columnKey="tenantDisplay" data={rentals.map(r => { const c = customers.find(c => c.id === r.tenantId); return { ...r, tenantDisplay: r.tenants?.length > 0 ? r.tenants.map(t => t.name).join(', ') : (c ? c.name : 'Ninguno') }; })} tableId="rentals" className="w-48" />}
                  {visibleColumns.includes('rentalType') && <TableHeaderWithFilter label="Tipo Alquiler" columnKey="rentalType" data={rentals} tableId="rentals" className="w-32" />}
                  {visibleColumns.includes('duration') && <TableHeaderWithFilter label="Duración" columnKey="duration" data={rentals} tableId="rentals" className="w-24 text-center" />}
                  {visibleColumns.includes('startDate') && <TableHeaderWithFilter label="Inicio" columnKey="startDate" data={rentals} tableId="rentals" className="w-32 text-center" />}
                  {visibleColumns.includes('endDate') && <TableHeaderWithFilter label="Fin" columnKey="endDate" data={rentals} tableId="rentals" className="w-32 text-center" />}
                  {visibleColumns.includes('status') && <TableHeaderWithFilter label="Estado" columnKey="status" data={rentals} tableId="rentals" className="w-24 text-center" />}
                  {visibleColumns.includes('deposit') && <TableHeaderWithFilter label="Fianza" columnKey="deposit" data={rentals.map(r => ({ ...r, deposit: Number(r.depositAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) }))} tableId="rentals" className="w-32 text-right" />}
                  {visibleColumns.includes('rent') && <TableHeaderWithFilter label="Renta" columnKey="rent" data={rentals.map(r => ({ ...r, rent: Number(r.rentAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) }))} tableId="rentals" className="w-32 text-right" />}
                  {visibleColumns.includes('paymentMethod') && <TableHeaderWithFilter label="Forma Pago" columnKey="paymentMethod" data={rentals} tableId="rentals" className="w-32" />}
                  {visibleColumns.includes('actualizaIpc') && <TableHeaderWithFilter label="Actualiza IPC" columnKey="actualizaIpc" data={rentals} tableId="rentals" className="w-24 text-center" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(filteredRentals.filter(r => {
                  if (!searchQuery) return true;
                  const sq = searchQuery.toLowerCase();
                  const prop = properties.find(p => p.id === r.propertyId);
                  const propName = prop ? prop.name : r.propertyName || '';
                  const cust = customers.find(c => c.id === r.tenantId);
                  const custName = cust ? cust.name : '';
                  const ref = r.reference || r._originalId || '';
                  
                  return propName.toLowerCase().includes(sq) || 
                         custName.toLowerCase().includes(sq) ||
                         ref.toLowerCase().includes(sq);
                }).map(rental => {
                  const prop = properties.find(p => p.id === rental.propertyId);
                  const cust = customers.find(c => c.id === rental.tenantId);
                  return {
                    ...rental,
                    id: rental._originalId || rental.id || '',
                    propertyDisplay: prop ? prop.name : rental.propertyName || rental.propertyId || 'Desconocido',
                    tenantDisplay: rental.tenants?.length > 0 ? rental.tenants.map(t => t.name).join(', ') : (cust ? cust.name : 'Ninguno'),
                    deposit: Number(rental.depositAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
                    rent: Number(rental.rentAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })
                  };
                }), 'rentals').map((rental) => (
                <tr 
                  key={rental.docId} 
                  className={selectedRental?.docId === rental.docId ? 'selected' : ''}
                  onClick={(e) => { e.stopPropagation(); setSelectedRental(rental); }}
                  onDoubleClick={() => handleEdit(rental)}
                >
                  {visibleColumns.includes('id') && <td>{rental.id}</td>}
                  {visibleColumns.includes('reference') && <td>{rental.reference || '---'}</td>}
                  {visibleColumns.includes('propertyDisplay') && (
                    <EditableCell 
                      value={rental.propertyId} 
                      options={properties.map(p => ({ id: p.id, name: p.name || p.address }))} 
                      onSave={(val) => handleSaveField(rental, 'propertyId', val)} 
                    />
                  )}
                  {visibleColumns.includes('tenantDisplay') && <td>{rental.tenantDisplay}</td>}
                  {visibleColumns.includes('rentalType') && (
                    <EditableCell 
                      className="capitalize" 
                      value={rental.rentalType} 
                      options={['vivienda habitual', 'alquiler por habitaciones', 'comercial', 'otro']} 
                      onSave={(val) => handleSaveField(rental, 'rentalType', val)} 
                    />
                  )}
                  {visibleColumns.includes('duration') && (
                    <EditableCell 
                      className="text-center capitalize" 
                      value={rental.duration} 
                      options={['fijo', 'temporal']} 
                      onSave={(val) => handleSaveField(rental, 'duration', val)} 
                    />
                  )}
                  {visibleColumns.includes('startDate') && (
                    <EditableCell 
                      className="text-center" 
                      type="date" 
                      value={rental.startDate} 
                      onSave={(val) => handleSaveField(rental, 'startDate', val)} 
                    />
                  )}
                  {visibleColumns.includes('endDate') && (
                    <EditableCell 
                      className="text-center" 
                      type="date" 
                      value={rental.endDate} 
                      onSave={(val) => handleSaveField(rental, 'endDate', val)} 
                    />
                  )}
                  {visibleColumns.includes('status') && (
                    <EditableCell 
                      className="text-center uppercase" 
                      value={rental.status || 'activo'} 
                      options={['activo', 'inactivo']} 
                      onSave={(val) => handleSaveField(rental, 'status', val)} 
                    />
                  )}
                  {visibleColumns.includes('deposit') && (
                    <EditableCell 
                      className="text-right" 
                      type="number" 
                      value={rental.depositAmount} 
                      onSave={(val) => handleSaveField(rental, 'depositAmount', val)} 
                    />
                  )}
                  {visibleColumns.includes('rent') && (
                    <EditableCell 
                      className="text-right" 
                      type="number" 
                      value={rental.rentAmount} 
                      onSave={(val) => handleSaveField(rental, 'rentAmount', val)} 
                    />
                  )}
                  {visibleColumns.includes('paymentMethod') && (
                    <EditableCell 
                      value={rental.paymentPeriod || 'mensual'} 
                      options={['mensual', 'trimestral', 'anual']} 
                      onSave={(val) => handleSaveField(rental, 'paymentPeriod', val)} 
                    />
                  )}
                  {visibleColumns.includes('actualizaIpc') && (
                    <EditableCell 
                      className="text-center font-bold" 
                      value={rental.actualizaIpc ? 'SÍ' : 'NO'} 
                      options={['SÍ', 'NO']} 
                      onSave={(val) => handleSaveField(rental, 'actualizaIpc', val)} 
                    />
                  )}
                </tr>
                ))}
            {rentals.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="text-center py-20 text-slate-400 italic">No hay alquileres registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Window 
            title={isEditing ? `Editar Alquiler: ${formData.reference || formData.id || 'Nuevo'}` : "Nuevo Alquiler"} 
            width={isMobile ? "100%" : "900px"}
            height={isMobile ? "100%" : "700px"}
            initialPos={{ x: isMobile ? 0 : 100, y: isMobile ? 0 : 50 }}
            onClose={() => setShowForm(false)}
            onMenuClick={() => setShowModalSidebar(!showModalSidebar)}
          >
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
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
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                    
                    {activeFormTab === 'general' && (
                      <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-3 max-w-md">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Propiedad:</label>
                            <select className="win-input w-full" value={formData.propertyId} onChange={e => setFormData({...formData, propertyId: e.target.value})}>
                              <option value="">-- Seleccionar Propiedad --</option>
                              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          {formData.rentalType !== 'alquiler por habitaciones' && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-700 uppercase">Inquilinos:</label>
                              {(() => {
                                const selectedProp = properties.find(p => p.id === formData.propertyId);
                                const propKey = selectedProp ? (selectedProp.name || selectedProp.address) : '';
                                const validCustomers = customers.filter(c => {
                                  if (!propKey) return true;
                                  const cFloors = Array.isArray(c.floors) ? c.floors : (c.floor ? c.floor.split(', ') : []);
                                  return cFloors.includes(propKey);
                                });
                                const currentTenants = formData.tenantIds || (formData.tenantId ? [formData.tenantId] : []);
                                
                                return (
                                  <div className="space-y-2">
                                    <select 
                                      className="win-input w-full" 
                                      value="" 
                                      onChange={e => {
                                        if (!e.target.value) return;
                                        const newId = e.target.value;
                                        if (!currentTenants.includes(newId)) {
                                          setFormData({...formData, tenantIds: [...currentTenants, newId], tenantId: currentTenants.length === 0 ? newId : formData.tenantId});
                                        }
                                      }}
                                    >
                                      <option value="">-- Añadir Inquilino --</option>
                                      {validCustomers.filter(c => !currentTenants.includes(c.id)).map(c => (
                                        <option key={c.id} value={c.id}>{c.name} {c.lastName || ''}</option>
                                      ))}
                                    </select>
                                    
                                    {currentTenants.length > 0 && (
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        {currentTenants.map(tId => {
                                          const cust = customers.find(c => c.id === tId);
                                          return (
                                            <div key={tId} className="flex items-center space-x-1 bg-white border border-gray-400 px-2 py-1 text-[10px] shadow-[1px_1px_0px_#808080]">
                                              <span 
                                                className="font-bold text-blue-800 cursor-pointer hover:underline"
                                                onClick={() => {
                                                  if (cust) {
                                                    navigate(`/clientes?editName=${encodeURIComponent(cust.name)}`);
                                                  }
                                                }}
                                                title="Ver ficha del cliente"
                                              >
                                                {cust ? `${cust.name} ${cust.lastName || ''}` : tId}
                                              </span>
                                              <button 
                                                type="button"
                                                onClick={() => {
                                                  const newTenants = currentTenants.filter(id => id !== tId);
                                                  setFormData({...formData, tenantIds: newTenants, tenantId: newTenants[0] || ''});
                                                }}
                                                className="text-red-500 hover:bg-red-50 p-0.5 rounded ml-1"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Referencia:</label>
                            <input type="text" className="win-input w-full" value={formData.reference || ''} onChange={e => setFormData({...formData, reference: e.target.value})} placeholder="Ref. de contrato (opcional)" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Estado:</label>
                            <div className="flex items-center space-x-4 pt-1">
                              <label className="flex items-center space-x-1 cursor-pointer">
                                <input type="radio" name="status" value="activo" checked={formData.status === 'activo'} onChange={e => setFormData({...formData, status: e.target.value})} />
                                <span className="text-[12px]">Activo</span>
                              </label>
                              <label className="flex items-center space-x-1 cursor-pointer">
                                <input type="radio" name="status" value="inactivo" checked={formData.status === 'inactivo'} onChange={e => setFormData({...formData, status: e.target.value})} />
                                <span className="text-[12px]">Inactivo</span>
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Tipo Alquiler:</label>
                            <select className="win-input w-full" value={formData.rentalType || 'vivienda habitual'} onChange={e => setFormData({...formData, rentalType: e.target.value})}>
                              <option value="vivienda habitual">Vivienda habitual</option>
                              <option value="uso distinto de vivienda">Uso distinto de vivienda</option>
                              <option value="alquiler por habitaciones">Alquiler por habitaciones</option>
                              <option value="parking">Parking</option>
                            </select>
                          </div>
                          {formData.rentalType !== 'alquiler por habitaciones' ? (
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">Duración:</label>
                                <select className="win-input w-full" value={formData.duration || 'fijo'} onChange={e => setFormData({...formData, duration: e.target.value})}>
                                  <option value="fijo">Fijo</option>
                                  <option value="abierto">Abierto</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">Inicio:</label>
                                <input type="date" className="win-input w-full" value={formData.startDate || ''} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                              </div>
                              {formData.duration !== 'abierto' && (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-700 uppercase">Fin:</label>
                                  <input type="date" className="win-input w-full" value={formData.endDate || ''} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                                </div>
                              )}
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">Renta (€):</label>
                                <input type="number" className="win-input w-full text-right" value={formData.rentAmount || ''} onChange={e => setFormData({...formData, rentAmount: e.target.value})} />
                                {(() => {
                                  const rentEq = (formData.paymentPeriod === 'anual' ? formData.rentAmount / 12 : (formData.paymentPeriod === 'trimestral' ? formData.rentAmount / 3 : formData.rentAmount)) || 0;
                                    const expEq = (formData.expenses || []).reduce((sum, exp) => {
                                      if (exp.includeInSum === false) return sum;
                                      let monthly = exp.amount || 0;
                                      if (exp.period === 'anual') monthly = monthly / 12;
                                      else if (exp.period === 'trimestral') monthly = monthly / 3;
                                      return sum + monthly;
                                    }, 0) || 0;
                                  const netEq = rentEq - expEq;
                                  return (
                                    <div className="text-[10px] text-right italic pt-1">
                                      {formData.paymentPeriod !== 'mensual' && formData.rentAmount > 0 && (
                                        <span className="block text-gray-500">Equivale a {rentEq.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / mes</span>
                                      )}
                                      <span className={`block font-bold mt-1 ${netEq >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                        Neto (tras gastos): {netEq.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / mes
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-700 uppercase">Fianza (€):</label>
                                <input type="number" className="win-input w-full text-right" value={formData.depositAmount || ''} onChange={e => setFormData({...formData, depositAmount: e.target.value})} />
                              </div>
                            </>
                          ) : (
                            <>
                              {(() => {
                                const totalRent = (formData.rooms || []).reduce((sum, r) => sum + (r.isActive !== false ? (Number(r.amount) || 0) : 0), 0);
                                const totalDep = (formData.rooms || []).reduce((sum, r) => sum + (r.isActive !== false ? (Number(r.depositAmount) || 0) : 0), 0);
                                const rentEq = (formData.paymentPeriod === 'anual' ? totalRent / 12 : (formData.paymentPeriod === 'trimestral' ? totalRent / 3 : totalRent)) || 0;
                                const expEq = (formData.expenses || []).reduce((sum, exp) => {
                                  if (exp.includeInSum === false) return sum;
                                  let monthly = exp.amount || 0;
                                  if (exp.period === 'anual') monthly = monthly / 12;
                                  else if (exp.period === 'trimestral') monthly = monthly / 3;
                                  return sum + monthly;
                                }, 0) || 0;
                                const netEq = rentEq - expEq;

                                return (
                                  <div className="space-y-2 mt-4 p-3 bg-[#f0f0f0] border border-gray-300 win-bevel">
                                    <h4 className="text-[11px] font-bold text-slate-800 uppercase border-b border-gray-300 pb-1 mb-2">Resumen Económico (Automático)</h4>
                                    <div className="flex justify-between items-center text-[11px]">
                                      <span className="font-bold text-slate-700">Renta Total:</span>
                                      <span>{totalRent.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px]">
                                      <span className="font-bold text-slate-700">Fianza Total:</span>
                                      <span>{totalDep.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                                    </div>
                                    <div className="text-[10px] text-right italic pt-2 mt-2 border-t border-gray-300">
                                      {formData.paymentPeriod !== 'mensual' && totalRent > 0 && (
                                        <span className="block text-gray-500">Equivale a {rentEq.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / mes</span>
                                      )}
                                      <span className={`block font-bold mt-1 ${netEq >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                        Neto (tras gastos): {netEq.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / mes
                                      </span>
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Periodo de Pago:</label>
                            <select className="win-input w-full" value={formData.paymentPeriod || 'mensual'} onChange={e => setFormData({...formData, paymentPeriod: e.target.value})}>
                              <option value="mensual">Mensual</option>
                              <option value="trimestral">Trimestral</option>
                              <option value="anual">Anual</option>
                            </select>
                          </div>
                          <div className="space-y-1 pt-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input type="checkbox" checked={formData.actualizaIpc || false} onChange={e => setFormData({...formData, actualizaIpc: e.target.checked})} />
                              <span className="text-[10px] font-bold text-slate-700 uppercase">Se actualiza por IPC</span>
                            </label>
                          </div>
                        </div>

                        {formData.rentalType === 'alquiler por habitaciones' && (
                          <div className="mt-4 border-t border-[#a0a0a0] pt-4">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-[12px] font-bold text-slate-800 uppercase">Fichas de Habitaciones</h3>
                              <button 
                                onClick={() => setFormData({...formData, rooms: [...(formData.rooms || []), { id: Date.now().toString(), name: `Habitación ${(formData.rooms?.length || 0) + 1}`, tenantId: '', amount: 0, depositAmount: 0, status: 'libre', duration: 'fijo', startDate: '', endDate: '' }]})}
                                className="flex items-center space-x-1 px-3 py-1.5 bg-[#e0e0e0] border border-gray-400 hover:bg-[#d0d0d0] text-[11px] font-bold shadow-[1px_1px_0px_#808080]"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Añadir Habitación</span>
                              </button>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              {/* TABS HEADER */}
                              <div className="flex flex-wrap gap-1 border-b border-gray-300 pb-0">
                                {(formData.rooms || []).map((room, idx) => (
                                  <button
                                    key={room.id}
                                    onClick={(e) => { e.preventDefault(); setActiveRoomTab(idx); }}
                                    className={`px-3 py-1.5 text-[11px] font-bold rounded-t-sm border-t border-x transition-colors ${activeRoomTab === idx ? 'bg-white text-[#000080] border-gray-300 border-b-white -mb-[1px] z-10' : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${room.isActive !== false ? 'bg-[#000080]' : 'bg-gray-400'}`} title={room.isActive !== false ? 'Activa' : 'Inactiva'}></span>
                                      {room.name || `Habitación ${idx + 1}`}
                                    </div>
                                  </button>
                                ))}
                                {(!formData.rooms || formData.rooms.length === 0) && (
                                  <div className="text-[11px] text-gray-500 italic p-2">No hay habitaciones registradas. Haz clic en "Añadir Habitación" para empezar.</div>
                                )}
                              </div>
                              
                              {/* TAB CONTENT */}
                              {formData.rooms && formData.rooms.length > 0 && (() => {
                                const activeIdx = activeRoomTab < formData.rooms.length ? activeRoomTab : 0;
                                const room = formData.rooms[activeIdx];
                                const idx = activeIdx;
                                const selectedProp = properties.find(p => p.id === formData.propertyId);
                                const propKey = selectedProp ? (selectedProp.name || selectedProp.address) : '';
                                const validCustomers = customers.filter(c => {
                                  if (!propKey) return true;
                                  const cFloors = Array.isArray(c.floors) ? c.floors : (c.floor ? c.floor.split(', ') : []);
                                  return cFloors.includes(propKey);
                                });

                                return (
                                  <div key={room.id} className="bg-white border border-gray-300 p-4 shadow-[2px_2px_0px_rgba(0,0,0,0.1)] flex flex-col space-y-4 relative">
                                    <div className="absolute top-2 right-2 flex gap-2">
                                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-300 cursor-pointer hover:bg-slate-200">
                                        <input 
                                          type="checkbox" 
                                          checked={room.isActive !== false}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].isActive = e.target.checked;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        />
                                        Activo
                                      </label>
                                      <button 
                                        onClick={() => {
                                          const newRooms = formData.rooms.filter(r => r.id !== room.id);
                                          setFormData({...formData, rooms: newRooms});
                                          setActiveRoomTab(Math.max(0, activeIdx - 1));
                                        }}
                                        className="text-red-500 hover:bg-red-100 p-1 rounded border border-transparent hover:border-red-300"
                                        title="Eliminar habitación"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                    
                                    <div className="space-y-1 w-3/4">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Nombre / Identificador:</label>
                                      <input 
                                        type="text" 
                                        className="win-input w-full font-bold text-[12px]" 
                                        placeholder="Ej: Hab. Principal"
                                        value={room.name}
                                        onChange={(e) => {
                                          const newRooms = [...formData.rooms];
                                          newRooms[idx].name = e.target.value;
                                          setFormData({...formData, rooms: newRooms});
                                        }}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Estado actual:</label>
                                        <select 
                                          className="win-input w-full"
                                          value={room.status || 'libre'}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].status = e.target.value;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        >
                                          <option value="libre">Libre</option>
                                          <option value="ocupada">Ocupada</option>
                                          <option value="mantenimiento">Mantenimiento</option>
                                        </select>
                                      </div>
                                      
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Duración contrato:</label>
                                        <select 
                                          className="win-input w-full"
                                          value={room.duration || 'fijo'}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].duration = e.target.value;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        >
                                          <option value="fijo">Fijo</option>
                                          <option value="abierto">Abierto</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-500 uppercase">Inquilino Asignado:</label>
                                      <div className="flex items-center gap-1">
                                        <select 
                                          className="win-input w-full"
                                          value={room.tenantId || ''}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].tenantId = e.target.value;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        >
                                          <option value="">-- Seleccionar Inquilino --</option>
                                          {validCustomers.map(c => <option key={c.id} value={c.id}>{c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.companyName}</option>)}
                                        </select>
                                        {room.tenantId && (
                                          <button 
                                            onClick={() => {
                                              const cust = customers.find(c => c.id === room.tenantId);
                                              if (cust) navigate(`/clientes?editName=${encodeURIComponent(cust.name)}`);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 p-1 bg-slate-200 border border-slate-400 shrink-0"
                                            title="Ir a ficha de cliente"
                                          >
                                            <User className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Fecha Inicio:</label>
                                        <input 
                                          type="date" 
                                          className="win-input w-full text-[11px]" 
                                          value={room.startDate || ''}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].startDate = e.target.value;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Fecha Fin:</label>
                                        <input 
                                          type="date" 
                                          className="win-input w-full text-[11px]" 
                                          value={room.endDate || ''}
                                          disabled={room.duration === 'abierto'}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].endDate = e.target.value;
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 border-t border-gray-300 pt-3 mt-1 bg-blue-50/30 p-2 -mx-4 -mb-4">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-[#000080] uppercase">Renta Mensual (€):</label>
                                        <input 
                                          type="number" 
                                          className="win-input w-full text-right font-bold text-[#000080]" 
                                          value={room.amount}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].amount = Number(e.target.value);
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-[#000080] uppercase">Fianza (€):</label>
                                        <input 
                                          type="number" 
                                          className="win-input w-full text-right font-bold text-[#000080]" 
                                          value={room.depositAmount || ''}
                                          onChange={(e) => {
                                            const newRooms = [...formData.rooms];
                                            newRooms[idx].depositAmount = Number(e.target.value);
                                            setFormData({...formData, rooms: newRooms});
                                          }}
                                        />
                                      </div>
                                    </div>

                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Gastos Asociados */}
                        <div className="mt-6 border-t border-[#a0a0a0] pt-4">
                          <div className="flex justify-between items-center mb-2">
                            <h3 className="text-[11px] font-bold text-slate-800 uppercase">Gastos Asociados</h3>
                            <button 
                              onClick={() => setFormData({...formData, expenses: [...(formData.expenses || []), { id: Date.now().toString(), concept: '', amount: 0, period: 'mensual', includeInSum: true }]})}
                              className="flex items-center space-x-1 px-2 py-1 bg-[#e0e0e0] border border-gray-400 hover:bg-[#d0d0d0] text-[10px] font-bold"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Añadir Gasto</span>
                            </button>
                          </div>
                          
                          <table className="w-full text-[11px] border-collapse bg-white border border-gray-300">
                            <thead className="bg-[#f0f0f0]">
                              <tr>
                                <th className="border border-gray-300 p-1.5 text-left">Concepto</th>
                                <th className="border border-gray-300 p-1.5 text-right w-24">Importe (€)</th>
                                <th className="border border-gray-300 p-1.5 text-center w-28">Periodicidad</th>
                                <th className="border border-gray-300 p-1.5 text-center w-16">Sumar</th>
                                <th className="border border-gray-300 p-1.5 text-center w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(formData.expenses || []).map((exp, idx) => (
                                <tr key={exp.id}>
                                  <td className="border border-gray-300 p-1">
                                    <input 
                                      type="text" 
                                      className="w-full px-1 py-0.5 outline-none" 
                                      placeholder="Ej: Comunidad"
                                      value={exp.concept}
                                      onChange={(e) => {
                                        const newExp = [...formData.expenses];
                                        newExp[idx].concept = e.target.value;
                                        setFormData({...formData, expenses: newExp});
                                      }}
                                    />
                                  </td>
                                  <td className="border border-gray-300 p-1">
                                    <input 
                                      type="number" 
                                      className="w-full px-1 py-0.5 outline-none text-right" 
                                      value={exp.amount}
                                      onChange={(e) => {
                                        const newExp = [...formData.expenses];
                                        newExp[idx].amount = Number(e.target.value);
                                        setFormData({...formData, expenses: newExp});
                                      }}
                                    />
                                  </td>
                                  <td className="border border-gray-300 p-1">
                                    <select 
                                      className="w-full px-1 py-0.5 outline-none text-center bg-transparent"
                                      value={exp.period}
                                      onChange={(e) => {
                                        const newExp = [...formData.expenses];
                                        newExp[idx].period = e.target.value;
                                        setFormData({...formData, expenses: newExp});
                                      }}
                                    >
                                      <option value="mensual">Mensual</option>
                                      <option value="trimestral">Trimestral</option>
                                      <option value="anual">Anual</option>
                                    </select>
                                  </td>
                                  <td className="border border-gray-300 p-1 text-center">
                                    <input 
                                      type="checkbox"
                                      className="form-checkbox h-3 w-3 text-blue-600 rounded border-slate-300 cursor-pointer"
                                      checked={exp.includeInSum !== false}
                                      onChange={(e) => {
                                        const newExp = [...formData.expenses];
                                        newExp[idx].includeInSum = e.target.checked;
                                        setFormData({...formData, expenses: newExp});
                                      }}
                                      title="Incluir en el sumatorio neto"
                                    />
                                  </td>
                                  <td className="border border-gray-300 p-1 text-center">
                                    <button 
                                      onClick={() => {
                                        const newExp = formData.expenses.filter(e => e.id !== exp.id);
                                        setFormData({...formData, expenses: newExp});
                                      }}
                                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {(!formData.expenses || formData.expenses.length === 0) && (
                                <tr>
                                  <td colSpan="5" className="border border-gray-300 p-4 text-center text-gray-500 italic">
                                    No hay gastos registrados
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            {formData.expenses && formData.expenses.length > 0 && (
                              <tfoot className="bg-[#e8e8e8] font-bold">
                                <tr>
                                  <td className="border border-gray-300 p-1.5 text-right" colSpan="3">
                                    Total Gastos / Mes:
                                  </td>
                                  <td className="border border-gray-300 p-1.5 text-right pr-2" colSpan="2">
                                    {formData.expenses.reduce((sum, exp) => {
                                      if (exp.includeInSum === false) return sum;
                                      let monthly = exp.amount || 0;
                                      if (exp.period === 'anual') monthly = monthly / 12;
                                      else if (exp.period === 'trimestral') monthly = monthly / 3;
                                      return sum + monthly;
                                    }, 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>

                        {/* Reparto a Propietarios */}
                        {(() => {
                          const selectedProp = properties.find(p => p.id === formData.propertyId);
                          const propOwners = selectedProp?.owners || [];
                          if (!formData.propertyId || propOwners.length === 0) return null;

                          const rentEq = (formData.paymentPeriod === 'anual' ? formData.rentAmount / 12 : (formData.paymentPeriod === 'trimestral' ? formData.rentAmount / 3 : formData.rentAmount)) || 0;
                          const expEq = (formData.expenses || []).reduce((sum, exp) => {
                            let monthly = exp.amount || 0;
                            if (exp.period === 'anual') monthly = monthly / 12;
                            else if (exp.period === 'trimestral') monthly = monthly / 3;
                            return sum + monthly;
                          }, 0) || 0;
                          const netEq = rentEq - expEq;

                          return (
                            <div className="mt-6 border-t border-[#a0a0a0] pt-4">
                              <h3 className="text-[11px] font-bold text-slate-800 uppercase mb-2">Ingreso Neto de Propietarios</h3>
                              <table className="w-full text-[11px] border-collapse bg-white border border-gray-300">
                                <thead className="bg-[#e0e0e0]">
                                  <tr>
                                    <th className="border border-gray-300 p-1.5 text-left">Propietario</th>
                                    <th className="border border-gray-300 p-1.5 text-right w-24">% Propiedad</th>
                                    <th className="border border-gray-300 p-1.5 text-right w-32">Ingreso Neto / Mes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {propOwners.map((owner, idx) => {
                                    const perc = parseFloat(owner.percentage) || 0;
                                    const ownerNet = netEq * (perc / 100);
                                    return (
                                      <tr key={idx}>
                                        <td className="border border-gray-300 p-1.5">{owner.name || 'Desconocido'}</td>
                                        <td className="border border-gray-300 p-1.5 text-right">{perc.toFixed(2)}%</td>
                                        <td className={`border border-gray-300 p-1.5 text-right font-semibold ${ownerNet >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                          {ownerNet.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot className="bg-[#f0f0f0] font-bold">
                                  <tr>
                                    <td className="border border-gray-300 p-1.5 text-right" colSpan="2">
                                      Total Activo:
                                    </td>
                                    <td className={`border border-gray-300 p-1.5 text-right ${netEq >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                      {netEq.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          );
                        })()}

                      </div>
                    )}

                    {activeFormTab === 'docs' && (
                      <div className="flex flex-col h-full">
                        <div className="flex justify-end mb-2 relative">
                          <input 
                            type="file" 
                            id="file-upload-rentals" 
                            multiple 
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleRentalFileUpload(e.target.files);
                              }
                              e.target.value = null; // reset input
                            }}
                          />
                          <label 
                            htmlFor="file-upload-rentals" 
                            className={`btn-classic px-3 h-5 text-[10px] flex items-center cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isUploading ? (
                              <>
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Subiendo...
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3 mr-1" /> Adjuntar
                              </>
                            )}
                          </label>
                        </div>
                        <div 
                          className={`flex-1 overflow-auto border border-[#808080] transition-colors duration-200 ${dragOverZone === 'rentalDocs' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 ring-inset' : ''}`}
                          onDragOver={(e) => { e.preventDefault(); if (!isUploading) setDragOverZone('rentalDocs'); }}
                          onDragLeave={() => setDragOverZone(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverZone(null);
                            if (isUploading) return;
                            const files = Array.from(e.dataTransfer.files);
                            if (files.length > 0) {
                              handleRentalFileUpload(files);
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

                    {activeFormTab === 'ingresos' && (
                      <div className="space-y-4 max-w-xl">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-700 uppercase">CEBE Asociado (Ingresos):</label>
                          <p className="text-[11px] text-gray-600 mb-2">
                            Selecciona el CEBE al que se imputarán los ingresos de este alquiler.
                          </p>
                          {renderCebeSelector('incomeCebeId', 'CEBE Ingresos')}
                        </div>
                        <div className="pt-2">
                          <button 
                            className="px-4 py-1.5 bg-[#4a69bd] text-white text-[11px] font-bold uppercase shadow-sm hover:bg-[#3b5598]"
                            onClick={() => handleOpenAccounting('ingresos')}
                          >
                            Añadir Asiento
                          </button>
                        </div>
                        <AnalyticsJournalViewer type="cebe" value={formData.incomeCebeId} userIds={queryUserIds?.length > 0 ? queryUserIds : [user.uid]} setPreviewDocument={setPreviewDocument} />
                      </div>
                    )}

                    {activeFormTab === 'gastos' && (
                      <div className="space-y-4 max-w-xl">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-700 uppercase">CECO Asociado (Gastos):</label>
                          <p className="text-[11px] text-gray-600 mb-2">
                            Selecciona el CECO al que se imputarán los gastos fijos de este alquiler.
                          </p>
                          {renderCecoSelector('expenseCecoId', 'CECO Gastos')}
                        </div>
                        <div className="pt-2">
                          <button 
                            className="px-4 py-1.5 bg-[#4a69bd] text-white text-[11px] font-bold uppercase shadow-sm hover:bg-[#3b5598]"
                            onClick={() => handleOpenAccounting('gastos')}
                          >
                            Añadir Asiento
                          </button>
                        </div>
                        <AnalyticsJournalViewer type="ceco" value={formData.expenseCecoId} userIds={queryUserIds?.length > 0 ? queryUserIds : [user.uid]} setPreviewDocument={setPreviewDocument} />
                      </div>
                    )}

                    {activeFormTab === 'extracto' && (
                      <ExtractoContableTab 
                        formData={formData} 
                        setFormData={setFormData} 
                        mode="rentals" 
                        cebes={cebes} 
                        cecos={cecos} 
                        setPreviewDocument={setPreviewDocument} 
                      />
                    )}

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
            height="600px"
            initialPos={{ x: 100, y: 50 }}
            onClose={() => setPreviewDocument(null)}
          >
            <div className="bg-[#d4d0c8] p-1 h-full flex flex-col min-h-0">
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

      {showAccountingModal && (
        <AccountingEntryModal 
          isOpen={true} 
          onClose={() => setShowAccountingModal(false)}
          onSaveSuccess={(id) => {
            console.log("Asiento vinculado en alquiler:", id);
            setShowAccountingModal(false);
          }}
          userId={user.uid}
          defaultDate={new Date().toISOString().split('T')[0]}
          defaultDescription={accountingModalConfig.defaultDescription}
          defaultAmount={accountingModalConfig.defaultAmount}
          linkedAccountId={accountingModalConfig.linkedAccountId}
          defaultAnalytics={accountingModalConfig.defaultAnalytics}
        />
      )}

      {showAccountsOverlay && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9998] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[92vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4a69bd] text-white select-none shrink-0">
              <h2 className="font-bold text-[13px] tracking-wide">CONFIGURACIÓN DE CUENTAS</h2>
              <button onClick={() => setShowAccountsOverlay(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <Accounts />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsJournalViewer({ type, value, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  
  useEffect(() => {
    if (!value || !userIds || userIds.length === 0) {
      setEntries([]);
      return;
    }
    // Fetch ALL entries for the user, then filter client-side by prefix
    // This supports hierarchy: parent code matches all children (e.g. "CB01" matches "CB01.1", "CB01.2", etc.)
    const q = query(
      collection(db, 'journal_entries'), 
      where('userId', 'in', userIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Prefix match: entry's cebe/ceco starts with the selected code (normalized)
      const filtered = all.filter(entry => {
        const fieldValue = entry[type];
        if (!fieldValue) return false;
        const normField = String(fieldValue).trim().replace(/^(CEBE|CECO)/i, '');
        const normValue = String(value).trim().replace(/^(CEBE|CECO)/i, '');
        return normField.startsWith(normValue);
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [type, value, userIds]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`Eliminar el asiento "${entry.description}"? Esta accion revertira los saldos contables.`)) return;
    try {
      await deleteJournalEntry(entry.userId || userIds[0], entry.id, entry.lines || []);
    } catch (err) {
      alert('Error al eliminar el asiento: ' + err.message);
    }
  };

  const handleTaxToggle = async (entry) => {
    try {
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, { isImpuesto: !entry.isImpuesto });
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    }
  };

  const handleUploadDoc = async (e, entry) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(entry.id);
    try {
      const url = await uploadFileToStorage(file, entry.userId || userIds[0], 'journal_entries', entry.id, 'docs');
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: url,
        documentName: file.name
      });
    } catch (err) {
      console.error(err);
      alert('Error al subir el documento: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const handleDeleteDoc = async (entry) => {
    if (!window.confirm('¿Eliminar el documento asociado a este asiento?')) return;
    try {
      const entryRef = doc(db, 'journal_entries', entry.id);
      await updateDoc(entryRef, {
        documentUrl: null,
        documentName: null
      });
    } catch (err) {
      alert('Error al eliminar el documento: ' + err.message);
    }
  };

  if (!value) return null;

  const regular = entries.filter(e => !e.isImpuesto);
  const impuestos = entries.filter(e => e.isImpuesto);
  const totalRegular = regular.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const totalImpuestos = impuestos.reduce((s, e) => s + (Number(e.total) || 0), 0);

  const renderRows = (rows) => rows.map(e => (
    <tr key={e.id} className="border-b border-gray-200 hover:bg-blue-50">
      <td className="p-1.5 whitespace-nowrap text-[10px]">{new Date(e.date).toLocaleDateString()}</td>
      <td className="p-1.5 truncate max-w-[150px] text-[10px]" title={e.description}>{e.description}</td>
      
      {/* Attached Document cell */}
      <td className="p-1.5 text-[10px] border-r border-gray-200">
        <div className="flex items-center gap-1.5">
          {e.documentUrl ? (
            <>
              <button 
                onClick={() => setPreviewDocument?.({ url: e.documentUrl, name: e.documentName || 'Documento' })} 
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium underline"
                title="Previsualizar documento"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[90px]" title={e.documentName}>{e.documentName}</span>
              </button>
              <button 
                onClick={() => handleDeleteDoc(e)} 
                className="text-red-500 hover:text-red-700 ml-auto p-0.5 hover:bg-red-50 rounded"
                title="Quitar documento"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <label className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-blue-600 select-none">
              {uploadingId === e.id ? (
                <span className="text-[9px] text-slate-500 animate-pulse">Subiendo...</span>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[9px]">Adjuntar doc</span>
                </>
              )}
              <input 
                type="file" 
                className="hidden" 
                onChange={(evt) => handleUploadDoc(evt, e)} 
                disabled={uploadingId === e.id}
              />
            </label>
          )}
        </div>
      </td>

      <td className="p-1.5 text-right font-mono text-slate-700 font-bold text-[10px]">{Number(e.total).toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;</td>
      <td className="p-1.5 text-center">
        <input type="checkbox" checked={!!e.isImpuesto} onChange={() => handleTaxToggle(e)} title="Marcar como Impuesto" className="cursor-pointer w-3.5 h-3.5 accent-orange-500" />
      </td>
      <td className="p-1 text-center">
        <button onClick={() => handleDelete(e)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5" title="Eliminar asiento">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>
  ));

  return (
    <div className="mt-6 border-t border-gray-300 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase">Asientos Contables Asociados</h3>
        {entries.length > 0 && (
          <div className="flex gap-3 text-[10px]">
            <span className="text-slate-700 font-bold">{type === 'cebe' ? 'Ingresos' : 'Gastos'}: {totalRegular.toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;</span>
            {impuestos.length > 0 && <span className="text-slate-700 font-bold">Impuestos: {totalImpuestos.toLocaleString('es-ES', {minimumFractionDigits:2})} &euro;</span>}
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados para este {type.toUpperCase()}.</p>
      ) : (
        <div className="overflow-x-auto border border-[#808080]">
          <table className="w-full win-table bg-white">
            <thead className="bg-[#e7e1d3] sticky top-0">
              <tr>
                <th className="text-left p-1.5 w-20 text-[10px]">Fecha</th>
                <th className="text-left p-1.5 text-[10px]">Concepto</th>
                <th className="text-left p-1.5 w-36 text-[10px]">Documento</th>
                <th className="text-right p-1.5 w-24 text-[10px]">Importe</th>
                <th className="text-center p-1.5 w-16 text-[10px]">Impuesto</th>
                <th className="w-8 p-1"></th>
              </tr>
            </thead>
            <tbody>
              {renderRows(regular)}
              {renderRows(impuestos)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

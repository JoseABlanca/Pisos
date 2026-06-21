import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  FileText, Building2, User, Key, Users, PanelLeft, Download, Filter
} from 'lucide-react';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';

export default function Rentals() {
  const { user, queryUserIds } = useAuth();
  const navigate = useNavigate();
  const [rentals, setRentals] = useState([]);
  const [properties, setProperties] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRental, setSelectedRental] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  
  const { activeTableFilters, applyTableFilters, clearAllFilters, TableHeaderWithFilter, renderFilterMenu, openFilterMenu, setOpenFilterMenu } = useTableFilters();

  const DEFAULT_COLUMNS = ['id', 'propertyDisplay', 'tenantDisplay', 'rent', 'status'];
  const { visibleColumns, toggleColumn } = useTableColumns('rentals', DEFAULT_COLUMNS);

  const [showSidebar, setShowSidebar] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [propertyFilter, setPropertyFilter] = useState([]);
  
  const [showModalSidebar, setShowModalSidebar] = useState(true);
  const [activeFormTab, setActiveFormTab] = useState('general');
  const [activeRoomTab, setActiveRoomTab] = useState(0);

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
    expenseAccountId: '',
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

    return () => {
      unsubRentals();
      unsubProps();
      unsubCusts();
    };
  }, [user, queryUserIds]);

  // Window event listeners
  useEffect(() => {
    const onNew = () => {
      setFormData(initialFormState);
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

  const handleEdit = (rental) => {
    setFormData(rental);
    setIsEditing(true);
    setShowForm(true);
    setActiveFormTab('general');
  };

  const formTabs = [
    { id: 'general', name: 'Datos Generales', icon: FileText },
    { id: 'docs', name: 'Documentos', icon: FileText },
    { id: 'ingresos', name: 'Ingresos / Facturación', icon: Building2 },
    { id: 'gastos', name: 'Gastos Asociados', icon: Key }
  ];

  const renderAccountSelector = (field, label) => (
    <div className="win-form-row">
      <label className="win-form-label">{label}:</label>
      <input 
        type="text" 
        className="win-input flex-1 min-w-0" 
        placeholder="Ej: 7050000"
        value={formData[field]} 
        onChange={(e) => setFormData({...formData, [field]: e.target.value})} 
      />
    </div>
  );

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
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="Ref. / ID" columnKey="id" data={rentals.map(r => ({ ...r, id: r._originalId || r.reference || '' }))} tableId="rentals" className="w-32" />}
                  {visibleColumns.includes('propertyDisplay') && <TableHeaderWithFilter label="Propiedad" columnKey="propertyDisplay" data={rentals.map(r => { const p = properties.find(p => p.id === r.propertyId); return { ...r, propertyDisplay: p ? p.name : r.propertyName || r.propertyId || 'Desconocido' }; })} tableId="rentals" className="w-48" />}
                  {visibleColumns.includes('tenantDisplay') && <TableHeaderWithFilter label="Inquilino" columnKey="tenantDisplay" data={rentals.map(r => { const c = customers.find(c => c.id === r.tenantId); return { ...r, tenantDisplay: r.tenants?.length > 0 ? r.tenants.map(t => t.name).join(', ') : (c ? c.name : 'Ninguno') }; })} tableId="rentals" className="w-48" />}
                  {visibleColumns.includes('startDate') && <TableHeaderWithFilter label="Inicio" columnKey="startDate" data={rentals} tableId="rentals" className="w-32 text-center" />}
                  {visibleColumns.includes('endDate') && <TableHeaderWithFilter label="Fin" columnKey="endDate" data={rentals} tableId="rentals" className="w-32 text-center" />}
                  {visibleColumns.includes('deposit') && <TableHeaderWithFilter label="Fianza" columnKey="deposit" data={rentals.map(r => ({ ...r, deposit: Number(r.depositAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) }))} tableId="rentals" className="w-32 text-right" />}
                  {visibleColumns.includes('rent') && <TableHeaderWithFilter label="Renta" columnKey="rent" data={rentals.map(r => ({ ...r, rent: Number(r.rentAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) }))} tableId="rentals" className="w-32 text-right" />}
                  {visibleColumns.includes('paymentMethod') && <TableHeaderWithFilter label="Forma Pago" columnKey="paymentMethod" data={rentals} tableId="rentals" className="w-32" />}
                  {visibleColumns.includes('status') && <TableHeaderWithFilter label="Estado" columnKey="status" data={rentals} tableId="rentals" className="w-24 text-center" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(rentals.filter(r => {
                  if (statusFilter !== 'todos' && (r.status || 'activo') !== statusFilter) return false;
                  if (propertyFilter.length > 0) {
                    const propName = properties.find(p => p.id === r.propertyId)?.name || 'Desconocido';
                    if (!propertyFilter.includes(propName)) return false;
                  }
                  
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
                    id: rental._originalId || rental.reference || '',
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
                  {visibleColumns.includes('propertyDisplay') && <td>{rental.propertyDisplay}</td>}
                  {visibleColumns.includes('tenantDisplay') && <td>{rental.tenantDisplay}</td>}
                  {visibleColumns.includes('startDate') && <td className="text-center">{rental.startDate || '-'}</td>}
                  {visibleColumns.includes('endDate') && <td className="text-center">{rental.endDate || '-'}</td>}
                  {visibleColumns.includes('deposit') && <td className="text-right">{rental.deposit} €</td>}
                  {visibleColumns.includes('rent') && <td className="text-right">{rental.rent} €</td>}
                  {visibleColumns.includes('paymentMethod') && <td>{rental.paymentPeriod || '-'}</td>}
                  {visibleColumns.includes('status') && <td className="text-center uppercase">{rental.status || 'activo'}</td>}
                </tr>
                ))}
            {rentals.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-20 text-slate-400 italic">No hay alquileres registrados</td>
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
                          <label 
                            htmlFor="file-upload-rentals" 
                            className="btn-classic px-3 h-5 text-[10px] flex items-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Adjuntar
                          </label>
                        </div>
                        <div 
                          className={`flex-1 overflow-auto border border-[#808080] transition-colors duration-200 ${dragOverZone === 'rentalDocs' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200 ring-inset' : ''}`}
                          onDragOver={(e) => { e.preventDefault(); setDragOverZone('rentalDocs'); }}
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

                    {activeFormTab === 'ingresos' && (
                      <div className="space-y-4 max-w-xl">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-700 uppercase">Cuenta de Ingresos:</label>
                          <p className="text-[11px] text-gray-600 mb-2">
                            Selecciona la cuenta contable donde se registrarán los ingresos de este alquiler (por ejemplo: 7050000 Ingresos por Arrendamientos).
                          </p>
                          {renderAccountSelector('incomeAccountId', 'Cuenta Ingresos')}
                        </div>
                      </div>
                    )}

                    {activeFormTab === 'gastos' && (
                      <div className="space-y-4 max-w-xl">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-700 uppercase">Cuenta de Gastos:</label>
                          <p className="text-[11px] text-gray-600 mb-2">
                            Selecciona la cuenta contable predeterminada para los gastos asociados a este alquiler.
                          </p>
                          {renderAccountSelector('expenseAccountId', 'Cuenta Gastos')}
                        </div>
                      </div>
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
                    <iframe 
                      src={previewDocument.url} 
                      className="absolute inset-0 w-full h-full border-none" 
                      title={previewDocument.name} 
                    />
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
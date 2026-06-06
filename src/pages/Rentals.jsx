import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  FileText, Building2, User, Key, Users
} from 'lucide-react';

export default function Rentals() {
  const { user, queryUserIds } = useAuth();
  const [rentals, setRentals] = useState([]);
  const [properties, setProperties] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showModalSidebar, setShowModalSidebar] = useState(true);
  const [activeFormTab, setActiveFormTab] = useState('general');

  const initialFormState = {
    reference: '',
    propertyId: '',
    tenantId: '',
    status: 'activo',
    rentalType: 'vivienda habitual',
    duration: 'fijo',
    rentAmount: 0,
    depositAmount: 0,
    paymentPeriod: 'mensual',
    incomeAccountId: '',
    expenseAccountId: '',
    notes: ''
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
        setRentals(snap.docs.map(d => ({ ...d.data(), id: d.id })));
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
    window.addEventListener('rentals:new', onNew);
    return () => window.removeEventListener('rentals:new', onNew);
  }, [initialFormState]);

  const handleSave = async () => {
    if (!formData.reference || !formData.propertyId) {
      alert('Referencia y Propiedad son obligatorios.');
      return;
    }
    
    try {
      const docRef = isEditing 
        ? doc(db, 'rentals', formData.id)
        : doc(collection(db, 'rentals'));
        
      await setDoc(docRef, {
        ...formData,
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
    { id: 'ingresos', name: 'Ingresos / Facturación', icon: Building2 },
    { id: 'gastos', name: 'Gastos Asociados', icon: Key }
  ];

  const renderAccountSelector = (field, label) => (
    <div className="win-form-row">
      <label className="win-form-label">{label}:</label>
      <input 
        type="text" 
        className="win-input flex-1" 
        placeholder="Ej: 7050000"
        value={formData[field]} 
        onChange={(e) => setFormData({...formData, [field]: e.target.value})} 
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#c0c0c0]">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-1 bg-[#d4d0c8] border-b border-[#808080] shadow-[0_1px_0_rgba(255,255,255,0.8)]">
        <div className="flex items-center space-x-1">
          <button className="win-btn" onClick={() => window.dispatchEvent(new CustomEvent('rentals:new'))} title="Nuevo Alquiler">
            <Plus className="w-4 h-4 text-blue-800" />
            {!isMobile && <span className="ml-1 text-[11px]">Nuevo</span>}
          </button>
        </div>
        <div className="flex items-center relative">
          <input 
            type="text" 
            placeholder="Buscar alquileres..." 
            className="win-input pl-8 pr-2 py-1 w-48 text-[11px]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-3 h-3 text-gray-500 absolute left-2" />
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 bg-white overflow-auto border-t border-[#808080] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.1)]">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-[#f0f0f0] sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.1)]">
            <tr>
              <th className="border border-[#c0c0c0] p-1.5 text-left font-semibold">Ref.</th>
              <th className="border border-[#c0c0c0] p-1.5 text-left font-semibold">Propiedad</th>
              <th className="border border-[#c0c0c0] p-1.5 text-left font-semibold">Inquilino</th>
              <th className="border border-[#c0c0c0] p-1.5 text-right font-semibold">Renta</th>
              <th className="border border-[#c0c0c0] p-1.5 text-center font-semibold">Estado</th>
              <th className="border border-[#c0c0c0] p-1.5 text-center font-semibold w-16">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rentals.filter(r => r.reference?.toLowerCase().includes(searchQuery.toLowerCase())).map((rental) => {
              const prop = properties.find(p => p.id === rental.propertyId);
              const cust = customers.find(c => c.id === rental.tenantId);
              return (
                <tr key={rental.id} className="hover:bg-blue-50/50 cursor-pointer" onDoubleClick={() => handleEdit(rental)}>
                  <td className="border border-[#e0e0e0] p-1.5">{rental.reference}</td>
                  <td className="border border-[#e0e0e0] p-1.5">{prop ? prop.name : 'Desconocido'}</td>
                  <td className="border border-[#e0e0e0] p-1.5">{cust ? cust.name : 'Ninguno'}</td>
                  <td className="border border-[#e0e0e0] p-1.5 text-right">{Number(rental.rentAmount).toFixed(2)} €</td>
                  <td className="border border-[#e0e0e0] p-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${rental.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {rental.status?.toUpperCase()}
                    </span>
                  </td>
                  <td className="border border-[#e0e0e0] p-1.5 text-center">
                    <div className="flex justify-center space-x-2">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(rental); }} className="text-blue-600 hover:text-blue-800"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(rental.id); }} className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rentals.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center p-8 text-gray-400 italic">No hay alquileres registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-0">
          <Window 
            title={isEditing ? `Editar Alquiler: ${formData.reference}` : "Nuevo Alquiler"} 
            width={isMobile ? "100%" : "850px"}
            height={isMobile ? "100%" : "600px"}
            initialPos={{ x: isMobile ? 0 : 100, y: isMobile ? 0 : 50 }}
            onClose={() => setShowForm(false)}
            onMenuClick={() => setShowModalSidebar(!showModalSidebar)}
          >
            <div className="flex h-[550px] bg-[#d4d0c8] relative">
              {/* Sidebar */}
              {showModalSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-[#4a69bd] text-white text-[10px] font-bold px-2 py-1 flex justify-between items-center">
                    <span>SECCIONES</span>
                  </div>
                  <div className="flex flex-col">
                    {formTabs.map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => { setActiveFormTab(tab.id); if (isMobile) setShowModalSidebar(false); }}
                        className={`w-full flex items-center space-x-2 text-left px-4 py-2.5 text-[11px] transition-colors border-b border-[#d0d0d0] ${
                          activeFormTab === tab.id 
                            ? 'bg-[#c0c0c0] text-black shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-bold' 
                            : 'bg-[#e8e8e8] text-slate-700 hover:bg-[#d8d8d8]'
                        }`}
                      >
                        <tab.icon className={`w-3.5 h-3.5 ${activeFormTab === tab.id ? 'text-black' : 'text-slate-500'}`} />
                        <span>{tab.name}</span>
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
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full space-y-4">
                    
                    {activeFormTab === 'general' && (
                      <div className="space-y-4">
                        <div className="bg-[#4a69bd] text-white px-2 py-1 font-bold text-[11px] shadow-[inset_1px_1px_0px_rgba(255,255,255,0.3)]">
                          DATOS BÁSICOS
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Referencia:</label>
                          <input type="text" className="win-input flex-1" value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} />
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Propiedad:</label>
                          <select className="win-input flex-1" value={formData.propertyId} onChange={e => setFormData({...formData, propertyId: e.target.value})}>
                            <option value="">-- Seleccionar Propiedad --</option>
                            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="win-form-row">
                          <label className="win-form-label">Inquilino Ppal:</label>
                          <select className="win-input flex-1" value={formData.tenantId} onChange={e => setFormData({...formData, tenantId: e.target.value})}>
                            <option value="">-- Sin Inquilino --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-4">
                          <div className="win-form-row flex-1">
                            <label className="win-form-label">Renta (€):</label>
                            <input type="number" className="win-input flex-1 text-right" value={formData.rentAmount} onChange={e => setFormData({...formData, rentAmount: e.target.value})} />
                          </div>
                          <div className="win-form-row flex-1">
                            <label className="win-form-label">Fianza (€):</label>
                            <input type="number" className="win-input flex-1 text-right" value={formData.depositAmount} onChange={e => setFormData({...formData, depositAmount: e.target.value})} />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeFormTab === 'ingresos' && (
                      <div className="space-y-4">
                        <div className="bg-[#4a69bd] text-white px-2 py-1 font-bold text-[11px] shadow-[inset_1px_1px_0px_rgba(255,255,255,0.3)]">
                          CONFIGURACIÓN DE INGRESOS
                        </div>
                        <div className="p-3 bg-[#e8e8e8] border border-gray-400">
                          <p className="text-[10px] text-gray-600 mb-3">
                            Selecciona la cuenta contable donde se registrarán los ingresos de este alquiler (por ejemplo: 7050000 Ingresos por Arrendamientos).
                          </p>
                          {renderAccountSelector('incomeAccountId', 'Cuenta Ingresos')}
                        </div>
                      </div>
                    )}

                    {activeFormTab === 'gastos' && (
                      <div className="space-y-4">
                        <div className="bg-[#4a69bd] text-white px-2 py-1 font-bold text-[11px] shadow-[inset_1px_1px_0px_rgba(255,255,255,0.3)]">
                          CONFIGURACIÓN DE GASTOS
                        </div>
                        <div className="p-3 bg-[#e8e8e8] border border-gray-400">
                          <p className="text-[10px] text-gray-600 mb-3">
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
    </div>
  );
}
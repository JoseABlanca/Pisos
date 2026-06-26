import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  User, Phone, Mail, MapPin, CreditCard, FileText, 
  ArrowLeft, Download, Building2, UserCircle, PieChart, TrendingUp,
  ChevronLeft, ChevronRight, Filter, PanelLeft
} from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';


export default function Partners() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFormTab, setActiveFormTab] = useState('general');
  const [gainView, setGainView] = useState('neta');
  const [showSidebar, setShowSidebar] = useState(true);

  const formTabs = [
    { id: 'general', name: 'GENERAL' },
    { id: 'contact', name: 'CONTACTO' },
    { id: 'financial', name: 'PARTICIPACIÓN' },
    { id: 'docs', name: 'DOCUMENTOS' }
  ];
  const [filterColumn, setFilterColumn] = useState('name');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todos');

  const { user, queryUserIds } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => {
      if (selectedPartner) handleEdit();
      else alert('Por favor, seleccione un propietario primero.');
    };
    const onDelete = () => {
      if (selectedPartner) handleDelete();
      else alert('Por favor, seleccione un propietario primero.');
    };
    const onFilter = () => setIsFilterActive(true);
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const filtered = applyTableFilters(filteredPartners, 'partners');
      if (format === 'pdf') {
        const allColumns = [
          { header: 'ID', dataKey: 'id' },
          { header: 'DNI/CIF', dataKey: 'dni' },
          { header: 'Nombre', dataKey: 'name' },
          { header: 'Email', dataKey: 'email' },
          { header: 'Teléfono', dataKey: 'phone' },
          { header: 'Estado', dataKey: 'status' }
        ];
        const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filtered, colsToExport, 'Reporte de Propietarios', 'propietarios.pdf');
      } else {
        handleExportFormat(filtered, 'Propietarios', format);
      }
    };

    window.addEventListener('partners:new', onNew);
    window.addEventListener('partners:edit', onEdit);
    window.addEventListener('partners:delete', onDelete);
    window.addEventListener('partners:filter', onFilter);
    window.addEventListener('partners:export', onExport);

    return () => {
      window.removeEventListener('partners:new', onNew);
      window.removeEventListener('partners:edit', onEdit);
      window.removeEventListener('partners:delete', onDelete);
      window.removeEventListener('partners:filter', onFilter);
      window.removeEventListener('partners:export', onExport);
    };
  }, [selectedPartner, filterColumn, filterOperator, filterValue]);

  const [partners, setPartners] = useState([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'partners'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        // Always update from Firebase, even if empty
        const cloudData = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        setPartners(cloudData);
      }
    );
    return () => unsub();
  }, [user]);

  const savePartnerToCloud = async (partner) => {
    if (!user) return;
    try {
      const docId = partner.id || doc(collection(db, 'partners')).id;
      
      const cleanPartner = Object.fromEntries(
        Object.entries(partner).filter(([_, v]) => v !== undefined)
      );

      await setDoc(doc(db, 'partners', docId), {
        ...cleanPartner,
        id: docId,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("Error saving partner to cloud:", error);
      alert("Error crítico al guardar en Firebase: " + error.message);
      throw error;
    }
  };

  const deletePartnerFromCloud = async (partnerId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'partners', partnerId));
    } catch (error) {
      console.error("Error deleting partner from cloud:", error);
    }
  };

  const handleSaveField = async (partner, field, newVal) => {
    try {
      const docRef = doc(db, 'partners', partner.id);
      let processedVal = newVal;
      if (field === 'ownership') {
        processedVal = parseFloat(newVal) || 0;
      }
      await setDoc(docRef, { ...partner, [field]: processedVal }, { merge: true });
    } catch (err) {
      console.error("Error updating partner field:", err);
    }
  };

  const createNewRecord = async () => {
    if (!user) return;
    try {
      const maxId = partners.reduce((max, p) => {
        const num = parseInt(p.id?.replace('S', '')) || 0;
        return num > max ? num : max;
      }, 0);
      const newId = `S${String(maxId + 1).padStart(3, '0')}`;
      const newRecord = {
        id: newId,
        name: 'Nuevo Propietario',
        dni: '',
        phone: '',
        email: '',
        address: '',
        iban: '',
        ownership: 0,
        status: 'activo',
        documents: [],
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'partners', newId), newRecord);
      setSelectedPartner(newRecord);
    } catch (err) {
      console.error("Error creating new partner:", err);
    }
  };

  const DEFAULT_COLUMNS = ['dni', 'name', 'email', 'phone', 'status'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('partners', DEFAULT_COLUMNS);
  const { activeTableFilters, applyTableFilters, clearAllFilters, TableHeaderWithFilter, renderFilterMenu, openFilterMenu, setOpenFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    dni: '',
    phone: '',
    email: '',
    address: '',
    iban: '',
    ownership: '',
    status: 'activo',
    documents: []
  });

  const [properties] = useState(() => {
    const saved = localStorage.getItem('app_properties');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const handleNew = () => {
    const maxId = partners.reduce((max, p) => {
      const num = parseInt(p.id?.replace('S', '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({
      id: `S${String(maxId + 1).padStart(3, '0')}`,
      name: '',
      dni: '',
      phone: '',
      email: '',
      address: '',
      iban: '',
      ownership: '',
      status: 'activo',
      documents: []
    });
    setIsEditing(false);
    setShowForm(true);
    setActiveFormTab('general');
  };

  const handleEdit = (partner = null) => {
    const target = partner && partner.id ? partner : selectedPartner;
    if (!target) return;
    setFormData({ ...target });
    setIsEditing(true);
    setShowForm(true);
    setActiveFormTab('general');
  };

  const handleDelete = () => {
    if (!selectedPartner) return;
    if (window.confirm(`¿Seguro que desea eliminar al propietario ${selectedPartner.name}?`)) {
      deletePartnerFromCloud(selectedPartner.id);
      setPartners(partners.filter(p => p.id !== selectedPartner.id));
      setSelectedPartner(null);
    }
  };

  const handleSave = async () => {
    let updatedPartner;
    if (isEditing) {
      updatedPartner = formData;
      setPartners(partners.map(p => p.id === formData.id ? formData : p));
    } else {
      updatedPartner = { ...formData, id: formData.id || doc(collection(db, 'partners')).id };
      setPartners([...partners, updatedPartner]);
    }
    try {
      await savePartnerToCloud(updatedPartner);
      setShowForm(false);
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const filteredPartners = partners.filter(p => {
    // Status filter
    if (statusFilter !== 'todos' && (p.status || 'activo') !== statusFilter) return false;

    // Search query filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        p.name?.toLowerCase().includes(search) ||
        p.dni?.toLowerCase().includes(search) ||
        p.email?.toLowerCase().includes(search)
      );
    }

    if (!isFilterActive && !filterValue) return true;
    
    const val = String(p[filterColumn] || '').toLowerCase();
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
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        if (selectedPartner) {
          const displayed = applyTableFilters(filteredPartners, 'partners');
          if (displayed.length > 0) {
            const lastItem = displayed[displayed.length - 1];
            if (selectedPartner.id === lastItem.id) {
              e.preventDefault();
              createNewRecord();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPartner, filteredPartners, partners, user]);

  return (
    <div className={`w-full h-full bg-[#d4d0c8] min-h-screen font-sans flex flex-col p-1 overflow-hidden`}>

      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">

        {/* Table View */}
        <div 
          className="flex-1 flex flex-col bg-white overflow-hidden relative"
          onClick={() => setSelectedPartner(null)}
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
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="ID" columnKey="id" data={filteredPartners} tableId="partners" className="w-24" />}
                  {visibleColumns.includes('dni') && <TableHeaderWithFilter label="DNI" columnKey="dni" data={filteredPartners} tableId="partners" className="w-24" />}
                  {visibleColumns.includes('name') && <TableHeaderWithFilter label="Nombre / Razón Social" columnKey="name" data={filteredPartners} tableId="partners" className="w-auto" />}
                  {visibleColumns.includes('email') && !isMobile && <TableHeaderWithFilter label="Email" columnKey="email" data={filteredPartners} tableId="partners" className="w-48" />}
                  {visibleColumns.includes('phone') && !isMobile && <TableHeaderWithFilter label="Teléfono" columnKey="phone" data={filteredPartners} tableId="partners" className="w-32" />}
                  {visibleColumns.includes('address') && <TableHeaderWithFilter label="Dirección" columnKey="address" data={filteredPartners} tableId="partners" className="w-48" />}
                  {visibleColumns.includes('iban') && <TableHeaderWithFilter label="IBAN" columnKey="iban" data={filteredPartners} tableId="partners" className="w-48" />}
                  {visibleColumns.includes('ownership') && <TableHeaderWithFilter label="% Propiedad" columnKey="ownership" data={filteredPartners} tableId="partners" className="w-24" />}
                  {visibleColumns.includes('status') && <TableHeaderWithFilter label="Estado" columnKey="status" data={filteredPartners} tableId="partners" className="w-24 text-center" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(filteredPartners, 'partners').length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-20 italic text-slate-400">No se han encontrado propietarios</td>
                  </tr>
                ) : applyTableFilters(filteredPartners, 'partners').map((partner) => (
                  <tr 
                    key={partner.id} 
                    className={selectedPartner?.id === partner.id ? 'selected' : ''}
                    onClick={() => setSelectedPartner(partner)}
                    onDoubleClick={() => handleEdit(partner)}
                  >
                    {visibleColumns.includes('id') && <td className="font-mono">{partner.id}</td>}
                    {visibleColumns.includes('dni') && <EditableCell className="font-mono" value={partner.dni} onSave={(val) => handleSaveField(partner, 'dni', val)} />}
                    {visibleColumns.includes('name') && <EditableCell value={partner.name} onSave={(val) => handleSaveField(partner, 'name', val)} />}
                    {visibleColumns.includes('email') && !isMobile && <EditableCell className="lowercase normal-case" value={partner.email} onSave={(val) => handleSaveField(partner, 'email', val)} />}
                    {visibleColumns.includes('phone') && !isMobile && <EditableCell value={partner.phone} onSave={(val) => handleSaveField(partner, 'phone', val)} />}
                    {visibleColumns.includes('address') && <EditableCell value={partner.address} onSave={(val) => handleSaveField(partner, 'address', val)} />}
                    {visibleColumns.includes('iban') && <EditableCell value={partner.iban} onSave={(val) => handleSaveField(partner, 'iban', val)} />}
                    {visibleColumns.includes('ownership') && <EditableCell type="number" value={partner.ownership} onSave={(val) => handleSaveField(partner, 'ownership', val)} />}
                    {visibleColumns.includes('status') && <EditableCell className="text-center" value={partner.status} options={['activo', 'inactivo']} onSave={(val) => handleSaveField(partner, 'status', val)} />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Form Window */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-1 sm:p-4">
          <Window 
            title={`${isEditing ? 'EDITAR' : 'NUEVO'} PROPIETARIO`} 
            onClose={() => setShowForm(false)}
            width={isMobile ? '100%' : '950px'}
            height={isMobile ? '100%' : '650px'}
            initialPos={isMobile ? { x: 0, y: 0 } : { x: 50, y: 30 }}
            onMenuClick={() => setShowSidebar(!showSidebar)}
          >
            <div className="flex h-[800px] bg-[#d4d0c8] relative">
              {/* Sidebar */}
              {showSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    {formTabs.map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => { setActiveFormTab(tab.id); if (isMobile) setShowSidebar(false); }}
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
              {isMobile && showSidebar && (
                <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowSidebar(false)} />
              )}
              
              {/* Main Content Area */}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                      
                      {activeFormTab === 'general' && (
                  <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">ID Propietario:</label>
                        <input type="text" value={formData.id} disabled className="win-input w-full bg-slate-100 font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">Nombre / Razón Social:</label>
                        <input 
                          type="text" 
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value})}
                          className="win-input w-full" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">DNI / CIF:</label>
                        <input 
                          type="text" 
                          value={formData.dni} 
                          onChange={e => setFormData({...formData, dni: e.target.value})}
                          className="win-input w-full" 
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">Estado:</label>
                        <select 
                          value={formData.status} 
                          onChange={e => setFormData({...formData, status: e.target.value})}
                          className="win-input w-full"
                        >
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                               {activeFormTab === 'contact' && (
                  <div className="space-y-3">
                    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">Teléfono:</label>
                        <input 
                          type="text" 
                          value={formData.phone} 
                          onChange={e => setFormData({...formData, phone: e.target.value})}
                          className="win-input w-full" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">Email:</label>
                        <input 
                          type="email" 
                          value={formData.email} 
                          onChange={e => setFormData({...formData, email: e.target.value})}
                          className="win-input w-full" 
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Dirección:</label>
                      <input 
                        type="text" 
                        value={formData.address || ''} 
                        onChange={e => setFormData({...formData, address: e.target.value})}
                        className="win-input w-full" 
                      />
                    </div>
                  </div>
                )}

                {activeFormTab === 'financial' && (
                  <div className="space-y-4">
                    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4 p-3 border border-white bg-slate-50/50 shadow-sm mb-4`}>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">IBAN:</label>
                        <input 
                          type="text" 
                          value={formData.iban || ''} 
                          onChange={e => setFormData({...formData, iban: e.target.value})}
                          className="win-input w-full font-mono" 
                          placeholder="ES00 0000 0000 0000 0000 0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-700 uppercase">% Propiedad:</label>
                        <input 
                          type="text" 
                          value={formData.ownership || ''} 
                          onChange={e => setFormData({...formData, ownership: e.target.value})}
                          className="win-input w-full" 
                          placeholder="Ej: 50.00"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center bg-slate-100 p-2 border border-[#808080]">
                      <span className="text-[10px] font-bold uppercase text-slate-600 italic">Vista de Rentabilidad</span>
                      <div className="flex bg-[#d4d0c8] p-0.5 border border-inset border-[#808080]">
                        <button 
                          className={`px-3 py-1 text-[9px] font-bold uppercase ${gainView === 'neta' ? 'bg-[#000080] text-white' : 'hover:bg-slate-200'}`}
                          onClick={() => setGainView('neta')}
                        >
                          Neta
                        </button>
                        <button 
                          className={`px-3 py-1 text-[9px] font-bold uppercase ${gainView === 'real' ? 'bg-[#000080] text-white' : 'hover:bg-slate-200'}`}
                          onClick={() => setGainView('real')}
                        >
                          Real
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-[#808080]">
                      <table className="win-table w-full">
                        <thead>
                          <tr>
                            <th>Inmueble</th>
                            <th className="text-right">%</th>
                            <th className="text-right">V. Actual</th>
                            <th className="text-right text-blue-700">Cap. Aportado</th>
                            {gainView === 'real' && <th className="text-right text-orange-700">Hipoteca</th>}
                            <th className="text-right">Ganancia</th>
                            <th className="text-right text-emerald-800">Ganancia + Aport.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const partnerProperties = properties.filter(p => 
                              p.owners?.some(o => o.partnerId === formData.id)
                            );

                            if (partnerProperties.length === 0) {
                              return <tr><td colSpan={gainView === 'real' ? 7 : 6} className="text-center py-10 italic text-slate-400">Sin participaciones</td></tr>;
                            }

                            let totalPercentage = 0;
                            let totalCurrentVal = 0;
                            let totalCapitalAportado = 0;
                            let totalHipoteca = 0;
                            let totalDisplayGain = 0;
                            let totalGananciaMasAportacionSum = 0;

                            const rows = partnerProperties.map(property => {
                              const owner = property.owners.find(o => o.partnerId === formData.id);
                              const ownerPercentageFloat = parseFloat(owner.percentage) || 0;
                              const perc = ownerPercentageFloat / 100;
                              const currentVal = (parseFloat(property.financials?.currentValue) || 0) * perc;
                              const hipoteca = (parseFloat(property.mortgagePending) || 0) * perc;
                              
                              // Calculate exact investment details to match RealEstate.jsx
                              const purchasePrice = parseFloat(property.financials?.purchasePrice) || 0;
                              const agentFees = parseFloat(property.financials?.agentFees) || 0;
                              
                              const totalAcquisitionExp = (property.financials?.acquisitionExpenses || []).reduce(
                                (acc, exp) => acc + (parseFloat(exp.amount) || 0), 
                                0
                              );
                              
                              const totalReforms = (property.reforms || []).reduce((acc, ref) => {
                                const invoiced = (ref.invoices || []).reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
                                const refAmount = ref.amount !== undefined && ref.amount !== null && ref.amount !== '' ? parseFloat(ref.amount) : invoiced;
                                return acc + (isNaN(refAmount) ? 0 : refAmount);
                              }, 0);
                              
                              const totalInvestment = purchasePrice + totalAcquisitionExp + agentFees + totalReforms;
                              const mortgage = parseFloat(property.loanAmount) || 0;
                              const equity = totalInvestment - mortgage;
                              
                              // Net profit matches the value on RealEstate.jsx
                              const netProfit = (parseFloat(property.financials?.currentValue) || 0) - equity;
                              const netGain = netProfit * perc;
                              const displayGain = gainView === 'real' ? netGain - hipoteca : netGain;
                              const capitalAportado = equity * perc;
                              const totalGananciaMasAportacion = displayGain + capitalAportado;

                              totalPercentage += ownerPercentageFloat;
                              totalCurrentVal += currentVal;
                              totalCapitalAportado += capitalAportado;
                              totalHipoteca += hipoteca;
                              totalDisplayGain += displayGain;
                              totalGananciaMasAportacionSum += totalGananciaMasAportacion;

                              return (
                                <tr key={property.id}>
                                  <td className="font-bold">{property.name}</td>
                                  <td className="text-right">{owner.percentage}%</td>
                                  <td className="text-right font-mono text-indigo-700">{currentVal.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                                  <td className="text-right font-mono text-blue-700">{capitalAportado.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                                  {gainView === 'real' && <td className="text-right font-mono text-orange-600">{hipoteca.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>}
                                  <td className={`text-right font-mono font-bold ${displayGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {displayGain.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className={`text-right font-mono font-bold ${totalGananciaMasAportacion >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {totalGananciaMasAportacion.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                                  </td>
                                </tr>
                              );
                            });

                            return (
                              <>
                                {rows}
                                <tr className="bg-slate-100 font-bold border-t-2 border-[#808080]">
                                  <td className="uppercase italic">Total</td>
                                  <td className="text-right">{totalPercentage.toLocaleString('de-DE', { minimumFractionDigits: 2 })}%</td>
                                  <td className="text-right font-mono text-indigo-700">{totalCurrentVal.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                                  <td className="text-right font-mono text-blue-700">{totalCapitalAportado.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                                  {gainView === 'real' && <td className="text-right font-mono text-orange-600">{totalHipoteca.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>}
                                  <td className={`text-right font-mono ${totalDisplayGain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {totalDisplayGain.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                                  </td>
                                  <td className={`text-right font-mono ${totalGananciaMasAportacionSum >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {totalGananciaMasAportacionSum.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeFormTab === 'docs' && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold text-blue-800 uppercase italic">Expediente Digital</p>
                      <button className="btn-classic px-2 py-1 flex items-center text-[10px]">
                        <Plus className="w-3 h-3 mr-1" /> Adjuntar
                      </button>
                    </div>
                    <div className="border border-[#808080] bg-white min-h-[150px]">
                      <table className="win-table w-full">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th className="w-10">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan="2" className="text-center py-10 text-slate-400 italic">No hay documentos</td>
                          </tr>
                        </tbody>
                      </table>
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

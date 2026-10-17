import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, 
  User, Phone, Mail, MapPin, CreditCard, FileText, 
  ArrowLeft, Download, Building2, UserCircle, PieChart, TrendingUp,
  ChevronLeft, ChevronRight, Filter, PanelLeft, Eye, RefreshCw
} from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { uploadFileToStorage } from '../utils/storageUtils';
import ZoomControl from '../components/ZoomControl';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';


export default function Partners() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const [showForm, setShowForm] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFormTab, setActiveFormTab] = useState('contact');
  const [gainView, setGainView] = useState('neta');
  const [showSidebar, setShowSidebar] = useState(true);

  const formTabs = [
    { id: 'contact', name: 'Contacto' },
    { id: 'financial', name: 'Participación' }
  ];
  const [filterColumn, setFilterColumn] = useState('name');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [isUploading, setIsUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);

  const { user, queryUserIds } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [selectedIds, setSelectedIds] = useState([]);

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = (displayedItems) => {
    if (selectedIds.length === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayedItems.map(item => item.id));
    }
  };

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
    setActiveFormTab('contact');
  };

  const handleEdit = (partner = null) => {
    if (selectedIds.length > 1) {
      alert("No se puede modificar más de un elemento a la vez. Por favor, selecciona solo uno.");
      return;
    }
    const target = (selectedIds.length === 1 ? partners.find(p => p.id === selectedIds[0]) : null) || (partner && partner.id ? partner : selectedPartner);
    if (!target) {
      alert('Por favor, seleccione un propietario primero.');
      return;
    }
    setFormData({ ...target });
    setIsEditing(true);
    setShowForm(true);
    setActiveFormTab('contact');
  };

  const handleDelete = async () => {
    if (selectedIds.length > 1) {
      if (!window.confirm(`¿Está seguro de que desea eliminar los ${selectedIds.length} propietarios seleccionados?`)) return;
      for (const id of selectedIds) {
        await deletePartnerFromCloud(id);
      }
      setPartners(prev => prev.filter(p => !selectedIds.includes(p.id)));
      setSelectedIds([]);
      if (selectedPartner && selectedIds.includes(selectedPartner.id)) {
        setSelectedPartner(null);
      }
      return;
    }
    const target = (selectedIds.length === 1 ? partners.find(p => p.id === selectedIds[0]) : null) || selectedPartner;
    if (!target) {
      alert('Por favor, seleccione un propietario primero.');
      return;
    }
    if (window.confirm(`¿Seguro que desea eliminar al propietario ${target.name}?`)) {
      await deletePartnerFromCloud(target.id);
      setPartners(prev => prev.filter(p => p.id !== target.id));
      setSelectedIds(prev => prev.filter(id => id !== target.id));
      if (selectedPartner?.id === target.id) setSelectedPartner(null);
    }
  };

  const handlePartnerFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !user || !formData.id) return;

    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'partners', formData.id, 'docs');
        newDocs.push({
          id: Date.now() + Math.random().toString(36).substring(7),
          name: file.name,
          concept: '',
          date: new Date().toISOString().split('T')[0],
          url,
          type: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString()
        });
      }

      setFormData(prev => ({
        ...prev,
        documents: [...(prev.documents || []), ...newDocs]
      }));
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const updatePartnerDocument = (docId, field, val) => {
    setFormData(prev => ({
      ...prev,
      documents: (prev.documents || []).map(d => d.id === docId ? { ...d, [field]: val } : d)
    }));
  };

  const deletePartnerDocument = (docId) => {
    if (window.confirm('¿Seguro que desea eliminar este documento?')) {
      setFormData(prev => ({
        ...prev,
        documents: (prev.documents || []).filter(d => d.id !== docId)
      }));
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
    const onNew = () => handleNew();
    const onEdit = () => handleEdit();
    const onDelete = () => handleDelete();
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
  }, [selectedPartner, filterColumn, filterOperator, filterValue, selectedIds, partners, filteredPartners, visibleColumns]);

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
    <div className="w-full h-full bg-white font-sans flex flex-col overflow-hidden">

      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">

        {/* Table View */}
        <div 
          className="flex-1 flex flex-col bg-white overflow-hidden relative"
          onClick={() => setSelectedPartner(null)}
        >
          {/* Header with Title and Search */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-3">
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
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-[#666]"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div 
            className="flex-1 overflow-y-auto overflow-x-hidden bg-white relative"
            onClick={(e) => e.stopPropagation()}
          >
            {renderFilterMenu()}
            {(() => {
              const displayedPartners = applyTableFilters(filteredPartners, 'partners');
              return (
                <table style={{ zoom: tableZoom }} className="clean-table">
                  <thead>
                    <tr className="sticky top-0 z-10">
                      <th className="w-8 !p-0 text-center bg-[#fafafa]">
                        <input 
                          type="checkbox" 
                          className="cursor-pointer w-3.5 h-3.5 align-middle" 
                          checked={displayedPartners.length > 0 && selectedIds.length === displayedPartners.length} 
                          onChange={() => handleToggleSelectAll(displayedPartners)} 
                        />
                      </th>
                      {visibleColumns.map(col => {
                        switch(col) {
                        case 'id': return (<TableHeaderWithFilter
     key="id" label="ID" columnKey="id" data={filteredPartners} tableId="partners" className="w-24" />);
                        case 'dni': return (<TableHeaderWithFilter
     key="dni" label="DNI" columnKey="dni" data={filteredPartners} tableId="partners" className="w-24" />);
                        case 'name': return (<TableHeaderWithFilter
     key="name" label="Nombre / Razón Social" columnKey="name" data={filteredPartners} tableId="partners" className="w-auto" />);
                        case 'email': return (!isMobile && <TableHeaderWithFilter
     key="email" label="Email" columnKey="email" data={filteredPartners} tableId="partners" className="w-48" />);
                        case 'phone': return (!isMobile && <TableHeaderWithFilter
     key="phone" label="Teléfono" columnKey="phone" data={filteredPartners} tableId="partners" className="w-32" />);
                        case 'address': return (<TableHeaderWithFilter
     key="address" label="Dirección" columnKey="address" data={filteredPartners} tableId="partners" className="w-48" />);
                        case 'iban': return (<TableHeaderWithFilter
     key="iban" label="IBAN" columnKey="iban" data={filteredPartners} tableId="partners" className="w-48" />);
                        case 'ownership': return (<TableHeaderWithFilter
     key="ownership" label="% Propiedad" columnKey="ownership" data={filteredPartners} tableId="partners" className="w-24" />);
                        case 'status': return (<TableHeaderWithFilter
     key="status" label="Estado" columnKey="status" data={filteredPartners} tableId="partners" className="w-24 text-center" />);
                        default: return null;
                        }
                      })}
        
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPartners.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length + 1} className="text-center py-20 italic text-slate-400">No se han encontrado propietarios</td>
                      </tr>
                    ) : displayedPartners.map((partner) => (
                      <tr 
                        key={partner.id} 
                        className={selectedPartner?.id === partner.id || selectedIds.includes(partner.id) ? 'selected' : ''}
                        onClick={() => setSelectedPartner(partner)}
                        onDoubleClick={() => handleEdit(partner)}
                      >
                        <td className="w-8 !p-0 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="cursor-pointer w-3.5 h-3.5 align-middle" 
                            checked={selectedIds.includes(partner.id)} 
                            onChange={() => handleToggleSelect(partner.id)} 
                          />
                        </td>
                        
                      {visibleColumns.map(col => {
                        switch(col) {
                        case 'id': return (<td
     key="id" className="font-mono">{partner.id}</td>);
                        case 'dni': return (<EditableCell
     key="dni" className="font-mono" value={partner.dni} onSave={(val) => handleSaveField(partner, 'dni', val)} />);
                        case 'name': return (<EditableCell
     key="name" value={partner.name} onSave={(val) => handleSaveField(partner, 'name', val)} />);
                        case 'email': return (!isMobile && <EditableCell
     key="email" className="lowercase normal-case" value={partner.email} onSave={(val) => handleSaveField(partner, 'email', val)} />);
                        case 'phone': return (!isMobile && <EditableCell
     key="phone" value={partner.phone} onSave={(val) => handleSaveField(partner, 'phone', val)} />);
                        case 'address': return (<EditableCell
     key="address" value={partner.address} onSave={(val) => handleSaveField(partner, 'address', val)} />);
                        case 'iban': return (<EditableCell
     key="iban" value={partner.iban} onSave={(val) => handleSaveField(partner, 'iban', val)} />);
                        case 'ownership': return (<EditableCell
     key="ownership" type="number" value={partner.ownership} onSave={(val) => handleSaveField(partner, 'ownership', val)} />);
                        case 'status': return (<EditableCell
     key="status" className="text-center" value={partner.status} options={['activo', 'inactivo']} onSave={(val) => handleSaveField(partner, 'status', val)} />);
                        default: return null;
                        }
                      })}
        
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Form Window */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-1 sm:p-4">
          <Window 
            title={`${isEditing ? 'EDITAR' : 'NUEVO'} PROPIETARIO`} 
            onClose={() => setShowForm(false)}
            width={isMobile ? '100%' : '1020px'}
            height={isMobile ? '100%' : '650px'}
            initialPos={isMobile ? { x: 0, y: 0 } : { x: 50, y: 30 }}
            onMenuClick={() => setShowSidebar(!showSidebar)}
          >
            <div className="flex h-[800px] bg-white relative">
              {/* Sidebar */}
              {showSidebar && (
                <div className={`bg-white border-r border-[#ccc] shrink-0 overflow-y-auto p-2 flex flex-col ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-52' : 'w-52'}`}>
                  <div className="border border-[#ccc] bg-white flex flex-col p-1 gap-1">
                    {formTabs.map(tab => {
                      const isActive = activeFormTab === tab.id;
                      return (
                        <button 
                          key={tab.id}
                          onClick={() => { setActiveFormTab(tab.id); if (isMobile) setShowSidebar(false); }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-[11px] transition-all border ${isActive
                            ? 'bg-[#e1e1e1] text-[#111] border-[#888] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] border-l-4 border-l-[#2b579a] font-bold'
                            : 'bg-white text-[#555] border-[#ddd] hover:bg-[#e9ecef] hover:text-[#111] font-medium'
                          }`}
                        >
                          <span className="truncate pr-1">{tab.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Mobile backdrop */}
              {isMobile && showSidebar && (
                <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowSidebar(false)} />
              )}
              
              {/* Main Content Area */}
              <div className="flex-1 bg-white flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-white p-5">
                      
                  {activeFormTab === 'contact' && (
                    <div className="space-y-4">
                      {/* Datos Generales y de Contacto */}
                      <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-700 uppercase">ID Propietario:</label>
                            <input type="text" value={formData.id} disabled className="win-input w-full bg-[#fafafa] font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-700 uppercase">Nombre / Razón Social:</label>
                            <input 
                              type="text" 
                              value={formData.name} 
                              onChange={e => setFormData({...formData, name: e.target.value})}
                              className="win-input w-full" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-700 uppercase">DNI / CIF:</label>
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
                            <label className="text-[10px] font-bold text-gray-700 uppercase">Teléfono:</label>
                            <input 
                              type="text" 
                              value={formData.phone} 
                              onChange={e => setFormData({...formData, phone: e.target.value})}
                              className="win-input w-full" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-700 uppercase">Email:</label>
                            <input 
                              type="email" 
                              value={formData.email} 
                              onChange={e => setFormData({...formData, email: e.target.value})}
                              className="win-input w-full" 
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-700 uppercase">Dirección:</label>
                            <input 
                              type="text" 
                              value={formData.address || ''} 
                              onChange={e => setFormData({...formData, address: e.target.value})}
                              className="win-input w-full" 
                            />
                          </div>
                        </div>
                      </div>

                      {/* Documentos mediante tabla abajo */}
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <div className="flex justify-between items-end mb-2">
                          <h3 className="text-[11px] font-bold text-[#333] italic uppercase tracking-wide">DOCUMENTOS</h3>
                          <div className="relative">
                            <input 
                              type="file" 
                              multiple 
                              id="partner-doc-upload" 
                              className="hidden" 
                              onChange={handlePartnerFileUpload} 
                              disabled={isUploading} 
                            />
                            <label 
                              htmlFor="partner-doc-upload" 
                              className={`border border-gray-300 bg-[#f5f5f5] hover:bg-[#ebebeb] px-3 py-1 text-[11px] text-[#333] font-medium flex items-center space-x-1.5 cursor-pointer transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                              <Plus className="w-3.5 h-3.5 text-gray-500" />
                              <span>{isUploading ? 'Subiendo...' : 'Adjuntar'}</span>
                            </label>
                          </div>
                        </div>
                        <div className="overflow-auto border border-gray-200 rounded-sm bg-white">
                          <table style={{ zoom: tableZoom }} className="modern-table w-full !border-0">
                              <thead>
                                <tr>
                                  <th className="w-[20%] text-left text-[10px]">FECHA</th>
                                  <th className="w-[30%] text-left text-[10px]">DOCUMENTO</th>
                                  <th className="w-[35%] text-left text-[10px]">CONCEPTO</th>
                                  <th className="w-[15%] text-center text-[10px]">ACCIÓN</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(!formData.documents || formData.documents.length === 0) ? (
                                  <tr>
                                    <td colSpan="4" className="text-center text-[#888] italic py-8">No hay documentos asociados a este propietario.</td>
                                  </tr>
                                ) : (
                                  formData.documents.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="py-1 px-2">
                                        <input 
                                          type="date" 
                                          className="w-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none focus:bg-transparent text-[11px] font-mono px-1 h-[24px] text-gray-800" 
                                          value={doc.date || ''} 
                                          onChange={(e) => updatePartnerDocument(doc.id, 'date', e.target.value)} 
                                        />
                                      </td>
                                      <td className="py-2 px-3">
                                        <div className="flex items-center space-x-2 truncate">
                                          <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                          <span className="truncate text-gray-700" title={doc.name}>{doc.name}</span>
                                        </div>
                                      </td>
                                      <td className="py-1 px-2">
                                        <input 
                                          type="text" 
                                          className="w-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none focus:bg-transparent text-[11px] px-1 h-[24px] text-gray-800" 
                                          value={doc.concept || ''} 
                                          onChange={(e) => updatePartnerDocument(doc.id, 'concept', e.target.value)} 
                                          placeholder="Añadir concepto..." 
                                        />
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        <div className="flex justify-center items-center space-x-4">
                                          <button className="text-gray-500 hover:text-blue-600 transition-colors cursor-pointer" onClick={() => setPreviewDocument(doc)} title="Previsualizar"><Eye className="w-3.5 h-3.5" /></button>
                                          <button className="text-gray-500 hover:text-red-600 transition-colors cursor-pointer" onClick={() => deletePartnerDocument(doc.id)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                {activeFormTab === 'financial' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[11px] font-bold text-[#333] italic uppercase tracking-wide">VISTA DE REPARTICIÓN</h3>
                    </div>

                    {/* Sub-tabs con diseño exacto de Foto 2 */}
                    <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0 mb-4 mt-3">
                      <button
                        type="button"
                        onClick={() => setGainView('neta')}
                        className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${gainView === 'neta' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" /> Rentabilidad Neta
                      </button>
                      <button
                        type="button"
                        onClick={() => setGainView('real')}
                        className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] ${gainView === 'real' ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' : 'text-slate-600 hover:bg-[#e0e0e0]'}`}
                      >
                        <PieChart className="w-3.5 h-3.5" /> Rentabilidad Real
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded-sm bg-white">
                      <table style={{ zoom: tableZoom }} className="modern-table !table-auto w-full !border-0">
                        <thead>
                          <tr>
                            <th className="text-left text-[10px] whitespace-nowrap !bg-[#fafafa]">INMUEBLE</th>
                            <th className="w-24 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">PORCENTAJE</th>
                            <th className="w-28 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">V. ACTUAL</th>
                            <th className="w-32 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">CAP. APORTADO</th>
                            {gainView === 'real' && <th className="w-28 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">HIPOTECA</th>}
                            <th className="w-32 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">GANANCIA</th>
                            <th className="w-36 text-right text-[10px] whitespace-nowrap !bg-[#fafafa]">GANANCIA + APORT.</th>
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
                                <tr key={property.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="text-[9px] text-slate-800 whitespace-nowrap font-normal">{property.name}</td>
                                  <td className="text-right text-[9px] text-black whitespace-nowrap font-normal">{(parseFloat(owner.percentage) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>
                                  <td className="text-right text-[9px] text-black whitespace-nowrap font-normal">{currentVal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                  <td className="text-right text-[9px] text-black whitespace-nowrap font-normal">{capitalAportado.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                  {gainView === 'real' && <td className="text-right text-[9px] text-black whitespace-nowrap font-normal">{hipoteca.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>}
                                  <td className={`text-right text-[9px] whitespace-nowrap font-normal ${displayGain < 0 ? 'text-red-700' : 'text-black'}`}>
                                    {displayGain.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </td>
                                  <td className={`text-right text-[9px] whitespace-nowrap font-normal ${totalGananciaMasAportacion < 0 ? 'text-red-800' : 'text-black'}`}>
                                    {totalGananciaMasAportacion.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </td>
                                </tr>
                              );
                            });

                            return (
                              <>
                                {rows}
                                <tr className="bg-[#f8f8f8] font-bold border-t-2 border-gray-300">
                                  <td className="text-[11px] text-black uppercase whitespace-nowrap">TOTALES</td>
                                  <td className="text-right text-[11px] text-black whitespace-nowrap">{totalPercentage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</td>
                                  <td className="text-right text-[11px] text-black whitespace-nowrap">{totalCurrentVal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                  <td className="text-right text-[11px] text-black whitespace-nowrap">{totalCapitalAportado.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                                  {gainView === 'real' && <td className="text-right text-[11px] text-black whitespace-nowrap">{totalHipoteca.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>}
                                  <td className="text-right text-[11px] text-black whitespace-nowrap">
                                    {totalDisplayGain.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </td>
                                  <td className="text-right text-[11px] text-black whitespace-nowrap">
                                    {totalGananciaMasAportacionSum.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
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

                  </div>
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 p-3 bg-[#f5f5f5] border-t border-[#ccc] shrink-0">
                  <button className="w-[85px] py-[4px] border border-[#a0a0a0] bg-[#f5f5f5] hover:bg-[#e8e8e8] active:bg-[#d0d0d0] text-[12px] text-slate-800 shadow-xs font-normal select-none" onClick={handleSave}>Aceptar</button>
                  <button className="w-[85px] py-[4px] border border-[#a0a0a0] bg-[#f5f5f5] hover:bg-[#e8e8e8] active:bg-[#d0d0d0] text-[12px] text-slate-800 shadow-xs font-normal select-none" onClick={() => setShowForm(false)}>Cancelar</button>
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
            width={isMobile ? "100%" : "800px"}
            initialPos={{ x: isMobile ? 0 : 100, y: isMobile ? 0 : 50 }}
            onClose={() => setPreviewDocument(null)}
          >
            <div className="bg-[#d4d0c8] p-1 h-[600px] flex flex-col">
              <div className="flex-1 bg-white border border-[#808080] border-t-0 p-1 win-bevel overflow-hidden flex flex-col">
                <div className="bg-[#cbd5e0] font-bold p-1 mb-1 uppercase text-[10px] border-b border-[#808080] shrink-0 flex justify-between items-center">
                  <span>Previsualización</span>
                  <button onClick={() => setPreviewDocument(null)} className="hover:bg-red-500 px-1"><X className="w-3 h-3" /></button>
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
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-10">
        <ZoomControl />
      </div>
</div>
  );
}

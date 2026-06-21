import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Download, Trash2, X, FileArchive, FileText, Building2, User, Landmark, Zap, Users as UsersIcon, Wrench, UserCircle, PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, deleteDoc, enableNetwork, disableNetwork } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import HipotecaTab from '../components/HipotecaTab';
import ServiciosTab from '../components/ServiciosTab';
import ComunidadTab from '../components/ComunidadTab';
import PropietariosTab from '../components/PropietariosTab';
import FinanzasTab from '../components/FinanzasTab';
import ExtractoTab from '../components/ExtractoTab';
import ClienteTab from '../components/ClienteTab';
import ReformasTab from '../components/ReformasTab';
import { uploadFileToStorage } from '../utils/storageUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import ZoomControl from '../components/ZoomControl';
import { DEFAULT_PROPERTIES } from '../utils/defaultData';

export default function RealEstate() {
  const { user, queryUserIds } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todos');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await disableNetwork(db);
          await enableNetwork(db);
        } catch (e) {
          console.warn('Firestore reconnect error:', e);
        }
        setRefreshKey(k => k + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const [availableCustomers, setAvailableCustomers] = useState([]);
  const [availablePartners, setAvailablePartners] = useState([]);
  const [rentals, setRentals] = useState([]);

  useEffect(() => {
    if (!user) return;
    
    const unsubPartners = onSnapshot(
      query(collection(db, 'partners'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setAvailablePartners(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setAvailableCustomers(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    const unsubRentals = onSnapshot(
      query(collection(db, 'rentals'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setRentals(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    return () => {
      unsubPartners();
      unsubCustomers();
      unsubRentals();
    };
  }, [user, refreshKey]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('Datos');
  const [availableAccounts, setAvailableAccounts] = useState([]);

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => handleEdit();
    const onDelete = () => handleDelete();
    window.addEventListener('real-estate:new', onNew);
    window.addEventListener('real-estate:edit', onEdit);
    window.addEventListener('real-estate:delete', onDelete);

    return () => {
      window.removeEventListener('real-estate:new', onNew);
      window.removeEventListener('real-estate:edit', onEdit);
      window.removeEventListener('real-estate:delete', onDelete);
    };
  }, [selectedProperty]);

  const [selectedTenantIndex, setSelectedTenantIndex] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [activeMortgageTab, setActiveMortgageTab] = useState('docs');
  const [activeCommunitySubTab, setActiveCommunitySubTab] = useState('payments');
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(null);
  const [selectedReformIndex, setSelectedReformIndex] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  const [showOnlyActiveServices, setShowOnlyActiveServices] = useState(false);
  const [finanzasSubTab, setFinanzasSubTab] = useState('principal');
  const [accessoryFormData, setAccessoryFormData] = useState(null);

  const { activeTableFilters, applyTableFilters, clearAllFilters, TableHeaderWithFilter, renderFilterMenu, openFilterMenu, setOpenFilterMenu } = useTableFilters();
  const DEFAULT_COLUMNS = ['id', 'name', 'address', 'cp', 'tenantDisplay', 'rentTotal'];
  const { visibleColumns, toggleColumn } = useTableColumns('properties', DEFAULT_COLUMNS);

  const transformServices = (servicesData) => {
    if (Array.isArray(servicesData)) return servicesData;
    if (!servicesData || typeof servicesData !== 'object') return [];
    
    const mapped = [];
    const mapping = {
      electricity: 'Electricidad',
      water: 'Agua',
      gas: 'Gas Natural',
      internet: 'Internet / Fibra',
      insurance: 'Seguros Hogar'
    };
    for (const [key, val] of Object.entries(servicesData)) {
      if (val?.cia || val?.ref || val?.company || val?.type) {
        mapped.push({
          id: val.id || Date.now() + Math.random().toString(36).substring(7),
          type: val.type || mapping[key] || 'Otro',
          company: val.company || val.cia || '',
          contract: val.contract || val.ref || '',
          amount: val.amount || '',
          date: val.date || '',
          doc: val.doc || '',
          docUrl: val.docUrl || '',
          active: val.active !== undefined ? val.active : true,
          invoices: val.invoices || [],
          docs: val.docs || [],
          accountingAccount: val.accountingAccount || ''
        });
      }
    }
    return mapped;
  };

  const [properties, setProperties] = useState(() => {
    const saved = localStorage.getItem('app_properties');
    if (saved && saved !== 'undefined' && saved !== 'null') {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error("Error parsing properties from localStorage", e);
      }
    }
    return DEFAULT_PROPERTIES;
  });

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'properties'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        const cloudData = snap.docs.map(d => {
          const data = d.data();
          return { ...data, id: data.id || d.id };
        });
        setProperties(cloudData);
        localStorage.setItem('app_properties', JSON.stringify(cloudData));
      },
      (err) => console.error("Properties snapshot error:", err)
    );
    return () => unsub();
  }, [user, refreshKey]);

  const savePropertyToCloud = async (property) => {
    if (!user) return;
    try {
      const docId = property.id || doc(collection(db, 'properties')).id;
      const cleanProperty = JSON.parse(JSON.stringify(property));
      await setDoc(doc(db, 'properties', docId), {
        ...cleanProperty,
        id: docId,
        userId: user.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("Error saving property to cloud:", error);
      alert("Error crítico al guardar en Firebase: " + error.message);
      throw error;
    }
  };

  const deletePropertyFromCloud = async (propertyId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'properties', propertyId));
    } catch (error) {
      console.error("Error deleting property from cloud:", error);
    }
  };

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    address: '',
    accessoryPropertyId: '',
    country: '',
    region: '',
    cp: '',
    catastral: '',
    registry: '',
    accountNumber: '',
    accountingAccount: '',
    m2: '',
    rooms: '',
    baths: '',
    year: '',
    efficiency: '',
    notes: '',
    tenants: [],
    hasMortgage: false,
    bank: '',
    mortgageType: 'fija',
    fixedYears: '',
    variableYears: '',
    variableInterest: '',
    generatedInterests: '',
    mortgageStart: '',
    totalMonths: '',
    loanNumber: '',
    loanAmount: '',
    interest: '',
    expiry: '',
    monthlyQuota: '',
    mortgageDocs: [],
    mortgageReceipts: [],
    mortgagePending: '',
    services: [],
    community: {
      admin: '',
      adminPhone: '',
      adminEmail: '',
      fee: '',
      paymentDay: '',
      hasSpecialLevy: false,
      specialLevyEndDate: '',
      specialLevyAmount: '',
      paymentDocs: [],
      meetings: []
    },
    reforms: [],
    propertyDocs: [],
    owners: [],
    financials: {
      acquisitionDate: '',
      purchasePrice: '',
      acquisitionCosts: '',
      agentFees: '',
      currentValue: '',
      salePrice: '',
      acquisitionExpenses: []
    },
    taxes: []
  });

  const handleNew = () => {
    setSelectedTenantIndex(null);
    const maxId = properties.reduce((max, p) => {
      const num = parseInt(p.id.replace('RE', '')) || 0;
      return num > max ? num : max;
    }, 0);
    setFormData({
      id: `RE${String(maxId + 1).padStart(3, '0')}`,
      name: '',
      address: '',
      country: '',
      region: '',
      cp: '',
      catastral: '',
      registry: '',
      accountNumber: '',
      accountingAccount: '',
      m2: '',
      rooms: '',
      baths: '',
      year: '',
      efficiency: '',
      notes: '',
      tenants: [],
      hasMortgage: false,
      bank: '',
      mortgageType: 'fija',
      fixedYears: '',
      variableYears: '',
      variableInterest: '',
      generatedInterests: '',
      mortgageStart: '',
      totalMonths: '',
      loanNumber: '',
      loanAmount: '',
      interest: '',
      expiry: '',
      monthlyQuota: '',
      mortgageDocs: [],
      mortgageReceipts: [],
      mortgagePending: '',
      services: [],
      community: {
        admin: '',
        adminPhone: '',
        adminEmail: '',
        fee: '',
        paymentDay: '',
        hasSpecialLevy: false,
        specialLevyEndDate: '',
        specialLevyAmount: '',
        paymentDocs: [],
        meetings: []
      },
      reforms: [],
      propertyDocs: [],
      owners: [],
      financials: {
        acquisitionDate: '',
        purchasePrice: '',
        acquisitionCosts: '',
        agentFees: '',
        currentValue: '',
        salePrice: '',
        acquisitionExpenses: []
      },
      taxes: []
    });
    setIsEditing(false);
    setShowForm(true);
  };

  const handleEdit = () => {
    if (!selectedProperty) return;
    setSelectedTenantIndex(null);
    setSelectedServiceIndex(null);
    
    setFormData({ 
      ...selectedProperty,
      services: transformServices(selectedProperty.services),
      community: {
        admin: '',
        adminPhone: '',
        adminEmail: '',
        fee: '',
        paymentDay: '',
        hasSpecialLevy: false,
        specialLevyEndDate: '',
        specialLevyAmount: '',
        paymentDocs: [],
        ...selectedProperty.community
      },
      reforms: selectedProperty.reforms || [],
      propertyDocs: selectedProperty.propertyDocs || [],
      owners: selectedProperty.owners || [],
      financials: selectedProperty.financials || {
        acquisitionDate: '',
        purchasePrice: '',
        acquisitionCosts: '',
        agentFees: '',
        currentValue: '',
        salePrice: '',
        acquisitionExpenses: []
      },
      taxes: selectedProperty.taxes || []
    });
    setFinanzasSubTab('principal');
    if (selectedProperty.accessoryPropertyId) {
      const acc = properties.find(p => p.id === selectedProperty.accessoryPropertyId);
      setAccessoryFormData(acc ? { ...acc } : null);
    } else {
      setAccessoryFormData(null);
    }
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert("El nombre de la propiedad es obligatorio");
      return;
    }

    const activeRentalsForProperty = rentals.filter(r => r.propertyId === formData.id && r.status === 'activo');
    const calculatedMonthlyRent = activeRentalsForProperty.reduce((sum, r) => sum + (parseFloat(r.rentAmount) || 0), 0);

    let updatedProperty;
    try {
      if (isEditing) {
        updatedProperty = { ...formData, monthlyRent: calculatedMonthlyRent.toString() };
        let newProps = properties.map(p => p.id === formData.id ? updatedProperty : p);
        if (accessoryFormData && accessoryFormData.id) {
          newProps = newProps.map(p => p.id === accessoryFormData.id ? accessoryFormData : p);
        }
        setProperties(newProps);
      } else {
        const newId = formData.id && !properties.find(p => p.id === formData.id) 
          ? formData.id 
          : doc(collection(db, 'properties')).id;
        updatedProperty = { ...formData, id: newId, monthlyRent: calculatedMonthlyRent.toString() };
        let newProps = [...properties, updatedProperty];
        if (accessoryFormData && accessoryFormData.id) {
          newProps = newProps.map(p => p.id === accessoryFormData.id ? accessoryFormData : p);
        }
        setProperties(newProps);
      }
      
      await savePropertyToCloud(updatedProperty);
      if (accessoryFormData && accessoryFormData.id) {
        await savePropertyToCloud(accessoryFormData);
      }
      setShowForm(false);
    } catch (error) {
      console.error("Error saving property:", error);
      alert("Error al guardar propiedad: " + error.message);
    }
  };

  const handleDelete = () => {
    if (!selectedProperty) return;
    if (window.confirm(`¿Está seguro de que desea eliminar la propiedad ${selectedProperty.name}?`)) {
      setProperties(properties.filter(p => p.id !== selectedProperty.id));
      deletePropertyFromCloud(selectedProperty.id);
      setSelectedProperty(null);
    }
  };

  const [filterColumn, setFilterColumn] = useState('name');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);

  const filteredProperties = properties.filter(p => {
    if (statusFilter !== 'todos' && (p.status || 'activo') !== statusFilter) return false;
    if (!isFilterActive && !filterValue) return true;
    
    let val = String(p[filterColumn] || '').toLowerCase();
    if (filterColumn === 'tenants' && Array.isArray(p.tenants)) {
      val = p.tenants.map(t => t.name === 'OTRO' ? t.customName : t.name).join(' ').toLowerCase();
    }
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

  const propertiesWithCalculatedRentals = useMemo(() => {
    return filteredProperties.map(p => {
      const activeRentalsForP = rentals.filter(r => r.propertyId === p.id && r.status === 'activo');
      const calculatedRentForP = activeRentalsForP.reduce((sum, r) => sum + (parseFloat(r.rentAmount) || 0), 0);
      
      const activeTenantsNames = activeRentalsForP.flatMap(r => {
        const names = [];
        if (Array.isArray(r.tenants)) {
          r.tenants.forEach(t => names.push((t.name || '').trim()));
        }
        if (Array.isArray(r.tenantIds)) {
          r.tenantIds.forEach(tId => {
            const cust = availableCustomers.find(c => c.id === tId);
            if (cust) names.push(`${cust.name} ${cust.lastName || ''}`.trim());
          });
        }
        if (r.tenantId) {
          const cust = availableCustomers.find(c => c.id === r.tenantId);
          if (cust) names.push(`${cust.name} ${cust.lastName || ''}`.trim());
        }
        return names;
      }).filter(Boolean);
      
      const uniqueActiveTenantsNames = [...new Set(activeTenantsNames)];
      const tenantDisplay = uniqueActiveTenantsNames.join(', ') || '(Sin inquilino)';
      
      return {
        ...p,
        tenantDisplay,
        rentTotal: calculatedRentForP.toFixed(2) + ' €',
        rentVal: calculatedRentForP,
        communityAdmin: p.community?.admin,
        communityAdminEmail: p.community?.adminEmail,
        communityAdminPhone: p.community?.adminPhone,
        communityFee: p.community?.fee,
        communityPaymentDay: p.community?.paymentDay,
        finAcquisitionDate: p.financials?.acquisitionDate,
        finPurchasePrice: p.financials?.purchasePrice,
        finAcquisitionCosts: p.financials?.acquisitionCosts,
        finAgentFees: p.financials?.agentFees,
        finCurrentValue: p.financials?.currentValue,
        finSalePrice: p.financials?.salePrice
      };
    });
  }, [filteredProperties, rentals, availableCustomers]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const accountsData = querySnapshot.docs
        .map(doc => doc.data())
        .filter(acc => acc.code && acc.code.length >= 4)
        .sort((a, b) => a.code.localeCompare(b.code));
      setAvailableAccounts(accountsData);
    }, (error) => {
      console.error("Error fetching accounts realtime:", error);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  const handleAssetFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !user || !formData.id) return;

    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'docs');
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
        docs: [...(prev.docs || []), ...newDocs]
      }));
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const updateAssetDocument = (docId, field, value) => {
    setFormData(prev => ({
      ...prev,
      docs: (prev.docs || []).map(d => d.id === docId ? { ...d, [field]: value } : d)
    }));
  };

  const deleteAssetDocument = (docId) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      setFormData(prev => ({
        ...prev,
        docs: (prev.docs || []).filter(d => d.id !== docId)
      }));
    }
  };

  const combinedFormData = useMemo(() => {
    if (!accessoryFormData) return formData;
    return {
      ...formData,
      investedCapital: (parseFloat(formData.investedCapital) || 0) + (parseFloat(accessoryFormData.investedCapital) || 0),
      theoreticalSalePrice: (parseFloat(formData.theoreticalSalePrice) || 0) + (parseFloat(accessoryFormData.theoreticalSalePrice) || 0),
      adquisitionExpenses: [
        ...(Array.isArray(formData.adquisitionExpenses) ? formData.adquisitionExpenses : []),
        ...(Array.isArray(accessoryFormData.adquisitionExpenses) ? accessoryFormData.adquisitionExpenses : [])
      ],
      reforms: [
        ...(Array.isArray(formData.reforms) ? formData.reforms : []),
        ...(Array.isArray(accessoryFormData.reforms) ? accessoryFormData.reforms : [])
      ]
    };
  }, [formData, accessoryFormData]);

  const tabs = [
    { id: 'Datos', icon: Building2 },
    { id: 'Cliente', icon: User },
    { id: 'Hipoteca', icon: Landmark },
    { id: 'Servicios', icon: Zap },
    { id: 'Comunidad', icon: UsersIcon },
    { id: 'Reformas', icon: Wrench },
    { id: 'Propietarios', icon: UserCircle },
    { id: 'Finanzas', icon: PieChart }
  ];

  const renderTabContent = () => {
    if (activeTab === 'Datos') {
      return (
        <div className="flex flex-col gap-6">
          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-6`}>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Nombre de la Finca:</label>
              <input type="text" className="win-input w-full" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Activo Accesorio (Opcional):</label>
              <select className="win-input w-full" value={formData.accessoryPropertyId || ''} onChange={e => {
                  const val = e.target.value;
                  setFormData({ ...formData, accessoryPropertyId: val });
                  if (val) {
                    const acc = properties.find(p => p.id === val);
                    setAccessoryFormData(acc ? { ...acc } : null);
                  } else {
                    setAccessoryFormData(null);
                  }
                }}>
                <option value="">-- Ninguno --</option>
                {properties.filter(p => p.id !== formData.id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Dirección:</label>
              <input type="text" className="win-input w-full" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">País:</label>
              <input type="text" className="win-input w-full" value={formData.country || ''} onChange={e => setFormData({ ...formData, country: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Región/Provincia:</label>
              <input type="text" className="win-input w-full" value={formData.region || ''} onChange={e => setFormData({ ...formData, region: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Código Postal:</label>
              <input type="text" className="win-input w-full" value={formData.cp || ''} onChange={e => setFormData({ ...formData, cp: e.target.value })} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Ref. Catastral:</label>
              <input type="text" className="win-input w-full" value={formData.catastral || ''} onChange={e => setFormData({ ...formData, catastral: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Reg. Propiedad:</label>
              <input type="text" className="win-input w-full" placeholder="Tomo, Libro, Finca..." value={formData.registry || ''} onChange={e => setFormData({ ...formData, registry: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Número de cuenta:</label>
              <input type="text" className="win-input w-full" value={formData.accountNumber || ''} onChange={e => setFormData({ ...formData, accountNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase" title="Doble clic en la caja de abajo para ir a la configuración de cuentas">Cuenta contable asociada:</label>
              <select className="win-input w-full cursor-pointer" value={formData.accountingAccount || ''} onChange={e => setFormData({ ...formData, accountingAccount: e.target.value })} onDoubleClick={() => navigate('/accounts')} title="Doble clic para añadir/editar cuentas">
                <option value=""></option>
                {availableAccounts.map(acc => (
                  <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col bg-slate-50 border border-gray-200 rounded-md">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white rounded-t-md">
            <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Documentos ({formData.name || 'Activo'})</h3>
            <div className="relative">
              <input type="file" multiple id="asset-doc-upload" className="hidden" onChange={handleAssetFileUpload} disabled={isUploading} />
              <label htmlFor="asset-doc-upload" className={`btn-classic flex items-center space-x-1 px-3 py-1 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <FileArchive className="w-4 h-4" />
                <span className="text-[11px] font-bold">{isUploading ? 'Subiendo...' : 'Subir Documento'}</span>
              </label>
            </div>
          </div>
          <div className="flex-1 bg-white overflow-hidden flex flex-col min-h-[200px] rounded-b-md">
            <div className="bg-[#f0f0f0] grid grid-cols-12 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase">
              <div className="col-span-4">Documento</div>
              <div className="col-span-4">Concepto</div>
              <div className="col-span-2">Fecha</div>
              <div className="col-span-2 text-center">Acción</div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
              {(!formData.docs || formData.docs.length === 0) ? (
                <div className="text-center text-slate-400 italic py-8 text-[11px]">No hay documentos asociados a este activo.</div>
              ) : (
                formData.docs.map((doc) => (
                  <div key={doc.id} className="grid grid-cols-12 gap-2 items-center text-[11px] border-b border-slate-100 pb-2">
                    <div className="col-span-4 flex items-center space-x-2 truncate">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="truncate" title={doc.name}>{doc.name}</span>
                    </div>
                    <div className="col-span-4">
                      <input type="text" className="win-input w-full text-[11px]" value={doc.concept || ''} onChange={(e) => updateAssetDocument(doc.id, 'concept', e.target.value)} placeholder="Ej. Escritura, IBI, Plano..." />
                    </div>
                    <div className="col-span-2">
                      <input type="date" className="win-input w-full text-[11px]" value={doc.date || ''} onChange={(e) => updateAssetDocument(doc.id, 'date', e.target.value)} />
                    </div>
                    <div className="col-span-2 flex justify-center space-x-2">
                      <button className="p-1 hover:bg-blue-50 text-blue-600 rounded" onClick={() => setPreviewDocument(doc)} title="Previsualizar"><Eye className="w-4 h-4" /></button>
                      <button className="p-1 hover:bg-red-50 text-red-600 rounded" onClick={() => deleteAssetDocument(doc.id)} title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      );
    }
    
    if (activeTab === 'Hipoteca') return <HipotecaTab formData={formData} setFormData={setFormData} user={user} isMobile={isMobile} setPreviewDocument={setPreviewDocument} isUploading={isUploading} setIsUploading={setIsUploading} />;
    if (activeTab === 'Servicios') return <ServiciosTab formData={formData} setFormData={setFormData} user={user} isMobile={isMobile} setPreviewDocument={setPreviewDocument} isUploading={isUploading} setIsUploading={setIsUploading} availableAccounts={availableAccounts} />;
    if (activeTab === 'Comunidad') return <ComunidadTab formData={formData} setFormData={setFormData} user={user} isMobile={isMobile} setPreviewDocument={setPreviewDocument} isUploading={isUploading} setIsUploading={setIsUploading} availableAccounts={availableAccounts} />;
    if (activeTab === 'Cliente') return <ClienteTab formData={formData} user={user} queryUserIds={queryUserIds} />;
    if (activeTab === 'Propietarios') return <PropietariosTab formData={accessoryFormData ? combinedFormData : formData} setFormData={setFormData} user={user} queryUserIds={queryUserIds} />;
    if (activeTab === 'Finanzas') {
      if (accessoryFormData) {
        return (
          <div className="flex flex-col h-full bg-white">
            <div className="flex bg-slate-100 border-b border-gray-300 p-2 gap-2">
              <button className={`px-4 py-1 text-xs font-bold rounded ${finanzasSubTab === 'principal' ? 'bg-[#000080] text-white' : 'bg-white border border-gray-300 text-slate-700'}`} onClick={() => setFinanzasSubTab('principal')}>Principal</button>
              <button className={`px-4 py-1 text-xs font-bold rounded ${finanzasSubTab === 'accesorio' ? 'bg-[#000080] text-white' : 'bg-white border border-gray-300 text-slate-700'}`} onClick={() => setFinanzasSubTab('accesorio')}>Accesorio</button>
              <button className={`px-4 py-1 text-xs font-bold rounded ${finanzasSubTab === 'agrupado' ? 'bg-[#000080] text-white' : 'bg-white border border-gray-300 text-slate-700'}`} onClick={() => setFinanzasSubTab('agrupado')}>Agrupado (Lectura)</button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {finanzasSubTab === 'principal' && <FinanzasTab formData={formData} setFormData={setFormData} rentals={rentals} user={user} setPreviewDocument={setPreviewDocument} />}
              {finanzasSubTab === 'accesorio' && <FinanzasTab formData={accessoryFormData} setFormData={setAccessoryFormData} rentals={rentals} user={user} setPreviewDocument={setPreviewDocument} />}
              {finanzasSubTab === 'agrupado' && <div className="flex-1 pointer-events-none opacity-80 flex flex-col"><FinanzasTab formData={combinedFormData} setFormData={() => {}} rentals={rentals} user={user} setPreviewDocument={setPreviewDocument} /></div>}
            </div>
          </div>
        );
      }
      return <FinanzasTab formData={formData} setFormData={setFormData} rentals={rentals} user={user} setPreviewDocument={setPreviewDocument} />;
    }
    if (activeTab === 'Reformas') return <ReformasTab formData={formData} setFormData={setFormData} user={user} isUploading={isUploading} setIsUploading={setIsUploading} setPreviewDocument={setPreviewDocument} />;
    return <div className="flex justify-center items-center h-full text-slate-500">Contenido de la pestaña {activeTab} (En desarrollo...)</div>;
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative" onClick={() => { setSelectedProperty(null); setSelectedTenantIndex(null); setSelectedServiceIndex(null); }}>
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <button className="btn-classic flex items-center gap-1.5" onClick={() => {
                      const allColumns = [
                        { header: 'ID', dataKey: 'id' },
                        { header: 'Nombre', dataKey: 'name' },
                        { header: 'Dirección', dataKey: 'address' },
                        { header: 'País', dataKey: 'country' },
                        { header: 'Provincia', dataKey: 'region' },
                        { header: 'Población', dataKey: 'city' },
                        { header: 'CP', dataKey: 'cp' },
                        { header: 'Ref. Catastral', dataKey: 'catastral' },
                        { header: 'Núm. Finca Registral', dataKey: 'registry' },
                        { header: 'Número de Cuenta', dataKey: 'accountNumber' },
                        { header: 'Cuenta Contable', dataKey: 'accountingAccount' },
                        { header: 'Inquilino Activo', dataKey: 'tenantDisplay' },
                        { header: 'Renta Mensual', dataKey: 'rentTotal' },
                        { header: 'Entidad Bancaria', dataKey: 'bank' },
                        { header: 'Número Préstamo', dataKey: 'loanNumber' },
                        { header: 'Importe Préstamo', dataKey: 'loanAmount' },
                        { header: 'Pendiente Amortizar', dataKey: 'mortgagePending' },
                        { header: 'Tipo Interés (%)', dataKey: 'interest' },
                        { header: 'Fecha Vencimiento', dataKey: 'expiry' },
                        { header: 'Admin. Comunidad', dataKey: 'communityAdmin' },
                        { header: 'Email Admin', dataKey: 'communityAdminEmail' },
                        { header: 'Tel. Admin', dataKey: 'communityAdminPhone' },
                        { header: 'Cuota Com.', dataKey: 'communityFee' },
                        { header: 'Día Cobro', dataKey: 'communityPaymentDay' },
                        { header: 'Fecha Adquisición', dataKey: 'finAcquisitionDate' },
                        { header: 'Precio Compra', dataKey: 'finPurchasePrice' },
                        { header: 'Gastos Adq.', dataKey: 'finAcquisitionCosts' },
                        { header: 'Hon. Agencia', dataKey: 'finAgentFees' },
                        { header: 'Valor Actual', dataKey: 'finCurrentValue' },
                        { header: 'Precio Venta Esp.', dataKey: 'finSalePrice' }
                      ];
                      const colsToExport = allColumns.filter(c => visibleColumns.includes(c.dataKey));
                      exportToPDF(applyTableFilters(propertiesWithCalculatedRentals, 'properties'), colsToExport, 'Reporte de Activos', 'activos.pdf');
                    }} title="Exportar a PDF"><Download className="w-3.5 h-3.5" /> PDF</button>
            </div>
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input type="text" placeholder="Buscar en el fichero (Alt+B)" value={filterValue} onChange={(e) => {
                  setFilterValue(e.target.value);
                  setIsFilterActive(e.target.value.length > 0);
                }} className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500" />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="ID" columnKey="id" data={propertiesWithCalculatedRentals} tableId="properties" className="w-16 md:w-20" />}
                  {visibleColumns.includes('name') && <TableHeaderWithFilter label="Nombre" columnKey="name" data={propertiesWithCalculatedRentals} tableId="properties" className="w-32 md:w-48" />}
                  {visibleColumns.includes('address') && <TableHeaderWithFilter label="Dirección" columnKey="address" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell md:w-64" />}
                  {visibleColumns.includes('tenantDisplay') && <TableHeaderWithFilter label="Inquilino" columnKey="tenantDisplay" data={propertiesWithCalculatedRentals} tableId="properties" className="w-24 md:w-32" />}
                  {visibleColumns.includes('rentTotal') && <TableHeaderWithFilter label="Renta Mensual" columnKey="rentTotal" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(propertiesWithCalculatedRentals, 'properties').map(p => (
                  <tr key={p.id} className={selectedProperty?.id === p.id ? 'selected' : ''} onClick={(e) => { e.stopPropagation(); setSelectedProperty(p); }} onDoubleClick={handleEdit}>
                    {visibleColumns.includes('id') && <td>{p.id}</td>}
                    {visibleColumns.includes('name') && <td className="truncate max-w-[100px]">{p.name}</td>}
                    {visibleColumns.includes('address') && <td className="hidden md:table-cell">{p.address}</td>}
                    {visibleColumns.includes('region') && <td>{p.region}</td>}
                    {visibleColumns.includes('city') && <td>{p.city}</td>}
                    {visibleColumns.includes('cp') && <td className="hidden md:table-cell">{p.cp}</td>}
                    {visibleColumns.includes('catastral') && <td className="hidden md:table-cell">{p.catastral}</td>}
                    {visibleColumns.includes('registry') && <td className="hidden md:table-cell">{p.registry}</td>}
                    {visibleColumns.includes('accountNumber') && <td className="hidden md:table-cell">{p.accountNumber}</td>}
                    {visibleColumns.includes('accountingAccount') && <td className="hidden md:table-cell">{p.accountingAccount}</td>}
                    
                    {visibleColumns.includes('tenantDisplay') && <td className="truncate max-w-[100px]" title={p.tenantDisplay}>{p.tenantDisplay}</td>}
                    {visibleColumns.includes('rentTotal') && <td className="text-right">{p.rentTotal}</td>}
                    
                    {visibleColumns.includes('bank') && <td>{p.bank}</td>}
                    {visibleColumns.includes('loanNumber') && <td>{p.loanNumber}</td>}
                    {visibleColumns.includes('loanAmount') && <td className="text-right">{p.loanAmount}</td>}
                    {visibleColumns.includes('mortgagePending') && <td className="text-right">{p.mortgagePending}</td>}
                    {visibleColumns.includes('interest') && <td className="text-right">{p.interest}</td>}
                    {visibleColumns.includes('expiry') && <td className="text-center">{p.expiry}</td>}

                    {visibleColumns.includes('communityAdmin') && <td>{p.community?.admin}</td>}
                    {visibleColumns.includes('communityAdminEmail') && <td>{p.community?.adminEmail}</td>}
                    {visibleColumns.includes('communityAdminPhone') && <td>{p.community?.adminPhone}</td>}
                    {visibleColumns.includes('communityFee') && <td className="text-right">{p.community?.fee}</td>}
                    {visibleColumns.includes('communityPaymentDay') && <td className="text-center">{p.community?.paymentDay}</td>}

                    {visibleColumns.includes('finAcquisitionDate') && <td className="text-center">{p.financials?.acquisitionDate}</td>}
                    {visibleColumns.includes('finPurchasePrice') && <td className="text-right">{p.financials?.purchasePrice}</td>}
                    {visibleColumns.includes('finAcquisitionCosts') && <td className="text-right">{p.financials?.acquisitionCosts}</td>}
                    {visibleColumns.includes('finAgentFees') && <td className="text-right">{p.financials?.agentFees}</td>}
                    {visibleColumns.includes('finCurrentValue') && <td className="text-right">{p.financials?.currentValue}</td>}
                    {visibleColumns.includes('finSalePrice') && <td className="text-right">{p.financials?.salePrice}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{filteredProperties.length} activos encontrados</div>
        <ZoomControl />
      </div>

      {/* Excel-style Filter Menu */}
      {renderFilterMenu()}

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

      {/* Property Form Window */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Window 
            title={isEditing ? `Editar Activo: ${formData.reference || formData.id || 'Nuevo'}` : "Nuevo Activo"} 
            width={isMobile ? "100%" : "1000px"}
            height={isMobile ? "100%" : "700px"}
            initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
            onClose={() => setShowForm(false)}
            onMenuClick={() => setShowSidebar(!showSidebar)}
          >
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
              {/* Sidebar - shown when showSidebar=true on both mobile and desktop */}
              {showSidebar && (
                <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setOpenFilterMenu(null); if (isMobile) setShowSidebar(false); }}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                          activeTab === tab.id
                            ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                            : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                        }`}
                      >
                        {tab.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Mobile backdrop to close sidebar */}
              {isMobile && showSidebar && (
                <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowSidebar(false)} />
              )}
              {/* Tab Content Container */}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                    {renderTabContent()}
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


import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, deleteDoc, enableNetwork, disableNetwork } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import TaxTab from '../components/TaxTab';
import ExtractoTab from '../components/ExtractoTab';
import HipotecaTab from '../components/HipotecaTab';
import ServiciosTab from '../components/ServiciosTab';
import { 
  Check, X, Search, Plus, Trash2, Edit, Save, Filter,
  Building2, User, Landmark, Zap, Users as UsersIcon,
  Download, Building, UserCircle, FileText, Wrench, ClipboardList,
  PieChart, Receipt, ChevronLeft, ChevronRight, PanelLeft
} from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { uploadFileToStorage } from '../utils/storageUtils';
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

  // Force Firestore reconnection when app returns from background (mobile fix)
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Datos');
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [filterColumn, setFilterColumn] = useState('name');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [isFilterActive, setIsFilterActive] = useState(false);

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => handleEdit();
    const onDelete = () => handleDelete();
    const onFilter = () => handleFilter();
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      handleExportFormat(properties, 'Activos', format);
    };

    window.addEventListener('real-estate:new', onNew);
    window.addEventListener('real-estate:edit', onEdit);
    window.addEventListener('real-estate:delete', onDelete);
    window.addEventListener('real-estate:filter', onFilter);
    window.addEventListener('real-estate:export', onExport);

    return () => {
      window.removeEventListener('real-estate:new', onNew);
      window.removeEventListener('real-estate:edit', onEdit);
      window.removeEventListener('real-estate:delete', onDelete);
      window.removeEventListener('real-estate:filter', onFilter);
      window.removeEventListener('real-estate:export', onExport);
    };
  }, [selectedProperty, filterColumn, filterOperator, filterValue]);

  const [selectedTenantIndex, setSelectedTenantIndex] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [activeMortgageTab, setActiveMortgageTab] = useState('docs');
  const [activeCommunitySubTab, setActiveCommunitySubTab] = useState('payments');
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(null);
  const [selectedReformIndex, setSelectedReformIndex] = useState(null);
  const [dragOverZone, setDragOverZone] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [activeTableFilters, setActiveTableFilters] = useState({});
  const [openFilterMenu, setOpenFilterMenu] = useState(null);
  const [showOnlyActiveServices, setShowOnlyActiveServices] = useState(false);

  const DEFAULT_COLUMNS = ['id', 'name', 'address', 'cp', 'tenantDisplay', 'rentTotal'];
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_COLUMNS);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sync-columns', { detail: { tab: 'Activos', columns: visibleColumns } }));
  }, [visibleColumns]);

  useEffect(() => {
    const handleToggleColumn = (e) => {
      const colId = e.detail.columnId;
      setVisibleColumns(prev => {
        if (prev.includes(colId)) return prev.filter(c => c !== colId);
        return [...prev, colId];
      });
    };
    
    const handleRequestSync = () => {
      window.dispatchEvent(new CustomEvent('sync-columns', { detail: { tab: 'Activos', columns: visibleColumns } }));
    };

    window.addEventListener('toggle-column', handleToggleColumn);
    window.addEventListener('request-sync-columns', handleRequestSync);
    
    return () => {
      window.removeEventListener('toggle-column', handleToggleColumn);
      window.removeEventListener('request-sync-columns', handleRequestSync);
    };
  }, [visibleColumns]);

  // Helper filter functions
  const getUniqueValues = (data, columnKey) => {
    if (!data || !Array.isArray(data)) return [];
    const values = data.map(item => {
      const val = item[columnKey];
      return val === null || val === undefined ? '(Vacío)' : String(val);
    });
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };

  const applyTableFilters = (data, tableId) => {
    if (!data || !Array.isArray(data)) return [];
    const filters = activeTableFilters[tableId];
    if (!filters) return data;

    return data.filter(item => {
      return Object.entries(filters).every(([columnKey, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) return true;
        const itemVal = item[columnKey] === null || item[columnKey] === undefined ? '(Vacío)' : String(item[columnKey]);
        return selectedValues.includes(itemVal);
      });
    });
  };

  const handleToggleFilterValue = (tableId, columnKey, value) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      const columnFilters = tableFilters[columnKey] || [];
      const newColumnFilters = columnFilters.includes(value)
        ? columnFilters.filter(v => v !== value)
        : [...columnFilters, value];
      
      return {
        ...prev,
        [tableId]: {
          ...tableFilters,
          [columnKey]: newColumnFilters
        }
      };
    });
  };

  const handleSelectAllFilters = (tableId, columnKey, allValues, select) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      return {
        ...prev,
        [tableId]: {
          ...tableFilters,
          [columnKey]: select ? allValues : []
        }
      };
    });
  };

  const renderFilterMenu = () => {
    if (!openFilterMenu) return null;
    const { tableId, columnKey, x, y, data } = openFilterMenu;
    const allValues = getUniqueValues(data, columnKey);
    const selectedValues = (activeTableFilters[tableId] || {})[columnKey] || [];
    
    const filteredValues = allValues.filter(val => 
      val.toLowerCase().includes(filterSearch.toLowerCase())
    );

    return (
      <div 
        className="fixed z-[100] bg-[#d4d0c8] border border-white shadow-[2px_2px_5px_rgba(0,0,0,0.3)] min-w-[180px] flex flex-col font-sans"
        style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 300) }}
      >
        <div className="bg-[#4a69bd] text-white text-[10px] px-2 py-1 font-bold flex justify-between items-center">
          <span>Filtro: {columnKey}</span>
          <button onClick={() => setOpenFilterMenu(null)} className="hover:bg-red-500 px-1"><X className="w-3 h-3" /></button>
        </div>
        
        <div className="p-2 space-y-2">
          <div className="relative">
            <input 
              type="text" 
              className="win-input w-full pl-7 pr-2 h-6 text-[10px]" 
              placeholder="Buscar..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              autoFocus
            />
            <Search className="w-3 h-3 absolute left-2 top-1.5 text-slate-400" />
          </div>

          <div className="flex space-x-1">
            <button 
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllFilters(tableId, columnKey, allValues, true)}
            >
              Seleccionar Todo
            </button>
            <button 
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllFilters(tableId, columnKey, allValues, false)}
            >
              Borrar Todo
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-[#808080] bg-white p-1">
            {filteredValues.map(val => (
              <label key={val} className="flex items-center space-x-2 hover:bg-[#0a246a] hover:text-white px-1 cursor-pointer py-0.5 group">
                <input 
                  type="checkbox" 
                  className="w-3 h-3"
                  checked={selectedValues.includes(val) || selectedValues.length === 0}
                  onChange={() => handleToggleFilterValue(tableId, columnKey, val)}
                />
                <span className="text-[10px] truncate">{val}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="p-1 border-t border-white flex justify-end">
          <button 
            className="btn-classic px-4 py-0.5 text-[10px] font-bold"
            onClick={() => setOpenFilterMenu(null)}
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  };

  const TableHeaderWithFilter = ({ label, columnKey, data, tableId, className = "" }) => {
    const isActive = (activeTableFilters[tableId] || {})[columnKey]?.length > 0;
    
    return (
      <th className={`${className} group relative`}>
        <div className="flex items-center justify-between">
          <span>{label}</span>
          <button 
            className={`p-0.5 rounded-sm hover:bg-slate-300 transition-colors ${isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setOpenFilterMenu({
                tableId,
                columnKey,
                x: rect.left,
                y: rect.bottom + 2,
                data
              });
              setFilterSearch('');
            }}
          >
            <Filter className={`w-3 h-3 ${isActive ? 'fill-blue-200' : ''}`} />
          </button>
        </div>
      </th>
    );
  };

  // Transformador para migrar datos antiguos del objeto de servicios al nuevo array dinámico:
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
      if (val?.cia || val?.ref) {
        mapped.push({
          type: mapping[key] || 'Otro',
          company: val.cia || '',
          contract: val.ref || '',
          amount: '',
          date: '',
          doc: '',
          docUrl: '',
          active: true,
          invoices: []
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
        console.log("Syncing properties from cloud. Count:", cloudData.length);
        setProperties(cloudData);
        localStorage.setItem('app_properties', JSON.stringify(cloudData));
      },
      (err) => console.error("Properties snapshot error:", err)
    );
    return () => unsub();
  }, [user, refreshKey]);

  // Handle saving to cloud
  const savePropertyToCloud = async (property) => {
    if (!user) return;
    try {
      // Use the property.id as document name if it exists, otherwise Firestore will generate one
      const docId = property.id || doc(collection(db, 'properties')).id;
      
      // Remove any undefined values which cause Firestore to fail silently
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
      throw error; // Rethrow to let handleSave know it failed
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
    
    // Transform/Migrate data
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
        setProperties(properties.map(p => p.id === formData.id ? updatedProperty : p));
      } else {
        const newId = formData.id && !properties.find(p => p.id === formData.id) 
          ? formData.id 
          : doc(collection(db, 'properties')).id;
        updatedProperty = { ...formData, id: newId, monthlyRent: calculatedMonthlyRent.toString() };
        setProperties([...properties, updatedProperty]);
      }
      
      console.log("Attempting to save property:", updatedProperty);
      await savePropertyToCloud(updatedProperty);
      console.log("Property saved successfully");
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

  const handleFilter = () => {
    setIsFilterActive(true);
  };

  const handleClear = () => {
    setFilterValue('');
    setFilterOperator('contains');
    setIsFilterActive(false);
    setActiveTableFilters({});
    setFilterSearch('');
  };

  const filteredProperties = properties.filter(p => {
    // Status filter - assuming property has a status field, if not default to 'activo'
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
      const activeTenantsNames = activeRentalsForP.flatMap(r => (r.tenants || []).map(t => t.name)).filter(Boolean);
      const uniqueActiveTenantsNames = [...new Set(activeTenantsNames)];
      const tenantDisplay = uniqueActiveTenantsNames.join(', ') || '(Sin inquilino)';
      return {
        ...p,
        tenantDisplay,
        rentTotal: calculatedRentForP.toFixed(2) + ' €',
        rentVal: calculatedRentForP
      };
    });
  }, [filteredProperties, rentals]);

  useEffect(() => {
    if (!user) return;
    const fetchAccounts = async () => {
      try {
        const q = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
        const querySnapshot = await getDocs(q);
        const accountsData = querySnapshot.docs
          .map(doc => doc.data())
          .filter(acc => acc.code && acc.code.length >= 4)
          .sort((a, b) => a.code.localeCompare(b.code));
        setAvailableAccounts(accountsData);
      } catch (error) {
        console.error("Error fetching accounts:", error);
      }
    };
  }, [user]);

  const financialMetrics = useMemo(() => {
    const totalAcquisitionExp = (formData.financials.acquisitionExpenses || []).reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
    const totalReforms = (formData.reforms || []).reduce((acc, ref) => {
      const invoiced = (ref.invoices || []).reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
      const refAmount = ref.amount !== undefined && ref.amount !== null && ref.amount !== '' ? parseFloat(ref.amount) : invoiced;
      return acc + (isNaN(refAmount) ? 0 : refAmount);
    }, 0);
    const purchasePrice = parseFloat(formData.financials.purchasePrice) || 0;
    const agentFees = parseFloat(formData.financials.agentFees) || 0;
    const totalInvestment = purchasePrice + totalAcquisitionExp + agentFees + totalReforms;
    const currentValue = parseFloat(formData.financials.currentValue) || 0;
    const mortgage = parseFloat(formData.loanAmount) || 0;
    const equity = totalInvestment - mortgage;
    const netProfit = currentValue - equity;
    const grossProfit = currentValue - totalInvestment;
    const mortgagePending = parseFloat(formData.mortgagePending) || 0;
    const realGain = netProfit - mortgagePending;
    
    const roi = totalInvestment > 0 ? (grossProfit / totalInvestment) * 100 : 0;
    const roe = equity > 0 ? (netProfit / equity) * 100 : 0;
    
    const rentRealBase = equity + mortgagePending;
    const rentReal = rentRealBase > 0 ? (realGain / rentRealBase) * 100 : 0;

    const ownersCalculations = formData.owners.map(owner => {
      const perc = (parseFloat(owner.percentage) || 0) / 100;
      return {
        ...owner,
        investment: totalInvestment * perc,
        equity: equity * perc,
        currentVal: currentValue * perc,
        profit: netProfit * perc,
        mortgagePending: mortgagePending * perc,
        realGain: (netProfit * perc) - (mortgagePending * perc)
      };
    });

    const ownersTotalPercentage = formData.owners.reduce((acc, o) => acc + (parseFloat(o.percentage) || 0), 0);
    
    const ownersTotals = ownersCalculations.reduce((acc, o) => ({
      investment: acc.investment + o.investment,
      equity: acc.equity + o.equity,
      currentVal: acc.currentVal + o.currentVal,
      profit: acc.profit + o.profit,
      mortgagePending: acc.mortgagePending + o.mortgagePending,
      realGain: acc.realGain + o.realGain
    }), { investment: 0, equity: 0, currentVal: 0, profit: 0, mortgagePending: 0, realGain: 0 });

    return {
      totalAcquisitionExp,
      totalReforms,
      totalInvestment,
      currentValue,
      mortgage,
      equity,
      netProfit,
      grossProfit,
      mortgagePending,
      realGain,
      roi,
      roe,
      rentReal,
      ownersCalculations,
      ownersTotalPercentage,
      ownersTotals
    };
  }, [formData]);

  const tabs = [
    { id: 'Datos', icon: Building2 },
    { id: 'Cliente', icon: User },
    { id: 'Hipoteca', icon: Landmark },
    { id: 'Servicios', icon: Zap },
    { id: 'Comunidad', icon: UsersIcon },
    { id: 'Reformas', icon: Wrench },
    { id: 'Propietarios', icon: UserCircle },
    { id: 'Finanzas', icon: PieChart },
    { id: 'Impuestos', icon: Receipt },
    { id: 'Extracto', icon: ClipboardList }
  ];

  const renderTabContent = () => {
    if (activeTab === 'Datos') {
      return (
        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-6`}>
          {/* Left Column */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Nombre de la Finca:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.name || ''} 
                onChange={e => setFormData({ ...formData, name: e.target.value })} 
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Dirección:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.address || ''} 
                onChange={e => setFormData({ ...formData, address: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">País:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.country || ''} 
                onChange={e => setFormData({ ...formData, country: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Región/Provincia:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.region || ''} 
                onChange={e => setFormData({ ...formData, region: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Código Postal:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.cp || ''} 
                onChange={e => setFormData({ ...formData, cp: e.target.value })} 
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Ref. Catastral:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.catastral || ''} 
                onChange={e => setFormData({ ...formData, catastral: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Reg. Propiedad:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                placeholder="Tomo, Libro, Finca..."
                value={formData.registry || ''} 
                onChange={e => setFormData({ ...formData, registry: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Número de cuenta:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={formData.accountNumber || ''} 
                onChange={e => setFormData({ ...formData, accountNumber: e.target.value })} 
              />
            </div>

            <div className="space-y-1">
              <label 
                className="text-[10px] font-bold text-slate-700 uppercase cursor-help"
                title="Doble clic en la caja de abajo para ir a la configuración de cuentas"
              >
                Cuenta contable asociada:
              </label>
              <select 
                className="win-input w-full cursor-pointer"
                value={formData.accountingAccount || ''}
                onChange={e => setFormData({ ...formData, accountingAccount: e.target.value })}
                onDoubleClick={() => navigate('/accounts')}
                title="Doble clic para añadir/editar cuentas"
              >
                <option value=""></option>
                {availableAccounts.map(acc => (
                  <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'Hipoteca') {
      return (
        <HipotecaTab 
          formData={formData} 
          setFormData={setFormData} 
          user={user} 
          isMobile={isMobile} 
          setPreviewDocument={setPreviewDocument}
          isUploading={isUploading}
          setIsUploading={setIsUploading}
        />
      );
    }

    if (activeTab === 'Servicios') {
      return (
        <ServiciosTab 
          formData={formData} 
          setFormData={setFormData} 
          user={user} 
          isMobile={isMobile} 
          setPreviewDocument={setPreviewDocument}
          isUploading={isUploading}
          setIsUploading={setIsUploading}
          availableAccounts={availableAccounts}
        />
      );
    }
    
    return (
      <div className="flex justify-center items-center h-full text-slate-500">
        Contenido de la pestaña {activeTab} (En desarrollo...)
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">

      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">

        {/* Table View */}
        <div 
          className="flex-1 flex flex-col bg-white overflow-hidden relative"
          onClick={() => {
            setSelectedProperty(null);
            setSelectedTenantIndex(null);
            setSelectedServiceIndex(null);
          }}
        >
          {/* Header with Title and Search */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-3"></div>
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
          <div className="flex-1 overflow-auto">
            <table className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('id') && <TableHeaderWithFilter label="ID" columnKey="id" data={propertiesWithCalculatedRentals} tableId="properties" className="w-16 md:w-20" />}
                  {visibleColumns.includes('name') && <TableHeaderWithFilter label="Nombre" columnKey="name" data={propertiesWithCalculatedRentals} tableId="properties" className="w-32 md:w-48" />}
                  {visibleColumns.includes('address') && <TableHeaderWithFilter label="Dirección" columnKey="address" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell md:w-64" />}
                  {visibleColumns.includes('country') && <TableHeaderWithFilter label="País" columnKey="country" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell" />}
                  {visibleColumns.includes('region') && <TableHeaderWithFilter label="Región/Provincia" columnKey="region" data={propertiesWithCalculatedRentals} tableId="properties" className="w-32" />}
                  {visibleColumns.includes('city') && <TableHeaderWithFilter label="Población" columnKey="city" data={propertiesWithCalculatedRentals} tableId="properties" className="w-32" />}
                  {visibleColumns.includes('cp') && <TableHeaderWithFilter label="CP" columnKey="cp" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell md:w-24" />}
                  {visibleColumns.includes('catastral') && <TableHeaderWithFilter label="Ref. Catastral" columnKey="catastral" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell" />}
                  {visibleColumns.includes('registry') && <TableHeaderWithFilter label="Reg. Propiedad" columnKey="registry" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell" />}
                  {visibleColumns.includes('accountNumber') && <TableHeaderWithFilter label="Número de cuenta" columnKey="accountNumber" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell" />}
                  {visibleColumns.includes('accountingAccount') && <TableHeaderWithFilter label="Cuenta contable" columnKey="accountingAccount" data={propertiesWithCalculatedRentals} tableId="properties" className="hidden md:table-cell" />}
                  
                  {visibleColumns.includes('tenantDisplay') && <TableHeaderWithFilter label="Inquilino" columnKey="tenantDisplay" data={propertiesWithCalculatedRentals} tableId="properties" className="w-24 md:w-32" />}
                  {visibleColumns.includes('rentTotal') && <TableHeaderWithFilter label="Renta Mensual" columnKey="rentTotal" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  
                  {visibleColumns.includes('bank') && <TableHeaderWithFilter label="Entidad Bancaria" columnKey="bank" data={propertiesWithCalculatedRentals} tableId="properties" />}
                  {visibleColumns.includes('loanNumber') && <TableHeaderWithFilter label="Nº Préstamo" columnKey="loanNumber" data={propertiesWithCalculatedRentals} tableId="properties" />}
                  {visibleColumns.includes('loanAmount') && <TableHeaderWithFilter label="Importe Concedido" columnKey="loanAmount" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('mortgagePending') && <TableHeaderWithFilter label="Hipoteca Pendiente" columnKey="mortgagePending" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('interest') && <TableHeaderWithFilter label="Tipo Interés" columnKey="interest" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('expiry') && <TableHeaderWithFilter label="Fecha Vencimiento" columnKey="expiry" data={propertiesWithCalculatedRentals} tableId="properties" className="text-center" />}

                  {visibleColumns.includes('communityAdmin') && <TableHeaderWithFilter label="Admin. Comunidad" columnKey="communityAdmin" data={propertiesWithCalculatedRentals} tableId="properties" />}
                  {visibleColumns.includes('communityAdminEmail') && <TableHeaderWithFilter label="Email Admin" columnKey="communityAdminEmail" data={propertiesWithCalculatedRentals} tableId="properties" />}
                  {visibleColumns.includes('communityAdminPhone') && <TableHeaderWithFilter label="Tel. Admin" columnKey="communityAdminPhone" data={propertiesWithCalculatedRentals} tableId="properties" />}
                  {visibleColumns.includes('communityFee') && <TableHeaderWithFilter label="Cuota Com." columnKey="communityFee" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('communityPaymentDay') && <TableHeaderWithFilter label="Día Cobro" columnKey="communityPaymentDay" data={propertiesWithCalculatedRentals} tableId="properties" className="text-center" />}

                  {visibleColumns.includes('finAcquisitionDate') && <TableHeaderWithFilter label="Fecha Adquisición" columnKey="finAcquisitionDate" data={propertiesWithCalculatedRentals} tableId="properties" className="text-center" />}
                  {visibleColumns.includes('finPurchasePrice') && <TableHeaderWithFilter label="Precio Compra" columnKey="finPurchasePrice" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('finAcquisitionCosts') && <TableHeaderWithFilter label="Gastos Adq." columnKey="finAcquisitionCosts" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('finAgentFees') && <TableHeaderWithFilter label="Hon. Agencia" columnKey="finAgentFees" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('finCurrentValue') && <TableHeaderWithFilter label="Valor Actual" columnKey="finCurrentValue" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                  {visibleColumns.includes('finSalePrice') && <TableHeaderWithFilter label="Precio Venta Esp." columnKey="finSalePrice" data={propertiesWithCalculatedRentals} tableId="properties" className="text-right" />}
                </tr>
              </thead>
              <tbody>
                {applyTableFilters(propertiesWithCalculatedRentals, 'properties').map(p => (
                  <tr 
                    key={p.id} 
                    className={selectedProperty?.id === p.id ? 'selected' : ''}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProperty(p);
                    }}
                    onDoubleClick={handleEdit}
                  >
                    {visibleColumns.includes('id') && <td>{p.id}</td>}
                    {visibleColumns.includes('name') && <td className="truncate max-w-[100px]">{p.name}</td>}
                    {visibleColumns.includes('address') && <td className="hidden md:table-cell">{p.address}</td>}
                    {visibleColumns.includes('country') && <td className="hidden md:table-cell">{p.country}</td>}
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
            title={isEditing ? "Editar Activo Inmobiliario" : "Nuevo Activo Inmobiliario"} 
            width={isMobile ? "100%" : "1200px"}
            initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
            onClose={() => setShowForm(false)}
            onMenuClick={() => setShowSidebar(!showSidebar)}
          >
            <div className="flex h-[800px] bg-[#d4d0c8] relative">
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


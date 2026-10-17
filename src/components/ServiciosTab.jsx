import React, { useState, useMemo, useEffect } from 'react';
import { 
  Upload, Trash2, Eye, FileText, Plus, X, RefreshCw 
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { uploadFileToStorage } from '../utils/storageUtils';
import Window from './Window';
import ResizableSidebar from './ResizableSidebar';
import AnalyticalCenters from '../pages/AnalyticalCenters';
import JournalEntry from '../pages/JournalEntry';

const GENERIC_SERVICES = [
  'Electricidad',
  'Seguros de Hogar',
  'Agua',
  'Gas Natural',
  'Internet / Fibra',
  'Comunidad',
  'Alarma / Seguridad',
  'Mantenimiento',
  'Otro'
];

export default function ServiciosTab({ 
  formData, 
  setFormData, 
  user, 
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  availableAccounts = [],
  cecos = [],
  cebes = [],
  queryUserIds = []
}) {
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const [selectedProviderId, setSelectedProviderId] = useState(null);
  const [bottomTab, setBottomTab] = useState('docs'); // 'docs' | 'extracto'
  const [showAddServiceDropdown, setShowAddServiceDropdown] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [showCecoModal, setShowCecoModal] = useState(false);

  // Estados para Asientos Contables / Extracto
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState(null);

  // Normalizar los servicios existentes (compatibilidad hacia atrás con formato plano)
  const rawServices = formData.services || [];
  const services = useMemo(() => {
    if (!Array.isArray(rawServices)) return [];

    const sortProvs = (list) => {
      return [...list].sort((a, b) => {
        const aActive = a.active !== false && a.active !== 'false';
        const bActive = b.active !== false && b.active !== 'false';
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return 0;
      });
    };

    const isAlreadyNewFormat = rawServices.some(s => Array.isArray(s.providers));
    if (isAlreadyNewFormat) {
      return rawServices.map((s, sIdx) => ({
        id: s.id || `srv-${sIdx}-${Date.now()}`,
        name: s.name || s.category || s.type || 'Servicio',
        category: s.category || s.name || s.type || 'Otro',
        providers: Array.isArray(s.providers) ? sortProvs(s.providers.map((p, pIdx) => ({
          id: p.id || `prov-${pIdx}-${Date.now()}`,
          company: p.company || '',
          contract: p.contract || '',
          startDate: p.startDate || '',
          endDate: p.endDate || '',
          ceco: p.ceco || '',
          active: p.active !== undefined ? p.active : true,
          docs: Array.isArray(p.docs) ? p.docs : []
        }))) : []
      }));
    }

    // Formato legado plano: agrupar por categoría
    const grouped = {};
    rawServices.forEach((item, idx) => {
      const cat = item.type || item.category || 'Otro';
      if (!grouped[cat]) {
        grouped[cat] = {
          id: `srv-${cat}-${Date.now()}`,
          name: cat,
          category: cat,
          providers: []
        };
      }
      grouped[cat].providers.push({
        id: item.id || `prov-${idx}-${Date.now()}`,
        company: item.company || '',
        contract: item.contract || '',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        ceco: item.ceco || '',
        active: item.active !== undefined ? item.active : true,
        docs: Array.isArray(item.docs) ? item.docs : []
      });
    });

    return Object.values(grouped).map(g => ({
      ...g,
      providers: sortProvs(g.providers)
    }));
  }, [rawServices]);

  const commitServices = (updatedServices) => {
    setFormData(prev => ({
      ...prev,
      services: updatedServices
    }));
  };

  const safeServiceIndex = (selectedServiceIndex !== null && services[selectedServiceIndex]) 
    ? selectedServiceIndex 
    : (services.length > 0 ? 0 : null);
    
  const currentService = safeServiceIndex !== null ? services[safeServiceIndex] : null;
  const providers = currentService?.providers || [];
  
  // Proveedor seleccionado: buscar por ID o por defecto el primero (que siempre es el activo)
  const currentProvider = useMemo(() => {
    if (!providers || providers.length === 0) return null;
    if (selectedProviderId) {
      const found = providers.find(p => p.id === selectedProviderId);
      if (found) return found;
    }
    return providers[0];
  }, [providers, selectedProviderId]);

  // Suscripción a journal_entries para la pestaña Extracto
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    setLoadingEntries(true);
    const q = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', userIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJournalEntries(all);
      setLoadingEntries(false);
    }, (error) => {
      console.error("Error loading journal entries in ServiciosTab:", error);
      setLoadingEntries(false);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  // Función auxiliar para extraer el código limpio de CECO o CEBE (ej. "CECO004 - SEGURO" -> "004")
  const getPureCode = (val) => {
    if (!val) return '';
    const parts = String(val).trim().split(' - ');
    const codePart = parts[0].trim().toUpperCase();
    return codePart.replace(/^(CEBE|CECO)/i, '');
  };

  // Filtrado de asientos para Extracto:
  // "la tabla solo debe darme la linea con el ceco señalado"
  // Solo la línea con coincidencia EXACTA en el CECO y que pertenezca al CEBE de Datos
  const filteredJournalRows = useMemo(() => {
    if (!currentProvider || !currentProvider.ceco) return [];

    const pureTargetCeco = getPureCode(currentProvider.ceco);
    if (!pureTargetCeco) return [];

    const pureTargetCebe = getPureCode(formData?.cebe);
    const startDate = currentProvider?.startDate || '';
    const endDate = currentProvider?.endDate || '';

    const rows = [];

    journalEntries.forEach(entry => {
      if (!entry.date) return;

      if (startDate && entry.date < startDate) return;
      if (endDate && entry.date > endDate) return;

      const hasLines = Array.isArray(entry.lines) && entry.lines.length > 0;
      
      if (hasLines) {
        entry.lines.forEach((l, lIdx) => {
          // EXCLUSIVAMENTE la línea que tenga el CECO exacto señalado
          const pureLineCeco = getPureCode(l.ceco);
          if (!pureLineCeco || pureLineCeco !== pureTargetCeco) {
            return;
          }

          // Si el activo tiene un CEBE elegido en Datos, verificar que coincida de forma exacta
          if (pureTargetCebe) {
            const pureLineCebe = getPureCode(l.cebe || entry.cebe);
            if (!pureLineCebe || pureLineCebe !== pureTargetCebe) {
              return;
            }
          }

          const debit = parseFloat(l.debit) || 0;
          const credit = parseFloat(l.credit) || 0;
          // En líneas de gasto, Debe es el importe del gasto (+), Haber es abono/devolución (-)
          const netAmount = debit > 0 ? debit : (credit > 0 ? -credit : 0);

          rows.push({
            id: `${entry.id}-${lIdx}`,
            entryId: entry.id,
            date: entry.date,
            entryNumber: entry.entryNumber || entry.number || '-',
            concept: l.description || l.concept || entry.description || entry.concept || '',
            accountCode: l.accountCode || l.accountId || '',
            document: l.document || entry.document || entry.documentName || '',
            debit,
            credit,
            amount: Math.abs(netAmount),
            isNegative: netAmount < 0,
            netAmount,
            docUrl: entry.documentUrl || entry.docUrl || l.documentUrl || null,
            parentEntry: entry
          });
        });
      } else {
        // Asientos simples legacy sin líneas
        const pureEntryCeco = getPureCode(entry.ceco);
        if (!pureEntryCeco || pureEntryCeco !== pureTargetCeco) return;

        if (pureTargetCebe) {
          const pureEntryCebe = getPureCode(entry.cebe);
          if (!pureEntryCebe || pureEntryCebe !== pureTargetCebe) return;
        }

        const totalAmt = parseFloat(entry.totalAmount || entry.amount) || 0;

        rows.push({
          id: entry.id,
          entryId: entry.id,
          date: entry.date,
          entryNumber: entry.entryNumber || entry.number || '-',
          concept: entry.description || entry.concept || '',
          accountCode: entry.accountCode || '',
          document: entry.document || entry.documentName || '',
          debit: totalAmt,
          credit: 0,
          amount: totalAmt,
          isNegative: false,
          netAmount: totalAmt,
          docUrl: entry.documentUrl || entry.docUrl || null,
          parentEntry: entry
        });
      }
    });

    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, formData?.cebe, currentProvider?.ceco, currentProvider?.startDate, currentProvider?.endDate]);

  const totalExtractoAmount = useMemo(() => {
    return filteredJournalRows.reduce((sum, r) => sum + r.netAmount, 0);
  }, [filteredJournalRows]);

  const getCecoDisplay = (code) => {
    if (!code) return '';
    const cleanCode = String(code).trim().toUpperCase().replace(/^CECO/i, '');
    const cecoObj = (cecos || []).find(c => String(c.code).trim().toUpperCase().replace(/^CECO/i, '') === cleanCode);
    return cecoObj ? `${cecoObj.code} - ${cecoObj.name}` : code;
  };

  const handleAddGenericService = (categoryName) => {
    const existingIdx = services.findIndex(s => s.name?.toLowerCase() === categoryName.toLowerCase());
    if (existingIdx !== -1) {
      setSelectedServiceIndex(existingIdx);
      const existingProvs = services[existingIdx]?.providers || [];
      setSelectedProviderId(existingProvs[0]?.id || null);
      setShowAddServiceDropdown(false);
      return;
    }

    const newProviderId = Date.now() + Math.random().toString(36).substring(7);
    const newProvider = {
      id: newProviderId,
      company: '',
      contract: '',
      startDate: '',
      endDate: '',
      ceco: '',
      active: true,
      docs: []
    };

    const newService = {
      id: Date.now() + Math.random().toString(36).substring(7),
      name: categoryName,
      category: categoryName,
      providers: [newProvider]
    };

    const updated = [...services, newService];
    commitServices(updated);
    setSelectedServiceIndex(updated.length - 1);
    setSelectedProviderId(newProviderId);
    setShowAddServiceDropdown(false);
  };

  const handleAddProvider = () => {
    if (!currentService || safeServiceIndex === null) return;
    const newId = Date.now() + Math.random().toString(36).substring(7);
    const hasActiveAlready = providers.some(p => p.active !== false && p.active !== 'false');
    const newProvider = {
      id: newId,
      company: '',
      contract: '',
      startDate: '',
      endDate: '',
      ceco: '',
      active: !hasActiveAlready,
      docs: []
    };

    const updated = [...services];
    const updatedProvs = [...providers, newProvider].sort((a, b) => {
      const aActive = a.active !== false && a.active !== 'false';
      const bActive = b.active !== false && b.active !== 'false';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });

    updated[safeServiceIndex] = {
      ...currentService,
      providers: updatedProvs
    };
    commitServices(updated);
    setSelectedProviderId(newId);
  };

  // Marcar como activo o no activo: el activo SIEMPRE se ordena a la primera posición
  const handleToggleActive = (checked) => {
    if (safeServiceIndex === null || !currentProvider) return;
    const currentId = currentProvider.id;
    const updated = [...services];
    const srv = { ...updated[safeServiceIndex] };
    
    srv.providers = (srv.providers || []).map(p => {
      if (p.id === currentId) {
        return { ...p, active: checked };
      }
      if (checked) {
        return { ...p, active: false };
      }
      return p;
    });

    // Reordenar para que el activo quede siempre de primero
    srv.providers.sort((a, b) => {
      const aActive = a.active !== false && a.active !== 'false';
      const bActive = b.active !== false && b.active !== 'false';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });

    updated[safeServiceIndex] = srv;
    commitServices(updated);
    setSelectedProviderId(currentId);
  };

  const handleDeleteProvider = (pId) => {
    if (!currentService || safeServiceIndex === null) return;
    const targetProv = (providers || []).find(p => p.id === pId) || currentProvider;
    if (!targetProv) return;

    if (!window.confirm(`¿Estás seguro de que deseas eliminar el proveedor "${targetProv.company || 'Proveedor'}"?`)) {
      return;
    }

    if (providers.length <= 1) {
      if (window.confirm(`Este es el único proveedor de "${currentService.name}". ¿Deseas eliminar todo el servicio?`)) {
        handleDeleteService(safeServiceIndex);
        return;
      }
    }

    const updatedProviders = (currentService.providers || []).filter(p => p.id !== targetProv.id);
    const updated = [...services];
    updated[safeServiceIndex] = {
      ...currentService,
      providers: updatedProviders
    };
    commitServices(updated);

    if (updatedProviders.length > 0) {
      setSelectedProviderId(updatedProviders[0].id);
    } else {
      setSelectedProviderId(null);
    }
  };

  const handleDeleteService = (sIdx) => {
    const srv = services[sIdx];
    if (!srv) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el servicio "${srv.name}" y todos sus proveedores asociados?`)) {
      return;
    }

    const updated = services.filter((_, i) => i !== sIdx);
    commitServices(updated);
    if (safeServiceIndex === sIdx) {
      setSelectedServiceIndex(updated.length > 0 ? 0 : null);
      setSelectedProviderId(updated[0]?.providers?.[0]?.id || null);
    } else if (safeServiceIndex > sIdx) {
      setSelectedServiceIndex(safeServiceIndex - 1);
    }
  };

  const updateProviderField = (field, value) => {
    if (safeServiceIndex === null || !currentProvider) return;
    const currentId = currentProvider.id;
    const updated = [...services];
    const srv = { ...updated[safeServiceIndex] };
    srv.providers = (srv.providers || []).map(p => 
      p.id === currentId ? { ...p, [field]: value } : p
    );
    updated[safeServiceIndex] = srv;
    commitServices(updated);
  };

  const handleFileUpload = async (e) => {
    if (safeServiceIndex === null || !currentProvider) return;
    const inputTarget = e.target;
    const files = Array.from(inputTarget.files);
    if (!files.length || !user) return;
    if (!formData.id) {
      alert("Guarda el activo primero para poder adjuntar documentos.");
      return;
    }

    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'services');
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

      const currentId = currentProvider.id;
      const updated = [...services];
      const srv = { ...updated[safeServiceIndex] };
      srv.providers = (srv.providers || []).map(p => {
        if (p.id !== currentId) return p;
        return {
          ...p,
          docs: [...(p.docs || []), ...newDocs]
        };
      });
      updated[safeServiceIndex] = srv;
      commitServices(updated);
    } catch (error) {
      console.error('Error al subir documento:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      if (inputTarget) inputTarget.value = '';
    }
  };

  const updateDocument = (docId, field, value) => {
    if (safeServiceIndex === null || !currentProvider) return;
    const currentId = currentProvider.id;
    const updated = [...services];
    const srv = { ...updated[safeServiceIndex] };
    srv.providers = (srv.providers || []).map(p => {
      if (p.id !== currentId) return p;
      return {
        ...p,
        docs: (p.docs || []).map(d =>
          d.id === docId ? { ...d, [field]: value } : d
        )
      };
    });
    updated[safeServiceIndex] = srv;
    commitServices(updated);
  };

  const deleteDocument = (docId) => {
    if (safeServiceIndex === null || !currentProvider) return;
    if (window.confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      const currentId = currentProvider.id;
      const updated = [...services];
      const srv = { ...updated[safeServiceIndex] };
      srv.providers = (srv.providers || []).map(p => {
        if (p.id !== currentId) return p;
        return {
          ...p,
          docs: (p.docs || []).filter(d => d.id !== docId)
        };
      });
      updated[safeServiceIndex] = srv;
      commitServices(updated);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-white relative overflow-hidden">
      {/* Panel Izquierdo: Lista de Servicios Genéricos con ResizableSidebar (arrastrar para redimensionar) */}
      <ResizableSidebar 
        defaultWidth={250} 
        minWidth={160} 
        maxWidth={550} 
        storageKey="servicios_sidebar_width"
        className="border-b md:border-b-0 md:border-r border-[#a0a0a0] bg-[#fafafa] flex flex-col shrink-0 h-full"
      >
        <div className="p-3 border-b border-[#a0a0a0] flex justify-between items-center bg-[#fafafa] relative">
          <h3 className="text-[12px] font-bold text-[#333] uppercase">Servicios</h3>
          <div className="relative">
            <button 
              type="button"
              onClick={() => setShowAddServiceDropdown(!showAddServiceDropdown)}
              className="btn-classic flex items-center space-x-1 px-2.5 py-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold">Añadir</span>
            </button>

            {/* Dropdown de Servicios Genéricos */}
            {showAddServiceDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setShowAddServiceDropdown(false)} 
                />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-400 shadow-lg rounded-sm z-40 py-1 text-xs">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase border-b border-gray-200">
                    Seleccionar Servicio
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {GENERIC_SERVICES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (cat === 'Otro') {
                            setShowAddServiceDropdown(false);
                            setShowCustomModal(true);
                          } else {
                            handleAddGenericService(cat);
                          }
                        }}
                        className="w-full px-3 py-1.5 hover:bg-gray-100 text-slate-700 hover:text-black text-left cursor-pointer transition-colors text-[11px] font-medium"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Lista de Servicios con fondo gris claro al seleccionar */}
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {services.length === 0 ? (
            <div className="text-center text-slate-400 italic py-8 text-[11px]">
              No hay servicios registrados.<br/>Haz clic en "Añadir" para empezar.
            </div>
          ) : (
            services.map((service, idx) => {
              const isSelected = safeServiceIndex === idx;
              return (
                <div 
                  key={service.id || idx}
                  onClick={() => {
                    setSelectedServiceIndex(idx);
                    const provs = service.providers || [];
                    setSelectedProviderId(provs[0]?.id || null);
                  }}
                  className={`p-2 border cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected 
                      ? 'bg-[#f0f0f0] border-[#a0a0a0] text-slate-800 font-bold shadow-2xs' 
                      : 'bg-white border-slate-200 hover:border-gray-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="truncate">
                    <div className="text-[11px] font-bold truncate">
                      {service.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteService(idx);
                    }}
                    className="text-gray-400 hover:text-red-600 p-1 transition-colors"
                    title="Eliminar este servicio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </ResizableSidebar>

      {/* Panel Derecho: Proveedores del Servicio Seleccionado */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white h-full">
        {!currentService ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 italic text-[12px] p-6 text-center">
            Selecciona un servicio de la lista de la izquierda o crea uno nuevo para ver sus proveedores y detalles.
          </div>
        ) : (
          <div className="flex-1 overflow-auto flex flex-col">
            
            {/* Pestañas de Proveedores (El activo SIEMPRE es la primera pestaña, sin mostrar "(Activo)") */}
            <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0 items-center overflow-x-auto">
              {providers.map((prov, pIdx) => {
                const isTabActive = currentProvider?.id === prov.id;
                return (
                  <button
                    key={prov.id || pIdx}
                    type="button"
                    onClick={() => setSelectedProviderId(prov.id)}
                    className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] cursor-pointer transition-colors ${
                      isTabActive 
                        ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' 
                        : 'text-slate-600 hover:bg-[#e0e0e0]'
                    }`}
                  >
                    <span className="truncate max-w-[150px]">
                      {prov.company || `Proveedor ${pIdx + 1}`}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleAddProvider}
                className="px-3 py-2 text-[11px] font-bold text-slate-700 hover:text-black hover:bg-[#e0e0e0] flex items-center gap-1.5 cursor-pointer shrink-0 border-r border-[#a0a0a0]"
                title="Añadir nuevo proveedor para este servicio"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Proveedor</span>
              </button>
            </div>

            {/* Contenido del Proveedor Seleccionado */}
            {!currentProvider ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 italic text-[12px]">
                <p>No hay proveedores para {currentService.name}.</p>
                <button
                  type="button"
                  onClick={handleAddProvider}
                  className="mt-3 btn-classic px-3 py-1 flex items-center gap-1.5 font-bold text-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" /> Añadir Primer Proveedor
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-auto flex flex-col">
                {/* Cabecera del Detalle del Proveedor */}
                <div className="p-4 border-b border-[#e0e0e0] bg-white">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
                      Detalles del Proveedor
                    </h3>
                    <button 
                      type="button"
                      onClick={() => handleDeleteProvider(currentProvider.id)}
                      className="text-[11px] text-red-500 hover:text-red-700 flex items-center gap-1 font-medium cursor-pointer"
                      title="Eliminar este proveedor"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        Empresa Suministradora:
                      </label>
                      <input 
                        type="text" 
                        className="win-input w-full" 
                        value={currentProvider.company || ''} 
                        onChange={e => updateProviderField('company', e.target.value)} 
                        placeholder="Ej. Endesa, Iberdrola, Mapfre..."
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        Contrato / Referencia:
                      </label>
                      <input 
                        type="text" 
                        className="win-input w-full" 
                        value={currentProvider.contract || ''} 
                        onChange={e => updateProviderField('contract', e.target.value)} 
                        placeholder="Número de contrato o póliza"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        Desde:
                      </label>
                      <input 
                        type="date" 
                        className="win-input w-full" 
                        value={currentProvider.startDate || ''} 
                        onChange={e => updateProviderField('startDate', e.target.value)} 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        Hasta:
                      </label>
                      <input 
                        type="date" 
                        className="win-input w-full" 
                        value={currentProvider.endDate || ''} 
                        onChange={e => updateProviderField('endDate', e.target.value)} 
                      />
                    </div>
                    
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        CECO Asociado:
                      </label>
                      <div className="flex gap-1">
                        <input 
                          type="text"
                          className="win-input flex-1 cursor-pointer bg-white"
                          value={getCecoDisplay(currentProvider.ceco)}
                          onClick={() => setShowCecoModal(true)}
                          readOnly
                          placeholder="Haga clic para seleccionar CECO..."
                          title="Haga clic para abrir la ventana de CECOs"
                        />
                        {currentProvider.ceco && (
                          <button 
                            type="button" 
                            className="btn-classic px-2.5 text-red-600 font-bold flex items-center justify-center shrink-0 cursor-pointer text-xs" 
                            onClick={() => updateProviderField('ceco', '')}
                            title="Quitar CECO asociado"
                          >
                            X
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Opción de Activo o No activo */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                        Estado:
                      </label>
                      <div className="flex items-center space-x-5 h-[30px]">
                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input 
                            type="radio" 
                            name={`provider_status_${currentProvider.id}`}
                            className="cursor-pointer w-4 h-4 text-blue-600 focus:ring-0"
                            checked={currentProvider.active !== false && currentProvider.active !== 'false'} 
                            onChange={() => handleToggleActive(true)} 
                          />
                          <span className="text-[11px] font-bold text-slate-800">Activo</span>
                        </label>
                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input 
                            type="radio" 
                            name={`provider_status_${currentProvider.id}`}
                            className="cursor-pointer w-4 h-4 text-blue-600 focus:ring-0"
                            checked={currentProvider.active === false || currentProvider.active === 'false'} 
                            onChange={() => handleToggleActive(false)} 
                          />
                          <span className="text-[11px] font-bold text-slate-600">No activo</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pestañas inferiores: Documentos y Extracto */}
                <div className="flex bg-[#f0f0f0] border-b border-[#a0a0a0] shrink-0 items-center overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setBottomTab('docs')}
                    className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] cursor-pointer transition-colors ${
                      bottomTab === 'docs' 
                        ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' 
                        : 'text-slate-600 hover:bg-[#e0e0e0]'
                    }`}
                  >
                    Documentos
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('extracto')}
                    className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#a0a0a0] cursor-pointer transition-colors ${
                      bottomTab === 'extracto' 
                        ? 'bg-white text-slate-800 border-b-2 border-b-slate-800' 
                        : 'text-slate-600 hover:bg-[#e0e0e0]'
                    }`}
                  >
                    Extracto
                  </button>
                </div>

                {/* Sub-pestaña 1: DOCUMENTOS */}
                {bottomTab === 'docs' && (
                  <div className="p-4 flex-1 flex flex-col bg-white">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">
                        Documentos ({currentProvider.company ? currentProvider.company.toUpperCase() : 'PROVEEDOR'})
                      </h3>
                      <div className="relative">
                        <input
                          type="file"
                          multiple
                          id="service-doc-upload"
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                        <label 
                          htmlFor="service-doc-upload" 
                          className={`border border-gray-400 bg-gray-200 hover:bg-gray-300 px-3 py-1 text-[11px] font-bold flex items-center text-slate-800 shrink-0 shadow-sm cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <Upload className="w-3.5 h-3.5 mr-1" />
                          <span>{isUploading ? 'Subiendo...' : 'Subir Factura/Contrato'}</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex-1 bg-white overflow-auto min-h-[220px]">
                      <table className="modern-table w-full">
                        <thead>
                          <tr>
                            <th className="w-28 text-center !bg-[#fafafa]">Fecha</th>
                            <th className="w-[35%] !bg-[#fafafa]">Documento</th>
                            <th className="w-[35%] !bg-[#fafafa]">Concepto</th>
                            <th className="w-20 text-center !bg-[#fafafa]">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!currentProvider.docs || currentProvider.docs.length === 0) ? (
                            <tr>
                              <td colSpan="4" className="text-center text-slate-400 italic py-16 text-[11px]">
                                No hay documentos asociados a este servicio.
                              </td>
                            </tr>
                          ) : (
                            currentProvider.docs.map((doc) => (
                              <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-1 text-center">
                                  <input
                                    type="date"
                                    className="w-full bg-transparent border-0 outline-none text-[11px] px-1 h-[24px] text-gray-800 text-center"
                                    value={doc.date || ''}
                                    onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                                  />
                                </td>
                                <td className="p-2 flex items-center text-[11px] text-gray-700">
                                  <FileText className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                                  <span className="truncate" title={doc.name}>{doc.name}</span>
                                </td>
                                <td className="p-1">
                                  <input
                                    type="text"
                                    className="w-full bg-transparent border-0 outline-none text-[11px] px-1 h-[24px] text-gray-800"
                                    value={doc.concept || ''}
                                    onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                                    placeholder="Ej. Factura Enero, Contrato..."
                                  />
                                </td>
                                <td className="text-center p-2">
                                  <div className="flex justify-center items-center space-x-3">
                                    {doc.url ? (
                                      <button 
                                        type="button"
                                        className="text-gray-500 hover:text-black transition-colors"
                                        onClick={() => setPreviewDocument(doc)}
                                        title="Previsualizar"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    ) : null}
                                    <button 
                                      type="button"
                                      className="text-gray-500 hover:text-red-600 transition-colors"
                                      onClick={() => deleteDocument(doc.id)}
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub-pestaña 2: EXTRACTO */}
                {bottomTab === 'extracto' && (
                  <div className="p-4 flex-1 flex flex-col bg-white">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">
                          Extracto
                        </h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {loadingEntries && <RefreshCw className="w-3.5 h-3.5 text-slate-600 animate-spin" />}
                        <div className="text-[11px] font-bold text-slate-800">
                          Total: <span className="text-slate-900">{totalExtractoAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                        </div>
                      </div>
                    </div>

                    {/* Mensajes informativos si falta CECO */}
                    {!currentProvider.ceco ? (
                      <div className="flex-1 flex items-center justify-center text-slate-500 italic text-[11px] py-16 text-center border border-dashed border-gray-200 rounded">
                        Asigna un CECO Asociado a este proveedor para ver sus asientos contables.
                      </div>
                    ) : (
                      <div className="flex-1 bg-white overflow-auto min-h-[220px] border border-gray-200 rounded-sm">
                        <table className="modern-table w-full !border-0 text-[11px]">
                          <thead className="sticky top-0 bg-[#fafafa] z-10 shadow-xs border-b border-gray-200">
                            <tr>
                              <th className="w-24 text-center !bg-[#fafafa]">Fecha</th>
                              <th className="w-28 text-center !bg-[#fafafa]">Asiento Nº</th>
                              <th className="w-[30%] !bg-[#fafafa]">Concepto</th>
                              <th className="w-24 text-center !bg-[#fafafa]">Cuenta</th>
                              <th className="w-[25%] !bg-[#fafafa]">Alquiler</th>
                              <th className="w-28 text-right !bg-[#fafafa]">Importe (€)</th>
                              <th className="w-16 text-center !bg-[#fafafa]">Doc.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredJournalRows.length === 0 ? (
                              <tr>
                                <td colSpan="7" className="text-center text-slate-400 italic py-16 text-[11px]">
                                  {loadingEntries 
                                    ? 'Cargando asientos contables...' 
                                    : 'No hay asientos contables registrados con este CECO para el CEBE seleccionado en estas fechas.'}
                                </td>
                              </tr>
                            ) : (
                              filteredJournalRows.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-b-0">
                                  <td className="p-1.5 text-center text-[10px] text-gray-700">
                                    {row.date ? row.date.split('-').reverse().join('/') : '-'}
                                  </td>
                                  <td className="p-1.5 text-center text-[10px]">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedJournalEntry(row.parentEntry)}
                                      className="font-bold cursor-pointer hover:underline text-[#4560a9]"
                                      title="Ver detalle del asiento"
                                    >
                                      {row.entryNumber}
                                    </button>
                                  </td>
                                  <td className="p-1.5 text-[10px] text-gray-800 truncate" title={row.concept}>
                                    {row.concept || '-'}
                                  </td>
                                  <td className="p-1.5 text-center text-[10px] font-mono text-gray-700">
                                    {row.accountCode || '-'}
                                  </td>
                                  <td className="p-1.5 text-[10px] text-gray-700 truncate" title={row.document}>
                                    {row.document || '-'}
                                  </td>
                                  <td className="p-1.5 text-right text-[10px] font-semibold text-slate-900">
                                    {row.isNegative ? '-' : ''}{row.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                  </td>
                                  <td className="p-1.5 text-center">
                                    {row.docUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewDocument({ url: row.docUrl, name: row.document || 'Documento' })}
                                        className="text-gray-500 hover:text-black transition-colors"
                                        title="Ver Documento"
                                      >
                                        <Eye className="w-3.5 h-3.5 mx-auto" />
                                      </button>
                                    ) : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal para Nombre de Servicio Personalizado */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[80]">
          <div className="bg-white border border-gray-400 shadow-xl rounded-sm p-4 w-[320px]">
            <h4 className="text-[12px] font-bold text-slate-800 uppercase mb-2">Nuevo Servicio</h4>
            <p className="text-[11px] text-gray-600 mb-3">Introduce el nombre del tipo de servicio:</p>
            <input 
              type="text" 
              className="win-input w-full mb-4" 
              value={customServiceName} 
              onChange={e => setCustomServiceName(e.target.value)}
              placeholder="Ej. Climatización, Portería..."
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && customServiceName.trim()) {
                  handleAddGenericService(customServiceName.trim());
                  setCustomServiceName('');
                  setShowCustomModal(false);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button 
                type="button"
                className="btn-classic px-3 py-1 text-xs" 
                onClick={() => {
                  setShowCustomModal(false);
                  setCustomServiceName('');
                }}
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={!customServiceName.trim()}
                className="border border-gray-400 bg-gray-200 hover:bg-gray-300 px-3 py-1 text-xs font-bold text-slate-800 disabled:opacity-50" 
                onClick={() => {
                  if (customServiceName.trim()) {
                    handleAddGenericService(customServiceName.trim());
                    setCustomServiceName('');
                    setShowCustomModal(false);
                  }
                }}
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Selección de CECO */}
      {showCecoModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70]">
          <Window 
            title="Selección de Centro de Coste (CECO)"
            width={isMobile ? "100%" : "900px"}
            initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
            onClose={() => setShowCecoModal(false)}
          >
            <div className="bg-white flex flex-col w-full h-[600px] relative overflow-hidden">
              <div className="flex-1 overflow-hidden relative">
                <AnalyticalCenters 
                  type="ceco" 
                  isModal={true} 
                  onSelect={(code) => {
                    updateProviderField('ceco', code);
                    setShowCecoModal(false);
                  }} 
                />
              </div>
              <div className="flex justify-end gap-2 shrink-0 px-3 py-1.5 bg-[#f0f0f0] border-t border-gray-300">
                <button 
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" 
                  onClick={() => setShowCecoModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}

      {/* Modal para Detalle / Edición de Asiento Contable */}
      {selectedJournalEntry && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-[100]">
          <Window 
            title={`Editar Asiento Contable Nº ${selectedJournalEntry.number || selectedJournalEntry.id?.substring(0, 6)}`}
            width="1150px"
            height="750px"
            initialPos={{ x: 50, y: 50 }}
            onClose={() => setSelectedJournalEntry(null)}
          >
            <div className="bg-white flex flex-col w-full h-full relative overflow-hidden">
              <JournalEntry 
                isModal={true} 
                initialEntry={selectedJournalEntry} 
                onClose={() => setSelectedJournalEntry(null)} 
              />
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

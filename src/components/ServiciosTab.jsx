import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { deleteJournalEntry } from '../services/accounting';
import { Upload, Trash2, Eye, FileText, Plus, Zap, Droplet, Wifi, Shield, Package, Power, X, Edit } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import Window from './Window';
import Accounts from '../pages/Accounts';

export default function ServiciosTab({ 
  formData, 
  setFormData, 
  user, 
  queryUserIds,
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  availableAccounts,
  cebes = [],
  cecos = []
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const services = formData.services || [];
  const selectedService = selectedIndex !== null ? services[selectedIndex] : null;

  const getAccountDisplay = (code) => {
    if (!code) return '';
    const acc = (availableAccounts || []).find(a => a.code === code);
    return acc ? `${acc.code} - ${acc.name}` : code;
  };

  const handleAddService = () => {
    const newService = {
      id: Date.now() + Math.random().toString(36).substring(7),
      type: 'Electricidad',
      company: '',
      contract: '',
      active: true,
      ceco: '',
      cebe: '',
      docs: []
    };
    
    setFormData(prev => ({
      ...prev,
      services: [...(prev.services || []), newService]
    }));
    setSelectedIndex((formData.services?.length || 0));
  };

  const updateServiceField = (index, field, value) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };
    setFormData(prev => ({ ...prev, services: newServices }));
  };

  const handleDeleteService = (index) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este servicio? Se perderán sus datos, aunque los documentos físicos seguirán en la nube.')) {
      const newServices = services.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, services: newServices }));
      if (selectedIndex === index) {
        setSelectedIndex(null);
      } else if (selectedIndex > index) {
        setSelectedIndex(selectedIndex - 1);
      }
    }
  };

  const handleFileUpload = async (e) => {
    if (selectedIndex === null) return;
    const inputTarget = e.target;
    const files = Array.from(inputTarget.files);
    if (!files.length || !user || !formData.id) return;

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

      const newServices = [...services];
      newServices[selectedIndex] = {
        ...newServices[selectedIndex],
        docs: [...(newServices[selectedIndex].docs || []), ...newDocs]
      };

      setFormData(prev => ({
        ...prev,
        services: newServices
      }));
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error al subir el documento: ' + error.message);
    } finally {
      setIsUploading(false);
      if (inputTarget) {
        inputTarget.value = '';
      }
    }
  };

  const updateDocument = (docId, field, value) => {
    if (selectedIndex === null) return;
    const newServices = [...services];
    const service = newServices[selectedIndex];
    service.docs = (service.docs || []).map(d => 
      d.id === docId ? { ...d, [field]: value } : d
    );
    setFormData(prev => ({ ...prev, services: newServices }));
  };

  const deleteDocument = (docId) => {
    if (selectedIndex === null) return;
    if (window.confirm('¿Estás seguro de que deseas eliminar este documento?')) {
      const newServices = [...services];
      const service = newServices[selectedIndex];
      service.docs = (service.docs || []).filter(d => d.id !== docId);
      setFormData(prev => ({ ...prev, services: newServices }));
    }
  };

  const getServiceIcon = (type) => {
    switch (type) {
      case 'Electricidad': return <Zap className="w-4 h-4" />;
      case 'Agua': return <Droplet className="w-4 h-4" />;
      case 'Gas Natural': return <Power className="w-4 h-4" />;
      case 'Internet / Fibra': return <Wifi className="w-4 h-4" />;
      case 'Seguros Hogar': return <Shield className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-white relative">
      {/* Panel Izquierdo: Lista de Servicios */}
      <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-[#a0a0a0] bg-[#f8f9fa] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#a0a0a0] flex justify-between items-center bg-slate-100">
          <h3 className="text-[12px] font-bold text-slate-800 uppercase">Servicios Activos</h3>
          <button 
            onClick={handleAddService}
            className="btn-classic flex items-center space-x-1 px-2 py-1"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] font-bold">Añadir</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-2 space-y-2">
          {services.length === 0 ? (
            <div className="text-center text-slate-400 italic py-8 text-[11px]">
              No hay servicios registrados.<br/>Haz clic en "Añadir" para empezar.
            </div>
          ) : (
            services.map((service, idx) => (
              <div 
                key={service.id || idx}
                onClick={() => setSelectedIndex(idx)}
                className={`p-2 border cursor-pointer flex items-center justify-between ${
                  selectedIndex === idx 
                    ? 'bg-blue-50 border-blue-400 shadow-sm' 
                    : 'bg-white border-slate-200 hover:border-blue-200'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <div className={`p-2 rounded-full ${service.active !== false ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'}`}>
                    {getServiceIcon(service.type)}
                  </div>
                  <div className="truncate">
                    <div className="text-[11px] font-bold text-slate-800 truncate">
                      {service.company || 'Sin Empresa'}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center space-x-1">
                      <span>{service.type}</span>
                      {service.active === false && (
                        <span className="text-red-500 font-semibold ml-1">(Baja)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel Derecho: Detalle del Servicio Seleccionado */}
      <div className="w-full md:w-2/3 flex flex-col flex-1 overflow-hidden bg-white">
        {!selectedService ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 italic text-[12px] p-6 text-center">
            Selecciona un servicio de la lista de la izquierda o crea uno nuevo para ver sus detalles.
          </div>
        ) : (
          <div className="flex-1 overflow-auto flex flex-col">
            {/* Cabecera del Detalle */}
            <div className="p-4 border-b border-[#e0e0e0] bg-white">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-[14px] font-bold text-slate-800 uppercase flex items-center gap-2">
                  {getServiceIcon(selectedService.type)}
                  Detalles del Servicio
                </h3>
                <button 
                  onClick={() => handleDeleteService(selectedIndex)}
                  className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1 font-bold border border-transparent hover:border-red-200 p-1 rounded"
                >
                  <Trash2 className="w-3 h-3" /> Eliminar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Empresa Suministradora:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={selectedService.company || ''} 
                    onChange={e => updateServiceField(selectedIndex, 'company', e.target.value)} 
                    placeholder="Ej. Iberdrola, Vodafone..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Tipo de Servicio:</label>
                  <select 
                    className="win-input w-full"
                    value={selectedService.type || 'Electricidad'}
                    onChange={e => updateServiceField(selectedIndex, 'type', e.target.value)}
                  >
                    <option value="Electricidad">Electricidad</option>
                    <option value="Agua">Agua</option>
                    <option value="Gas Natural">Gas Natural</option>
                    <option value="Internet / Fibra">Internet / Fibra</option>
                    <option value="Seguros Hogar">Seguros Hogar</option>
                    <option value="Comunidad">Comunidad</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Contrato / Referencia:</label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={selectedService.contract || ''} 
                    onChange={e => updateServiceField(selectedIndex, 'contract', e.target.value)} 
                    placeholder="Número de contrato o póliza"
                  />
                </div>
                
                <div className="space-y-1 relative">
                  <label 
                    className="text-[10px] font-bold text-slate-700 uppercase cursor-help"
                    title="Doble clic en la caja de abajo para ir a la configuración de cuentas"
                  >
                    Cuenta Contable Asociada:
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      className="win-input w-full cursor-pointer"
                      value={showDropdown ? accountSearch : getAccountDisplay(selectedService.accountingAccount)}
                      onChange={e => {
                        setAccountSearch(e.target.value);
                        setShowDropdown(true);
                      }}
                      onClick={() => {
                        setShowDropdown(true);
                        setAccountSearch('');
                      }}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                      onDoubleClick={() => setShowAccountsModal(true)}
                      placeholder="Buscar o doble clic para añadir..."
                      title="Doble clic para buscar o añadir una cuenta contable"
                    />
                    
                    {showDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#808080] shadow-lg max-h-48 overflow-y-auto">
                        {(availableAccounts || [])
                          .filter(acc => 
                            !accountSearch || 
                            acc.code.toLowerCase().includes(accountSearch.toLowerCase()) || 
                            acc.name.toLowerCase().includes(accountSearch.toLowerCase())
                          )
                          .map(acc => (
                            <div 
                              key={acc.code}
                              className="px-2 py-1 text-[11px] cursor-pointer hover:bg-[#316ac5] hover:text-white"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateServiceField(selectedIndex, 'accountingAccount', acc.code);
                                setShowDropdown(false);
                              }}
                            >
                              {acc.code} - {acc.name}
                            </div>
                        ))}
                        {(availableAccounts || []).filter(acc => 
                            !accountSearch || 
                            acc.code.toLowerCase().includes(accountSearch.toLowerCase()) || 
                            acc.name.toLowerCase().includes(accountSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="px-2 py-1 text-[11px] text-gray-500 italic">No hay resultados</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* CECO Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">CECO:</label>
                  <select 
                    className="win-input w-full"
                    value={selectedService.ceco || ''}
                    onChange={e => updateServiceField(selectedIndex, 'ceco', e.target.value)}
                  >
                    <option value="">-- Seleccionar CECO --</option>
                    {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>

                {/* CEBE Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">CEBE:</label>
                  <select 
                    className="win-input w-full"
                    value={selectedService.cebe || ''}
                    onChange={e => updateServiceField(selectedIndex, 'cebe', e.target.value)}
                  >
                    <option value="">-- Seleccionar CEBE --</option>
                    {cebes.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1 flex flex-col justify-end">
                  <label className="flex items-center space-x-2 cursor-pointer p-1">
                    <input 
                      type="checkbox" 
                      className="form-checkbox h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      checked={selectedService.active !== false} 
                      onChange={e => updateServiceField(selectedIndex, 'active', e.target.checked)} 
                    />
                    <span className="text-[11px] font-bold text-slate-700">Servicio Activo</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Extracto Contable del Servicio */}
            <div className="p-4 bg-white border-b border-[#e0e0e0]">
              <ServiciosJournalViewer 
                cecoCode={selectedService.ceco}
                cebeCode={selectedService.cebe}
                userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                setPreviewDocument={setPreviewDocument}
              />
            </div>

            {/* Expediente Digital del Servicio */}
            <div className="p-4 flex-1 flex flex-col bg-slate-50 min-h-[250px]">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Documentos ({selectedService.company || selectedService.type})</h3>
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
                    className={`btn-classic flex items-center space-x-1 px-3 py-1 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-[11px] font-bold">{isUploading ? 'Subiendo...' : 'Subir Factura/Contrato'}</span>
                  </label>
                </div>
              </div>

              <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[200px]">
                <div className="bg-[#f0f0f0] grid grid-cols-12 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase">
                  <div className="col-span-4">Documento</div>
                  <div className="col-span-4">Concepto</div>
                  <div className="col-span-2">Fecha</div>
                  <div className="col-span-2 text-center">Acción</div>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-2">
                  {(!selectedService.docs || selectedService.docs.length === 0) ? (
                    <div className="text-center text-slate-400 italic py-8 text-[11px]">No hay documentos asociados a este servicio.</div>
                  ) : (
                    selectedService.docs.map((doc) => (
                      <div key={doc.id} className="grid grid-cols-12 gap-2 items-center text-[11px] border-b border-slate-100 pb-2">
                        <div className="col-span-4 flex items-center space-x-2 truncate">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate" title={doc.name}>{doc.name}</span>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            className="win-input w-full text-[11px]"
                            value={doc.concept || ''}
                            onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                            placeholder="Ej. Factura Enero, Contrato..."
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="date"
                            className="win-input w-full text-[11px]"
                            value={doc.date || ''}
                            onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 flex justify-center space-x-2">
                          <button 
                            className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                            onClick={() => setPreviewDocument(doc)}
                            title="Previsualizar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            className="p-1 hover:bg-red-50 text-red-600 rounded"
                            onClick={() => deleteDocument(doc.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accounts Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70]">
          <Window 
            title="Configuración de Cuentas Contables"
            width={isMobile ? "100%" : "900px"}
            initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
            onClose={() => setShowAccountsModal(false)}
          >
            <div className="bg-[#d4d0c8] flex flex-col h-[600px]">
              <div className="flex-1 overflow-auto p-1">
                <div className="bg-white border border-[#808080] shadow-[1px_1px_0px_#000] min-h-full h-full relative">
                  <Accounts 
                    isModal={true} 
                    onAccountSelect={(code) => {
                      updateServiceField(selectedIndex, 'accountingAccount', code);
                      setShowAccountsModal(false);
                    }} 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                <button 
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" 
                  onClick={() => setShowAccountsModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

function ServiciosJournalViewer({ cecoCode, cebeCode, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!cecoCode && !cebeCode) {
      setEntries([]);
      return;
    }
    if (!userIds || userIds.length === 0) {
      setEntries([]);
      return;
    }

    const q = query(
      collection(db, 'journal_entries'), 
      where('userId', 'in', userIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all.filter(entry => {
        let matchesCeco = false;
        if (cecoCode && entry.ceco) {
          const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
          const normValue = String(cecoCode).trim().replace(/^(CEBE|CECO)/i, '');
          matchesCeco = normField.startsWith(normValue);
        }

        let matchesCebe = false;
        if (cebeCode && entry.cebe) {
          const normField = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
          const normValue = String(cebeCode).trim().replace(/^(CEBE|CECO)/i, '');
          matchesCebe = normField.startsWith(normValue);
        }

        if (cecoCode && cebeCode) {
          return matchesCeco || matchesCebe;
        } else if (cecoCode) {
          return matchesCeco;
        } else if (cebeCode) {
          return matchesCebe;
        }
        return false;
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [cecoCode, cebeCode, userIds]);

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

  const handleDelete = async (entry) => {
    if (!window.confirm(`¿Eliminar el asiento "${entry.description || 'sin descripción'}"? Esta acción revertirá los saldos contables.`)) return;
    try {
      await deleteJournalEntry(entry.userId || userIds[0], entry.id, entry.lines || []);
    } catch (err) {
      alert('Error al eliminar el asiento: ' + err.message);
    }
  };

  const handleEdit = (entry) => {
    navigate('/journal-entry', { state: { editEntry: entry } });
  };

  if (!cecoCode && !cebeCode) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase">Extracto de Asientos Contables del Servicio</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados para este servicio.</p>
      ) : (
        <div className="overflow-x-auto border border-[#808080]">
          <table className="w-full win-table bg-white">
            <thead className="bg-[#e7e1d3] sticky top-0">
              <tr>
                <th className="text-left p-1.5 w-24 text-[10px]">Fecha</th>
                <th className="text-left p-1.5 text-[10px]">Concepto</th>
                <th className="text-left p-1.5 w-40 text-[10px]">Documento</th>
                <th className="text-right p-1.5 w-24 text-[10px]">Importe</th>
                <th className="w-16 p-1 text-center text-[10px]">Acción</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-gray-200 hover:bg-blue-50">
                  <td className="p-1.5 whitespace-nowrap text-[10px]">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="p-1.5 truncate max-w-[200px] text-[10px]" title={e.description}>{e.description}</td>
                  
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
                            <span className="truncate max-w-[120px]" title={e.documentName}>{e.documentName}</span>
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
                  <td className="p-1.5 text-center flex justify-center items-center gap-2">
                    <button 
                      onClick={() => handleEdit(e)} 
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded p-0.5" 
                      title="Editar asiento"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(e)} 
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-0.5" 
                      title="Eliminar asiento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

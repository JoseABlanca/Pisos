import React, { useState } from 'react';
import { Upload, Trash2, Eye, FileText, Plus, Zap, Droplet, Wifi, Shield, Package, Power } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function ServiciosTab({ 
  formData, 
  setFormData, 
  user, 
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  availableAccounts
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const services = formData.services || [];
  const selectedService = selectedIndex !== null ? services[selectedIndex] : null;

  const handleAddService = () => {
    const newService = {
      id: Date.now() + Math.random().toString(36).substring(7),
      type: 'Electricidad',
      company: '',
      contract: '',
      active: true,
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
        // Guardamos en /properties/{propertyId}/services/
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
                
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-700 uppercase">Cuenta Contable:</label>
                    <button 
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                      onClick={() => window.open('/accounts', '_blank', 'width=800,height=600')}
                      title="Abrir configuración de cuentas en una ventana nueva"
                    >
                      Añadir/Editar cuenta
                    </button>
                  </div>
                  <select 
                    className="win-input w-full"
                    value={selectedService.accountingAccount || ''}
                    onChange={e => updateServiceField(selectedIndex, 'accountingAccount', e.target.value)}
                  >
                    <option value=""></option>
                    {(availableAccounts || []).map(acc => (
                      <option key={acc.code} value={acc.code}>{acc.code} - {acc.name}</option>
                    ))}
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

            {/* Expediente Digital del Servicio */}
            <div className="p-4 flex-1 flex flex-col bg-slate-50">
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

              <div className="flex-1 border border-[#808080] bg-white overflow-hidden flex flex-col min-h-[250px]">
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
    </div>
  );
}

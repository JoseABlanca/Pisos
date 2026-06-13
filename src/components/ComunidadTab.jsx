import React, { useState } from 'react';
import { Upload, Trash2, Eye, Plus, Calendar, FileText, Euro, Users, Check } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';
import Window from './Window';
import Accounts from '../pages/Accounts';

export default function ComunidadTab({ 
  formData, 
  setFormData, 
  user, 
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  availableAccounts
}) {
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [activeAccountField, setActiveAccountField] = useState(null); // 'community' or derrama index
  
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchValue, setSearchValue] = useState('');

  const [docFile, setDocFile] = useState(null);
  const [docConcept, setDocConcept] = useState('');
  const [docDate, setDocDate] = useState('');
  const [docAmount, setDocAmount] = useState('');

  // Ensure community object exists
  const community = formData.community || {};
  const derramas = community.derramas || [];
  const documents = community.documents || [];

  const updateCommunityField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      community: {
        ...(prev.community || {}),
        [field]: value
      }
    }));
  };

  const addDerrama = () => {
    const newDerramas = [...derramas, { id: Date.now().toString(), amount: '', endDate: '', accountingAccount: '' }];
    updateCommunityField('derramas', newDerramas);
  };

  const updateDerrama = (index, field, value) => {
    const newDerramas = [...derramas];
    newDerramas[index] = { ...newDerramas[index], [field]: value };
    updateCommunityField('derramas', newDerramas);
  };

  const removeDerrama = (index) => {
    if (window.confirm('¿Eliminar esta derrama?')) {
      const newDerramas = derramas.filter((_, i) => i !== index);
      updateCommunityField('derramas', newDerramas);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user || !formData.id) return;

    if (!docConcept) {
      alert("Por favor, introduce el concepto del documento antes de subirlo.");
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const path = `properties/${formData.id}/community/${Date.now()}_${file.name}`;
      const url = await uploadFileToStorage(path, file);
      
      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        url,
        type: file.type,
        path,
        concept: docConcept,
        date: docDate || new Date().toISOString().split('T')[0],
        amount: docAmount,
        uploadedAt: new Date().toISOString()
      };

      setFormData(prev => ({
        ...prev,
        community: {
          ...(prev.community || {}),
          documents: [...(prev.community?.documents || []), newDoc]
        }
      }));

      // Reset form
      setDocFile(null);
      setDocConcept('');
      setDocDate('');
      setDocAmount('');
      e.target.value = '';

    } catch (error) {
      console.error("Error al subir documento:", error);
      alert("Error al subir el documento: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removeDocument = (docId) => {
    if (window.confirm('¿Estás seguro de eliminar este documento? (Solo se quitará de la lista)')) {
      setFormData(prev => ({
        ...prev,
        community: {
          ...(prev.community || {}),
          documents: prev.community.documents.filter(d => d.id !== docId)
        }
      }));
    }
  };

  const updateDocument = (docId, field, value) => {
    setFormData(prev => ({
      ...prev,
      community: {
        ...(prev.community || {}),
        documents: (prev.community.documents || []).map(d => 
          d.id === docId ? { ...d, [field]: value } : d
        )
      }
    }));
  };

  const calculateRemainingDays = (endDate) => {
    if (!endDate) return '-';
    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const getAccountDisplay = (code) => {
    if (!code) return '';
    const acc = (availableAccounts || []).find(a => a.code === code);
    return acc ? `${acc.code} - ${acc.name}` : code;
  };

  const renderAccountSelector = (fieldId, currentValue, onChangeCallback) => {
    const isDropdownOpen = activeDropdown === fieldId;
    return (
      <div className="relative">
        <input 
          type="text"
          className="win-input w-full cursor-pointer"
          value={isDropdownOpen ? searchValue : getAccountDisplay(currentValue)}
          onChange={e => {
            setSearchValue(e.target.value);
            setActiveDropdown(fieldId);
          }}
          onClick={() => {
            setActiveDropdown(fieldId);
            setSearchValue('');
          }}
          onBlur={() => setTimeout(() => { if (activeDropdown === fieldId) setActiveDropdown(null) }, 200)}
          onDoubleClick={() => {
            setActiveAccountField(fieldId);
            setShowAccountsModal(true);
          }}
          placeholder="Buscar o doble clic para añadir..."
          title="Doble clic para buscar o añadir una cuenta contable"
        />
        
        {isDropdownOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-[#808080] shadow-lg max-h-48 overflow-y-auto">
            {(availableAccounts || [])
              .filter(acc => 
                !searchValue || 
                acc.code.toLowerCase().includes(searchValue.toLowerCase()) || 
                acc.name.toLowerCase().includes(searchValue.toLowerCase())
              )
              .map(acc => (
                <div 
                  key={acc.code}
                  className="px-2 py-1 text-[11px] cursor-pointer hover:bg-[#316ac5] hover:text-white"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChangeCallback(acc.code);
                    setActiveDropdown(null);
                  }}
                >
                  {acc.code} - {acc.name}
                </div>
            ))}
            {(availableAccounts || []).filter(acc => 
                !searchValue || 
                acc.code.toLowerCase().includes(searchValue.toLowerCase()) || 
                acc.name.toLowerCase().includes(searchValue.toLowerCase())
            ).length === 0 && (
              <div className="px-2 py-1 text-[11px] text-gray-500 italic">No hay resultados</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8]">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        
        {/* Top Section: Data & Derramas */}
        <div className="w-full flex flex-col gap-4">
          
          {/* Datos Comunidad */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-[11px] font-bold text-[#000080] border-b border-[#000080] pb-1 uppercase">Datos Principales</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">Administrador:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={community.admin || ''} 
                onChange={e => updateCommunityField('admin', e.target.value)} 
                placeholder="Nombre del administrador o empresa"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Teléfono:</label>
                <input 
                  type="text" 
                  className="win-input w-full" 
                  value={community.adminPhone || ''} 
                  onChange={e => updateCommunityField('adminPhone', e.target.value)} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Email:</label>
                <input 
                  type="email" 
                  className="win-input w-full" 
                  value={community.adminEmail || ''} 
                  onChange={e => updateCommunityField('adminEmail', e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Cuota Ordinaria (€):</label>
                <input 
                  type="number" 
                  className="win-input w-full text-right" 
                  value={community.fee || ''} 
                  onChange={e => updateCommunityField('fee', e.target.value)} 
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1 relative">
                <label 
                  className="text-[10px] font-bold text-slate-700 uppercase cursor-help"
                  title="Doble clic en la caja de abajo para ir a la configuración de cuentas"
                >
                  Cuenta Contable:
                </label>
                {renderAccountSelector('communityAccount', community.accountingAccount, (val) => updateCommunityField('accountingAccount', val))}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-gray-200">
              <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-100">
                <input 
                  type="checkbox" 
                  className="form-checkbox h-4 w-4 text-blue-600 rounded border-slate-300"
                  checked={community.hasSpecialLevy || false} 
                  onChange={e => {
                    updateCommunityField('hasSpecialLevy', e.target.checked);
                    if (e.target.checked && derramas.length === 0) addDerrama();
                  }} 
                />
                <span className="text-[12px] font-bold text-slate-800">Con Derrama Activa</span>
              </label>
            </div>
          </div>

          {/* Derramas Section */}
          {community.hasSpecialLevy && (
            <div className="flex flex-col space-y-3 mt-2">
              <div className="flex justify-between items-center border-b border-orange-600 pb-1">
                <h3 className="text-[11px] font-bold text-orange-600 uppercase">Derramas</h3>
                <button 
                  onClick={addDerrama}
                  className="flex items-center text-[10px] text-blue-600 hover:text-blue-800 font-bold"
                >
                  <Plus className="w-3 h-3 mr-1" /> Añadir derrama
                </button>
              </div>

              {derramas.length === 0 && (
                <div className="text-[11px] text-slate-500 italic text-center py-2">
                  No hay derramas configuradas. Pulsa 'Añadir derrama'.
                </div>
              )}

              {derramas.map((derrama, idx) => (
                <div key={derrama.id} className="p-2 border border-orange-200 bg-orange-50 relative">
                  <button 
                    onClick={() => removeDerrama(idx)}
                    className="absolute top-1 right-1 text-red-500 hover:text-red-700 bg-white rounded p-0.5"
                    title="Eliminar derrama"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <div className="grid grid-cols-2 gap-3 pr-4 mb-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Importe (€):</label>
                      <input 
                        type="number" 
                        className="win-input w-full text-right" 
                        value={derrama.amount || ''} 
                        onChange={e => updateDerrama(idx, 'amount', e.target.value)} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Fecha Final:</label>
                      <input 
                        type="date" 
                        className="win-input w-full" 
                        value={derrama.endDate || ''} 
                        onChange={e => updateDerrama(idx, 'endDate', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pr-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Días Restantes:</label>
                      <div className="win-input w-full bg-gray-100 flex items-center justify-center font-bold text-[12px] text-blue-800 h-[22px]">
                        {calculateRemainingDays(derrama.endDate)} días
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Cuenta Contable:</label>
                      {renderAccountSelector(`derrama_${idx}`, derrama.accountingAccount, (val) => updateDerrama(idx, 'accountingAccount', val))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Bottom Section: Expediente Digital */}
        <div className="w-full flex flex-col h-full min-h-[300px]">
          <div className="flex flex-col h-full pt-4">
            <div className="bg-[#cbd5e0] font-bold p-1 border-b border-[#808080] shrink-0 text-[11px] uppercase flex items-center">
              <FileText className="w-3 h-3 mr-1" />
              Expediente Digital Comunidad
            </div>
            
            {/* Upload form */}
            <div className="p-2 border-b border-[#808080] bg-[#f0f0f0] shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Concepto <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    className="win-input w-full" 
                    value={docConcept}
                    onChange={e => setDocConcept(e.target.value)}
                    placeholder="Ej: Recibo Enero, Acta Reunión..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Fecha</label>
                  <input 
                    type="date" 
                    className="win-input w-full" 
                    value={docDate}
                    onChange={e => setDocDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-700 uppercase">Cantidad (€)</label>
                  <input 
                    type="number" 
                    className="win-input w-full text-right" 
                    value={docAmount}
                    onChange={e => setDocAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <input 
                  type="file" 
                  id="community-file-upload"
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={isUploading || !formData.id}
                />
                <label 
                  htmlFor="community-file-upload" 
                  className={`btn-classic px-4 py-1 text-[11px] font-bold flex items-center shrink-0 ${(!formData.id || isUploading || !docConcept) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Upload className="w-3 h-3 mr-2" />
                  {isUploading ? 'Subiendo...' : 'Seleccionar Archivo'}
                </label>
                {!formData.id && (
                  <span className="text-[10px] text-red-600 font-bold ml-2">
                    Guarda la propiedad primero
                  </span>
                )}
                {!docConcept && formData.id && (
                  <span className="text-[10px] text-orange-600 font-bold ml-2">
                    Indica un concepto primero
                  </span>
                )}
              </div>
            </div>

            {/* Documents Table */}
            <div className="flex-1 overflow-auto bg-white p-1 min-h-[200px]">
              <table className="clean-table w-full">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <th>Concepto</th>
                    <th className="w-24 text-center">Fecha</th>
                    <th className="w-24 text-right">Cantidad</th>
                    <th className="w-16 text-center">Docs</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center text-slate-500 py-4 italic text-[11px]">
                        No hay documentos guardados
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc, idx) => (
                      <tr key={doc.id || idx}>
                        <td className="text-center">
                          <button 
                            onClick={() => removeDocument(doc.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Eliminar documento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className="p-0">
                          <input 
                            type="text"
                            value={doc.concept || ''}
                            onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] font-bold px-1 m-0 h-[22px]"
                          />
                        </td>
                        <td className="text-center w-28 p-0">
                          <input 
                            type="date"
                            value={doc.date ? doc.date.split('T')[0] : ''}
                            onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] text-center px-1 m-0 h-[22px]"
                          />
                        </td>
                        <td className="text-right w-24 p-0">
                          <input 
                            type="number"
                            value={doc.amount || ''}
                            onChange={(e) => updateDocument(doc.id, 'amount', e.target.value)}
                            className="win-input w-full bg-transparent border-transparent hover:border-gray-300 focus:bg-white text-[11px] text-right px-1 m-0 h-[22px]"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="text-center">
                          <button 
                            onClick={() => setPreviewDocument({ url: doc.url, type: doc.type, name: doc.name })}
                            className="text-blue-600 hover:text-blue-800"
                            title="Ver documento"
                          >
                            <Eye className="w-4 h-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
                      if (activeAccountField === 'communityAccount') {
                        updateCommunityField('accountingAccount', code);
                      } else if (activeAccountField.startsWith('derrama_')) {
                        const idx = parseInt(activeAccountField.split('_')[1]);
                        updateDerrama(idx, 'accountingAccount', code);
                      }
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

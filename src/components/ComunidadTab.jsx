import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { deleteJournalEntry } from '../services/accounting';
import { Upload, Trash2, Eye, Plus, Calendar, FileText, Euro, Users, Check, X, Edit, FolderOpen } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function ComunidadTab({ 
  formData, 
  setFormData, 
  user, 
  queryUserIds,
  isMobile, 
  setPreviewDocument,
  isUploading,
  setIsUploading,
  cecos = [],
  cebes = []
}) {
  const [activeBottomTab, setActiveBottomTab] = useState('docs'); // docs, ordinario, derrama

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
    const newDerramas = [...derramas, { id: Date.now().toString(), amount: '', endDate: '' }];
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

    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'community');
      
      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        url,
        type: file.type,
        concept: 'Nuevo Documento',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        uploadedAt: new Date().toISOString()
      };

      setFormData(prev => ({
        ...prev,
        community: {
          ...(prev.community || {}),
          documents: [...(prev.community?.documents || []), newDoc]
        }
      }));

      e.target.value = '';
    } catch (error) {
      console.error("Error al subir documento:", error);
      alert("Error al subir el documento: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRowFileUpload = async (e, docId) => {
    const file = e.target.files[0];
    if (!file || !user || !formData.id) return;

    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, 'properties', formData.id, 'community');
      
      setFormData(prev => ({
        ...prev,
        community: {
          ...(prev.community || {}),
          documents: (prev.community.documents || []).map(d => 
            d.id === docId ? { ...d, url, name: file.name, type: file.type, uploadedAt: new Date().toISOString() } : d
          )
        }
      }));
    } catch (error) {
      console.error("Error al subir documento para la fila:", error);
      alert("Error al subir el documento: " + error.message);
    } finally {
      setIsUploading(false);
      e.target.value = '';
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
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Día Cobro:</label>
                <input 
                  type="number" 
                  min="1"
                  max="31"
                  className="win-input w-full text-right" 
                  value={community.paymentDay || ''} 
                  onChange={e => updateCommunityField('paymentDay', e.target.value)} 
                  placeholder="1-31"
                />
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
                  <div className="grid grid-cols-1 gap-3 pr-4">
                    <div className="space-y-1 col-span-1">
                      <label className="text-[10px] font-bold text-slate-700 uppercase">Días Restantes:</label>
                      <div className="win-input w-[150px] bg-gray-100 flex items-center justify-center font-bold text-[12px] text-blue-800 h-[22px]">
                        {calculateRemainingDays(derrama.endDate)} días
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Bottom Section: Expediente Digital & Registros Analíticos */}
        <div className="w-full flex flex-col h-full min-h-[350px]">
          <div className="flex flex-col h-full pt-4">
            {/* Sub-tabs header for bottom section */}
            <div className="flex bg-[#cbd5e0] border-b border-[#808080] shrink-0">
              <button
                onClick={() => setActiveBottomTab('docs')}
                className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#808080] ${activeBottomTab === 'docs' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-700 hover:bg-[#b0c0d0]'}`}
              >
                <FileText className="w-3 h-3" /> Expediente Digital (Docs)
              </button>
              <button
                onClick={() => setActiveBottomTab('ordinario')}
                className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#808080] ${activeBottomTab === 'ordinario' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-700 hover:bg-[#b0c0d0]'}`}
              >
                <FolderOpen className="w-3 h-3" /> Registros Comunidad
              </button>
              <button
                onClick={() => setActiveBottomTab('derrama')}
                className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#808080] ${activeBottomTab === 'derrama' ? 'bg-white text-blue-800 border-b-2 border-b-blue-500' : 'text-slate-700 hover:bg-[#b0c0d0]'}`}
              >
                <FolderOpen className="w-3 h-3" /> Registros Derrama
              </button>
            </div>
            
            <div className="bg-white flex-1 flex flex-col p-3 border-x border-b border-[#808080]">
              {activeBottomTab === 'docs' && (
                <div className="flex-1 flex flex-col">
                  {/* Upload form */}
                  <div className="p-2 border-b border-slate-200 bg-[#f0f0f0] shrink-0 flex items-center space-x-2 mb-2">
                    <input 
                      type="file" 
                      id="community-file-upload"
                      className="hidden" 
                      onChange={handleFileUpload}
                      disabled={isUploading || !formData.id}
                    />
                    <label 
                      htmlFor="community-file-upload" 
                      className={`btn-classic px-4 py-1 text-[11px] font-bold flex items-center shrink-0 ${(!formData.id || isUploading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      title="Sube un archivo y crea el registro asociado"
                    >
                      <Upload className="w-3 h-3 mr-2" />
                      {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                    </label>

                    <button
                      onClick={() => {
                        const newDoc = {
                          id: Date.now().toString(),
                          name: null,
                          url: null,
                          type: null,
                          path: null,
                          concept: 'Nuevo Registro Manual',
                          date: new Date().toISOString().split('T')[0],
                          amount: '',
                          uploadedAt: new Date().toISOString()
                        };
                        setFormData(prev => ({
                          ...prev,
                          community: {
                            ...(prev.community || {}),
                            documents: [...(prev.community?.documents || []), newDoc]
                          }
                        }));
                      }}
                      className={`btn-classic px-4 py-1 text-[11px] font-bold flex items-center shrink-0 ${!formData.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      disabled={!formData.id}
                      title="Añade una línea al expediente sin subir ningún archivo"
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      Añadir Registro Manual
                    </button>

                    {!formData.id && (
                      <span className="text-[10px] text-red-600 font-bold ml-2">
                        Guarda la propiedad primero
                      </span>
                    )}
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
                                {doc.url ? (
                                  <div className="flex justify-center items-center space-x-2">
                                    <button 
                                      onClick={() => setPreviewDocument({ url: doc.url, type: doc.type, name: doc.name })}
                                      className="text-blue-600 hover:text-blue-800"
                                      title="Ver documento"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <div className="flex items-center">
                                      <input 
                                        type="file" 
                                        id={`row-file-replace-${doc.id}`}
                                        className="hidden" 
                                        onChange={(e) => handleRowFileUpload(e, doc.id)}
                                        disabled={isUploading || !formData.id}
                                      />
                                      <label 
                                        htmlFor={`row-file-replace-${doc.id}`}
                                        className="cursor-pointer text-orange-500 hover:text-orange-700 m-0 leading-none"
                                        title="Reemplazar documento"
                                      >
                                        <Upload className="w-4 h-4" />
                                      </label>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-center">
                                    <input 
                                      type="file" 
                                      id={`row-file-upload-${doc.id}`}
                                      className="hidden" 
                                      onChange={(e) => handleRowFileUpload(e, doc.id)}
                                      disabled={isUploading || !formData.id}
                                    />
                                    <label 
                                      htmlFor={`row-file-upload-${doc.id}`}
                                      className="cursor-pointer text-blue-600 hover:text-blue-800"
                                      title="Subir documento a este registro"
                                    >
                                      <Upload className="w-3.5 h-3.5 mx-auto" />
                                    </label>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeBottomTab === 'ordinario' && (
                <div className="flex-1 flex flex-col space-y-3">
                  <div className="bg-[#f0f0f0] p-2 border border-[#a0a0a0] rounded shadow-sm max-w-md">
                    <h4 className="text-[10px] font-bold text-slate-800 uppercase mb-2">Imputación Analítica Comunidad</h4>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CECO:</label>
                      <select 
                        className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                        value={community.ceco || ""} 
                        onChange={(e) => updateCommunityField('ceco', e.target.value)}
                      >
                        <option value="">-- Seleccionar CECO --</option>
                        {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <ComunidadJournalViewer 
                    cecoCode={community.ceco}
                    userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                    setPreviewDocument={setPreviewDocument}
                  />
                </div>
              )}

              {activeBottomTab === 'derrama' && (
                <div className="flex-1 flex flex-col space-y-3">
                  <div className="bg-[#f0f0f0] p-2 border border-[#a0a0a0] rounded shadow-sm max-w-md">
                    <h4 className="text-[10px] font-bold text-slate-800 uppercase mb-2">Imputación Analítica Derramas</h4>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-slate-700 uppercase w-12">CECO:</label>
                      <select 
                        className="win-input flex-1 min-w-0 text-[11px] h-6 py-0.5" 
                        value={community.derramaCeco || ""} 
                        onChange={(e) => updateCommunityField('derramaCeco', e.target.value)}
                      >
                        <option value="">-- Seleccionar CECO --</option>
                        {cecos.map(c => <option key={c.id} value={c.code}>{c.code} - {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <ComunidadJournalViewer 
                    cecoCode={community.derramaCeco}
                    userIds={queryUserIds?.length > 0 ? queryUserIds : (user ? [user.uid] : [])}
                    setPreviewDocument={setPreviewDocument}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function ComunidadJournalViewer({ cecoCode, userIds, setPreviewDocument }) {
  const [entries, setEntries] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!cecoCode) {
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
        if (!entry.ceco) return false;
        const normField = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
        const normValue = String(cecoCode).trim().replace(/^(CEBE|CECO)/i, '');
        return normField.startsWith(normValue);
      });
      setEntries(filtered.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [cecoCode, userIds]);

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

  if (!cecoCode) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold text-slate-800 uppercase">Extracto de Asientos Contables</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">No hay asientos contables registrados para este CECO.</p>
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

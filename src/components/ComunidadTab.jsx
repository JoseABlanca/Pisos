import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Trash2, Eye, Plus, Calendar, FileText, Euro, Users, Check, RefreshCw } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { uploadFileToStorage } from '../utils/storageUtils';
import Window from './Window';
import Accounts from '../pages/Accounts';
import AnalyticalCenters from '../pages/AnalyticalCenters';
import JournalEntry from '../pages/JournalEntry';

export default function ComunidadTab({ 
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
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [activeAccountField, setActiveAccountField] = useState(null); // 'community' or derrama index
  const [showCecoModal, setShowCecoModal] = useState(false);
  const [activeCecoField, setActiveCecoField] = useState(null); // 'community' or { type: 'derrama', index }
  const [bottomTab, setBottomTab] = useState('docs'); // 'docs' | 'extracto'

  // Estados para Asientos Contables / Extracto
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState(null);

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
    const newDerramas = [...derramas, { id: Date.now().toString(), amount: '', endDate: '', active: true, accountingAccount: '' }];
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

  const getAccountDisplay = (code) => {
    if (!code) return '';
    const acc = (availableAccounts || []).find(a => a.code === code);
    return acc ? `${acc.code} - ${acc.name}` : code;
  };

  const getCecoDisplay = (code) => {
    if (!code) return '';
    const cleanCode = String(code).trim().toUpperCase().replace(/^CECO/i, '');
    const cecoObj = (cecos || []).find(c => String(c.code).trim().toUpperCase().replace(/^CECO/i, '') === cleanCode);
    return cecoObj ? `${cecoObj.code} - ${cecoObj.name}` : code;
  };

  const getCecoShortName = (code, fallback = '') => {
    if (!code) return fallback;
    const cleanCode = String(code).trim().toUpperCase().replace(/^CECO/i, '');
    const cecoObj = (cecos || []).find(c => String(c.code).trim().toUpperCase().replace(/^CECO/i, '') === cleanCode);
    if (cecoObj?.name) {
      return cecoObj.name;
    }
    if (code.includes(' - ')) {
      return code.split(' - ').slice(1).join(' - ').trim();
    }
    return code;
  };

  // Extraer código exacto sin prefijos
  const getPureCode = (val) => {
    if (!val) return '';
    const parts = String(val).trim().split(' - ');
    const codePart = parts[0].trim().toUpperCase();
    return codePart.replace(/^(CEBE|CECO)/i, '');
  };

  // Suscripción a journal_entries para Extracto
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
      console.error("Error loading journal entries in ComunidadTab:", error);
      setLoadingEntries(false);
    });
    return () => unsubscribe();
  }, [user, queryUserIds]);

  // Filtrado de asientos contables por CECO
  const getEntriesForCeco = (targetCecoCode) => {
    if (!targetCecoCode) return [];
    const pureTarget = getPureCode(targetCecoCode);
    if (!pureTarget) return [];
    const pureTargetCebe = getPureCode(formData?.cebe);

    const rows = [];
    journalEntries.forEach(entry => {
      if (!entry.date) return;

      const hasLines = Array.isArray(entry.lines) && entry.lines.length > 0;
      if (hasLines) {
        entry.lines.forEach((l, lIdx) => {
          const pureLineCeco = getPureCode(l.ceco);
          if (!pureLineCeco || pureLineCeco !== pureTarget) return;

          if (pureTargetCebe) {
            const pureLineCebe = getPureCode(l.cebe || entry.cebe);
            if (!pureLineCebe || pureLineCebe !== pureTargetCebe) return;
          }

          const debit = parseFloat(l.debit) || 0;
          const credit = parseFloat(l.credit) || 0;
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
        const pureEntryCeco = getPureCode(entry.ceco);
        if (!pureEntryCeco || pureEntryCeco !== pureTarget) return;

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
  };

  const hasBothCecos = Boolean(community.ceco && community.derramaCeco);

  const rowsCeco1 = useMemo(() => getEntriesForCeco(community.ceco), [journalEntries, formData?.cebe, community.ceco]);
  const rowsCeco2 = useMemo(() => getEntriesForCeco(community.derramaCeco), [journalEntries, formData?.cebe, community.derramaCeco]);
  const rowsTotal = useMemo(() => {
    const map = new Map();
    rowsCeco1.forEach(r => map.set(r.id, r));
    rowsCeco2.forEach(r => map.set(r.id, r));
    return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [rowsCeco1, rowsCeco2]);

  const activeExtractRows = useMemo(() => {
    if (!hasBothCecos) {
      if (community.ceco) return rowsCeco1;
      if (community.derramaCeco) return rowsCeco2;
      return [];
    }
    if (bottomTab === 'ceco2') return rowsCeco2;
    if (bottomTab === 'total') return rowsTotal;
    return rowsCeco1;
  }, [hasBothCecos, bottomTab, rowsCeco1, rowsCeco2, rowsTotal, community.ceco, community.derramaCeco]);

  const totalExtractoAmount = useMemo(() => {
    return activeExtractRows.reduce((sum, r) => sum + r.netAmount, 0);
  }, [activeExtractRows]);

  const renderAccountSelector = (fieldId, currentValue, onChangeCallback, inputClassName) => {
    return (
      <div className="flex gap-1">
        <input 
          type="text"
          className={inputClassName || "win-input flex-1 cursor-pointer bg-white"}
          value={getAccountDisplay(currentValue)}
          onClick={() => {
            setActiveAccountField(fieldId);
            setShowAccountsModal(true);
          }}
          readOnly
          placeholder="Haga clic para seleccionar cuenta..."
          title="Haga clic para abrir la ventana de cuentas contables"
        />
        {currentValue && (
          <button 
            type="button" 
            className="btn-classic px-2 text-red-600 font-bold" 
            onClick={() => onChangeCallback('')}
            title="Quitar cuenta"
          >
            X
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
        
        {/* Top Section: Data & Derramas */}
        <div className="w-full flex flex-col gap-6">
          
          {/* Datos Comunidad */}
          <div className="flex flex-col space-y-3">
            
            <div className="space-y-2.5">
              <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Administrador:</label>
              <input 
                type="text" 
                className="win-input w-full" 
                value={community.admin || ''} 
                onChange={e => updateCommunityField('admin', e.target.value)} 
                placeholder="Nombre del administrador o empresa"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Teléfono:</label>
                <input 
                  type="text" 
                  className="win-input w-full" 
                  value={community.adminPhone || ''} 
                  onChange={e => updateCommunityField('adminPhone', e.target.value)} 
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Email:</label>
                <input 
                  type="email" 
                  className="win-input w-full" 
                  value={community.adminEmail || ''} 
                  onChange={e => updateCommunityField('adminEmail', e.target.value)} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Cuota Ordinaria (€):</label>
                <input 
                  type="number" 
                  className="win-input w-full text-right" 
                  value={community.fee || ''} 
                  onChange={e => updateCommunityField('fee', e.target.value)} 
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">Día Cobro:</label>
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
              <div className="space-y-2.5 relative">
                <label className="text-[10px] font-bold text-[#444] uppercase tracking-wide block">
                  CECO Asociado:
                </label>
                <div className="flex gap-1">
                  <input 
                    type="text"
                    className="win-input flex-1 cursor-pointer bg-white"
                    value={getCecoDisplay(community.ceco)}
                    onClick={() => {
                      setActiveCecoField('community');
                      setShowCecoModal(true);
                    }}
                    readOnly
                    placeholder="Haga clic para seleccionar CECO..."
                    title="Haga clic para abrir la ventana de CECOs"
                  />
                  {community.ceco && (
                    <button 
                      type="button" 
                      className="btn-classic px-2.5 text-red-600 font-bold flex items-center justify-center shrink-0 cursor-pointer text-xs" 
                      onClick={() => updateCommunityField('ceco', '')}
                      title="Quitar CECO asociado"
                    >
                      X
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-1">
              <label className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-100">
                <input 
                  type="checkbox" 
                  className="form-checkbox h-4 w-4 text-black rounded border-slate-300"
                  checked={community.hasSpecialLevy || false} 
                  onChange={e => {
                    updateCommunityField('hasSpecialLevy', e.target.checked);
                    if (e.target.checked && derramas.length === 0) addDerrama();
                  }} 
                />
                <span className="text-[12px] font-bold text-slate-800">Derramas</span>
              </label>
            </div>
          </div>

          {/* Derramas Section */}
          {community.hasSpecialLevy && (
            <div className="flex flex-col space-y-3 pt-2">
              <div className="flex flex-col mb-4 px-1 gap-2">
                <div className="w-full border-t border-gray-300 mb-1" />
                <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Derramas</h3>
                
                {/* Línea horizontal: CECO Derrama a la izquierda y Añadir derrama a la derecha */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#444] uppercase tracking-wide">CECO Derrama:</span>
                    <div className="flex gap-1 items-center">
                      <input 
                        type="text"
                        className="win-input text-[11px] h-[26px] w-64 cursor-pointer bg-white font-mono truncate"
                        value={getCecoDisplay(community.derramaCeco)}
                        onClick={() => {
                          setActiveCecoField('derrama');
                          setShowCecoModal(true);
                        }}
                        readOnly
                        placeholder="Haz clic para seleccionar CECO..."
                        title="Haga clic para seleccionar el CECO de la derrama"
                      />
                      {community.derramaCeco && (
                        <button 
                          type="button" 
                          className="btn-classic px-2 text-red-600 font-bold h-[26px] flex items-center justify-center shrink-0 cursor-pointer text-xs" 
                          onClick={() => updateCommunityField('derramaCeco', '')}
                          title="Quitar CECO de la derrama"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={addDerrama}
                    className="border border-gray-400 bg-gray-200 hover:bg-gray-300 px-3 py-1 text-[11px] font-bold flex items-center text-slate-800 shrink-0 shadow-sm cursor-pointer h-[26px]"
                    title="Añadir derrama"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Añadir derrama
                  </button>
                </div>
              </div>

              <div className="overflow-auto bg-white border border-gray-200 rounded-sm">
                <table className="modern-table w-full !border-0 text-[11px]">
                  <thead className="bg-[#fafafa] border-b border-gray-200">
                    <tr>
                      <th className="w-14 text-center !bg-[#fafafa]">Activa</th>
                      <th className="w-44 text-center !bg-[#fafafa]">Fecha Final</th>
                      <th className="w-36 text-center !bg-[#fafafa]">Días Restantes</th>
                      <th className="text-right !bg-[#fafafa]">Importe (€)</th>
                      <th className="w-16 text-center !bg-[#fafafa]">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derramas.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center text-slate-500 py-4 italic text-[11px]">
                          No hay derramas configuradas. Pulsa 'Añadir derrama'.
                        </td>
                      </tr>
                    ) : (
                      derramas.map((derrama, idx) => {
                        const isActive = derrama.active !== false;
                        return (
                          <tr 
                            key={derrama.id || idx} 
                            className={`hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                              !isActive ? 'opacity-40 bg-gray-50/50' : ''
                            }`}
                          >
                            <td className="p-2 text-center">
                              <input 
                                type="checkbox" 
                                className="form-checkbox h-4 w-4 text-black rounded border-slate-300 cursor-pointer"
                                checked={isActive} 
                                onChange={e => updateDerrama(idx, 'active', e.target.checked)} 
                                title={isActive ? "Derrama activa" : "Derrama inactiva"}
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input 
                                type="date" 
                                className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-center text-black" 
                                value={derrama.endDate || ''} 
                                onChange={e => updateDerrama(idx, 'endDate', e.target.value)} 
                              />
                            </td>
                            <td className="p-2 text-center font-bold text-[11px] text-black whitespace-nowrap">
                              {calculateRemainingDays(derrama.endDate)} {derrama.endDate ? 'días' : ''}
                            </td>
                            <td className="p-2">
                              <input 
                                type="number" 
                                step="0.01"
                                className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:bg-transparent focus:shadow-none text-[11px] px-1 h-[24px] text-right font-bold text-black" 
                                value={derrama.amount || ''} 
                                onChange={e => updateDerrama(idx, 'amount', e.target.value)} 
                                placeholder="0.00"
                              />
                            </td>
                            <td className="text-center p-2">
                              <button 
                                type="button"
                                onClick={() => removeDerrama(idx)}
                                className="text-gray-500 hover:text-red-600 transition-colors p-1 cursor-pointer"
                                title="Eliminar derrama"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Bottom Section: Selector de pestañas Documentos y Extracto (Igual a Servicios) */}
        <div className="w-full flex flex-col h-full min-h-[300px]">
          
          {/* Pestañas inferiores */}
          <div className="flex bg-[#f0f0f0] shrink-0 items-center overflow-x-auto">
            <button
              type="button"
              onClick={() => setBottomTab('docs')}
              className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#d0d0d0] cursor-pointer transition-colors border-b-2 ${
                bottomTab === 'docs' 
                  ? 'bg-white text-slate-900 border-b-black' 
                  : 'text-slate-600 hover:bg-[#e0e0e0] border-b-transparent'
              }`}
            >
              Documentos
            </button>

            {hasBothCecos ? (
              <>
                <button
                  type="button"
                  onClick={() => setBottomTab('ceco1')}
                  className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#d0d0d0] cursor-pointer transition-colors border-b-2 ${
                    (bottomTab === 'ceco1' || (bottomTab !== 'docs' && bottomTab !== 'ceco2' && bottomTab !== 'total'))
                      ? 'bg-white text-slate-900 border-b-black' 
                      : 'text-slate-600 hover:bg-[#e0e0e0] border-b-transparent'
                  }`}
                >
                  Extracto {getCecoShortName(community.ceco)}
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('ceco2')}
                  className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#d0d0d0] cursor-pointer transition-colors border-b-2 ${
                    bottomTab === 'ceco2' 
                      ? 'bg-white text-slate-900 border-b-black' 
                      : 'text-slate-600 hover:bg-[#e0e0e0] border-b-transparent'
                  }`}
                >
                  Extracto {getCecoShortName(community.derramaCeco)}
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('total')}
                  className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#d0d0d0] cursor-pointer transition-colors border-b-2 ${
                    bottomTab === 'total' 
                      ? 'bg-white text-slate-900 border-b-black' 
                      : 'text-slate-600 hover:bg-[#e0e0e0] border-b-transparent'
                  }`}
                >
                  Total Extractos
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBottomTab('extracto')}
                className={`px-4 py-2 text-[11px] font-bold flex items-center gap-2 border-r border-[#d0d0d0] cursor-pointer transition-colors border-b-2 ${
                  bottomTab !== 'docs' 
                    ? 'bg-white text-slate-900 border-b-black' 
                    : 'text-slate-600 hover:bg-[#e0e0e0] border-b-transparent'
                }`}
              >
                Extracto
              </button>
            )}
          </div>

          {/* Sub-pestaña 1: DOCUMENTOS */}
          {bottomTab === 'docs' && (
            <div className="p-4 flex-1 flex flex-col bg-white">
              <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Documentos</h3>
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
                    className={`border border-gray-400 bg-gray-200 hover:bg-gray-300 px-4 py-1 text-[11px] font-bold flex items-center text-slate-800 shrink-0 shadow-sm ${(!formData.id || isUploading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    title="Sube un archivo y crea el registro asociado"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {isUploading ? 'Subiendo...' : 'Adjuntar'}
                  </label>
                  {!formData.id && (
                    <span className="text-[10px] text-red-600 font-bold">
                      Guarda la propiedad primero
                    </span>
                  )}
                </div>
              </div>

              {/* Documents Table */}
              <div className="flex-1 overflow-auto bg-white min-h-[200px] border border-gray-200 rounded-sm">
                <table className="modern-table w-full !border-0 text-[11px]">
                  <thead className="sticky top-0 bg-[#fafafa] z-10 border-b border-gray-200 shadow-xs">
                    <tr>
                      <th className="w-28 text-center !bg-[#fafafa]">Fecha</th>
                      <th className="w-[40%] !bg-[#fafafa]">Documento</th>
                      <th className="w-[30%] !bg-[#fafafa]">Concepto</th>
                      <th className="w-20 text-center !bg-[#fafafa]">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center text-slate-500 py-4 italic text-[11px]">
                          No hay documentos guardados
                        </td>
                      </tr>
                    ) : (
                      documents.map((doc, idx) => (
                        <tr key={doc.id || idx} className="hover:bg-slate-50 transition-colors border-b border-gray-100 last:border-b-0">
                          <td className="text-center p-1">
                            <input 
                              type="date" 
                              value={doc.date ? doc.date.split('T')[0] : ''}
                              onChange={(e) => updateDocument(doc.id, 'date', e.target.value)}
                              className="w-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none focus:bg-transparent text-[11px] font-mono px-1 h-[24px] text-center text-gray-800"
                            />
                          </td>
                          <td className="p-2 flex items-center text-[11px] text-gray-700">
                            <FileText className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                            <span className="truncate" title={doc.name || 'Sin archivo'}>{doc.name || 'Sin archivo'}</span>
                          </td>
                          <td className="p-1">
                            <input 
                              type="text"
                              value={doc.concept || ''}
                              onChange={(e) => updateDocument(doc.id, 'concept', e.target.value)}
                              placeholder="Añadir concepto..."
                              className="w-full bg-transparent border-0 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-0 focus:shadow-none focus:bg-transparent text-[11px] px-1 h-[24px] text-gray-800"
                            />
                          </td>
                          <td className="text-center p-2">
                            <div className="flex justify-center items-center space-x-3">
                              {doc.url ? (
                                <button 
                                  onClick={() => setPreviewDocument({ url: doc.url, type: doc.type, name: doc.name })}
                                  className="text-gray-500 hover:text-black transition-colors"
                                  title="Ver documento"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              ) : (
                                <div className="relative flex items-center justify-center">
                                  <input 
                                    type="file" 
                                    id={`row-file-upload-${doc.id}`}
                                    className="hidden" 
                                    onChange={(e) => handleRowFileUpload(e, doc.id)}
                                    disabled={isUploading || !formData.id}
                                  />
                                  <label 
                                    htmlFor={`row-file-upload-${doc.id}`}
                                    className="cursor-pointer text-indigo-600 hover:text-indigo-800 m-0 leading-none"
                                    title="Subir documento a este registro"
                                  >
                                    <Upload className="w-4 h-4" />
                                  </label>
                                </div>
                              )}
                              <button 
                                onClick={() => removeDocument(doc.id)}
                                className="text-gray-500 hover:text-red-600 transition-colors"
                                title="Eliminar documento"
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

          {/* Sub-pestaña: EXTRACTO */}
          {bottomTab !== 'docs' && (
            <div className="p-4 flex-1 flex flex-col bg-white">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">
                    {hasBothCecos 
                      ? (bottomTab === 'ceco2' 
                          ? `Extracto ${getCecoShortName(community.derramaCeco)}` 
                          : (bottomTab === 'total' 
                              ? 'Total Extractos' 
                              : `Extracto ${getCecoShortName(community.ceco)}`))
                      : 'Extracto'
                    }
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
              {(!community.ceco && !community.derramaCeco) ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 italic text-[11px] py-16 text-center border border-dashed border-gray-200 rounded">
                  Asigna un CECO Asociado a la comunidad o a la derrama para ver sus asientos contables.
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
                      {activeExtractRows.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="text-center text-slate-400 italic py-16 text-[11px]">
                            {loadingEntries 
                              ? 'Cargando asientos contables...' 
                              : 'No hay asientos contables registrados para este extracto.'}
                          </td>
                        </tr>
                      ) : (
                        activeExtractRows.map((row) => (
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
            <div className="bg-white flex flex-col w-full h-[600px] relative overflow-hidden">
              <div className="flex-1 overflow-hidden relative">
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
              <div className="flex justify-end gap-2 shrink-0 px-3 py-1.5 bg-[#f0f0f0] border-t border-gray-300">
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
                    if (activeCecoField === 'derrama') {
                      updateCommunityField('derramaCeco', code);
                    } else {
                      updateCommunityField('ceco', code);
                    }
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

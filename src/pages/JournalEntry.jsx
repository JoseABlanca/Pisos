import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { Save, Plus, Trash2, X, Search, Edit2, Minus, FilePlus, RefreshCw } from 'lucide-react';
import Accounts from './Accounts'; // Import Accounts to use as modal
import ZoomControl from '../components/ZoomControl';
import { registerJournalEntry, updateJournalEntry } from '../services/accounting';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function JournalEntry() {
  const { user, queryUserIds } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [date, setDate] = useState('');
  const [entryId, setEntryId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [originalLines, setOriginalLines] = useState(null);
  const [nextEntryNumber, setNextEntryNumber] = useState(1);
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);
  const [lines, setLines] = useState([
    { id: 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null },
    { id: 2, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null }
  ]);
  
  const [cecos, setCecos] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [selectedCebe, setSelectedCebe] = useState('');
  const [selectedCeco, setSelectedCeco] = useState('');

  const [documentUrl, setDocumentUrl] = useState(null);
  const [documentName, setDocumentName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!isEditing && !entryId) {
      setEntryId(doc(collection(db, 'journal_entries')).id);
    }
  }, [isEditing, entryId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user || !entryId) return;
    setIsUploading(true);
    try {
      const url = await uploadFileToStorage(file, user.uid, 'journal_entries', entryId, 'docs');
      setDocumentUrl(url);
      setDocumentName(file.name);
    } catch (err) {
      console.error(err);
      alert('Error al subir el documento: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = () => {
    if (window.confirm('¿Eliminar el documento asociado a este asiento?')) {
      setDocumentUrl(null);
      setDocumentName(null);
    }
  };
  
  // State for Accounts Modal
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(null);
  
  const [accounts, setAccounts] = useState([]);
  
  useEffect(() => {
    if (!user) return;
    
    // Fetch accounts to resolve names
    const unsubAccounts = onSnapshot(
      query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setAccounts(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );
    
    // Fetch the max entry number from counters
    const unsubEntries = onSnapshot(
      doc(db, 'counters', `journal_${user.uid}`),
      (snap) => {
        if (!snap.exists()) {
          setNextEntryNumber(1);
        } else {
          setNextEntryNumber((snap.data().lastValue || 0) + 1);
        }
      }
    );

    const unsubCecos = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]), where('type', '==', 'ceco')),
      (snap) => setCecos(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    );

    const unsubCebes = onSnapshot(
      query(collection(db, 'analytical_centers'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]), where('type', '==', 'cebe')),
      (snap) => setCebes(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    );

    return () => {
      unsubAccounts();
      unsubEntries();
      unsubCecos();
      unsubCebes();
    };
  }, [user]);

  useEffect(() => {
    if (location.state?.editEntry && accounts.length > 0) {
      const { editEntry } = location.state;
      setEntryId(editEntry.id);
      setIsEditing(true);
      setDate(editEntry.date ? editEntry.date.split('T')[0] : '');
      setNextEntryNumber(editEntry.number || 1);
      setSelectedCebe(editEntry.cebe || editEntry.lines?.find(l => l.cebe)?.cebe || '');
      setSelectedCeco(editEntry.ceco || editEntry.lines?.find(l => l.ceco)?.ceco || '');
      setDocumentUrl(editEntry.documentUrl || null);
      setDocumentName(editEntry.documentName || null);
      
      if (editEntry.lines && editEntry.lines.length > 0) {
        setOriginalLines(editEntry.lines);
        const mappedLines = editEntry.lines.map((l, i) => {
           const acct = accounts.find(a => a.id === l.accountId);
           return {
             id: i + 1,
             account: acct ? acct.code : '',
             description: l.description || editEntry.description,
             document: l.document || '',
             ceco: l.ceco || '',
             cebe: l.cebe || '',
             debit: parseFloat(l.debit) || 0,
             credit: parseFloat(l.credit) || 0,
             image: null
           };
        });
        if (mappedLines.length < 2) {
          mappedLines.push({ id: mappedLines.length + 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null });
        }
        setLines(mappedLines);
      }
    }
  }, [location.state, accounts]);

  // Resolve CEBE/CECO codes with/without prefixes for select dropdowns
  useEffect(() => {
    if (selectedCebe && cebes.length > 0) {
      const normSelected = selectedCebe.replace(/^(CEBE|CECO)/i, '').trim();
      const matched = cebes.find(c => c.code.replace(/^(CEBE|CECO)/i, '').trim() === normSelected);
      if (matched && matched.code !== selectedCebe) {
        setSelectedCebe(matched.code);
      }
    }
  }, [cebes, selectedCebe]);

  useEffect(() => {
    if (selectedCeco && cecos.length > 0) {
      const normSelected = selectedCeco.replace(/^(CEBE|CECO)/i, '').trim();
      const matched = cecos.find(c => c.code.replace(/^(CEBE|CECO)/i, '').trim() === normSelected);
      if (matched && matched.code !== selectedCeco) {
        setSelectedCeco(matched.code);
      }
    }
  }, [cecos, selectedCeco]);

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    
    if (field === 'debit') {
      newLines[index][field] = value;
      if (Number(value) > 0) newLines[index]['credit'] = 0;
    } else if (field === 'credit') {
      newLines[index][field] = value;
      if (Number(value) > 0) newLines[index]['debit'] = 0;
    } else if (field === 'account') {
      newLines[index][field] = value;
      // Auto-fill description if matched
      const acct = accounts.find(a => a.code === value);
      if (acct && !newLines[index].description) {
        newLines[index].description = acct.name;
      }
    } else {
      newLines[index][field] = value;
    }
    
    setLines(newLines);
  };
  
  const addLine = () => {
    const maxId = lines.length > 0 ? Math.max(...lines.map(l => l.id)) : 0;
    setLines([...lines, { id: maxId + 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null }]);
  };
  
  const removeLine = (index) => {
    if (index === null || index === undefined) return;
    setLines(lines.filter((_, i) => i !== index));
    if (selectedLineIndex === index) {
      setSelectedLineIndex(null);
    } else if (selectedLineIndex > index) {
      setSelectedLineIndex(selectedLineIndex - 1);
    }
  };
  
  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const imbalance = totalDebit - totalCredit;

  const selectedAccountName = selectedLineIndex !== null && lines[selectedLineIndex] 
    ? accounts.find(a => a.code === lines[selectedLineIndex].account)?.name || ''
    : '';

  const handleSave = async () => {
    if (!date) {
      alert("Por favor, introduzca una fecha.");
      return;
    }
    if (!isBalanced) {
      alert("El asiento está descuadrado.");
      return;
    }
    
    const validLines = lines.filter(l => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) {
      alert("Se requieren al menos dos apuntes para guardar un asiento.");
      return;
    }

    try {
      const entryNumber = nextEntryNumber;
      
      const formattedLines = validLines.map(line => {
        const acct = accounts.find(a => a.code === line.account);
        return {
          accountId: acct ? acct.id : '',
          accountCode: line.account,
          description: line.description,
          document: line.document,
          ceco: '',
          cebe: '',
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
        };
      });

      if (formattedLines.some(l => !l.accountId)) {
        alert("Algunas cuentas no son válidas o no existen en el catálogo.");
        return;
      }

      const globalDescription = formattedLines[0].description || `Asiento manual ${date}`;
      const analytics = {
        cebe: selectedCebe || '',
        ceco: selectedCeco || ''
      };
      
      if (isEditing) {
        await updateJournalEntry(user.uid, entryId, globalDescription, formattedLines, originalLines, date, analytics, documentUrl, documentName);
        alert(`Asiento ${nextEntryNumber} actualizado correctamente.`);
        navigate('/journal-list');
      } else {
        await registerJournalEntry(user.uid, globalDescription, formattedLines, date, analytics, entryId, documentUrl, documentName);
        alert(`Asiento ${entryNumber} guardado correctamente.`);
        // Reset form
        setDate('');
        setSelectedCebe('');
        setSelectedCeco('');
        setDocumentUrl(null);
        setDocumentName(null);
        setEntryId(''); // triggers regeneration via useEffect
        setLines([
          { id: 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null },
          { id: 2, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null }
        ]);
        setSelectedLineIndex(null);
      }
      
    } catch (error) {
      console.error("Error al guardar asiento:", error);
      alert("Error al guardar asiento: " + error.message);
    }
  };

  const handleKeyDown = (e, index, field) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (index === lines.length - 1) {
        addLine();
        setTimeout(() => {
          document.getElementById(`${field}-${index + 1}`)?.focus();
        }, 50);
      } else {
        document.getElementById(`${field}-${index + 1}`)?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) {
        document.getElementById(`${field}-${index - 1}`)?.focus();
      }
    }
  };

  const openAccountSelector = (e, index) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setActiveLineIndex(index);
    setShowAccountsModal(true);
  };

  const handleAccountSelect = (selectedAccountCode, selectedAccountName) => {
    if (activeLineIndex !== null) {
      const newLines = [...lines];
      newLines[activeLineIndex].account = selectedAccountCode;
      if (!newLines[activeLineIndex].description) {
        newLines[activeLineIndex].description = selectedAccountName;
      }
      setLines(newLines);
    }
    setShowAccountsModal(false);
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header Info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 bg-gray-100 border-b border-gray-300 text-[11px] font-bold text-gray-700 overflow-hidden w-full">
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Diario:</span>
          <span>GENERAL</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Moneda:</span>
          <span>Euro</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Fecha:</span>
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-1 py-0.5 border border-gray-300 rounded focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Asiento:</span>
          <span className="bg-white px-2 py-0.5 border border-gray-300 rounded w-16 text-right inline-block h-[26px]">
            {date ? nextEntryNumber : ''}
          </span>
        </div>
        {cebes.length > 0 && (
          <div className="flex items-center">
            <span className="text-gray-500 mr-2">CEBE:</span>
            <select 
              value={selectedCebe}
              onChange={(e) => setSelectedCebe(e.target.value)}
              className="px-1 py-0.5 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-[11px]"
            >
              <option value="">-- Sin CEBE --</option>
              {cebes.map(c => (
                <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        )}
        {cecos.length > 0 && (
          <div className="flex items-center">
            <span className="text-gray-500 mr-2">CECO:</span>
            <select 
              value={selectedCeco}
              onChange={(e) => setSelectedCeco(e.target.value)}
              className="px-1 py-0.5 border border-gray-300 rounded focus:border-blue-500 outline-none bg-white text-[11px]"
            >
              <option value="">-- Sin CECO --</option>
              {cecos.map(c => (
                <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Document Upload Option */}
        <div className="flex items-center space-x-2 border-l border-gray-300 pl-3">
          <span className="text-gray-500 mr-2">Doc:</span>
          {documentUrl ? (
            <div className="flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 border border-blue-200 rounded text-[10px]">
              <span className="truncate max-w-[120px]" title={documentName}>{documentName}</span>
              <button 
                type="button"
                onClick={handleDeleteDoc}
                className="ml-1.5 text-red-500 hover:text-red-700"
                title="Quitar documento"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className={`btn-classic px-2 h-[26px] text-[10px] flex items-center cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isUploading ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <FilePlus className="w-3.5 h-3.5 mr-1" />
                  Adjuntar
                </>
              )}
              <input 
                type="file" 
                className="hidden" 
                onChange={handleFileUpload} 
                disabled={isUploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              />
            </label>
          )}
        </div>

        <div className="flex-1" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center px-2 py-1 border-b border-gray-200 bg-gray-50 space-x-2 overflow-x-auto w-full scrollbar-hide shrink-0">
        <button 
          onClick={handleSave}
          disabled={!isBalanced || !date}
          className={`p-1 rounded flex items-center justify-center ${(!isBalanced || !date) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'}`}
          title="Aceptar asiento y crear uno nuevo"
        >
          <div className="relative">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <div className="absolute -bottom-1 -right-1 bg-white rounded-full">
              <Plus className="w-3.5 h-3.5 text-green-500 stroke-[3]" />
            </div>
          </div>
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1"></div>
        <button onClick={addLine} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Añadir línea">
          <Plus className="w-5 h-5" />
        </button>
        <button 
          onClick={() => removeLine(selectedLineIndex !== null ? selectedLineIndex : lines.length - 1)} 
          className="p-1 hover:bg-gray-200 rounded text-gray-600" 
          title="Quitar fila seleccionada"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead className="bg-white sticky top-0 z-10 border-b border-gray-300">
            <tr>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-12 text-center text-gray-600 uppercase">ORDEN</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-32 text-gray-600 uppercase">CUENTA</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-48 text-gray-600 uppercase">TÍTULO CUENTA</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold flex-1 text-gray-600 uppercase">CONCEPTO</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-gray-600 uppercase">DOCUMENTO</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-right text-gray-600 uppercase">DEBE</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-right text-gray-600 uppercase">HABER</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-10 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const acct = accounts.find(a => a.code === line.account);
              const acctName = acct ? acct.name : '';
              
              return (
                <tr 
                  key={idx} 
                  className={`border-b border-gray-200 hover:bg-blue-50/30 group ${selectedLineIndex === idx ? 'bg-blue-50/50' : ''}`}
                  onClick={() => setSelectedLineIndex(idx)}
                >
                  <td className="bg-gray-50 text-center text-gray-500 select-none">
                    {idx + 1}
                  </td>
                  <td className="p-0 relative" onDoubleClick={(e) => openAccountSelector(e, idx)}>
                    <input 
                      id={`account-${idx}`}
                      type="text" 
                      value={line.account}
                      onChange={(e) => updateLine(idx, 'account', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'account')}
                      onDoubleClick={(e) => openAccountSelector(e, idx)}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 font-mono"
                      placeholder="Doble clic..."
                      autoComplete="off"
                    />
                    <button 
                      type="button"
                      onClick={(e) => openAccountSelector(e, idx)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-blue-600 hidden group-hover:block z-10 bg-white shadow-sm rounded"
                    >
                      <Search className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-2 py-1.5 truncate text-gray-600 bg-gray-50/50" onDoubleClick={(e) => openAccountSelector(e, idx)}>
                    {acctName}
                  </td>
                  <td className="p-0">
                    <input 
                      id={`description-${idx}`}
                      type="text" 
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'description')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="p-0">
                    <input 
                      id={`document-${idx}`}
                      type="text" 
                      value={line.document}
                      onChange={(e) => updateLine(idx, 'document', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'document')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 uppercase text-[10px]"
                    />
                  </td>

                  <td className="p-0">
                    <input 
                      id={`debit-${idx}`}
                      type="number" 
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'debit')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 text-right text-gray-800"
                    />
                  </td>
                  <td className="p-0">
                    <input 
                      id={`credit-${idx}`}
                      type="number" 
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'credit')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 text-right text-gray-800"
                    />
                  </td>
                  {/* Removed IMAGEN cell */}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Totals */}
      <div className="bg-gray-100 border-t border-gray-300 flex flex-col text-[12px] font-bold">
        <div className="flex items-center">
          <div className="flex-1 text-left pl-4 py-1 pr-4 text-gray-600 uppercase font-bold">
            C.C
          </div>
          <div className="text-right py-1 px-4 text-gray-600 uppercase w-32">
            TOTALES:
          </div>
          <div className="w-28 text-right py-1 px-2 text-green-700 border-l border-gray-300">
            {totalDebit.toFixed(2)}
          </div>
          <div className="w-28 text-right py-1 px-2 text-red-600 border-l border-gray-300">
            {totalCredit.toFixed(2)}
          </div>
          <div className="w-32 border-l border-gray-300 flex items-center justify-center">
            <ZoomControl />
          </div>
        </div>
        <div className="flex items-center pb-1">
          <div className="flex-1 text-left pl-4 py-0.5 pr-4 text-gray-700">
            {selectedAccountName || '\u00A0'}
          </div>
          <div className="w-32"></div>
          <div className="w-28"></div>
          <div className="w-28"></div>
          <div className="w-32"></div>
        </div>
      </div>
      
      {/* Imbalance Alert */}
      {!isBalanced && (totalDebit > 0 || totalCredit > 0) && (
        <div className="bg-red-50 border-t border-red-200 text-red-700 px-4 py-1.5 text-[11px] font-bold flex justify-between">
          <span>DESCUADRE EN EL ASIENTO</span>
          <span>{Math.abs(imbalance).toFixed(2)}</span>
        </div>
      )}

      {/* Accounts Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 bg-black/5 backdrop-blur-sm0 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
              <h2 className="font-bold text-[13px] tracking-wide">SELECCIÓN DE CUENTA</h2>
              <button onClick={() => setShowAccountsModal(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              {/* Render the full Accounts component inside the modal */}
              {/* Pass an onSelect prop if Accounts supported it, otherwise we intercept double clicks via a wrapper if needed */}
              {/* To ensure it works perfectly, we can pass an optional onAccountSelect prop to Accounts */}
              <Accounts isModal={true} onAccountSelect={handleAccountSelect} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

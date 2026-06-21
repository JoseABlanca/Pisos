import { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { registerJournalEntry } from '../services/accounting';
import Window from './Window';
import { Search, X, Plus, Check, BookOpen, Link as LinkIcon, Minus } from 'lucide-react';
import Accounts from '../pages/Accounts';
import ZoomControl from './ZoomControl';
import { useAuth } from '../context/AuthContext';

export default function AccountingEntryModal({ isOpen, onClose, onSaveSuccess, userId, defaultDate, defaultDescription, defaultAmount, linkedAccountId, defaultAnalytics }) {
  const { user, queryUserIds } = useAuth();
  const [linkMode, setLinkMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [existingEntries, setExistingEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Grid state
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState([
    { account: '', description: defaultDescription || '', document: '', debit: defaultAmount ? defaultAmount.toString() : '', credit: '' },
    { account: '', description: defaultDescription || '', document: '', debit: '', credit: defaultAmount ? defaultAmount.toString() : '' }
  ]);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    const q = query(collection(db, 'journal_entries'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter by linked account if provided
      if (linkedAccountId) {
        // Find the code for the linked account id
        const linkedAccount = accounts.find(a => a.id === linkedAccountId);
        const linkedCode = linkedAccount ? linkedAccount.code : linkedAccountId;
        
        data = data.filter(entry => {
          if (!entry.lines) return false;
          return entry.lines.some(line => {
            const lineCode = line.account || line.accountId;
            return lineCode && String(lineCode).startsWith(String(linkedCode));
          });
        });
      }

      setExistingEntries(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    return () => unsubscribe();
  }, [isOpen, user, linkedAccountId, accounts]);

  useEffect(() => {
    if (!isOpen || !user) return;
    const q = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAccounts(data);
    });
    return () => unsubscribe();
  }, [isOpen, user]);

  if (!isOpen) return null;

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const imbalance = totalDebit - totalCredit;

  const selectedAccountName = selectedLineIndex !== null && lines[selectedLineIndex] 
    ? accounts.find(a => a.code === lines[selectedLineIndex].account)?.name || ''
    : '';

  const addLine = () => {
    setLines([...lines, { account: '', description: lines[lines.length - 1]?.description || '', document: '', debit: '', credit: '' }]);
  };

  const removeLine = (index) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
      if (selectedLineIndex === index) setSelectedLineIndex(null);
    }
  };

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    
    // Auto-fill description if account is entered and description is empty
    if (field === 'account' && value.length >= 3 && !newLines[index].description) {
      const acct = accounts.find(a => a.code === value);
      if (acct) newLines[index].description = acct.name;
    }
    
    setLines(newLines);
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

  const handleSave = async () => {
    if (!date) {
      alert("Por favor, introduce la fecha del asiento.");
      return;
    }
    if (!isBalanced) {
      alert("El asiento no está cuadrado.");
      return;
    }

    const validLines = lines.filter(l => l.account && (parseFloat(l.debit) || parseFloat(l.credit)));
    if (validLines.length < 2) {
      alert("El asiento debe tener al menos dos apuntes.");
      return;
    }

    const formattedLines = validLines.map(l => ({
      accountId: accounts.find(a => a.code === l.account)?.id || l.account,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description,
      document: l.document || ''
    }));

    try {
      // Use the first line's description as the global description if it exists
      const globalDesc = lines[0].description || defaultDescription || "Asiento Automático";
      const result = await registerJournalEntry(user.uid, globalDesc, formattedLines, date, defaultAnalytics);
      if (result.success && result.id) {
        onSaveSuccess(result.id, { description: globalDesc, total: totalDebit, date });
        onClose();
      }
    } catch (error) {
      console.error("Error saving entry:", error);
      alert("Error al registrar asiento: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <Window 
        title="Crear Asiento Contable (Enlace Bidireccional)" 
        width="800px"
        onClose={onClose}
      >
        <div className="flex flex-col h-full bg-white space-y-0">
          <div className="bg-[#4a69bd] text-white text-[10px] px-2 py-1 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Generar Asiento Contable Asociado</span>
          </div>

          <div className="flex border-b border-[#808080] shrink-0">
            <button 
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${!linkMode ? 'bg-[#4a69bd] text-white' : 'bg-[#e7e1d3] text-slate-600 hover:bg-[#d4d0c8]'}`}
              onClick={() => setLinkMode(false)}
            >
              Crear Nuevo Asiento
            </button>
            <button 
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase transition-colors ${linkMode ? 'bg-[#4a69bd] text-white' : 'bg-[#e7e1d3] text-slate-600 hover:bg-[#d4d0c8]'}`}
              onClick={() => setLinkMode(true)}
            >
              Vincular Existente
            </button>
          </div>

          {linkMode ? (
            <div className="flex flex-col flex-1 min-h-[300px] overflow-hidden space-y-2 p-4">
              <div>
                <input 
                  type="text" 
                  placeholder="Buscar por concepto o importe..." 
                  className="px-2 py-1 border border-gray-300 rounded w-full text-[11px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex-1 bg-white border border-[#808080] overflow-y-auto min-h-[250px]">
                <table className="w-full text-[10px] win-table">
                  <thead className="sticky top-0 bg-[#e7e1d3] shadow-sm">
                    <tr>
                      <th className="text-left w-20 px-2">Fecha</th>
                      <th className="text-left px-2">Concepto</th>
                      <th className="text-right w-24 px-2">Importe</th>
                      <th className="w-20 text-center px-2">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingEntries.filter(e => 
                      (e.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      String(e.total || '').includes(searchTerm)
                    ).map(entry => (
                      <tr key={entry.id} className="hover:bg-blue-50 border-b border-slate-100">
                        <td className="p-1.5 px-2">{new Date(entry.date).toLocaleDateString()}</td>
                        <td className="p-1.5 px-2 font-bold">{entry.description}</td>
                        <td className="p-1.5 px-2 text-right font-mono text-emerald-700 font-bold">{Number(entry.total).toLocaleString('es-ES', {minimumFractionDigits:2})} €</td>
                        <td className="p-1 px-2 text-center">
                          <button 
                            onClick={() => {
                              onSaveSuccess(entry.id, { description: entry.description, total: entry.total, date: entry.date });
                              onClose();
                            }}
                            className="border border-gray-400 rounded bg-white hover:bg-gray-50 px-2 py-0.5 text-[9px] w-full flex justify-center items-center"
                          >
                            <LinkIcon className="w-3 h-3 mr-1"/> Vincular
                          </button>
                        </td>
                      </tr>
                    ))}
                    {existingEntries.length === 0 && (
                      <tr><td colSpan="4" className="p-4 text-center italic text-slate-500">Cargando asientos o no hay registros...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden min-h-[350px]">
              {/* Header Info */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 bg-gray-100 border-b border-gray-300 text-[11px] font-bold text-gray-700 overflow-hidden w-full shrink-0">
                <div className="flex items-center">
                  <span className="text-gray-500 mr-2">Diario:</span>
                  <span>GENERAL</span>
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
              </div>

              {/* Toolbar */}
              <div className="flex items-center px-2 py-1 border-b border-gray-200 bg-gray-50 space-x-2 w-full shrink-0">
                <button 
                  onClick={handleSave}
                  disabled={!isBalanced || !date}
                  className={`p-1 rounded flex items-center justify-center ${(!isBalanced || !date) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'}`}
                  title="Aceptar asiento"
                >
                  <div className="relative">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full">
                      <Check className="w-3.5 h-3.5 text-green-500 stroke-[3]" />
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
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-10 text-center text-gray-600 uppercase">ORDEN</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-28 text-gray-600 uppercase">CUENTA</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-40 text-gray-600 uppercase">TÍTULO CUENTA</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold flex-1 text-gray-600 uppercase">CONCEPTO</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-gray-600 uppercase">DOCUMENTO</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-right text-gray-600 uppercase">DEBE</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-24 text-right text-gray-600 uppercase">HABER</th>
                      <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-8 text-center"></th>
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
                              className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400"
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
                          <td className="p-0"></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer Totals */}
              <div className="bg-gray-100 border-t border-gray-300 flex flex-col text-[12px] font-bold shrink-0">
                <div className="flex items-center">
                  <div className="flex-1 text-left pl-4 py-1 pr-4 text-gray-600 uppercase font-bold">
                    C.C
                  </div>
                  <div className="text-right py-1 px-4 text-gray-600 uppercase w-32">
                    TOTALES:
                  </div>
                  <div className="w-24 text-right py-1 px-2 text-green-700 border-l border-gray-300">
                    {totalDebit.toFixed(2)}
                  </div>
                  <div className="w-24 text-right py-1 px-2 text-red-600 border-l border-gray-300">
                    {totalCredit.toFixed(2)}
                  </div>
                  <div className="w-8 border-l border-gray-300 flex items-center justify-center">
                  </div>
                </div>
                <div className="flex items-center pb-1">
                  <div className="flex-1 text-left pl-4 py-0.5 pr-4 text-gray-700">
                    {selectedAccountName || '\u00A0'}
                  </div>
                  <div className="w-32"></div>
                  <div className="w-24"></div>
                  <div className="w-24"></div>
                  <div className="w-8"></div>
                </div>
              </div>
              
              {/* Imbalance Alert */}
              {!isBalanced && (totalDebit > 0 || totalCredit > 0) && (
                <div className="bg-red-50 border-t border-red-200 text-red-700 px-4 py-1.5 text-[11px] font-bold flex justify-between shrink-0">
                  <span>DESCUADRE EN EL ASIENTO</span>
                  <span>{Math.abs(imbalance).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Accounts Modal */}
          {showAccountsModal && (
            <div className="fixed inset-0 bg-black/5 backdrop-blur-sm0 flex items-center justify-center z-[10000] p-4">
              <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
                <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
                  <h2 className="font-bold text-[13px] tracking-wide">SELECCIÓN DE CUENTA</h2>
                  <button onClick={() => setShowAccountsModal(false)} className="hover:bg-white/20 p-1 rounded">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden relative">
                  <Accounts isModal={true} onAccountSelect={handleAccountSelect} />
                </div>
              </div>
            </div>
          )}

        </div>
      </Window>
    </div>
  );
}

export function AccountSelector({ accounts, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  
  const filtered = accounts.filter(acc => {
    const code = String(acc.code || '');
    if (code.length < 3) return false;
    return code.includes(search) || acc.name.toLowerCase().includes(search.toLowerCase());
  });

  const selectedAccount = accounts.find(a => a.id === value);

  const handleOpen = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 300)
    });
    setIsOpen(true);
  };

  return (
    <div className="w-full h-full relative">
      <div 
        onClick={handleOpen}
        className="w-full h-8 flex items-center justify-between px-2 bg-white border border-[#808080] cursor-pointer hover:bg-blue-50"
      >
        <div className="flex-1 truncate text-[10px] font-mono">
          {selectedAccount ? (
            <span className="font-bold text-blue-900">{selectedAccount.code} - {selectedAccount.name}</span>
          ) : (
            <span className="text-slate-400 italic">Elegir cuenta...</span>
          )}
        </div>
        <Search className="w-2.5 h-2.5 text-slate-400 ml-1" />
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[10000]" onClick={() => setIsOpen(false)}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ 
              top: dropdownPos.top, 
              left: dropdownPos.left, 
              width: dropdownPos.width,
              position: 'fixed'
            }}
            className="bg-[#f0f0f0] border-2 border-slate-800 shadow-[4px_4px_15px_rgba(0,0,0,0.4)] flex flex-col p-1 animate-in slide-in-from-top-1 duration-100"
          >
            <div className="bg-[#4a69bd] text-white p-1 flex justify-between items-center text-[9px] font-bold mb-1">
              <span>BUSCAR CUENTA</span>
              <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setIsOpen(false)} />
            </div>
            
            <input 
              autoFocus
              type="text"
              placeholder="Código o nombre..."
              className="w-full text-[11px] px-2 py-1.5 border border-[#808080] outline-none mb-1 shadow-inner focus:bg-yellow-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="max-h-[200px] overflow-y-auto bg-white border border-[#808080]">
              <table className="w-full text-[11px]">
                <thead className="bg-[#d4d0c8] text-left sticky top-0 border-b border-[#808080]">
                  <tr>
                    <th className="p-1 w-16">Cta.</th>
                    <th className="p-1">Nombre</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan="2" className="p-4 text-center italic text-slate-400">Sin resultados</td></tr>
                  ) : (
                    filtered.sort((a,b) => a.code.localeCompare(b.code)).map(acc => (
                      <tr 
                        key={acc.id}
                        onClick={() => {
                          onChange(acc.id);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className="bg-white hover:bg-blue-50 text-slate-800 cursor-pointer border-b border-slate-100"
                      >
                        <td className="p-1 font-mono font-bold">{acc.code}</td>
                        <td className="p-1 truncate">{acc.name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

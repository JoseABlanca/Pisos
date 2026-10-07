import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { Save, Plus, Trash2, X, Search, Edit2, Minus, FilePlus, RefreshCw, Copy, PanelLeft } from 'lucide-react';
import { collection as fbCollection, query as fbQuery, where as fbWhere, onSnapshot as fbOnSnapshot } from 'firebase/firestore';
import Accounts from './Accounts'; // Import Accounts to use as modal
import AnalyticalCenters from './AnalyticalCenters'; // Import AnalyticalCenters to use as modal
import ZoomControl from '../components/ZoomControl';
import { registerJournalEntry, updateJournalEntry } from '../services/accounting';
import { uploadFileToStorage } from '../utils/storageUtils';

const evaluateMathExpression = (expr) => {
  if (expr === null || expr === undefined) return 0;
  const str = String(expr).trim();
  if (!str) return 0;
  
  // Replace Spanish decimal commas with dots
  let sanitized = str.replace(/,/g, '.');
  
  // Allow only digits, operators (+, -, *, /), parentheses, dots and spaces
  if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  try {
    const result = new Function(`return (${sanitized})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch (e) {
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  }
};

const parseAmount = (val) => {
  return evaluateMathExpression(val);
};

function SearchableSelector({ items, value, onChange, placeholder, type, id, onKeyDown, onOpenModal }) {
  const [isOpen, setIsOpen] = useState(false); // full search popup
  const [search, setSearch] = useState('');     // search for full popup
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [focusedSuggestionIdx, setFocusedSuggestionIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleOpenFullSearch = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 220)
    });
    setSearch('');
    setIsOpen(true);
    setShowSuggestions(false);
  };

  const handleInputChange = (val) => {
    setInputValue(val);
    onChange(val); // update state in parent
    if (!val) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = items.filter(item => 
      (item.code && item.code.toLowerCase().includes(val.toLowerCase())) || 
      (item.name && item.name.toLowerCase().includes(val.toLowerCase()))
    ).slice(0, 10);
    setSuggestions(filtered);
    setShowSuggestions(true);
    setFocusedSuggestionIdx(-1);
  };

  const handleInputBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setSuggestions([]);
    }, 250);
  };

  const selectItem = (item) => {
    onChange(item.code);
    setInputValue(item.code);
    setShowSuggestions(false);
    setSuggestions([]);
    setFocusedSuggestionIdx(-1);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      handleOpenFullSearch();
      return;
    }
    
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedSuggestionIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter') {
        if (focusedSuggestionIdx >= 0 && focusedSuggestionIdx < suggestions.length) {
          e.preventDefault();
          selectItem(suggestions[focusedSuggestionIdx]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        setSuggestions([]);
        return;
      }
    }

    // Forward to parent keydown for grid navigation
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const filteredFull = items.filter(item => {
    const code = String(item.code || '').toLowerCase();
    const name = String(item.name || '').toLowerCase();
    const query = search.toLowerCase();
    return code.includes(query) || name.includes(query);
  });

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onDoubleClick={handleOpenFullSearch}
        onBlur={handleInputBlur}
        className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 font-mono text-[11px]"
        placeholder={placeholder}
        autoComplete="off"
      />

      {/* Inline Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-300 shadow-lg rounded z-30 max-h-48 overflow-y-auto">
          {suggestions.map((suggestion, sIdx) => (
            <div
              key={suggestion.id}
              onClick={() => selectItem(suggestion)}
              onMouseEnter={() => setFocusedSuggestionIdx(sIdx)}
              className={`px-3 py-1.5 cursor-pointer text-[10px] flex justify-between items-center ${
                focusedSuggestionIdx === sIdx ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="font-mono font-bold">{suggestion.code}</span>
              <span className="truncate text-gray-500 max-w-[120px] normal-case">{suggestion.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Full Modal-Like Search Overlay (via Double Click / F3) */}
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
            className="bg-[#f0f0f0] border border-slate-400 shadow-md flex flex-col p-1 animate-in slide-in-from-top-1 duration-100"
          >
            <input 
              autoFocus
              type="text"
              placeholder="Buscar..."
              className="w-full text-[11px] px-1.5 py-1 border border-gray-400 outline-none mb-1 shadow-inner focus:bg-yellow-50 normal-case font-sans"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
            />

            <div className="max-h-[150px] overflow-y-auto bg-white border border-gray-300">
              <div 
                onClick={() => {
                  onChange('');
                  setInputValue('');
                  setIsOpen(false);
                  setSearch('');
                }}
                className="p-1 text-[11px] text-slate-500 italic hover:bg-blue-50 cursor-pointer border-b border-slate-100 uppercase text-left"
              >
                -- SIN {type === 'cebe' ? 'CEBE' : 'CECO'} --
              </div>
              {filteredFull.length === 0 ? (
                <div className="p-2 text-center text-slate-400 italic text-[10px]">Sin resultados</div>
              ) : (
                filteredFull.sort((a,b) => a.code.localeCompare(b.code)).map(item => (
                  <div 
                    key={item.id}
                    onClick={() => {
                      selectItem(item);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className="p-1 hover:bg-blue-50 text-slate-800 cursor-pointer border-b border-slate-100 flex flex-col text-left"
                  >
                    <span className="font-mono font-bold text-[10px]">{item.code}</span>
                    <span className="text-[9px] text-slate-500 truncate normal-case font-sans">{item.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    { id: 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null },
    { id: 2, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null }
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
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [focusedSuggestionIdx, setFocusedSuggestionIdx] = useState(-1);
  const [hasCleanedCebes, setHasCleanedCebes] = useState(false);
  const [showCebeModal, setShowCebeModal] = useState(false);
  const [showCecoModal, setShowCecoModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyModalSearch, setCopyModalSearch] = useState('');
  const [journalHistory, setJournalHistory] = useState([]);
  const [copyModalSelectedId, setCopyModalSelectedId] = useState(null);
  const [copyDateFilter, setCopyDateFilter] = useState('Todos');
  const [copySelectedMonths, setCopySelectedMonths] = useState([]);
  const [copySelectedQuarters, setCopySelectedQuarters] = useState([]);
  const [copySelectedYears, setCopySelectedYears] = useState([]);
  const [showCopySidebar, setShowCopySidebar] = useState(true);
  const [copyFocusedAccountName, setCopyFocusedAccountName] = useState('');
  
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

    // Fetch journal entries for copy modal
    const unsubJournal = fbOnSnapshot(
      fbQuery(fbCollection(db, 'journal_entries'), fbWhere('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])),
      (snap) => {
        setJournalHistory(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      }
    );

    return () => {
      unsubAccounts();
      unsubEntries();
      unsubCecos();
      unsubCebes();
      unsubJournal();
    };
  }, [user]);

  useEffect(() => {
    if (location.state?.editEntry && accounts.length > 0) {
      setHasCleanedCebes(false);
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
             ceco: (editEntry.lines && editEntry.lines.some(line => line.ceco || line.cebe)) ? (l.ceco || '') : (editEntry.ceco || ''),
             cebe: (editEntry.lines && editEntry.lines.some(line => line.ceco || line.cebe)) ? (l.cebe || '') : (editEntry.cebe || ''),
             debit: parseFloat(l.debit) || 0,
             credit: parseFloat(l.credit) || 0,
             documentUrl: l.documentUrl || (i === 0 ? editEntry.documentUrl : null),
             documentName: l.documentName || (i === 0 ? editEntry.documentName : null),
             image: null
           };
        });
        if (mappedLines.length < 2) {
          mappedLines.push({ id: mappedLines.length + 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null });
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

  // Clean invalid line-level CEBE/CECO codes once master lists are loaded
  useEffect(() => {
    if (lines.length === 0 || cebes.length === 0 || cecos.length === 0 || hasCleanedCebes) return;
    
    let changed = false;
    const newLines = lines.map(line => {
      let updatedCebe = line.cebe;
      let updatedCeco = line.ceco;

      if (line.cebe && cebes.length > 0) {
        const norm = line.cebe.replace(/^(CEBE|CECO)/i, '').trim();
        const matched = cebes.find(c => c.code.replace(/^(CEBE|CECO)/i, '').trim() === norm);
        if (matched) {
          if (matched.code !== line.cebe) {
            updatedCebe = matched.code;
            changed = true;
          }
        } else {
          updatedCebe = '';
          changed = true;
        }
      }

      if (line.ceco && cecos.length > 0) {
        const norm = line.ceco.replace(/^(CEBE|CECO)/i, '').trim();
        const matched = cecos.find(c => c.code.replace(/^(CEBE|CECO)/i, '').trim() === norm);
        if (matched) {
          if (matched.code !== line.ceco) {
            updatedCeco = matched.code;
            changed = true;
          }
        } else {
          updatedCeco = '';
          changed = true;
        }
      }

      if (updatedCebe !== line.cebe || updatedCeco !== line.ceco) {
        return { ...line, cebe: updatedCebe, ceco: updatedCeco };
      }
      return line;
    });

    if (changed) {
      setLines(newLines);
    }
    setHasCleanedCebes(true);
  }, [cebes, cecos, lines, hasCleanedCebes]);

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    
    if (field === 'debit') {
      newLines[index][field] = value;
      if (parseAmount(value) > 0) newLines[index]['credit'] = 0;
    } else if (field === 'credit') {
      newLines[index][field] = value;
      if (parseAmount(value) > 0) newLines[index]['debit'] = 0;
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

  const handleFieldBlur = (index, field, value) => {
    if (field === 'debit' || field === 'credit') {
      const evaluated = evaluateMathExpression(value);
      if (evaluated !== 0 || value) {
        updateLine(index, field, String(evaluated));
      }
    }
  };
  
  const addLine = () => {
    const maxId = lines.length > 0 ? Math.max(...lines.map(l => l.id)) : 0;
    setLines([...lines, { id: maxId + 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null }]);
  };
  
  const removeLine = (index, field = 'account') => {
    if (index === null || index === undefined) return;
    if (lines.length <= 1) return;
    
    setLines(lines.filter((_, i) => i !== index));
    if (selectedLineIndex === index) {
      setSelectedLineIndex(null);
    } else if (selectedLineIndex > index) {
      setSelectedLineIndex(selectedLineIndex - 1);
    }

    const targetIdx = index >= lines.length - 1 ? lines.length - 2 : index;
    setTimeout(() => {
      document.getElementById(`${field}-${targetIdx}`)?.focus();
    }, 50);
  };
  
  const totalDebit = lines.reduce((sum, l) => sum + parseAmount(l.debit), 0);
  const totalCredit = lines.reduce((sum, l) => sum + parseAmount(l.credit), 0);
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
    
    const validLines = lines.filter(l => l.account && (parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0));
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
          ceco: line.ceco || '',
          cebe: line.cebe || '',
          debit: parseAmount(line.debit) || 0,
          credit: parseAmount(line.credit) || 0,
        };
      });

      if (formattedLines.some(l => !l.accountId)) {
        alert("Algunas cuentas no son válidas o no existen en el catálogo.");
        return;
      }

      const globalDescription = formattedLines[0].description || `Asiento manual ${date}`;
      
      // Extract first matched CEBE/CECO and Document for global compatibility
      const firstCebe = formattedLines.find(l => l.cebe)?.cebe || '';
      const firstCeco = formattedLines.find(l => l.ceco)?.ceco || '';
      const analytics = {
        cebe: firstCebe,
        ceco: firstCeco
      };
      
      const firstDoc = formattedLines.find(l => l.documentUrl);
      const globalDocUrl = firstDoc ? firstDoc.documentUrl : null;
      const globalDocName = firstDoc ? firstDoc.documentName : null;
      
      if (isEditing) {
        await updateJournalEntry(user.uid, entryId, globalDescription, formattedLines, originalLines, date, analytics, globalDocUrl, globalDocName, nextEntryNumber);
        alert(`Asiento ${nextEntryNumber} actualizado correctamente.`);
        navigate('/journal-list');
      } else {
        await registerJournalEntry(user.uid, globalDescription, formattedLines, date, analytics, entryId, globalDocUrl, globalDocName);
        alert(`Asiento ${entryNumber} guardado correctamente.`);
        // Reset form
        setDate('');
        setEntryId(''); // triggers regeneration via useEffect
        setLines([
          { id: 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null },
          { id: 2, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null }
        ]);
        setSelectedLineIndex(null);
      }
      
    } catch (error) {
      console.error("Error al guardar asiento:", error);
      alert("Error al guardar asiento: " + error.message);
    }
  };

  const handleAccountChange = (idx, value) => {
    updateLine(idx, 'account', value);
    if (!value) {
      setSuggestions([]);
      setActiveDropdownIndex(null);
      setFocusedSuggestionIdx(-1);
      return;
    }
    const filtered = accounts.filter(a => 
      (a.code && a.code.toLowerCase().includes(value.toLowerCase())) || 
      (a.name && a.name.toLowerCase().includes(value.toLowerCase()))
    ).slice(0, 10);
    setSuggestions(filtered);
    setActiveDropdownIndex(idx);
    setFocusedSuggestionIdx(-1);
  };

  const selectSuggestion = (idx, selectedAccount) => {
    const newLines = [...lines];
    newLines[idx].account = selectedAccount.code;
    if (!newLines[idx].description) {
      newLines[idx].description = selectedAccount.name;
    }
    setLines(newLines);
    setActiveDropdownIndex(null);
    setSuggestions([]);
    setFocusedSuggestionIdx(-1);
  };

  const handleAccountBlur = () => {
    setTimeout(() => {
      setActiveDropdownIndex(null);
      setSuggestions([]);
      setFocusedSuggestionIdx(-1);
    }, 200);
  };

  const handleKeyDown = (e, index, field) => {
    if (e.ctrlKey && e.key === 'Delete') {
      e.preventDefault();
      removeLine(index, field);
      return;
    }

    if (field === 'account') {
      if (e.key === 'F3') {
        e.preventDefault();
        openAccountSelector(e, index);
        return;
      }
      if (activeDropdownIndex === index && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedSuggestionIdx(prev => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Enter') {
          if (focusedSuggestionIdx >= 0 && focusedSuggestionIdx < suggestions.length) {
            e.preventDefault();
            selectSuggestion(index, suggestions[focusedSuggestionIdx]);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setActiveDropdownIndex(null);
          setSuggestions([]);
          setFocusedSuggestionIdx(-1);
          return;
        }
      }
    }

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

  const openCebeSelector = (index) => {
    setActiveLineIndex(index);
    setShowCebeModal(true);
  };

  const handleCebeSelect = (selectedCebeCode) => {
    if (activeLineIndex !== null) {
      const newLines = [...lines];
      newLines[activeLineIndex].cebe = selectedCebeCode;
      setLines(newLines);
    }
    setShowCebeModal(false);
  };

  const openCecoSelector = (index) => {
    setActiveLineIndex(index);
    setShowCecoModal(true);
  };

  const handleCecoSelect = (selectedCecoCode) => {
    if (activeLineIndex !== null) {
      const newLines = [...lines];
      newLines[activeLineIndex].ceco = selectedCecoCode;
      setLines(newLines);
    }
    setShowCecoModal(false);
  };

  const handleCopyEntry = (entry) => {
    if (!entry || !entry.lines || entry.lines.length === 0) return;
    const mappedLines = entry.lines.map((l, i) => {
      const acct = accounts.find(a => a.id === l.accountId);
      return {
        id: i + 1,
        account: acct ? acct.code : (l.accountCode || ''),
        description: l.description || entry.description || '',
        document: l.document || '',
        ceco: l.ceco || entry.ceco || '',
        cebe: l.cebe || entry.cebe || '',
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        image: null,
        documentUrl: null,
        documentName: null,
      };
    });
    if (mappedLines.length < 2) {
      mappedLines.push({ id: mappedLines.length + 1, account: '', description: '', document: '', ceco: '', cebe: '', debit: 0, credit: 0, image: null, documentUrl: null, documentName: null });
    }
    setLines(mappedLines);
    setShowCopyModal(false);
    setCopyModalSearch('');
    setCopyModalSelectedId(null);
  };

  // Group journal history entries for copy modal display
  const groupedJournalForCopy = useMemo(() => {
    return journalHistory
      .filter(e => {
        if (!copyModalSearch) return true;
        const q = copyModalSearch.toLowerCase();
        return (
          String(e.number || '').includes(q) ||
          (e.description || '').toLowerCase().includes(q) ||
          (e.date || '').includes(q) ||
          (e.lines || []).some(l => {
            const acct = accounts.find(a => a.id === l.accountId);
            return (acct?.code || '').toLowerCase().includes(q) ||
                   (acct?.name || '').toLowerCase().includes(q) ||
                   (l.description || '').toLowerCase().includes(q) ||
                   (l.document || '').toLowerCase().includes(q) ||
                   (l.ceco || '').toLowerCase().includes(q) ||
                   (l.cebe || '').toLowerCase().includes(q) ||
                   String(l.debit || '').includes(q) ||
                   String(l.credit || '').includes(q);
          })
        );
      })
      .sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        return (b.number || 0) - (a.number || 0);
      });
  }, [journalHistory, copyModalSearch, accounts]);

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
        <button
          onClick={() => setShowCopyModal(true)}
          className="p-1 hover:bg-gray-200 rounded flex items-center justify-center"
          title="Copiar asiento desde el diario"
        >
          <div className="relative w-[22px] h-[22px]">
            {/* Fichero de atrás */}
            <svg width="18" height="20" viewBox="0 0 14 17" fill="none" stroke="#0ea5e9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', top:2, left:4}}>
              <path d="M2 1h7l3 3v11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="9 1 9 4 12 4"/>
            </svg>
            {/* Fichero de delante */}
            <svg width="18" height="20" viewBox="0 0 14 17" fill="white" stroke="#0ea5e9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', top:0, left:0}}>
              <path d="M2 1h7l3 3v11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/>
              <polyline points="9 1 9 4 12 4"/>
            </svg>
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
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-28 text-gray-600 uppercase">CUENTA</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-40 text-gray-600 uppercase">TÍTULO CUENTA</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold flex-1 text-gray-600 uppercase">CONCEPTO</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-28 text-gray-600 uppercase">CEBE</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-28 text-gray-600 uppercase">CECO</th>
              <th className="border-b border-gray-300 px-2 py-1.5 font-bold w-44 text-gray-600 uppercase">DOCUMENTO</th>
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
                      onChange={(e) => handleAccountChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'account')}
                      onDoubleClick={(e) => openAccountSelector(e, idx)}
                      onBlur={handleAccountBlur}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 font-mono"
                      placeholder="Doble clic o F3..."
                      autoComplete="off"
                    />
                    <button 
                      type="button"
                      onClick={(e) => openAccountSelector(e, idx)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-blue-600 hidden group-hover:block z-10 bg-white shadow-sm rounded"
                    >
                      <Search className="w-3 h-3" />
                    </button>

                    {/* Suggestions Dropdown */}
                    {activeDropdownIndex === idx && suggestions.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-300 shadow-lg rounded z-30 max-h-48 overflow-y-auto">
                        {suggestions.map((suggestion, sIdx) => (
                          <div
                            key={suggestion.id}
                            onClick={() => selectSuggestion(idx, suggestion)}
                            onMouseEnter={() => setFocusedSuggestionIdx(sIdx)}
                            className={`px-3 py-1.5 cursor-pointer text-[11px] flex justify-between items-center ${
                              focusedSuggestionIdx === sIdx ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="font-mono font-bold">{suggestion.code}</span>
                            <span className="truncate text-gray-500 max-w-[160px]">{suggestion.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
                    <SearchableSelector 
                      id={`cebe-${idx}`}
                      items={cebes} 
                      value={line.cebe} 
                      onChange={(val) => updateLine(idx, 'cebe', val)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'cebe')}
                      onOpenModal={() => openCebeSelector(idx)}
                      placeholder="Sin CEBE" 
                      type="cebe" 
                    />
                  </td>
                  <td className="p-0">
                    <SearchableSelector 
                      id={`ceco-${idx}`}
                      items={cecos} 
                      value={line.ceco} 
                      onChange={(val) => updateLine(idx, 'ceco', val)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'ceco')}
                      onOpenModal={() => openCecoSelector(idx)}
                      placeholder="Sin CECO" 
                      type="ceco" 
                    />
                  </td>
                  <td className="p-0">
                    <div className="flex items-center w-full h-full pr-1 gap-1">
                      <input 
                        id={`document-${idx}`}
                        type="text" 
                        value={line.document}
                        onChange={(e) => updateLine(idx, 'document', e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, 'document')}
                        className="flex-1 min-w-0 h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 uppercase text-[10px]"
                        placeholder="Ref..."
                      />
                      {line.documentUrl ? (
                        <div className="flex items-center bg-blue-50 text-blue-700 px-1 py-0.5 border border-blue-200 rounded text-[9px] shrink-0 max-w-[90px]" title={line.documentName}>
                          <span className="truncate">{line.documentName}</span>
                          <button 
                            type="button"
                            onClick={() => {
                              if (window.confirm('¿Quitar documento de esta línea?')) {
                                updateLine(idx, 'documentUrl', null);
                                updateLine(idx, 'documentName', null);
                              }
                            }}
                            className="ml-1 text-red-500 hover:text-red-700 shrink-0"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <label className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer shrink-0" title="Adjuntar documento">
                          <FilePlus className="w-3.5 h-3.5" />
                          <input 
                            type="file" 
                            className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !user || !entryId) return;
                              try {
                                const url = await uploadFileToStorage(file, user.uid, 'journal_entries', `${entryId}_line_${idx}`, 'docs');
                                updateLine(idx, 'documentUrl', url);
                                updateLine(idx, 'documentName', file.name);
                              } catch (err) {
                                console.error(err);
                                alert('Error al subir: ' + err.message);
                              }
                            }}
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          />
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="p-0">
                    <input 
                      id={`debit-${idx}`}
                      type="text" 
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                      onBlur={(e) => handleFieldBlur(idx, 'debit', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'debit')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 text-right text-gray-800"
                    />
                  </td>
                  <td className="p-0">
                    <input 
                      id={`credit-${idx}`}
                      type="text" 
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                      onBlur={(e) => handleFieldBlur(idx, 'credit', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, 'credit')}
                      className="w-full h-full px-2 py-1.5 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 text-right text-gray-800"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); removeLine(idx); }}>
                    <Trash2 className="w-3.5 h-3.5 cursor-pointer inline-block" />
                  </td>
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
        
        {/* Bottom Bar for Zoom */}
        <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 mt-2">
          <ZoomControl />
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

      {/* CEBE Modal */}
      {showCebeModal && (
        <div className="fixed inset-0 bg-black/5 backdrop-blur-sm0 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
              <h2 className="font-bold text-[13px] tracking-wide uppercase">SELECCIÓN DE CEBE</h2>
              <button onClick={() => setShowCebeModal(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <AnalyticalCenters type="cebe" isModal={true} onSelect={handleCebeSelect} />
            </div>
          </div>
        </div>
      )}

      {/* CECO Modal */}
      {showCecoModal && (
        <div className="fixed inset-0 bg-black/5 backdrop-blur-sm0 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[90vw] h-[90vh] overflow-hidden max-w-[1200px] border border-gray-400">
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none">
              <h2 className="font-bold text-[13px] tracking-wide uppercase">SELECCIÓN DE CECO</h2>
              <button onClick={() => setShowCecoModal(false)} className="hover:bg-white/20 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <AnalyticalCenters type="ceco" isModal={true} onSelect={handleCecoSelect} />
            </div>
          </div>
        </div>
      )}

      {/* Copy Entry Modal — Consulta de Diario style */}
      {showCopyModal && (() => {
        // Flatten journal entries into individual lines (same as JournalList)
        const allFlatCopyLines = [];
        groupedJournalForCopy.forEach(entry => {
          (entry.lines || []).forEach((line, lineIdx) => {
            const acct = accounts.find(a => a.id === line.accountId);
            allFlatCopyLines.push({
              entryId: entry.id,
              number: entry.number,
              date: entry.date,
              lineOrder: lineIdx + 1,
              accountCode: acct ? acct.code : (line.accountCode || ''),
              description: line.description || entry.description || 'Sin concepto',
              document: line.document || '',
              ceco: (entry.lines && entry.lines.some(l => l.ceco || l.cebe)) ? (line.ceco || '') : (entry.ceco || ''),
              cebe: (entry.lines && entry.lines.some(l => l.ceco || l.cebe)) ? (line.cebe || '') : (entry.cebe || ''),
              debit: parseFloat(line.debit) || 0,
              credit: parseFloat(line.credit) || 0,
              originalEntry: entry,
            });
          });
        });

        // Apply date filters
        const monthNames = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
        let flatCopyLines = allFlatCopyLines.filter(item => {
          if (!item.date) return true;
          const itemDate = new Date(item.date);
          const today = new Date();

          // Date filter from sidebar
          if (copyDateFilter !== 'Todos') {
            if (copyDateFilter === 'De hoy' || copyDateFilter === 'Creados/modificados hoy') {
              if (itemDate.toDateString() !== today.toDateString()) return false;
            } else if (copyDateFilter === 'De la última semana') {
              const lastWeek = new Date(today);
              lastWeek.setDate(today.getDate() - 7);
              if (itemDate < lastWeek) return false;
            } else if (copyDateFilter === 'Del último mes') {
              const lastMonth = new Date(today);
              lastMonth.setMonth(today.getMonth() - 1);
              if (itemDate < lastMonth) return false;
            }
          }

          // Timeline filters (months, quarters, years)
          const dateParts = String(item.date).split('-');
          const y = parseInt(dateParts[0], 10);
          const m = parseInt(dateParts[1], 10) - 1;

          if (copySelectedYears.length > 0) {
            if (!copySelectedYears.includes(String(y))) return false;
          }

          if (copySelectedMonths.length > 0 || copySelectedQuarters.length > 0) {
            const matchMonth = copySelectedMonths.includes(monthNames[m]);
            const matchQuarter = copySelectedQuarters.some(q => {
              if (q === '1T') return m >= 0 && m <= 2;
              if (q === '2T') return m >= 3 && m <= 5;
              if (q === '3T') return m >= 6 && m <= 8;
              if (q === '4T') return m >= 9 && m <= 11;
              return false;
            });
            if (!matchMonth && !matchQuarter) return false;
          }

          return true;
        });

        // Apply '100 últimos asientos' limit
        if (copyDateFilter === '100 últimos asientos') {
          flatCopyLines = flatCopyLines.slice(0, 100);
        }

        return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white shadow-2xl rounded-lg flex flex-col w-[98vw] max-w-[1400px] h-[90vh] overflow-hidden border border-gray-400">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-4 py-2 bg-[#4e80c8] text-white select-none shrink-0">
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <h2 className="font-bold text-[13px] tracking-wide">COPIAR ASIENTO DEL DIARIO</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center border-b border-white/40 px-1 w-64">
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Buscar en el fichero (Alt+B)" 
                    className="w-full text-[12px] py-0.5 outline-none bg-transparent text-white placeholder-white/60"
                    value={copyModalSearch}
                    onChange={(e) => setCopyModalSearch(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-white/60 ml-1" />
                </div>
                <span className="text-[11px] text-white/70">{groupedJournalForCopy.length} asiento(s)</span>
                <button 
                  onClick={() => setShowCopySidebar(!showCopySidebar)} 
                  className="text-white/80 hover:text-white p-1 rounded hover:bg-white/20 transition-colors"
                  title={showCopySidebar ? 'Ocultar Filtros' : 'Mostrar Filtros'}
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
                <button onClick={() => { setShowCopyModal(false); setCopyModalSearch(''); setCopyModalSelectedId(null); setCopyDateFilter('Todos'); setCopySelectedMonths([]); setCopySelectedQuarters([]); setCopySelectedYears([]); setCopyFocusedAccountName(''); }} className="hover:bg-white/20 p-1 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: Sidebar + Timeline + Table */}
            <div className="flex flex-1 overflow-hidden uppercase">
              
              {/* Left Sidebar - Date Filters */}
              {showCopySidebar && (
                <div className="w-40 border-r border-gray-300 bg-[#f9fafc] flex flex-col shrink-0 text-[11px] text-gray-700">
                  <div className="flex-1 p-3 overflow-y-auto space-y-4">
                    <div>
                      <h3 className="font-bold mb-2 text-[#2a3042]">FECHAS:</h3>
                      <div className="space-y-1.5 ml-1">
                        {['Todos', 'De hoy', 'De la última semana', 'Del último mes', '100 últimos asientos', 'Creados/modificados hoy'].map(filter => (
                          <label key={filter} className="flex items-center space-x-1.5 cursor-pointer hover:bg-gray-200 p-0.5 rounded -ml-0.5">
                            <input 
                              type="radio" 
                              name="copyDateFilter" 
                              className="w-3 h-3 text-blue-600" 
                              checked={copyDateFilter === filter}
                              onChange={() => setCopyDateFilter(filter)}
                            /> 
                            <span>{filter.toUpperCase()}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <button 
                        onClick={() => {
                          setCopySelectedMonths([]);
                          setCopySelectedQuarters([]);
                          setCopySelectedYears([]);
                          setCopyDateFilter('Todos');
                        }}
                        className="w-full py-1.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 rounded text-[10px] font-bold uppercase transition-colors"
                      >
                        Quitar filtros temporales
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Column */}
              <div className="w-8 border-r border-gray-300 bg-white flex flex-col items-center py-2 space-y-2 text-[10px] font-bold text-gray-600 overflow-y-auto shrink-0 select-none">
                {['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'].map(m => (
                  <span 
                    key={m} 
                    onClick={() => setCopySelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className={`hover:text-blue-600 cursor-pointer p-0.5 w-full text-center transition-colors ${copySelectedMonths.includes(m) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
                  >{m}</span>
                ))}
                {['1T', '2T', '3T', '4T'].map((q, idx) => (
                  <span 
                    key={q}
                    onClick={() => setCopySelectedQuarters(prev => prev.includes(q) ? prev.filter(x => x !== q) : [...prev, q])}
                    className={`w-full text-center hover:text-blue-600 cursor-pointer transition-colors ${idx === 0 ? 'mt-2 pt-2 border-t border-gray-300' : ''} ${copySelectedQuarters.includes(q) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
                  >{q}</span>
                ))}
                {['2024', '2025', '2026', '2027'].map((yr, idx) => (
                  <span 
                    key={yr}
                    onClick={() => setCopySelectedYears(prev => prev.includes(yr) ? prev.filter(x => x !== yr) : [...prev, yr])}
                    className={`w-full text-center hover:text-blue-600 cursor-pointer transition-colors ${idx === 0 ? 'mt-2 pt-2 border-t border-gray-300' : ''} ${copySelectedYears.includes(yr) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
                  >{yr}</span>
                ))}
              </div>

              {/* Main Table */}
              <div className="flex-1 bg-white flex flex-col min-w-0">
                <div className="flex-1 overflow-auto">
                  <table className="w-full h-full text-left border-collapse text-[11px] font-sans">
                    <thead className="bg-white sticky top-0 z-10">
                      <tr>
                        <th className="border-b border-gray-300 px-2 py-1.5 text-center w-8">
                          <input 
                            type="checkbox" 
                            className="w-3 h-3"
                            checked={flatCopyLines.length > 0 && copyModalSelectedId === flatCopyLines[0]?.entryId}
                            onChange={(e) => {
                              if (e.target.checked && flatCopyLines.length > 0) {
                                setCopyModalSelectedId(flatCopyLines[0].entryId);
                              } else {
                                setCopyModalSelectedId(null);
                              }
                            }}
                          />
                        </th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-24 text-center uppercase">FECHA</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-16 text-center uppercase">ASI.</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-16 text-center uppercase">ORD.</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-24 uppercase">CUENTA</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 flex-1 min-w-[200px] uppercase">CONCEPTO</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-24 uppercase">DOCUM.</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-20 uppercase">CECO</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-20 uppercase">CEBE</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-24 text-right uppercase">DEBE</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-24 text-right uppercase">HABER</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-8 text-center uppercase">P</th>
                        <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-12 text-center uppercase">IMP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatCopyLines.length === 0 ? (
                        <tr>
                          <td colSpan="13" className="text-center italic py-10 text-slate-400 text-[11px]">
                            {journalHistory.length === 0 ? 'CARGANDO DATOS...' : 'NO HAY ASIENTOS QUE COINCIDAN CON LA BÚSQUEDA'}
                          </td>
                        </tr>
                      ) : (
                        flatCopyLines.map((item, idx) => {
                          const isSelected = copyModalSelectedId === item.entryId;
                          return (
                            <tr 
                              key={`${item.entryId}-${idx}`} 
                              className={`border-b border-gray-200 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 border-l-2 border-l-blue-400'
                                  : 'hover:bg-blue-50/50'
                              }`}
                              onClick={() => {
                                setCopyModalSelectedId(item.entryId);
                                const acc = accounts.find(a => a.code === item.accountCode);
                                setCopyFocusedAccountName(acc ? `${acc.code} - ${acc.name}` : item.accountCode);
                              }}
                              onDoubleClick={() => handleCopyEntry(item.originalEntry)}
                            >
                              <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  className="w-3 h-3 cursor-pointer"
                                  checked={isSelected}
                                  onChange={() => {
                                    setCopyModalSelectedId(isSelected ? null : item.entryId);
                                    if (!isSelected) {
                                      const acc = accounts.find(a => a.code === item.accountCode);
                                      setCopyFocusedAccountName(acc ? `${acc.code} - ${acc.name}` : item.accountCode);
                                    }
                                  }}
                                />
                              </td>
                              <td className="px-2 py-1 text-center text-gray-700">
                                {item.date ? new Date(item.date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: '2-digit'}) : '—'}
                              </td>
                              <td className="px-2 py-1 text-center text-gray-700">{item.number || '—'}</td>
                              <td className="px-2 py-1 text-center text-gray-700">{item.lineOrder}</td>
                              <td className="px-2 py-1 text-gray-700 font-mono">{item.accountCode}</td>
                              <td className="px-2 py-1 truncate max-w-[200px] text-gray-700" title={item.description}>{item.description}</td>
                              <td className="px-2 py-1 text-gray-700">{item.document}</td>
                              <td className="px-2 py-1 text-gray-700">{item.ceco}</td>
                              <td className="px-2 py-1 text-gray-700">{item.cebe}</td>
                              <td className="px-2 py-1 text-right text-gray-700">{item.debit > 0 ? item.debit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : '0,00'}</td>
                              <td className="px-2 py-1 text-right text-gray-700">{item.credit > 0 ? item.credit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : '0,00'}</td>
                              <td className="px-2 py-1 text-center text-gray-700">
                                <input type="checkbox" className="w-3 h-3 cursor-pointer" defaultChecked={item.debit > 0 || item.credit > 0} readOnly />
                              </td>
                              <td className="px-2 py-1 text-center text-gray-700">
                                <input type="checkbox" className="w-3.5 h-3.5 cursor-pointer accent-blue-600" defaultChecked={!!item.originalEntry?.isImpuesto} readOnly />
                              </td>
                            </tr>
                          );
                        })
                      )}
                      <tr className="h-full">
                        <td colSpan="13"></td>
                      </tr>
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10 bg-[#f8f9fa] border-t-2 border-gray-300 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] select-none">
                      <tr className="font-bold text-gray-800 border-t border-gray-300">
                        <td colSpan="9" className="px-2 py-2 text-right">TOTALES:</td>
                        <td className="px-2 py-2 text-right text-red-600 font-sans tabular-nums">
                          {flatCopyLines.reduce((s, l) => s + l.debit, 0).toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="px-2 py-2 text-right text-red-600 font-sans tabular-nums">
                          {flatCopyLines.reduce((s, l) => s + l.credit, 0).toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td colSpan="2"></td>
                      </tr>
                      <tr className="text-[10px] text-gray-600 border-t border-gray-200">
                        <td colSpan="13" className="px-4 py-1.5 text-left italic normal-case">
                          {copyFocusedAccountName ? `Cuenta seleccionada: ${copyFocusedAccountName}` : '\u00A0'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-gray-500 normal-case">
                {copyModalSelectedId ? 'Asiento seleccionado — pulsa Copiar o haz doble clic para cargar las líneas' : 'Selecciona un asiento de la lista'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCopyModal(false); setCopyModalSearch(''); setCopyModalSelectedId(null); setCopyFocusedAccountName(''); }}
                  className="px-3 py-1.5 text-[11px] border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={!copyModalSelectedId}
                  onClick={() => {
                    const entry = groupedJournalForCopy.find(e => e.id === copyModalSelectedId);
                    if (entry) handleCopyEntry(entry);
                  }}
                  className={`px-4 py-1.5 text-[11px] rounded font-bold flex items-center gap-1.5 transition-all ${
                    copyModalSelectedId
                      ? 'bg-[#4e80c8] hover:bg-[#3d6db0] text-white shadow-sm'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copiar asiento
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

    </div>
  );
}

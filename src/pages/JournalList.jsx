import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import ZoomControl from '../components/ZoomControl';
import { useAuth } from '../context/AuthContext';
import { registerJournalEntry, deleteJournalEntry, updateJournalEntry } from '../services/accounting';
import Window from '../components/Window';
import { 
  BookOpen, Plus, Save, AlertCircle, History, ArrowRightLeft,
  Search, Filter, Download, Trash2, Edit, X, Check, FileText, PanelLeft
} from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import ResizableSidebar from '../components/ResizableSidebar';

function AccountSelector({ accounts, value, onChange }) {
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

            <div className="max-h-[250px] overflow-y-auto bg-white border border-[#808080]">
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

export default function Journal() {
  const { user, queryUserIds } = useAuth();
  const navigate = useNavigate();

  const handleEditEntry = () => {
    if (selectedEntryIds.size !== 1) return;
    const entryId = Array.from(selectedEntryIds)[0];
    const entryToEdit = history.find(e => e.id === entryId);
    if (entryToEdit) {
      navigate('/journal-entry', { state: { editEntry: entryToEdit } });
    }
  };

  const handleToggleImpuesto = async (entryId, currentVal) => {
    try {
      const entryRef = doc(db, 'journal_entries', entryId);
      await updateDoc(entryRef, {
        isImpuesto: !currentVal
      });
    } catch (err) {
      console.error("Error al actualizar impuesto:", err);
      alert("Error al cambiar estado de impuesto: " + err.message);
    }
  };
  const [entries, setEntries] = useState([{ accountId: '', debit: '', credit: '' }]);
  const [description, setDescription] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [dateFilter, setDateFilter] = useState('Todos');
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState(new Set());

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filter states
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [filterColumn, setFilterColumn] = useState('description');
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');

  // Excel-style Header Filters
  const [headerFilters, setHeaderFilters] = useState({}); // { colName: [values] }
  const [openFilter, setOpenFilter] = useState(null); // active column dropdown
  const [filterSearch, setFilterSearch] = useState('');

  // Totals for validation
  const totalDebitCreation = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  const totalCreditCreation = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  const isBalanced = totalDebitCreation === totalCreditCreation && totalDebitCreation > 0;

  const [focusedAccountName, setFocusedAccountName] = useState('');

  useEffect(() => {
    if (!user) return;
    
    // Load accounts mapping
    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubAcc = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Close filters on outside click
    const handleOutsideClick = (e) => {
      if (!e.target.closest('th')) setOpenFilter(null);
    };
    window.addEventListener('click', handleOutsideClick);

    // Load journal history
    const qHist = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid])
    );
    const unsubHist = onSnapshot(qHist, 
      (snap) => {
        setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching journal history:", error);
        setLoading(false);
      }
    );

    return () => { 
      unsubAcc(); 
      unsubHist(); 
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [user]);

  const addRow = () => setEntries([...entries, { accountId: '', debit: '', credit: '' }]);
  
  const updateRow = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    if (field === 'debit' && value > 0) newEntries[index].credit = '';
    if (field === 'credit' && value > 0) newEntries[index].debit = '';
    setEntries(newEntries);
  };

  const handleSave = async () => {
    console.log("Intentando guardar asiento...", { isBalanced, entries, description, entryDate });
    if (!isBalanced) {
      alert("El asiento no está cuadrado. Debe: " + totalDebitCreation + ", Haber: " + totalCreditCreation);
      return;
    }
    
    try {
      if (isEditing && selectedEntry) {
        console.log("Editando asiento existente:", selectedEntry.id);
        await updateJournalEntry(user.uid, selectedEntry.id, description, entries, selectedEntry.lines, entryDate);
      } else {
        console.log("Registrando nuevo asiento...");
        const result = await registerJournalEntry(user.uid, description, entries, entryDate);
        console.log("Resultado del registro:", result);
      }
      
      setEntries([{ accountId: '', debit: '', credit: '' }]);
      setDescription('');
      setEntryDate(new Date().toISOString().split('T')[0]);
      setShowForm(false);
      setIsEditing(false);
      alert("Asiento guardado correctamente.");
    } catch (error) {
      console.error("ERROR AL GUARDAR:", error);
      alert("ERROR AL GUARDAR: " + (error.code || error.message || "Error desconocido"));
      
      if (error.message.includes("permission-denied")) {
        alert("Parece un problema de permisos en Firebase. Por favor, asegúrate de haber actualizado las Reglas de Seguridad en tu consola de Firebase añadiendo la regla para 'counters'.");
      }
    }
  };

  const handleEdit = () => {
    if (!selectedEntry) return;
    setEntries(selectedEntry.lines.map(l => ({ ...l })));
    setDescription(selectedEntry.description);
    setEntryDate(selectedEntry.date || new Date().toISOString().split('T')[0]);
    setIsEditing(true);
    setShowForm(true);
  };

  const handleDeleteSelected = async () => {
    if (selectedEntryIds.size === 0) return;
    if (window.confirm(`¿Está seguro de que desea eliminar ${selectedEntryIds.size} asiento(s)? Esta acción revertirá los saldos de las cuentas.`)) {
      try {
        for (const id of selectedEntryIds) {
          const entry = history.find(e => e.id === id);
          if (entry) {
            await deleteJournalEntry(user.uid, entry.id, entry.lines);
          }
        }
        setSelectedEntryIds(new Set());
      } catch (error) {
        alert('Error al eliminar: ' + error.message);
      }
    }
  };

  const handleNew = () => {
    setEntries([{ accountId: '', debit: '', credit: '' }]);
    setDescription('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setShowForm(true);
  };

  const flattenHistory = () => {
    const flattened = [];
    if (!history || !Array.isArray(history)) return flattened;

    history.forEach(entry => {
      // Usamos el operador opcional ?. o un fallback para evitar errores si lines no existe
      (entry.lines || []).forEach(line => {
        const account = accounts.find(a => a.id === line.accountId) || {};
        flattened.push({
          entryId: entry.id,
          shortId: entry.number || (entry.id || '').slice(-6).toUpperCase(),
          date: entry.date || new Date().toISOString(),
          description: line.description || entry.description || 'Sin concepto',
          accountCode: account.code || 'N/A',
          accountName: account.name || 'Cuenta Desconocida',
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0,
          ceco: (entry.lines && entry.lines.some(l => l.ceco || l.cebe)) ? (line.ceco || '') : (entry.ceco || ''),
          cebe: (entry.lines && entry.lines.some(l => l.ceco || l.cebe)) ? (line.cebe || '') : (entry.cebe || ''),
          document: line.document || entry.documentName || '',
          originalEntry: entry
        });
      });
    });
    return flattened.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const baseHistory = flattenHistory();

  const filteredHistory = baseHistory.filter(item => {
    // 1. Top Bar search (existing logic)
    if (isFilterActive && filterValue) {
      let val = String(item[filterColumn] || '').toLowerCase();
      const searchVal = filterValue.toLowerCase();
      if (filterOperator === '=') { if (val !== searchVal) return false; }
      else { if (!val.includes(searchVal)) return false; }
    }

    // 2. Header Filters (Excel-style)
    const headerFiltered = Object.entries(headerFilters).every(([col, selectedValues]) => {
      if (!selectedValues || selectedValues.length === 0) return true;
      return selectedValues.includes(String(item[col]));
    });
    if (!headerFiltered) return false;

    // 3. Sidebar Date Filters
    if (dateFilter !== 'Todos') {
      const today = new Date();
      const itemDate = new Date(item.date);
      if (dateFilter === 'De hoy') {
        if (itemDate.toDateString() !== today.toDateString()) return false;
      } else if (dateFilter === 'De la última semana') {
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        if (itemDate < lastWeek) return false;
      } else if (dateFilter === 'Del último mes') {
        const lastMonth = new Date(today);
        lastMonth.setMonth(today.getMonth() - 1);
        if (itemDate < lastMonth) return false;
      }
      // "100 últimos asientos", "Creados/modificados hoy", "Filtro/s seleccionado/s" not fully implemented
    }

    // 4. Timeline Filter (Multi-selection)
    const dateParts = item.date.split('-');
    const y = parseInt(dateParts[0], 10);
    const m = parseInt(dateParts[1], 10) - 1; // 0-based month
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

    if (selectedYears.length > 0) {
      if (!selectedYears.includes(String(y))) return false;
    }

    if (selectedMonths.length > 0 || selectedQuarters.length > 0) {
      const matchMonth = selectedMonths.includes(months[m]);
      const matchQuarter = selectedQuarters.some(q => {
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

  // For '100 últimos asientos' filter, we apply it after sorting
  const finalFilteredHistory = dateFilter === '100 últimos asientos' ? filteredHistory.slice(0, 100) : filteredHistory;

  const totalFilteredDebit = finalFilteredHistory.reduce((sum, item) => sum + item.debit, 0);
  const totalFilteredCredit = finalFilteredHistory.reduce((sum, item) => sum + item.credit, 0);

  const getUniqueValues = (col) => {
    const vals = [...new Set(baseHistory.map(item => String(item[col] || '')))];
    return vals.sort();
  };

  const toggleHeaderFilter = (col, val) => {
    const current = headerFilters[col] || [];
    const updated = current.includes(val) 
      ? current.filter(v => v !== val)
      : [...current, val];
    setHeaderFilters({ ...headerFilters, [col]: updated });
  };

  const selectAllInHeader = (col, vals) => {
    setHeaderFilters({ ...headerFilters, [col]: vals });
  };

  const clearHeaderFilter = (col) => {
    const newFilters = { ...headerFilters };
    delete newFilters[col];
    setHeaderFilters(newFilters);
  };

  return (
    <div className="flex h-full bg-white relative uppercase">
      {/* Header title inside the view */}
      <div className="absolute top-0 left-0 w-full h-8 bg-white border-b border-gray-200 flex items-center px-4 z-20">
        <h2 className="text-sm font-bold text-[#2a3042]">CONSULTA DE DIARIO</h2>
        <div className="ml-auto flex items-center space-x-2">
           {selectedEntryIds.size === 1 && (
             <button 
               onClick={handleEditEntry}
               className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors flex items-center text-[11px] font-bold"
               title="Editar asiento seleccionado"
             >
               <Edit className="w-4 h-4 mr-1" /> Editar
             </button>
           )}
           {selectedEntryIds.size > 0 && (
             <button 
               onClick={handleDeleteSelected}
               className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors flex items-center text-[11px] font-bold"
               title="Eliminar asientos seleccionados"
             >
               <Trash2 className="w-4 h-4 mr-1" /> Eliminar ({selectedEntryIds.size})
             </button>
           )}
           <button 
             onClick={() => setShowSidebar(!showSidebar)}
             className="text-gray-500 hover:text-blue-600 p-1 rounded hover:bg-gray-100 transition-colors"
             title={showSidebar ? 'Ocultar Filtros' : 'Mostrar Filtros'}
           >
             <PanelLeft className="w-4 h-4" />
           </button>
        </div>
      </div>

      <div className="flex w-full pt-8">
        {/* Left Sidebar */}
        {showSidebar && (
          <ResizableSidebar className=" border-r border-gray-300 bg-[#f9fafc] flex flex-col shrink-0 text-[11px] text-gray-700">
            <div className="flex-1 p-3 overflow-y-auto space-y-4">
              <div>
                <h3 className="font-bold mb-2 text-[#2a3042]">FECHAS:</h3>
                <div className="space-y-1.5 ml-1">
                  {['Todos', 'De hoy', 'De la última semana', 'Del último mes', '100 últimos asientos', 'Creados/modificados hoy', 'Filtro/s seleccionado/s'].map(filter => (
                    <label key={filter} className="flex items-center space-x-1.5 cursor-pointer hover:bg-gray-200 p-0.5 rounded -ml-0.5">
                      <input 
                        type="radio" 
                        name="dateFilter" 
                        className="w-3 h-3 text-blue-600" 
                        checked={dateFilter === filter}
                        onChange={() => setDateFilter(filter)}
                      /> 
                      <span>{filter.toUpperCase()}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold mb-1.5 text-[#2a3042]">DIARIO</h3>
                <select className="w-full border border-gray-300 rounded px-1.5 py-1 mb-2 text-[11px] bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 uppercase">
                  <option>TODOS</option>
                </select>
                <div className="flex justify-end">
                  <button className="border border-gray-400 bg-gray-100 px-4 py-1 rounded hover:bg-gray-200 text-[11px] hover:border-gray-500 shadow-sm transition-colors uppercase">
                    VER
                  </button>
                </div>
              </div>
            </div>
          </ResizableSidebar>
        )}
        
        {/* Timeline column */}
        {showSidebar && (
          <div className="w-8 border-r border-gray-300 bg-white flex flex-col items-center py-2 space-y-2 text-[10px] font-bold text-gray-600 overflow-y-auto shrink-0 select-none">
            {['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'].map(m => (
               <span 
                 key={m} 
                 onClick={() => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                 className={`hover:text-blue-600 cursor-pointer p-0.5 w-full text-center ${selectedMonths.includes(m) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
               >
                 {m}
               </span>
            ))}
            <span 
              onClick={() => setSelectedQuarters(prev => prev.includes('1T') ? prev.filter(x => x !== '1T') : [...prev, '1T'])}
              className={`mt-2 pt-2 border-t border-gray-300 w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('1T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
            >1T</span>
            <span 
              onClick={() => setSelectedQuarters(prev => prev.includes('2T') ? prev.filter(x => x !== '2T') : [...prev, '2T'])}
              className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('2T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
            >2T</span>
            <span 
              onClick={() => setSelectedQuarters(prev => prev.includes('3T') ? prev.filter(x => x !== '3T') : [...prev, '3T'])}
              className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('3T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
            >3T</span>
            <span 
              onClick={() => setSelectedQuarters(prev => prev.includes('4T') ? prev.filter(x => x !== '4T') : [...prev, '4T'])}
              className={`w-full text-center hover:text-blue-600 cursor-pointer ${selectedQuarters.includes('4T') ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
            >4T</span>
            {['2024', '2025', '2026', '2027'].map((yr, idx) => (
              <span 
                key={yr}
                onClick={() => setSelectedYears(prev => prev.includes(yr) ? prev.filter(x => x !== yr) : [...prev, yr])}
                className={`w-full text-center hover:text-blue-600 cursor-pointer ${idx === 0 ? 'mt-2 pt-2 border-t border-gray-300' : ''} ${selectedYears.includes(yr) ? 'bg-blue-100 text-blue-700 font-bold' : ''}`}
              >
                {yr}
              </span>
            ))}
          </div>
        )}

        {/* Table View */}
        <div className="flex-1 overflow-auto bg-white flex flex-col">
          <table className="w-full text-left border-collapse text-[11px] font-sans">
            <thead className="bg-white sticky top-0 z-10">
              <tr>
                <th className="border-b border-gray-300 px-2 py-1.5 text-center w-8">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allIds = new Set(finalFilteredHistory.map(item => item.entryId));
                        setSelectedEntryIds(allIds);
                      } else {
                        setSelectedEntryIds(new Set());
                      }
                    }}
                    checked={finalFilteredHistory.length > 0 && selectedEntryIds.size === new Set(finalFilteredHistory.map(i => i.entryId)).size}
                  />
                </th>
                <th className="border-b border-gray-300 px-2 py-1.5 font-normal text-gray-600 w-16 text-center uppercase">DIARIO</th>
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
              {finalFilteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="14" className="text-center italic py-10 text-slate-400 text-[11px]">
                    {loading ? 'CARGANDO DATOS...' : 'NO HAY ASIENTOS REGISTRADOS PARA MOSTRAR'}
                  </td>
                </tr>
              ) : (
                finalFilteredHistory.map((item, idx) => (
                  <tr 
                    key={`${item.entryId}-${idx}`} 
                    className="border-b border-gray-200 hover:bg-blue-50/50 cursor-pointer"
                    onClick={() => {
                      const acc = accounts.find(a => a.code === item.accountCode);
                      setFocusedAccountName(acc ? acc.name : item.accountCode);
                    }}
                  >
                    <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="w-3 h-3 cursor-pointer"
                        checked={selectedEntryIds.has(item.entryId)}
                        onChange={(e) => {
                          const newSet = new Set(selectedEntryIds);
                          if (e.target.checked) newSet.add(item.entryId);
                          else newSet.delete(item.entryId);
                          setSelectedEntryIds(newSet);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1 text-center text-gray-700">1</td>
                    <td className="px-2 py-1 text-center text-gray-700">{new Date(item.date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: '2-digit'})}</td>
                    <td className="px-2 py-1 text-center text-gray-700">{item.shortId}</td>
                    <td className="px-2 py-1 text-center text-gray-700">{idx + 1}</td>
                    <td className="px-2 py-1 text-gray-700">{item.accountCode}</td>
                    <td className="px-2 py-1 truncate max-w-[200px] text-gray-700" title={item.description}>{item.description}</td>
                    <td className="px-2 py-1 text-gray-700">{item.document}</td>
                    <td className="px-2 py-1 text-gray-700">{item.ceco}</td>
                    <td className="px-2 py-1 text-gray-700">{item.cebe}</td>
                    <td className="px-2 py-1 text-right text-gray-700">{item.debit > 0 ? item.debit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : '0,00'}</td>
                    <td className="px-2 py-1 text-right text-gray-700">{item.credit > 0 ? item.credit.toLocaleString('es-ES', {minimumFractionDigits: 2}) : '0,00'}</td>
                    <td className="px-2 py-1 text-center text-gray-700">
                      <input type="checkbox" className="w-3 h-3 cursor-pointer" defaultChecked={item.debit > 0 || item.credit > 0} />
                    </td>
                    <td className="px-2 py-1 text-center text-gray-700" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 cursor-pointer accent-blue-600" 
                        checked={!!item.originalEntry?.isImpuesto} 
                        onChange={() => handleToggleImpuesto(item.entryId, !!item.originalEntry?.isImpuesto)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-[#f8f9fa] border-t-2 border-gray-300 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] select-none">
              <tr className="font-bold text-gray-800 border-t border-gray-300">
                <td colSpan="10" className="px-2 py-2 text-right">TOTALES:</td>
                <td className="px-2 py-2 text-right text-red-600 font-sans tabular-nums">{totalFilteredDebit.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td className="px-2 py-2 text-right text-red-600 font-sans tabular-nums">{totalFilteredCredit.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td colSpan="2"></td>
              </tr>
              <tr className="text-[10px] text-gray-600 border-t border-gray-200">
                <td colSpan="14" className="px-4 py-1.5 text-left italic normal-case">
                  {focusedAccountName ? `Cuenta seleccionada: ${focusedAccountName}` : '\u00A0'}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-[#808080]">
            <ZoomControl />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { Download, TrendingUp, TrendingDown, ClipboardList, Search, FileText, Plus, Check, X, Upload, BookOpen } from 'lucide-react';
import { exportToCSV } from '../utils/exportUtils';
import { db } from '../firebase/config';
import { doc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import AccountingEntryModal, { AccountSelector } from './AccountingEntryModal';
import { registerJournalEntry } from '../services/accounting';


const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

export default function ExtractoTab({ formData, setFormData, rentals }) {
  const [selectedYear, setSelectedYear] = useState('Todos');
  const [selectedMonth, setSelectedMonth] = useState('Todos');
  const [selectedType, setSelectedType] = useState('Todos'); // 'Todos' | 'Ingreso' | 'Gasto'
  const [searchQuery, setSearchQuery] = useState('');
  const { user, queryUserIds } = useAuth();
  const [accountingModalData, setAccountingModalData] = useState(null);
  
  // Local Form state for adding movements
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMovement, setNewMovement] = useState({
    concept: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    type: 'Ingreso', // 'Ingreso' | 'Gasto'
    rentalId: '',
    syncTax: false,
    tenant: ''
  });
  const [journalEntries, setJournalEntries] = useState([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' }
  ]);
  const [accounts, setAccounts] = useState([]);

  // Load accounts list
  useEffect(() => {
    if (!user) return;
    const qAcc = query(collection(db, 'accounts'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsubAcc = onSnapshot(qAcc, (snap) => {
      setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubAcc();
  }, [user]);

  // Synchronize amount and type directly into the journal entries
  useEffect(() => {
    if (accounts.length === 0) return;
    const amt = parseFloat(newMovement.amount) || 0;
    
    let defaultDebitAcc = '';
    let defaultCreditAcc = '';

    if (newMovement.type === 'Ingreso') {
      const bank = accounts.find(a => a.code?.startsWith('572'));
      const cash = accounts.find(a => a.code?.startsWith('570'));
      defaultDebitAcc = bank?.id || cash?.id || '';

      const rentalInc = accounts.find(a => a.code?.startsWith('705') || a.code?.startsWith('752') || a.code?.startsWith('7'));
      defaultCreditAcc = rentalInc?.id || '';
    } else {
      const exp = accounts.find(a => a.code?.startsWith('622') || a.code?.startsWith('62') || a.code?.startsWith('6'));
      defaultDebitAcc = exp?.id || '';

      const bank = accounts.find(a => a.code?.startsWith('572'));
      const cash = accounts.find(a => a.code?.startsWith('570'));
      defaultCreditAcc = bank?.id || cash?.id || '';
    }

    setJournalEntries([
      { accountId: defaultDebitAcc, debit: amt > 0 ? amt.toString() : '', credit: '' },
      { accountId: defaultCreditAcc, debit: '', credit: amt > 0 ? amt.toString() : '' }
    ]);
  }, [newMovement.amount, newMovement.type, accounts]);

  const addJournalEntryRow = () => setJournalEntries([...journalEntries, { accountId: '', debit: '', credit: '' }]);
  
  const updateJournalEntryRow = (index, field, value) => {
    const newEntries = [...journalEntries];
    newEntries[index][field] = value;
    if (field === 'debit' && value > 0) newEntries[index].credit = '';
    if (field === 'credit' && value > 0) newEntries[index].debit = '';
    setJournalEntries(newEntries);
  };

  const handleCreateJournalEntryForTransaction = (t) => {
    setAccountingModalData({
      date: t.date || new Date().toISOString().split('T')[0],
      concept: t.concept,
      amount: parseFloat(t.amount) || 0,
      type: t.type,
      onSaveSuccess: async (journalId) => {
        const rental = rentals.find(r => r.id === t.rentalId);
        if (!rental) return;
        const itemsField = t.type === 'Ingreso' ? 'incomeItems' : 'expenseItems';
        const items = [...(rental[itemsField] || [])];
        if (items[t.itemIndex]) {
          items[t.itemIndex].journalId = journalId;
          const updatedRental = { ...rental, [itemsField]: items };
          await setDoc(doc(db, 'rentals', rental.id), updatedRental, { merge: true });
        }
      }
    });
  };



  // 1. Filter rentals belonging to this property
  const propertyRentals = useMemo(() => {
    if (!formData || !formData.id) return [];
    return rentals.filter(r => r.propertyId === formData.id);
  }, [rentals, formData.id]);

  // Pre-select first rental or active rental when opening form
  const defaultRentalId = useMemo(() => {
    if (propertyRentals.length === 0) return '';
    const active = propertyRentals.find(r => r.status === 'activo');
    return active ? active.id : propertyRentals[0].id;
  }, [propertyRentals]);

  // Pre-select the rental object based on newMovement.rentalId or defaultRentalId
  const selectedRentalForNew = useMemo(() => {
    const rId = newMovement.rentalId || defaultRentalId;
    if (!rId) return null;
    return propertyRentals.find(r => r.id === rId) || null;
  }, [propertyRentals, newMovement.rentalId, defaultRentalId]);

  // 2. Gather all incomes and expenses from ALL rentals associated with this property
  const allTransactions = useMemo(() => {
    if (!formData || !formData.id) return [];

    let list = [];

    propertyRentals.forEach(rental => {
      const tenantName = (rental.tenants || []).map(t => t.name).join(', ') || '(Sin inquilino)';
      const rentalName = rental.name || `Alquiler - ${tenantName}`;

      // Process Incomes
      if (Array.isArray(rental.incomeItems)) {
        rental.incomeItems.forEach((item, idx) => {
          if (!item) return;
          list.push({
            id: `income-${rental.id}-${idx}`,
            itemIndex: idx,
            date: item.date || '',
            type: 'Ingreso',
            concept: item.name || 'Ingreso registrado',
            amount: parseFloat(item.amount) || 0,
            doc: item.doc || null,
            isTax: !!item.isTax,
            taxId: item.taxId || null,
            journalId: item.journalId || null,
            rentalName,
            tenantName,
            tenant: item.tenant || '',
            rentalId: rental.id,
            rentalObj: rental
          });
        });
      }

      // Process Expenses
      if (Array.isArray(rental.expenseItems)) {
        rental.expenseItems.forEach((item, idx) => {
          if (!item) return;
          list.push({
            id: `expense-${rental.id}-${idx}`,
            itemIndex: idx,
            date: item.date || '',
            type: 'Gasto',
            concept: item.name || 'Gasto registrado',
            amount: parseFloat(item.amount) || 0,
            doc: item.doc || null,
            isTax: !!item.isTax,
            taxId: item.taxId || null,
            journalId: item.journalId || null,
            rentalName,
            tenantName,
            tenant: item.tenant || '',
            rentalId: rental.id,
            rentalObj: rental
          });
        });
      }
    });

    // Default: descending by date (latest first)
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [propertyRentals, formData]);

  // 3. Extract dynamically all unique years where transactions exist
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    allTransactions.forEach(t => {
      if (t.date) {
        const yr = t.date.split('-')[0];
        if (yr) yearsSet.add(yr);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  // 4. Filter transactions based on selection state
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(t => {
      // Year Filter
      if (selectedYear !== 'Todos') {
        const yr = t.date.split('-')[0];
        if (yr !== selectedYear) return false;
      }

      // Month Filter
      if (selectedMonth !== 'Todos') {
        const mo = t.date.split('-')[1];
        if (mo !== selectedMonth) return false;
      }

      // Type Filter
      if (selectedType !== 'Todos') {
        if (t.type !== selectedType) return false;
      }

      // Search query Filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesConcept = t.concept.toLowerCase().includes(q);
        const matchesTenant = t.tenantName.toLowerCase().includes(q);
        const matchesRental = t.rentalName.toLowerCase().includes(q);
        if (!matchesConcept && !matchesTenant && !matchesRental) return false;
      }

      return true;
    });
  }, [allTransactions, selectedYear, selectedMonth, selectedType, searchQuery]);

  // 5. Calculate metrics based on the filtered set
  const metrics = useMemo(() => {
    let incomes = 0;
    let expenses = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'Ingreso') {
        incomes += t.amount;
      } else {
        expenses += t.amount;
      }
    });
    return {
      incomes,
      expenses,
      net: incomes - expenses
    };
  }, [filteredTransactions]);

  // 6. Handle CSV Export
  const handleExport = () => {
    const exportData = filteredTransactions.map(t => ({
      Fecha: t.date,
      Tipo: t.type,
      Concepto: t.concept,
      Alquiler: t.rentalName,
      Inquilino: t.tenantName,
      'Inquilino Específico': t.tenant || '(Todos / General)',
      'Importe (€)': t.type === 'Ingreso' ? t.amount : -t.amount,
      Documento: t.doc || 'Sin documento'
    }));

    const cleanPropName = (formData.name || 'Propiedad').trim().replace(/\s+/g, '_');
    exportToCSV(exportData, `Extracto_${cleanPropName}_${new Date().toISOString().split('T')[0]}`);
  };

  // 7. Toggle Taxes check directly on each transaction row
  const handleToggleTax = async (transaction, checked) => {
    const rental = rentals.find(r => r.id === transaction.rentalId);
    if (!rental) return;

    const itemsField = transaction.type === 'Ingreso' ? 'incomeItems' : 'expenseItems';
    const items = [...(rental[itemsField] || [])];
    const item = items[transaction.itemIndex];

    if (!item) return;

    if (checked) {
      if (item.isTax) return;
      const taxId = `tax-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      item.isTax = true;
      item.taxId = taxId;

      // Update property taxes list
      const newTaxEntry = {
        id: taxId,
        kind: transaction.type === 'Ingreso' ? 'income' : 'expense',
        concept: item.name || (transaction.type === 'Ingreso' ? 'Ingreso por alquiler' : 'Gasto por alquiler'),
        type: transaction.type === 'Ingreso' ? 'Otros ingresos' : 'Otros gastos',
        amount: parseFloat(item.amount) || 0,
        date: item.date || new Date().toISOString().split('T')[0],
        deductible: transaction.type === 'Gasto' ? true : undefined,
        docs: item.doc ? [{ name: item.doc, date: item.date || new Date().toISOString().split('T')[0] }] : [],
        isSyncedRental: true
      };

      const updatedTaxes = [...(formData.taxes || []), newTaxEntry];
      setFormData({ ...formData, taxes: updatedTaxes });

      // Save to Firebase properties
      try {
        await setDoc(doc(db, 'properties', formData.id), { ...formData, taxes: updatedTaxes }, { merge: true });
      } catch (err) {
        console.error("Error saving property with new tax:", err);
      }
    } else {
      if (!item.isTax) return;
      const taxId = item.taxId;
      item.isTax = false;
      item.taxId = null;

      // Remove from property taxes list
      const updatedTaxes = (formData.taxes || []).filter(t => t.id !== taxId);
      setFormData({ ...formData, taxes: updatedTaxes });

      // Save to Firebase properties
      try {
        await setDoc(doc(db, 'properties', formData.id), { ...formData, taxes: updatedTaxes }, { merge: true });
      } catch (err) {
        console.error("Error saving property after removing tax:", err);
      }
    }

    // Save updated rental to Firebase
    try {
      const updatedRental = { ...rental, [itemsField]: items };
      await setDoc(doc(db, 'rentals', rental.id), updatedRental, { merge: true });
    } catch (err) {
      console.error("Error updating rental in Firestore:", err);
    }
  };

  // 8. Attach document from Extracto tab
  const handleItemDocUpload = async (e, transaction) => {
    const file = e.target.files[0];
    if (!file) return;

    const rental = rentals.find(r => r.id === transaction.rentalId);
    if (!rental) return;

    const itemsField = transaction.type === 'Ingreso' ? 'incomeItems' : 'expenseItems';
    const items = [...(rental[itemsField] || [])];
    const item = items[transaction.itemIndex];

    if (!item) return;

    // Create a new document metadata object
    const docObj = {
      name: file.name,
      date: new Date().toISOString().split('T')[0],
      size: (file.size / 1024).toFixed(1) + ' KB',
      url: URL.createObjectURL(file),
      type: file.type
    };

    // Update fields
    item.doc = file.name;

    // Add document to rental.documents list if not already there
    const currentDocs = rental.documents || [];
    const isDocDuplicate = currentDocs.some(d => d.name === file.name);
    const updatedDocs = isDocDuplicate ? currentDocs : [...currentDocs, docObj];

    // If synced to taxes, sync doc to property taxes list
    if (item.isTax && item.taxId) {
      const updatedTaxes = (formData.taxes || []).map(tax => {
        if (tax.id === item.taxId) {
          const tDocs = tax.docs || [];
          const isTaxDocDuplicate = tDocs.some(d => d.name === file.name);
          return {
            ...tax,
            docs: isTaxDocDuplicate ? tDocs : [...tDocs, { name: file.name, date: docObj.date, url: docObj.url }]
          };
        }
        return tax;
      });
      setFormData({ ...formData, taxes: updatedTaxes });
      try {
        await setDoc(doc(db, 'properties', formData.id), { ...formData, taxes: updatedTaxes }, { merge: true });
      } catch (err) {
        console.error("Error syncing doc to property taxes:", err);
      }
    }

    // Save rental to Firebase
    try {
      const updatedRental = { ...rental, [itemsField]: items, documents: updatedDocs };
      await setDoc(doc(db, 'rentals', rental.id), updatedRental, { merge: true });
    } catch (err) {
      console.error("Error updating rental with document:", err);
    }
  };

  // 9. Preview or Download document in new tab
  const handleViewDoc = (transaction) => {
    if (!transaction.doc) return;
    const rental = rentals.find(r => r.id === transaction.rentalId);
    if (!rental || !rental.documents) {
      alert("No se ha encontrado el documento de alquiler.");
      return;
    }
    const documentObj = rental.documents.find(d => d.name === transaction.doc);
    if (documentObj && documentObj.url) {
      window.open(documentObj.url, '_blank');
    } else {
      alert(`El archivo "${transaction.doc}" está registrado, pero no hay una URL de vista previa disponible.`);
    }
  };

  const totalDebit = useMemo(() => {
    return journalEntries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
  }, [journalEntries]);

  const totalCredit = useMemo(() => {
    return journalEntries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
  }, [journalEntries]);

  const isBalanced = useMemo(() => {
    return Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  }, [totalDebit, totalCredit]);

  // 10. Direct Adding of Incomes/Expenses from Extracto tab
  const handleAddMovement = async () => {
    const { concept, amount, date, type, rentalId, syncTax, tenant } = newMovement;
    
    if (!concept || !amount || !rentalId) {
      alert("Por favor, rellene todos los campos del movimiento (Concepto, Importe y Alquiler).");
      return;
    }

    if (!isBalanced) {
      alert(`El asiento contable no está cuadrado. Debe: ${totalDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €, Haber: ${totalCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €. Por favor cuádrelo antes de guardar.`);
      return;
    }

    const rental = rentals.find(r => r.id === rentalId);
    if (!rental) {
      alert("El contrato de alquiler seleccionado no es válido.");
      return;
    }

    const itemsField = type === 'Ingreso' ? 'incomeItems' : 'expenseItems';
    const currentItems = rental[itemsField] || [];
    
    // Generate unique taxId if checked
    const taxId = syncTax ? `tax-${Date.now()}-${Math.floor(Math.random() * 1000)}` : null;

    let journalId = null;

    // 1. Save journal entry first
    try {
      const result = await registerJournalEntry(user.uid, concept, journalEntries, date);
      if (result.success && result.id) {
        journalId = result.id;
      }
    } catch (err) {
      console.error("Error creating journal entry:", err);
      alert("Error al registrar el asiento contable: " + err.message);
      return;
    }

    const newItem = {
      date,
      name: concept,
      amount: parseFloat(amount) || 0,
      doc: null,
      isTax: syncTax,
      taxId: taxId,
      tenant: tenant || '',
      journalId: journalId
    };

    // If synced with taxes, sync to property's taxes list
    if (syncTax) {
      const newTaxEntry = {
        id: taxId,
        kind: type === 'Ingreso' ? 'income' : 'expense',
        concept,
        type: type === 'Ingreso' ? 'Otros ingresos' : 'Otros gastos',
        amount: parseFloat(amount) || 0,
        date,
        deductible: type === 'Gasto' ? true : undefined,
        docs: [],
        isSyncedRental: true
      };

      const updatedTaxes = [...(formData.taxes || []), newTaxEntry];
      setFormData({ ...formData, taxes: updatedTaxes });

      try {
        await setDoc(doc(db, 'properties', formData.id), { ...formData, taxes: updatedTaxes }, { merge: true });
      } catch (err) {
        console.error("Error saving new tax entry in property:", err);
      }
    }

    // Save rental to Firebase
    try {
      const updatedItems = [...currentItems, newItem];
      const updatedRental = { ...rental, [itemsField]: updatedItems };
      await setDoc(doc(db, 'rentals', rental.id), updatedRental, { merge: true });

      // Clear form inputs
      setNewMovement({
        concept: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'Ingreso',
        rentalId: defaultRentalId,
        syncTax: false,
        tenant: ''
      });
      setShowAddForm(false);
      alert("Movimiento y asiento contable registrados correctamente.");
    } catch (err) {
      console.error("Error creating transaction in Firestore:", err);
      alert("Error al guardar el movimiento en Firebase: " + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-green-50 border border-green-200 rounded shadow-sm">
          <div className="text-[9px] font-bold text-green-700 uppercase mb-1">Total Ingresos Filtrado</div>
          <div className="font-mono text-[16px] font-bold text-green-950">
            {metrics.incomes.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
          </div>
        </div>

        <div className="p-3 bg-red-50 border border-red-200 rounded shadow-sm">
          <div className="text-[9px] font-bold text-red-700 uppercase mb-1">Total Gastos Filtrado</div>
          <div className="font-mono text-[16px] font-bold text-red-950">
            -{metrics.expenses.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
          </div>
        </div>

        <div className={`p-3 border rounded shadow-sm ${metrics.net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-[9px] font-bold uppercase mb-1 ${metrics.net >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            Balance Neto Filtrado
          </div>
          <div className={`font-mono text-[16px] font-bold ${metrics.net >= 0 ? 'text-blue-950' : 'text-orange-950'}`}>
            {metrics.net.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
          </div>
        </div>
      </div>

      {/* Advanced Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Add Movement toggle button */}
        <button
          className="btn-classic px-3 h-7 flex items-center gap-1 text-[10px] bg-blue-50 hover:bg-blue-100"
          onClick={() => {
            setShowAddForm(!showAddForm);
            if (!newMovement.rentalId) {
              setNewMovement(prev => ({ ...prev, rentalId: defaultRentalId }));
            }
          }}
        >
          <Plus className="w-3.5 h-3.5 text-blue-800" />
          <span className="font-bold">NUEVO MOVIMIENTO</span>
        </button>

        {/* Year Filter */}
        <div className="flex items-center gap-1 bg-[#d4d0c8] border border-[#808080] p-1">
          <span className="text-[10px] font-bold uppercase text-slate-600">Año:</span>
          <select
            className="win-input w-24 text-[10px]"
            value={selectedYear}
            onChange={e => { setSelectedYear(e.target.value); setSelectedMonth('Todos'); }}
          >
            <option value="Todos">Todos</option>
            {availableYears.map(yr => (
              <option key={yr} value={yr}>{yr}</option>
            ))}
          </select>
        </div>

        {/* Month Filter */}
        <div className="flex items-center gap-1 bg-[#d4d0c8] border border-[#808080] p-1">
          <span className="text-[10px] font-bold uppercase text-slate-600">Mes:</span>
          <select
            className="win-input w-28 text-[10px]"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            <option value="Todos">Todos</option>
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Type selector buttons */}
        <div className="flex bg-[#d4d0c8] border border-[#808080] p-0.5 gap-0.5">
          {[
            { id: 'Todos', label: 'Todos' },
            { id: 'Ingreso', label: 'Ingresos' },
            { id: 'Gasto', label: 'Gastos' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setSelectedType(opt.id)}
              className={`px-3 py-1 text-[9px] font-bold uppercase transition-colors ${
                selectedType === opt.id ? 'bg-[#000080] text-white' : 'hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Interactive concept search */}
        <div className="flex items-center gap-1 bg-white border border-[#808080] px-2 h-7 min-w-[150px] flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="bg-transparent border-none outline-none text-[10px] w-full"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Export to CSV Button */}
        <button
          className="btn-classic px-3 h-7 flex items-center gap-1.5 text-[10px] ml-auto"
          onClick={handleExport}
          title="Exportar extracto a CSV"
        >
          <Download className="w-3.5 h-3.5 text-green-800" />
          <span className="font-bold">EXPORTAR CSV</span>
        </button>
      </div>

      {/* Expandable Form: Add Movement */}
      {showAddForm && (
        <div className="p-3 bg-slate-100 border border-[#808080] win-bevel text-[10px] flex flex-col gap-3">
          <div className="font-bold text-[#000080] uppercase border-b border-[#808080] pb-1 flex justify-between items-center">
            <span>Registrar Nuevo Ingreso o Gasto Directo</span>
            <button onClick={() => setShowAddForm(false)} className="text-red-700 hover:text-red-900 font-black"><X className="w-3.5 h-3.5" /></button>
          </div>

          {propertyRentals.length === 0 ? (
            <div className="text-center py-4 text-orange-700 font-bold">
              ⚠️ No hay contratos de alquiler para esta propiedad en Alquileres. Para registrar un movimiento, debes crear al menos uno en Alquileres.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600">Tipo de Movimiento</label>
                <select
                  className="win-input w-full"
                  value={newMovement.type}
                  onChange={e => setNewMovement(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="Ingreso">Ingreso (+)</option>
                  <option value="Gasto">Gasto (-)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600">Contrato de Alquiler / Inquilinos</label>
                <select
                  className="win-input w-full"
                  value={newMovement.rentalId}
                  onChange={e => setNewMovement(prev => ({ ...prev, rentalId: e.target.value, tenant: '' }))}
                >
                  {propertyRentals.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({(r.tenants || []).map(t => t.name).join(', ') || 'Sin Inquilino'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600">Inquilino Específico</label>
                <select
                  className="win-input w-full"
                  value={newMovement.tenant || ''}
                  onChange={e => setNewMovement(prev => ({ ...prev, tenant: e.target.value }))}
                >
                  <option value="">(Todos / General)</option>
                  {selectedRentalForNew && (selectedRentalForNew.tenants || []).map((t, idx) => (
                    <option key={t.name || idx} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600">Fecha del Movimiento</label>
                <input
                  type="date"
                  className="win-input w-full"
                  value={newMovement.date}
                  onChange={e => setNewMovement(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="font-bold text-slate-600">Concepto / Descripción</label>
                <input
                  type="text"
                  className="win-input w-full"
                  placeholder="Ej: Renta del mes, Reparación de persiana..."
                  value={newMovement.concept}
                  onChange={e => setNewMovement(prev => ({ ...prev, concept: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-bold text-slate-600">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="win-input w-full text-right font-bold text-blue-800"
                  placeholder="0.00"
                  value={newMovement.amount}
                  onChange={e => setNewMovement(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-1.5 h-7">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newMovement.syncTax}
                    className="w-3.5 h-3.5 cursor-pointer"
                    onChange={e => setNewMovement(prev => ({ ...prev, syncTax: e.target.checked }))}
                  />
                  <span className="font-bold text-orange-800">Enviar directamente a pestaña Impuestos</span>
                </label>
              </div>

              {/* Embedded Journal Entry Section */}
              <div className="sm:col-span-3 border-t border-[#808080] pt-3 mt-1 space-y-2">
                <div className="flex justify-between items-center bg-[#cbd5e0] p-1 uppercase text-[9px] font-bold text-slate-800 border border-[#808080]">
                  <span>📚 Libro Diario: Asiento Contable de Entrada</span>
                  <div className="flex items-center gap-2 text-[9px]">
                    <div className={`w-2 h-2 rounded-full ${isBalanced ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span>{isBalanced ? 'Asiento Cuadrado' : 'Asiento Descuadrado'}</span>
                  </div>
                </div>

                <div className="border border-[#808080] bg-white overflow-x-auto max-h-[180px]">
                  <table className="win-table w-full min-w-[500px]">
                    <thead>
                      <tr>
                        <th className="text-left text-[9px]">Cuenta Contable</th>
                        <th className="w-24 text-right text-[9px]">Debe</th>
                        <th className="w-24 text-right text-[9px]">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalEntries.map((entry, idx) => (
                        <tr key={idx}>
                          <td className="p-0 border-r border-[#d4d0c8]">
                            <AccountSelector 
                              accounts={accounts}
                              value={entry.accountId}
                              onChange={(val) => updateJournalEntryRow(idx, 'accountId', val)}
                            />
                          </td>
                          <td className="p-0 border-r border-[#d4d0c8]">
                            <input 
                              type="number" 
                              value={entry.debit}
                              onChange={(e) => updateJournalEntryRow(idx, 'debit', e.target.value)}
                              className="w-full bg-transparent border-none outline-none p-1 text-[10px] text-right font-mono"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-0">
                            <input 
                              type="number" 
                              value={entry.credit}
                              onChange={(e) => updateJournalEntryRow(idx, 'credit', e.target.value)}
                              className="w-full bg-transparent border-none outline-none p-1 text-[10px] text-right font-mono"
                              placeholder="0.00"
                            />
                          </td>
                        </tr>
                      ))}
                      
                      {/* Totals Row */}
                      <tr className="bg-[#e7e1d3] border-t-2 border-[#808080]">
                        <td className="p-1 text-[9px] font-bold text-right uppercase">Total Asiento:</td>
                        <td className="p-1 text-right font-mono text-[10px] font-bold text-green-700 bg-white/40 border-l border-[#808080]">
                          {totalDebit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="p-1 text-right font-mono text-[10px] font-bold text-red-700 bg-white/40 border-l border-[#808080]">
                          {totalCredit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </td>
                      </tr>
                      
                      {totalDebit - totalCredit !== 0 && (
                        <tr className="bg-red-50 text-[9px] text-red-700 font-bold">
                          <td className="p-1 text-right">⚠️ Diferencia Descuadrada:</td>
                          <td colSpan="2" className="p-1 text-right font-mono text-[10px] font-black bg-red-600 text-white border-l border-[#808080]">
                            {Math.abs(totalDebit - totalCredit).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 italic text-[9px]">El asiento se pre-calcula al ingresar el importe, elija las cuentas correctas.</span>
                  <button 
                    onClick={addJournalEntryRow}
                    className="btn-classic px-2.5 py-0.5 flex items-center space-x-1 text-[9px] font-bold"
                  >
                    <Plus className="w-2.5 h-2.5 mr-0.5 text-blue-800" />
                    <span>Añadir Línea</span>
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3 flex justify-end gap-2 border-t border-[#808080] pt-2">
                <button className="btn-classic px-4 h-7 text-[10px] flex items-center font-bold" onClick={handleAddMovement}>
                  <Check className="w-3.5 h-3.5 mr-1 text-green-700" /> GUARDAR MOVIMIENTO
                </button>
                <button className="btn-classic px-4 h-7 text-[10px] flex items-center" onClick={() => setShowAddForm(false)}>
                  <X className="w-3.5 h-3.5 mr-1 text-red-600" /> CANCELAR
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <div className="border border-[#808080] bg-white overflow-auto max-h-[350px]">
        <table className="win-table w-full text-[10px]">
          <thead>
            <tr className="sticky top-0 z-10">
              <th className="w-24 text-left">Fecha</th>
              <th className="w-20 text-center">Tipo</th>
              <th className="text-left">Concepto</th>
              <th className="w-44 text-left">Alquiler / Inquilino</th>
              <th className="w-24 text-center">Impuestos</th>
              <th className="w-20 text-center">Asiento</th>
              <th className="w-28 text-right">Importe (€)</th>
              <th className="w-36 text-left">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-400 italic text-[11px]">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                  No hay movimientos registrados para esta propiedad
                </td>
              </tr>
            ) : (
              filteredTransactions.map((t) => {
                const isIncome = t.type === 'Ingreso';
                const rowBg = isIncome ? 'hover:bg-green-50/40' : 'hover:bg-red-50/40';
                
                return (
                  <tr key={t.id} className={`${rowBg} transition-colors border-b border-[#e0e0e0]`}>
                    {/* Date */}
                    <td className="p-1.5 border-r border-[#d4d0c8]">{t.date || '—'}</td>

                    {/* Type Badge */}
                    <td className="p-1 border-r border-[#d4d0c8] text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border leading-none ${
                        isIncome
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-red-100 text-red-700 border-red-300'
                      }`}>
                        {t.type.toUpperCase()}
                      </span>
                    </td>

                    {/* Concept */}
                    <td className="p-1.5 border-r border-[#d4d0c8] font-medium text-slate-800">{t.concept}</td>

                    {/* Rental Name & Tenant */}
                    <td className="p-1.5 border-r border-[#d4d0c8] text-slate-600 truncate max-w-[150px]" title={`${t.rentalName} (${t.tenant ? `${t.tenant} - ` : ''}${t.tenantName})`}>
                      <span className="font-bold text-slate-700">{t.tenant || t.tenantName}</span>
                      {t.tenant && <span className="text-slate-500 text-[8px] block">({t.tenantName})</span>}
                      <span className="text-slate-400 text-[9px] block italic truncate">{t.rentalName}</span>
                    </td>

                    {/* Impuestos Checkbox */}
                    <td className="p-1.5 border-r border-[#d4d0c8] text-center">
                      <input
                        type="checkbox"
                        checked={!!t.isTax}
                        className="w-3.5 h-3.5 cursor-pointer"
                        onChange={e => handleToggleTax(t, e.target.checked)}
                      />
                    </td>

                    {/* Asiento Icon */}
                    <td className="p-1.5 border-r border-[#d4d0c8] text-center">
                      <button
                        className="focus:outline-none"
                        title={t.journalId ? "Asiento Contable Registrado" : "Generar Asiento Contable"}
                        onClick={() => handleCreateJournalEntryForTransaction(t)}
                      >
                        <BookOpen className={`w-3.5 h-3.5 mx-auto ${t.journalId ? 'text-green-700 font-bold' : 'text-slate-400 hover:text-blue-600'}`} />
                      </button>
                    </td>

                    {/* Amount */}
                    <td className={`p-1.5 border-r border-[#d4d0c8] text-right font-mono font-bold text-[11px] ${
                      isIncome ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {isIncome ? '+' : '-'}{t.amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </td>

                    {/* Attached Doc */}
                    <td className="p-1 text-slate-500 truncate max-w-[120px]" title={t.doc || ''}>
                      <div className="flex items-center h-full w-full gap-1">
                        {t.doc ? (
                          <div className="flex items-center gap-1 max-w-[90px] truncate shrink-0">
                            <FileText className="w-3 h-3 text-blue-600 shrink-0" />
                            <span 
                              className="text-[9px] text-blue-600 underline cursor-pointer hover:text-blue-800 truncate"
                              onClick={() => handleViewDoc(t)}
                            >
                              {t.doc}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-400 italic shrink-0">Sin doc</span>
                        )}
                        
                        {/* Action clip/file selection */}
                        <div className="ml-auto flex items-center shrink-0">
                          <label className="cursor-pointer hover:text-blue-600 text-slate-400 p-0.5">
                            <Upload className="w-3 h-3" />
                            <input 
                              type="file" 
                              className="hidden" 
                              onChange={e => handleItemDocUpload(e, t)} 
                            />
                          </label>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dynamic Summary Legend footer */}
      <div className="bg-[#f8f8f8] border border-[#808080] px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-[9px] text-slate-500 italic">
          Total de movimientos encontrados: <strong>{filteredTransactions.length}</strong> de {allTransactions.length}
        </span>
        <span className="text-[9px] text-slate-500 italic ml-auto">
          Los datos que se visualizan aquí se editan y actualizan directamente desde la pestaña <strong>Impuestos</strong> y de <strong>Alquileres</strong>.
        </span>
      </div>

      {accountingModalData && (
        <AccountingEntryModal
          isOpen={!!accountingModalData}
          onClose={() => setAccountingModalData(null)}
          userId={user?.uid}
          initialData={accountingModalData}
          onSaveSuccess={accountingModalData.onSaveSuccess}
        />
      )}
    </div>
  );
}

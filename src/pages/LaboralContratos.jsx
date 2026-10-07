import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, X, FileText, Briefcase, Upload, Eye, Trash2, FileArchive } from 'lucide-react';
import Accounts from './Accounts';
import AnalyticalCenters from './AnalyticalCenters';
import { useDragResize } from '../hooks/useDragResize';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { useTableFilters } from '../hooks/useTableFilters';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import { handleExportFormat } from '../utils/exportUtils';
import { uploadFileToStorage } from '../utils/storageUtils';
import ZoomControl from '../components/ZoomControl';

export default function LaboralContratos() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [selectedContrato, setSelectedContrato] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('Datos');

  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear().toString());
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [journalEntries, setJournalEntries] = useState([]);
  const [loadingAnalitica, setLoadingAnalitica] = useState(false);
  const [showAccountSel, setShowAccountSel] = useState(false);
  const [showCebeSel, setShowCebeSel] = useState(false);
  const [showCecoSel, setShowCecoSel] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [rawAccounts, setRawAccounts] = useState([]);

  const accountDR = useDragResize({ initW: 900, initH: 650, minW: 500, minH: 400, storageKey: 'analitica_laboral_accountModal' });
  const centerDR = useDragResize({ initW: 700, initH: 500, minW: 400, minH: 300, storageKey: 'analitica_laboral_centerModal' });

  const [showSidebar, setShowSidebar] = useState(true);
  const [filterValue, setFilterValue] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);

  const DEFAULT_COLUMNS = ['id', 'empresaId', 'puesto', 'fechaInicio', 'ingresoMensual'];
  const { visibleColumns, toggleColumn, columnWidths, updateColumnWidth } = useTableColumns('laboral-contratos', DEFAULT_COLUMNS);
  const { applyTableFilters, TableHeaderWithFilter, renderFilterMenu } = useTableFilters({ columnWidths, updateColumnWidth });

  const emptyForm = {
    id: '', empresaId: '', puesto: '', fechaInicio: '', fechaFin: '',
    ingresoMensual: '', tipoJornada: 'Completa', referencia: '',
    cebe: '', ceco: '', cebeId: '', cecoId: '', descripcion: '', documentos: []
  };
  const [formData, setFormData] = useState({ ...emptyForm });

  
  useEffect(() => {
    if (!user || !user.uid) return;
    const qIds = Array.isArray(queryUserIds) && queryUserIds.length > 0 ? queryUserIds : [user.uid];
    setLoadingAnalitica(true);
    const journalQuery = query(collection(db, 'journal_entries'), where('userId', 'in', qIds));
    const unsubJournal = onSnapshot(journalQuery, (snap) => {
      setJournalEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingAnalitica(false);
    });
    const unsubAccounts = onSnapshot(collection(db, 'pgc_accounts'), (snap) => {
      setRawAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubJournal();
      unsubAccounts();
    };
  }, [user, queryUserIds]);

  useEffect(() => {
    if (!user) return;
    const ids = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const unsubC = onSnapshot(query(collection(db, 'laboral_contratos'), where('userId', 'in', ids)), snap =>
      setContratos(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubE = onSnapshot(query(collection(db, 'laboral_empresas'), where('userId', 'in', ids)), snap =>
      setEmpresas(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubCb = onSnapshot(query(collection(db, 'analytical_centers'), where('userId', 'in', ids), where('type', '==', 'cebe')), snap =>
      setCebes(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    const unsubCo = onSnapshot(query(collection(db, 'analytical_centers'), where('userId', 'in', ids), where('type', '==', 'ceco')), snap =>
      setCecos(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => { unsubC(); unsubE(); unsubCb(); unsubCo(); };
  }, [user, queryUserIds]);

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => { if (selectedContrato) handleEdit(selectedContrato); else alert('Selecciona un contrato primero.'); };
    const onDelete = () => { if (selectedContrato) handleDelete(selectedContrato); else alert('Selecciona un contrato primero.'); };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Empresa', dataKey: 'empresaNombre' },
          { header: 'Puesto', dataKey: 'puesto' },
          { header: 'Fecha Inicio', dataKey: 'fechaInicio' },
          { header: 'Ingreso Mensual', dataKey: 'ingresoMensual' },
        ].filter(c => visibleColumns.includes(c.dataKey === 'empresaNombre' ? 'empresaId' : c.dataKey));
        exportToPDF(contratosConNombre, cols, 'Contratos Laborales', 'laboral_contratos.pdf');
      } else {
        handleExportFormat(contratosConNombre, 'Contratos Laborales', format);
      }
    };
    const onColumns = (e) => { const { columnId } = e.detail || {}; if (columnId) toggleColumn(columnId); };
    window.addEventListener('laboral-contrato:new', onNew);
    window.addEventListener('laboral-contrato:edit', onEdit);
    window.addEventListener('laboral-contrato:delete', onDelete);
    window.addEventListener('laboral-contrato:export', onExport);
    window.addEventListener('laboral-contrato:columns', onColumns);
    return () => {
      window.removeEventListener('laboral-contrato:new', onNew);
      window.removeEventListener('laboral-contrato:edit', onEdit);
      window.removeEventListener('laboral-contrato:delete', onDelete);
      window.removeEventListener('laboral-contrato:export', onExport);
      window.removeEventListener('laboral-contrato:columns', onColumns);
    };
  }, [selectedContrato, visibleColumns]);

  const contratosConNombre = useMemo(() =>
    contratos.map(c => ({ ...c, empresaNombre: empresas.find(e => e.id === c.empresaId)?.nombre || c.empresaNombre || c.empresaId || '-' }))
  , [contratos, empresas]);

  useEffect(() => {
    if (selectedContrato && contratosConNombre.length > 0) {
      const updated = contratosConNombre.find(c => c.id === selectedContrato.id);
      if (updated) {
        setSelectedContrato(updated);
      }
    }
  }, [contratosConNombre]);

  const filteredContratos = useMemo(() => {
    if (!filterValue) return contratosConNombre;
    const f = filterValue.toLowerCase();
    return contratosConNombre.filter(c =>
      (c.empresaNombre || '').toLowerCase().includes(f) ||
      (c.puesto || '').toLowerCase().includes(f) ||
      (c.referencia || '').toLowerCase().includes(f)
    );
  }, [contratosConNombre, filterValue]);

  const filteredAndColumnFilteredContratos = useMemo(() => {
    return applyTableFilters(filteredContratos, 'laboral-contratos');
  }, [filteredContratos, applyTableFilters]);

  const handleNew = () => {
    setFormData({ ...emptyForm, id: Date.now().toString(36).toUpperCase() });
    setIsEditing(false);
    setActiveTab('Datos');
    setShowForm(true);
  };

  const handleEdit = (c) => {
    const cebeCode = c.cebe !== undefined && c.cebe !== '' ? c.cebe : (c.cebeId ? cebes.find(x => x.id === c.cebeId)?.code : '') || '';
    const cecoCode = c.ceco !== undefined && c.ceco !== '' ? c.ceco : (c.cecoId ? cecos.find(x => x.id === c.cecoId)?.code : '') || '';
    const cebeId = c.cebeId || (cebeCode ? cebes.find(x => x.code === cebeCode)?.id : '') || '';
    const cecoId = c.cecoId || (cecoCode ? cecos.find(x => x.code === cecoCode)?.id : '') || '';
    setFormData({
      ...emptyForm,
      ...c,
      cebe: cebeCode,
      ceco: cecoCode,
      cebeId: cebeId,
      cecoId: cecoId,
      descripcion: c.descripcion || ''
    });
    setIsEditing(true);
    setActiveTab('Datos');
    setShowForm(true);
  };

  
  const matchingAccounts = useMemo(() => {
    if (!filtroCuenta) return rawAccounts;
    const q = filtroCuenta.toLowerCase();
    return rawAccounts.filter(a => (a.code || '').toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q));
  }, [filtroCuenta, rawAccounts]);

  const matchingCebes = useMemo(() => {
    const term = formData.cebe || '';
    if (!term) return cebes;
    const q = term.toLowerCase();
    return cebes.filter(c => (c.code || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q));
  }, [formData.cebe, cebes]);

  const matchingCecos = useMemo(() => {
    const term = formData.ceco || '';
    if (!term) return cecos;
    const q = term.toLowerCase();
    return cecos.filter(c => (c.code || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q));
  }, [formData.ceco, cecos]);

  const handleInputKeyDown = (e, openModalFn) => {
    if (e.key === 'F4') {
      e.preventDefault();
      openModalFn(true);
    }
  };

  const analiticaRows = useMemo(() => {
    if (!formData || (!formData.cebe && !formData.ceco)) return [];
    
    const normValueCebe = formData.cebe ? String(formData.cebe).trim().replace(/^(CEBE|CECO)/i, '') : '';
    const normValueCeco = formData.ceco ? String(formData.ceco).trim().replace(/^(CEBE|CECO)/i, '') : '';

    let rows = [];
    journalEntries.forEach(entry => {
      const entryDate = entry.date || '';
      const entryYear = entryDate ? entryDate.substring(0, 4) : '';
      
      if (filtroAnio && filtroAnio !== 'Todos' && entryYear !== filtroAnio) return;

      if (entry.lines) {
        entry.lines.forEach(l => {
          if (filtroCuenta && filtroCuenta !== 'Todas' && l.accountCode !== filtroCuenta) return;

          let match = false;
          if (normValueCebe && l.cebe) {
             const c = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
             if (c.startsWith(normValueCebe)) match = true;
          }
          if (normValueCeco && l.ceco) {
             const c = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
             if (c.startsWith(normValueCeco)) match = true;
          }

          if (match) {
             let importe = (Number(l.debit) || 0) - (Number(l.credit) || 0);
             if (String(l.accountCode).startsWith('7')) {
               importe = -importe;
             }
             if (importe !== 0) {
               rows.push({
                 fecha: entry.date,
                 concepto: entry.concept || entry.description || '',
                 cuenta: l.accountCode,
                 importe: importe,
                 arrastrado: 0
               });
             }
          }
        });
      }
    });

    rows.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    let sum = 0;
    rows = rows.map(r => {
      sum += r.importe;
      return { ...r, arrastrado: sum };
    });

    return rows;
  }, [journalEntries, formData, filtroAnio, filtroCuenta]);

  const handleSave = async () => {
    if (!formData.puesto) { alert('El puesto es obligatorio'); return; }
    try {
      const contractId = formData.id || Date.now().toString(36).toUpperCase();
      const docRef = doc(db, 'laboral_contratos', contractId);

      // Resolve Empresa name
      const matchedEmp = empresas.find(e => e.id === formData.empresaId);
      const empresaNombre = matchedEmp ? matchedEmp.nombre : (formData.empresaNombre || '');

      // Resolve CEBE code & id
      let cebeCode = formData.cebe || '';
      let cebeId = formData.cebeId || '';
      if (cebeCode && !cebeId) {
        cebeId = cebes.find(x => x.code === cebeCode)?.id || '';
      } else if (!cebeCode && cebeId) {
        cebeCode = cebes.find(x => x.id === cebeId)?.code || '';
      }
      if (!cebeCode) {
        cebeCode = '';
        cebeId = '';
      }

      // Resolve CECO code & id
      let cecoCode = formData.ceco || '';
      let cecoId = formData.cecoId || '';
      if (cecoCode && !cecoId) {
        cecoId = cecos.find(x => x.code === cecoCode)?.id || '';
      } else if (!cecoCode && cecoId) {
        cecoCode = cecos.find(x => x.id === cecoId)?.code || '';
      }
      if (!cecoCode) {
        cecoCode = '';
        cecoId = '';
      }

      const cleanData = JSON.parse(JSON.stringify({
        ...formData,
        id: contractId,
        empresaNombre,
        cebe: cebeCode,
        cebeId: cebeId,
        ceco: cecoCode,
        cecoId: cecoId,
        userId: user?.uid || formData.userId || '',
        updatedAt: new Date().toISOString()
      }));

      await setDoc(docRef, cleanData, { merge: true });

      setSelectedContrato(prev => (prev?.id === contractId ? { ...prev, ...cleanData } : prev));
      setShowForm(false);
    } catch (err) {
      console.error('Error al guardar contrato:', err);
      alert('Error al guardar el contrato: ' + err.message);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`¿Eliminar contrato "${c.puesto}"?`)) return;
    await deleteDoc(doc(db, 'laboral_contratos', c.id));
    if (selectedContrato?.id === c.id) setSelectedContrato(null);
  };

  const handleSaveField = async (c, field, value) => {
    await setDoc(doc(db, 'laboral_contratos', c.id), { [field]: value }, { merge: true });
  };

  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !user || !formData.id) return;
    setIsUploading(true);
    try {
      const newDocs = [];
      for (const file of files) {
        const url = await uploadFileToStorage(file, user.uid, 'laboral_contratos', formData.id, 'docs');
        newDocs.push({ id: Date.now() + Math.random().toString(36).substring(7), name: file.name, concept: '', date: new Date().toISOString().split('T')[0], url, type: file.type || 'application/octet-stream', uploadedAt: new Date().toISOString() });
      }
      setFormData(prev => ({ ...prev, documentos: [...(prev.documentos || []), ...newDocs] }));
    } catch (err) { alert('Error al subir el documento: ' + err.message); }
    finally { setIsUploading(false); e.target.value = ''; }
  };

  const tabs = [
    { id: 'Datos', icon: Briefcase },
    { id: 'Analítica', icon: FileText },
    { id: 'Documentos', icon: FileText }
  ];

  const renderTabContent = () => {
    if (activeTab === 'Datos') return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">EMPRESA</label>
              <select className="win-input w-full cursor-pointer" value={formData.empresaId || ''} onChange={e => {
                const empId = e.target.value;
                const emp = empresas.find(x => x.id === empId);
                setFormData(p => ({ ...p, empresaId: empId, empresaNombre: emp ? emp.nombre : '' }));
              }}>
                <option value="">(Sin empresa)</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">PUESTO *</label>
              <input className="win-input w-full" value={formData.puesto || ''} onChange={e => setFormData(p => ({ ...p, puesto: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">FECHA INICIO</label>
              <input type="date" className="win-input w-full" value={formData.fechaInicio || ''} onChange={e => setFormData(p => ({ ...p, fechaInicio: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">FECHA FIN</label>
              <input type="date" className="win-input w-full" value={formData.fechaFin || ''} onChange={e => setFormData(p => ({ ...p, fechaFin: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">CEBE (Centro de Beneficio)</label>
              <select className="win-input w-full cursor-pointer" value={formData.cebe || ''} onChange={e => {
                const code = e.target.value;
                const match = cebes.find(x => x.code === code);
                setFormData(p => ({ ...p, cebe: code, cebeId: match?.id || '' }));
              }}>
                <option value="">(Sin CEBE)</option>
                {cebes.map(c => <option key={c.id} value={c.code}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">INGRESO MENSUAL (€)</label>
              <input type="number" step="0.01" className="win-input w-full" value={formData.ingresoMensual ?? ''} onChange={e => setFormData(p => ({ ...p, ingresoMensual: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">TIPO JORNADA</label>
              <select className="win-input w-full cursor-pointer" value={formData.tipoJornada || 'Completa'} onChange={e => setFormData(p => ({ ...p, tipoJornada: e.target.value }))}>
                <option value="Completa">Completa</option>
                <option value="Parcial">Parcial</option>
                <option value="Reducida">Reducida</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">REFERENCIA DE CONTRATO</label>
              <input className="win-input w-full" value={formData.referencia || ''} onChange={e => setFormData(p => ({ ...p, referencia: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-700 uppercase">CECO (Centro de Coste)</label>
              <select className="win-input w-full cursor-pointer" value={formData.ceco || ''} onChange={e => {
                const code = e.target.value;
                const match = cecos.find(x => x.code === code);
                setFormData(p => ({ ...p, ceco: code, cecoId: match?.id || '' }));
              }}>
                <option value="">(Sin CECO)</option>
                {cecos.map(c => <option key={c.id} value={c.code}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-[10px] font-bold text-slate-700 uppercase">DESCRIPCIÓN / OBSERVACIONES</label>
            <textarea className="win-input w-full" rows={3} value={formData.descripcion || ''} onChange={e => setFormData(p => ({ ...p, descripcion: e.target.value }))} placeholder="Notas o descripción del contrato..." />
          </div>
        </div>
      </div>
    );
    
    if (activeTab === 'Analítica') return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-4 p-3 bg-[#f8f9fa] border-b border-[#ccc] shrink-0 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[50px] text-center shrink-0 font-bold">Año:</span>
            <select className="w-[70px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-bold" value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
              <option value="Todos">Todos</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span onClick={() => setShowAccountSel(true)} className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold cursor-pointer hover:bg-[#dcdcdc] select-none active:bg-[#c8c8c8]">Cuenta:</span>
            <div className="relative">
              <input type="text" value={filtroCuenta || ''}
                  onChange={e => setFiltroCuenta(e.target.value)}
                  onFocus={() => setActiveDropdown('cuenta')}
                  onBlur={() => setActiveDropdown(null)}
                  onKeyDown={e => handleInputKeyDown(e, setShowAccountSel)}
                  className="w-[120px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-mono" placeholder="Todas" />
              {activeDropdown === 'cuenta' && (
                <div className="absolute left-0 mt-1 bg-white border border-[#999] shadow-lg z-[4000] w-[220px] max-h-[200px] overflow-y-auto rounded-sm text-[11px]">
                  {matchingAccounts.length === 0 ? (
                    <div className="p-2 text-gray-400 italic">No hay resultados</div>
                  ) : (
                    matchingAccounts.slice(0, 100).map(acc => (
                      <div key={acc.id} onMouseDown={(e) => { e.preventDefault(); setFiltroCuenta(acc.code); setActiveDropdown(null); }} className="p-1 px-2 hover:bg-[#cce5ff] cursor-pointer truncate font-mono text-left" title={`${acc.code} - ${acc.name}`}>
                        {acc.code} - {acc.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowAccountSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
            {filtroCuenta && <button onClick={() => setFiltroCuenta('')} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
          </div>

          <div className="flex items-center gap-1">
            <span onClick={() => setShowCebeSel(true)} className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold cursor-pointer hover:bg-[#dcdcdc] select-none active:bg-[#c8c8c8]">CEBE:</span>
            <div className="relative">
              <input type="text" value={formData.cebe || ''}
                  onChange={e => {
                    const code = e.target.value;
                    const match = cebes.find(x => x.code === code);
                    setFormData(p => ({ ...p, cebe: code, cebeId: match?.id || (code ? p.cebeId : '') }));
                  }}
                  onFocus={() => setActiveDropdown('cebe')}
                  onBlur={() => setActiveDropdown(null)}
                  onKeyDown={e => handleInputKeyDown(e, setShowCebeSel)}
                  className="w-[120px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-mono" placeholder="Todos" />
              {activeDropdown === 'cebe' && (
                <div className="absolute left-0 mt-1 bg-white border border-[#999] shadow-lg z-[4000] w-[220px] max-h-[200px] overflow-y-auto rounded-sm text-[11px]">
                  {matchingCebes.length === 0 ? (
                    <div className="p-2 text-gray-400 italic">No hay resultados</div>
                  ) : (
                    matchingCebes.slice(0, 100).map(c => (
                      <div key={c.id} onMouseDown={(e) => { e.preventDefault(); setFormData(p => ({ ...p, cebe: c.code, cebeId: c.id })); setActiveDropdown(null); }} className="p-1 px-2 hover:bg-[#cce5ff] cursor-pointer truncate font-mono text-left" title={`${c.code} - ${c.name}`}>
                        {c.code} - {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowCebeSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
            {formData.cebe && <button onClick={() => setFormData(p => ({ ...p, cebe: '', cebeId: '' }))} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
          </div>

          <div className="flex items-center gap-1">
            <span onClick={() => setShowCecoSel(true)} className="border border-[#999] bg-[#e9ecef] px-2 py-[3px] text-[11px] text-[#333] w-[60px] text-center shrink-0 font-bold cursor-pointer hover:bg-[#dcdcdc] select-none active:bg-[#c8c8c8]">CECO:</span>
            <div className="relative">
              <input type="text" value={formData.ceco || ''}
                  onChange={e => {
                    const code = e.target.value;
                    const match = cecos.find(x => x.code === code);
                    setFormData(p => ({ ...p, ceco: code, cecoId: match?.id || (code ? p.cecoId : '') }));
                  }}
                  onFocus={() => setActiveDropdown('ceco')}
                  onBlur={() => setActiveDropdown(null)}
                  onKeyDown={e => handleInputKeyDown(e, setShowCecoSel)}
                  className="w-[120px] border border-[#999] px-2 py-[3px] text-[11px] bg-white outline-none font-mono" placeholder="Todos" />
              {activeDropdown === 'ceco' && (
                <div className="absolute left-0 mt-1 bg-white border border-[#999] shadow-lg z-[4000] w-[220px] max-h-[200px] overflow-y-auto rounded-sm text-[11px]">
                  {matchingCecos.length === 0 ? (
                    <div className="p-2 text-gray-400 italic">No hay resultados</div>
                  ) : (
                    matchingCecos.slice(0, 100).map(c => (
                      <div key={c.id} onMouseDown={(e) => { e.preventDefault(); setFormData(p => ({ ...p, ceco: c.code, cecoId: c.id })); setActiveDropdown(null); }} className="p-1 px-2 hover:bg-[#cce5ff] cursor-pointer truncate font-mono text-left" title={`${c.code} - ${c.name}`}>
                        {c.code} - {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowCecoSel(true)} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6"><FileText size={13} /></button>
            {formData.ceco && <button onClick={() => setFormData(p => ({ ...p, ceco: '', cecoId: '' }))} className="border border-[#999] bg-[#e1e1e1] hover:bg-[#d0d0d0] p-[2px] rounded-[2px] shadow-sm flex items-center justify-center shrink-0 w-6 h-6 text-red-600 font-bold">X</button>}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white" style={{ minHeight: '300px' }}>
          {loadingAnalitica ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-gray-500 text-sm">Cargando datos analíticos...</span>
            </div>
          ) : (!formData.cebe && !formData.ceco) ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <FileText className="w-8 h-8 text-gray-300" />
              <span className="text-gray-500 text-sm italic">Seleccione un CEBE o CECO para ver sus asientos asociados.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse border border-[#ccc]">
              <thead className="bg-[#f8f9fa]">
                <tr>
                  <th className="py-[6px] px-2 text-[10px] font-bold text-[#333] uppercase border border-[#ccc]">FECHA (ASIENTO)</th>
                  <th className="py-[6px] px-2 text-[10px] font-bold text-[#333] uppercase border border-[#ccc]">CUENTA</th>
                  <th className="py-[6px] px-2 text-[10px] font-bold text-[#333] uppercase border border-[#ccc]">CONCEPTO ASIENTO</th>
                  <th className="py-[6px] px-2 text-right text-[10px] font-bold text-[#333] uppercase border border-[#ccc]">IMPORTE</th>
                  <th className="py-[6px] px-2 text-right text-[10px] font-bold text-[#333] uppercase border border-[#ccc]">IMPORTE ARRASTRADO</th>
                </tr>
              </thead>
              <tbody>
                {analiticaRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-1 px-2 text-[11px] whitespace-nowrap border border-[#eee] text-[#333]">{row.fecha}</td>
                    <td className="py-1 px-2 text-[11px] whitespace-nowrap border border-[#eee] text-[#333]">{row.cuenta}</td>
                    <td className="py-1 px-2 text-[11px] truncate max-w-[300px] border border-[#eee] text-[#333]" title={row.concepto}>{row.concepto}</td>
                    <td className={`py-1 px-2 text-[11px] text-right font-medium border border-[#eee] ${row.importe < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {row.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className={`py-1 px-2 text-[11px] text-right font-bold border border-[#eee] ${row.arrastrado < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {row.arrastrado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                  </tr>
                ))}
                {analiticaRows.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-4 text-center text-gray-500 text-[11px] italic border border-[#eee]">No hay asientos contables para los filtros seleccionados.</td>
                  </tr>
                )}
                {analiticaRows.length > 0 && (
                  <tr className="bg-blue-50/50">
                    <td colSpan="3" className="py-2 px-2 text-[11px] font-bold text-blue-800 uppercase pl-2 border border-[#ccc] text-right">TOTALES</td>
                    <td className="py-2 px-2 text-[12px] text-right font-bold text-blue-800 border border-[#ccc]">
                      {analiticaRows.reduce((sum, r) => sum + r.importe, 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="py-2 px-2 text-[12px] text-right font-bold text-blue-800 border border-[#ccc]">
                      {analiticaRows[analiticaRows.length - 1]?.arrastrado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );

if (activeTab === 'Documentos') return (
      <div className="flex flex-col bg-slate-50 border border-gray-200 rounded-md">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white rounded-t-md">
          <h3 className="text-[12px] font-bold text-slate-800 uppercase italic">Documentos ({formData.puesto || 'Contrato'})</h3>
          <div className="relative">
            <input type="file" multiple id="contrato-doc-upload" className="hidden" onChange={handleDocUpload} disabled={isUploading} />
            <label htmlFor="contrato-doc-upload" className={`btn-classic flex items-center space-x-1 px-3 py-1 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <FileArchive className="w-4 h-4" />
              <span className="text-[11px] font-bold">{isUploading ? 'Subiendo...' : 'Subir Documento'}</span>
            </label>
          </div>
        </div>
        <div className="flex-1 bg-white overflow-hidden flex flex-col min-h-[200px] rounded-b-md">
          <div className="bg-[#f0f0f0] grid grid-cols-12 gap-2 p-2 border-b border-[#808080] text-[10px] font-bold uppercase">
            <div className="col-span-4">Documento</div>
            <div className="col-span-4">Concepto</div>
            <div className="col-span-2">Fecha</div>
            <div className="col-span-2 text-center">Acción</div>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {(!formData.documentos || formData.documentos.length === 0) ? (
              <div className="text-center text-slate-400 italic py-8 text-[11px]">No hay documentos asociados a este contrato.</div>
            ) : (
              formData.documentos.map((doc) => (
                <div key={doc.id} className="grid grid-cols-12 gap-2 items-center text-[11px] border-b border-slate-100 pb-2">
                  <div className="col-span-4 flex items-center space-x-2 truncate">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate text-blue-600 underline cursor-pointer" onClick={() => setPreviewDocument(doc)} title={doc.name}>{doc.name}</span>
                  </div>
                  <div className="col-span-4">
                    <input type="text" className="win-input w-full text-[11px]" value={doc.concept || ''} onChange={(e) => setFormData(prev => ({ ...prev, documentos: prev.documentos.map(x => x.id === doc.id ? { ...x, concept: e.target.value } : x) }))} placeholder="Ej. Contrato firmado, Nómina..." />
                  </div>
                  <div className="col-span-2">
                    <input type="date" className="win-input w-full text-[11px]" value={doc.date || ''} onChange={(e) => setFormData(prev => ({ ...prev, documentos: prev.documentos.map(x => x.id === doc.id ? { ...x, date: e.target.value } : x) }))} />
                  </div>
                  <div className="col-span-2 flex justify-center space-x-2">
                    <button className="p-1 hover:bg-blue-50 text-gray-500 rounded" onClick={() => setPreviewDocument(doc)} title="Previsualizar"><Eye className="w-4 h-4" /></button>
                    <button className="p-1 hover:bg-gray-50 text-gray-500 rounded" onClick={() => setFormData(prev => ({ ...prev, documentos: prev.documentos.filter(x => x.id !== doc.id) }))} title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
    return null;
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative" onClick={() => setSelectedContrato(null)}>
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-2" />
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input type="text" placeholder="Buscar contrato..." value={filterValue} onChange={e => setFilterValue(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500" />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table style={{ zoom: tableZoom }} className="clean-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<TableHeaderWithFilter
 key="id" label="ID" columnKey="id" data={contratosConNombre} tableId="laboral-contratos" className="w-16" />);
                    case 'empresaId': return (<TableHeaderWithFilter
 key="empresaId" label="Empresa" columnKey="empresaNombre" data={contratosConNombre} tableId="laboral-contratos" className="w-32" />);
                    case 'puesto': return (<TableHeaderWithFilter
 key="puesto" label="Puesto" columnKey="puesto" data={contratosConNombre} tableId="laboral-contratos" className="w-48" />);
                    case 'fechaInicio': return (<TableHeaderWithFilter
 key="fechaInicio" label="Fecha Inicio" columnKey="fechaInicio" data={contratosConNombre} tableId="laboral-contratos" />);
                    case 'fechaFin': return (<TableHeaderWithFilter
 key="fechaFin" label="Fecha Fin" columnKey="fechaFin" data={contratosConNombre} tableId="laboral-contratos" />);
                    case 'ingresoMensual': return (<TableHeaderWithFilter
 key="ingresoMensual" label="Ingreso Mensual" columnKey="ingresoMensual" data={contratosConNombre} tableId="laboral-contratos" className="text-right" />);
                    case 'tipoJornada': return (<TableHeaderWithFilter
 key="tipoJornada" label="Tipo Jornada" columnKey="tipoJornada" data={contratosConNombre} tableId="laboral-contratos" />);
                    case 'referencia': return (<TableHeaderWithFilter
 key="referencia" label="Referencia" columnKey="referencia" data={contratosConNombre} tableId="laboral-contratos" />);
                    default: return null;
                    }
                  })}
    
                </tr>
              </thead>
              <tbody>
                {filteredAndColumnFilteredContratos.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">No hay contratos registrados.</td></tr>
                ) : (
                  filteredAndColumnFilteredContratos.map(c => (
                    <tr key={c.id} className={selectedContrato?.id === c.id ? 'selected' : ''}
                      onClick={e => { e.stopPropagation(); setSelectedContrato(c); }}
                      onDoubleClick={() => handleEdit(c)}>
                      
                  {visibleColumns.map(col => {
                    switch(col) {
                    case 'id': return (<td
 key="id" className="font-mono text-xs">{c.id}</td>);
                    case 'empresaId': return (<td
 key="empresaId" className="text-[12px]">{c.empresaNombre}</td>);
                    case 'puesto': return (<EditableCell
 key="puesto" value={c.puesto} onSave={val => handleSaveField(c, 'puesto', val)} />);
                    case 'fechaInicio': return (<td
 key="fechaInicio" className="text-[12px]">{c.fechaInicio}</td>);
                    case 'fechaFin': return (<td
 key="fechaFin" className="text-[12px]">{c.fechaFin}</td>);
                    case 'ingresoMensual': return (<td
 key="ingresoMensual" className="text-right font-mono text-[12px]">{c.ingresoMensual ? parseFloat(c.ingresoMensual).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '-'}</td>);
                    case 'tipoJornada': return (<td
 key="tipoJornada" className="text-[12px]">{c.tipoJornada}</td>);
                    case 'referencia': return (<td
 key="referencia" className="text-[12px]">{c.referencia}</td>);
                    default: return null;
                    }
                  })}
    
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
        <div>{filteredAndColumnFilteredContratos.length} contratos encontrados</div>
        <ZoomControl />
      </div>

      {renderFilterMenu()}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Window title={isEditing ? `Editar Contrato: ${formData.puesto || formData.id}` : 'Nuevo Contrato'}
            width="900px" height="650px" initialPos={{ x: 80, y: 40 }} onClose={() => setShowForm(false)} onMenuClick={() => setShowSidebar(!showSidebar)}>
            <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] relative">
              {showSidebar && (
                <div className="bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] w-44">
                  <div className="bg-white border border-[#a0a0a0] flex flex-col">
                    {tabs.map(tab => (
                      <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${activeTab === tab.id ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold' : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'}`}>
                        {tab.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
                <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                  <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                    {renderTabContent()}
                  </div>
                </div>
                <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                  <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" onClick={handleSave}>Aceptar</button>
                  <button className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" onClick={() => setShowForm(false)}>Cancelar</button>
                </div>
              </div>
            </div>
          </Window>
        </div>
      )}

      {previewDocument && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-60">
          <div className="bg-white border shadow-xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-4 py-2 border-b">
              <span className="font-bold text-sm">{previewDocument.name}</span>
              <button onClick={() => setPreviewDocument(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {previewDocument.url && <iframe src={previewDocument.url} className="w-full h-[60vh] border-none" title={previewDocument.name} />}
            </div>
          </div>
        </div>
      )}

      {showAccountSel && (
        <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', left: accountDR.pos.x, top: accountDR.pos.y, width: accountDR.size.w, height: accountDR.size.h }}
               className="flex flex-col bg-white border border-[#888] shadow-[2px_3px_16px_rgba(0,0,0,0.4)] relative">
            {accountDR.resizeHandles}
            <div onMouseDown={accountDR.onDragDown}
                 className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
              <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de cuenta</span>
              <button onClick={() => setShowAccountSel(false)}
                      className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Accounts
                isModal={true}
                onAccountSelect={(code) => {
                  setFiltroCuenta(code);
                  setShowAccountSel(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showCebeSel && (
        <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', left: centerDR.pos.x, top: centerDR.pos.y, width: centerDR.size.w, height: centerDR.size.h }}
               className="flex flex-col bg-white border border-[#888] shadow-[2px_3px_16px_rgba(0,0,0,0.4)] relative">
            {centerDR.resizeHandles}
            <div onMouseDown={centerDR.onDragDown}
                 className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
              <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de CEBE</span>
              <button onClick={() => setShowCebeSel(false)}
                      className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AnalyticalCenters type="cebe" isModal={true} onSelect={(code) => {
                const match = cebes.find(x => x.code === code);
                setFormData(p => ({ ...p, cebe: code, cebeId: match?.id || '' }));
                setShowCebeSel(false);
              }} />
            </div>
          </div>
        </div>
      )}

      {showCecoSel && (
        <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ position: 'absolute', left: centerDR.pos.x, top: centerDR.pos.y, width: centerDR.size.w, height: centerDR.size.h }}
               className="flex flex-col bg-white border border-[#888] shadow-[2px_3px_16px_rgba(0,0,0,0.4)] relative">
            {centerDR.resizeHandles}
            <div onMouseDown={centerDR.onDragDown}
                 className="flex items-center justify-between px-3 py-[6px] bg-[#4472c4] shrink-0 cursor-move">
              <span className="text-white text-[12px] font-bold tracking-wide uppercase">Selección de CECO</span>
              <button onClick={() => setShowCecoSel(false)}
                      className="w-[22px] h-[22px] flex items-center justify-center hover:bg-red-500 text-white rounded-[2px]">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AnalyticalCenters type="ceco" isModal={true} onSelect={(code) => {
                const match = cecos.find(x => x.code === code);
                setFormData(p => ({ ...p, ceco: code, cecoId: match?.id || '' }));
                setShowCecoSel(false);
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

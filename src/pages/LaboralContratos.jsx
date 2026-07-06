import { useState, useEffect, useMemo } from 'react';
import { Search, X, FileText, Briefcase, Upload } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import { handleExportFormat } from '../utils/exportUtils';
import { uploadFileToStorage } from '../utils/storageUtils';

export default function LaboralContratos() {
  const { user, queryUserIds } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [cebes, setCebes] = useState([]);
  const [cecos, setCecos] = useState([]);
  const [selectedContrato, setSelectedContrato] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('Datos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [filterValue, setFilterValue] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);

  const DEFAULT_COLUMNS = ['id', 'empresaId', 'puesto', 'fechaInicio', 'ingresoMensual'];
  const { visibleColumns, toggleColumn, columnWidths } = useTableColumns('laboral-contratos', DEFAULT_COLUMNS);

  const emptyForm = {
    id: '', empresaId: '', puesto: '', fechaInicio: '', fechaFin: '',
    ingresoMensual: '', tipoJornada: 'Completa', referencia: '',
    cebeId: '', cecoId: '', descripcion: '', documentos: []
  };
  const [formData, setFormData] = useState({ ...emptyForm });

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
    contratos.map(c => ({ ...c, empresaNombre: empresas.find(e => e.id === c.empresaId)?.nombre || c.empresaId || '-' }))
  , [contratos, empresas]);

  const filteredContratos = useMemo(() => {
    if (!filterValue) return contratosConNombre;
    const f = filterValue.toLowerCase();
    return contratosConNombre.filter(c =>
      (c.empresaNombre || '').toLowerCase().includes(f) ||
      (c.puesto || '').toLowerCase().includes(f) ||
      (c.referencia || '').toLowerCase().includes(f)
    );
  }, [contratosConNombre, filterValue]);

  const handleNew = () => {
    setFormData({ ...emptyForm, id: Date.now().toString(36).toUpperCase() });
    setIsEditing(false);
    setActiveTab('Datos');
    setShowForm(true);
  };

  const handleEdit = (c) => {
    setFormData({ ...emptyForm, ...c });
    setIsEditing(true);
    setActiveTab('Datos');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.puesto) { alert('El puesto es obligatorio'); return; }
    const docRef = doc(db, 'laboral_contratos', formData.id);
    await setDoc(docRef, { ...formData, userId: user.uid }, { merge: true });
    setShowForm(false);
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
      <div className="flex flex-col gap-4">
        <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-3">
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-3 border-b border-[#c0c0c0] pb-1">DATOS DEL CONTRATO</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">EMPRESA</label>
              <select className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.empresaId} onChange={e => setFormData(p => ({ ...p, empresaId: e.target.value }))}>
                <option value="">(Sin empresa)</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">PUESTO *</label>
              <input className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.puesto} onChange={e => setFormData(p => ({ ...p, puesto: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">FECHA INICIO</label>
              <input type="date" className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.fechaInicio} onChange={e => setFormData(p => ({ ...p, fechaInicio: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">FECHA FIN</label>
              <input type="date" className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.fechaFin} onChange={e => setFormData(p => ({ ...p, fechaFin: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">INGRESO MENSUAL (€)</label>
              <input type="number" step="0.01" className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.ingresoMensual} onChange={e => setFormData(p => ({ ...p, ingresoMensual: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">TIPO JORNADA</label>
              <select className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.tipoJornada} onChange={e => setFormData(p => ({ ...p, tipoJornada: e.target.value }))}>
                <option value="Completa">Completa</option>
                <option value="Parcial">Parcial</option>
                <option value="Reducida">Reducida</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">REFERENCIA DE CONTRATO</label>
              <input className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.referencia} onChange={e => setFormData(p => ({ ...p, referencia: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>
    );
    if (activeTab === 'Analítica') return (
      <div className="flex flex-col gap-4">
        <div className="bg-[#f0f0f0] border border-[#a0a0a0] p-3">
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-3 border-b border-[#c0c0c0] pb-1">CENTROS ANALÍTICOS</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">CEBE (Centro de Beneficio)</label>
              <select className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.cebeId} onChange={e => setFormData(p => ({ ...p, cebeId: e.target.value }))}>
                <option value="">(Sin CEBE)</option>
                {cebes.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">CECO (Centro de Coste)</label>
              <select className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" value={formData.cecoId} onChange={e => setFormData(p => ({ ...p, cecoId: e.target.value }))}>
                <option value="">(Sin CECO)</option>
                {cecos.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">DESCRIPCIÓN</label>
              <textarea className="w-full border border-gray-400 px-2 py-1 text-[12px] bg-white" rows={4} value={formData.descripcion} onChange={e => setFormData(p => ({ ...p, descripcion: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>
    );
    if (activeTab === 'Documentos') return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 cursor-pointer px-3 py-1 bg-[#e0e0e0] border border-[#a0a0a0] text-[11px] font-bold hover:bg-[#d0d0d0] uppercase">
            <Upload className="w-3 h-3" />
            {isUploading ? 'Subiendo...' : 'Adjuntar documento'}
            <input type="file" className="hidden" multiple onChange={handleDocUpload} disabled={isUploading} />
          </label>
        </div>
        <table className="clean-table">
          <thead><tr><th>Nombre</th><th>Concepto</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            {(formData.documentos || []).length === 0 ? (
              <tr><td colSpan={4} className="text-center text-gray-400 py-4">No hay documentos adjuntos.</td></tr>
            ) : (
              (formData.documentos || []).map(d => (
                <tr key={d.id}>
                  <td><a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-[11px]">{d.name}</a></td>
                  <td><input className="border border-gray-300 px-1 py-0.5 text-[11px] w-full" value={d.concept || ''} onChange={e => setFormData(prev => ({ ...prev, documentos: prev.documentos.map(x => x.id === d.id ? { ...x, concept: e.target.value } : x) }))} /></td>
                  <td className="text-[11px]">{d.date}</td>
                  <td><button className="text-red-500 hover:text-red-700 text-[10px]" onClick={() => setFormData(prev => ({ ...prev, documentos: prev.documentos.filter(x => x.id !== d.id) }))}>Eliminar</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
            <table className="clean-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  {visibleColumns.includes('id') && <th>ID</th>}
                  {visibleColumns.includes('empresaId') && <th>Empresa</th>}
                  {visibleColumns.includes('puesto') && <th>Puesto</th>}
                  {visibleColumns.includes('fechaInicio') && <th>Fecha Inicio</th>}
                  {visibleColumns.includes('fechaFin') && <th>Fecha Fin</th>}
                  {visibleColumns.includes('ingresoMensual') && <th className="text-right">Ingreso Mensual</th>}
                  {visibleColumns.includes('tipoJornada') && <th>Tipo Jornada</th>}
                  {visibleColumns.includes('referencia') && <th>Referencia</th>}
                </tr>
              </thead>
              <tbody>
                {filteredContratos.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">No hay contratos registrados.</td></tr>
                ) : (
                  filteredContratos.map(c => (
                    <tr key={c.id} className={selectedContrato?.id === c.id ? 'selected' : ''}
                      onClick={e => { e.stopPropagation(); setSelectedContrato(c); }}
                      onDoubleClick={() => handleEdit(c)}>
                      {visibleColumns.includes('id') && <td className="font-mono text-xs">{c.id}</td>}
                      {visibleColumns.includes('empresaId') && <td className="text-[12px]">{c.empresaNombre}</td>}
                      {visibleColumns.includes('puesto') && <EditableCell value={c.puesto} onSave={val => handleSaveField(c, 'puesto', val)} />}
                      {visibleColumns.includes('fechaInicio') && <td className="text-[12px]">{c.fechaInicio}</td>}
                      {visibleColumns.includes('fechaFin') && <td className="text-[12px]">{c.fechaFin}</td>}
                      {visibleColumns.includes('ingresoMensual') && <td className="text-right font-mono text-[12px]">{c.ingresoMensual ? parseFloat(c.ingresoMensual).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €' : '-'}</td>}
                      {visibleColumns.includes('tipoJornada') && <td className="text-[12px]">{c.tipoJornada}</td>}
                      {visibleColumns.includes('referencia') && <td className="text-[12px]">{c.referencia}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
    </div>
  );
}

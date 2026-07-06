import { useState, useEffect, useMemo } from 'react';
import { Search, Trash2, X, FileText, Building2 } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import EditableCell from '../components/EditableCell';
import { handleExportFormat } from '../utils/exportUtils';

export default function LaboralEmpresas() {
  const { user, queryUserIds } = useAuth();
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [filterValue, setFilterValue] = useState('');

  const DEFAULT_COLUMNS = ['id', 'nombre', 'razonSocial', 'cif', 'sector'];
  const { visibleColumns, toggleColumn, columnWidths } = useTableColumns('laboral-empresas', DEFAULT_COLUMNS);

  const [formData, setFormData] = useState({
    id: '', nombre: '', razonSocial: '', cif: '', sector: '',
    telefono: '', email: '', direccion: '', ciudad: '', web: '', notas: ''
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState('Datos');

  const tabs = [
    { id: 'Datos', icon: Building2 }
  ];

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'laboral_empresas'), where('userId', 'in', queryUserIds?.length > 0 ? queryUserIds : [user.uid]));
    const unsub = onSnapshot(q, snap => setEmpresas(snap.docs.map(d => ({ ...d.data(), id: d.id }))));
    return () => unsub();
  }, [user, queryUserIds]);

  useEffect(() => {
    const onNew = () => handleNew();
    const onEdit = () => { if (selectedEmpresa) handleEdit(selectedEmpresa); else alert('Selecciona una empresa primero.'); };
    const onDelete = () => { if (selectedEmpresa) handleDelete(selectedEmpresa); else alert('Selecciona una empresa primero.'); };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      if (format === 'pdf') {
        const cols = [
          { header: 'ID', dataKey: 'id' },
          { header: 'Nombre', dataKey: 'nombre' },
          { header: 'Razón Social', dataKey: 'razonSocial' },
          { header: 'CIF', dataKey: 'cif' },
          { header: 'Sector', dataKey: 'sector' },
        ].filter(c => visibleColumns.includes(c.dataKey));
        exportToPDF(filteredEmpresas, cols, 'Empresas Laborales', 'laboral_empresas.pdf');
      } else {
        handleExportFormat(filteredEmpresas, 'Empresas Laborales', format);
      }
    };
    const onColumns = (e) => {
      const { columnId } = e.detail || {};
      if (columnId) toggleColumn(columnId);
    };
    window.addEventListener('laboral-empresa:new', onNew);
    window.addEventListener('laboral-empresa:edit', onEdit);
    window.addEventListener('laboral-empresa:delete', onDelete);
    window.addEventListener('laboral-empresa:export', onExport);
    window.addEventListener('laboral-empresa:columns', onColumns);
    return () => {
      window.removeEventListener('laboral-empresa:new', onNew);
      window.removeEventListener('laboral-empresa:edit', onEdit);
      window.removeEventListener('laboral-empresa:delete', onDelete);
      window.removeEventListener('laboral-empresa:export', onExport);
      window.removeEventListener('laboral-empresa:columns', onColumns);
    };
  }, [selectedEmpresa, visibleColumns]);

  const filteredEmpresas = useMemo(() => {
    if (!filterValue) return empresas;
    const f = filterValue.toLowerCase();
    return empresas.filter(e =>
      (e.nombre || '').toLowerCase().includes(f) ||
      (e.razonSocial || '').toLowerCase().includes(f) ||
      (e.cif || '').toLowerCase().includes(f) ||
      (e.sector || '').toLowerCase().includes(f)
    );
  }, [empresas, filterValue]);

  const handleNew = () => {
    setFormData({ id: Date.now().toString(36).toUpperCase(), nombre: '', razonSocial: '', cif: '', sector: '', telefono: '', email: '', direccion: '', ciudad: '', web: '', notas: '' });
    setIsEditing(false);
    setShowForm(true);
  };

  const handleEdit = (emp) => {
    setFormData({ ...emp });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.nombre) { alert('El nombre es obligatorio'); return; }
    const docRef = doc(db, 'laboral_empresas', formData.id);
    await setDoc(docRef, { ...formData, userId: user.uid }, { merge: true });
    setShowForm(false);
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`¿Eliminar empresa "${emp.nombre}"?`)) return;
    await deleteDoc(doc(db, 'laboral_empresas', emp.id));
    if (selectedEmpresa?.id === emp.id) setSelectedEmpresa(null);
  };

  const handleSaveField = async (emp, field, value) => {
    const docRef = doc(db, 'laboral_empresas', emp.id);
    await setDoc(docRef, { [field]: value }, { merge: true });
  };

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        <div className="flex-1 flex flex-col bg-white overflow-hidden relative" onClick={() => setSelectedEmpresa(null)}>
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
            <div className="flex items-center space-x-2" />
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input type="text" placeholder="Buscar empresa..." value={filterValue} onChange={e => setFilterValue(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500" />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="clean-table">
              <thead>
                <tr className="sticky top-0 z-10">
                  {visibleColumns.includes('id') && <th>ID</th>}
                  {visibleColumns.includes('nombre') && <th>Nombre</th>}
                  {visibleColumns.includes('razonSocial') && <th>Razón Social</th>}
                  {visibleColumns.includes('cif') && <th>CIF/NIF</th>}
                  {visibleColumns.includes('sector') && <th>Sector</th>}
                  {visibleColumns.includes('telefono') && <th>Teléfono</th>}
                  {visibleColumns.includes('email') && <th>Email</th>}
                  {visibleColumns.includes('direccion') && <th>Dirección</th>}
                  {visibleColumns.includes('ciudad') && <th>Ciudad</th>}
                  {visibleColumns.includes('web') && <th>Web</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEmpresas.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">No hay empresas registradas.</td></tr>
                ) : (
                  filteredEmpresas.map(emp => (
                    <tr key={emp.id} className={selectedEmpresa?.id === emp.id ? 'selected' : ''}
                      onClick={e => { e.stopPropagation(); setSelectedEmpresa(emp); }}
                      onDoubleClick={() => handleEdit(emp)}>
                      {visibleColumns.includes('id') && <td className="font-mono text-xs">{emp.id}</td>}
                      {visibleColumns.includes('nombre') && <EditableCell value={emp.nombre} onSave={val => handleSaveField(emp, 'nombre', val)} />}
                      {visibleColumns.includes('razonSocial') && <EditableCell value={emp.razonSocial} onSave={val => handleSaveField(emp, 'razonSocial', val)} />}
                      {visibleColumns.includes('cif') && <EditableCell value={emp.cif} onSave={val => handleSaveField(emp, 'cif', val)} />}
                      {visibleColumns.includes('sector') && <EditableCell value={emp.sector} onSave={val => handleSaveField(emp, 'sector', val)} />}
                      {visibleColumns.includes('telefono') && <EditableCell value={emp.telefono} onSave={val => handleSaveField(emp, 'telefono', val)} />}
                      {visibleColumns.includes('email') && <EditableCell value={emp.email} onSave={val => handleSaveField(emp, 'email', val)} />}
                      {visibleColumns.includes('direccion') && <EditableCell value={emp.direccion} onSave={val => handleSaveField(emp, 'direccion', val)} />}
                      {visibleColumns.includes('ciudad') && <EditableCell value={emp.ciudad} onSave={val => handleSaveField(emp, 'ciudad', val)} />}
                      {visibleColumns.includes('web') && <EditableCell value={emp.web} onSave={val => handleSaveField(emp, 'web', val)} />}
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
          <Window title={isEditing ? `Editar Empresa: ${formData.nombre || formData.id}` : 'Nueva Empresa'}
            width="900px" height="580px" initialPos={{ x: 100, y: 60 }} onClose={() => setShowForm(false)} onMenuClick={() => setShowSidebar(!showSidebar)}>
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
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">NOMBRE *</label>
                            <input className="win-input w-full" value={formData.nombre} onChange={e => setFormData(p => ({ ...p, nombre: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">RAZÓN SOCIAL</label>
                            <input className="win-input w-full" value={formData.razonSocial} onChange={e => setFormData(p => ({ ...p, razonSocial: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">CIF/NIF</label>
                            <input className="win-input w-full" value={formData.cif} onChange={e => setFormData(p => ({ ...p, cif: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">SECTOR</label>
                            <input className="win-input w-full" value={formData.sector} onChange={e => setFormData(p => ({ ...p, sector: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">NOTAS</label>
                            <textarea className="win-input w-full" rows={3} value={formData.notas} onChange={e => setFormData(p => ({ ...p, notas: e.target.value }))} />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">TELÉFONO</label>
                            <input className="win-input w-full" value={formData.telefono} onChange={e => setFormData(p => ({ ...p, telefono: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">EMAIL</label>
                            <input type="email" className="win-input w-full" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">DIRECCIÓN</label>
                            <input className="win-input w-full" value={formData.direccion} onChange={e => setFormData(p => ({ ...p, direccion: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">CIUDAD</label>
                            <input className="win-input w-full" value={formData.ciudad} onChange={e => setFormData(p => ({ ...p, ciudad: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">WEB</label>
                            <input className="win-input w-full" value={formData.web} onChange={e => setFormData(p => ({ ...p, web: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                    </div>
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
    </div>
  );
}

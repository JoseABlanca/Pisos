import { useState, useMemo, useEffect } from 'react';
import Window from './Window';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, Eye, X } from 'lucide-react';

export default function TaxesExtractModal({ isOpen, onClose, property, year, rentals = [] }) {
  const [activeTab, setActiveTab] = useState('Ingresos');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  const { user, queryUserIds } = useAuth();
  const [journalEntries, setJournalEntries] = useState([]);
  const [selectedYear, setSelectedYear] = useState(year ? year.toString() : new Date().getFullYear().toString());
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update selected year if prop changes
  useEffect(() => {
    if (year) {
      setSelectedYear(year.toString());
    }
  }, [year]);

  // Load journal entries
  useEffect(() => {
    if (!user || !isOpen) return;
    const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    const q = query(
      collection(db, 'journal_entries'),
      where('userId', 'in', qIds)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setJournalEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Error loading journal entries for TaxesExtractModal:", err);
    });
    return () => unsubscribe();
  }, [user, isOpen, queryUserIds]);

  // Extract unique years from journal entries
  const availableYears = useMemo(() => {
    const yearsSet = new Set();
    if (year && year !== 'Todas') {
      yearsSet.add(year.toString());
    }
    journalEntries.forEach(e => {
      if (e.date) {
        const yr = e.date.substring(0, 4);
        if (yr) yearsSet.add(yr);
      }
    });
    // Add current year if empty
    if (yearsSet.size === 0) {
      yearsSet.add(new Date().getFullYear().toString());
    }
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [journalEntries, year]);

  // Filter journal entries for Incomes (CEBE + taxIncomeCecos)
  const filteredTaxIncomes = useMemo(() => {
    if (!property) return [];
    const propertyCebe = String(property.cebe || '').trim();
    const taxIncomeCecos = property.taxIncomeCecos || [];
    const normalizedIncomeCecos = taxIncomeCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));
    const normalizedPropCebe = propertyCebe ? propertyCebe.replace(/^(CEBE|CECO)/i, '') : '';

    if (!normalizedPropCebe && normalizedIncomeCecos.length === 0) return [];

    return journalEntries.filter(entry => {
      // Must be tax marked
      if (!entry.isImpuesto) return false;
      
      // Match year
      if (selectedYear !== 'Todas') {
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        if (entryYr !== selectedYear) return false;
      }
      
      // Match line level
      let lineMatch = false;
      if (entry.lines) {
        entry.lines.forEach(l => {
          if (l.cebe && normalizedPropCebe) {
            const lineCebe = String(l.cebe).trim().replace(/^(CEBE|CECO)/i, '');
            if (lineCebe.startsWith(normalizedPropCebe)) {
              lineMatch = true;
            }
          }
          if (l.ceco && normalizedIncomeCecos.length > 0) {
            const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normalizedIncomeCecos.some(c => lineCeco.startsWith(c))) {
              lineMatch = true;
            }
          }
        });
      }

      // Match global level
      let globalMatch = false;
      if (entry.cebe && normalizedPropCebe) {
        const entryCebe = String(entry.cebe).trim().replace(/^(CEBE|CECO)/i, '');
        if (entryCebe.startsWith(normalizedPropCebe)) {
          globalMatch = true;
        }
      }
      if (entry.ceco && normalizedIncomeCecos.length > 0) {
        const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
        if (normalizedIncomeCecos.some(c => entryCeco.startsWith(c))) {
          globalMatch = true;
        }
      }

      return lineMatch || globalMatch;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, property, selectedYear]);

  // Filter journal entries for Expenses (taxExpenseCecos)
  const filteredTaxExpenses = useMemo(() => {
    if (!property) return [];
    const taxExpenseCecos = property.taxExpenseCecos || [];
    const normalizedExpenseCecos = taxExpenseCecos.map(c => c.replace(/^(CEBE|CECO)/i, ''));

    if (normalizedExpenseCecos.length === 0) return [];

    return journalEntries.filter(entry => {
      // Must be tax marked
      if (!entry.isImpuesto) return false;

      // Match year
      if (selectedYear !== 'Todas') {
        const entryYr = entry.date ? entry.date.substring(0, 4) : '';
        if (entryYr !== selectedYear) return false;
      }

      // Match line level
      let lineMatch = false;
      if (entry.lines) {
        entry.lines.forEach(l => {
          if (l.ceco && normalizedExpenseCecos.length > 0) {
            const lineCeco = String(l.ceco).trim().replace(/^(CEBE|CECO)/i, '');
            if (normalizedExpenseCecos.some(c => lineCeco.startsWith(c))) {
              lineMatch = true;
            }
          }
        });
      }

      // Match global level
      let globalMatch = false;
      if (entry.ceco && normalizedExpenseCecos.length > 0) {
        const entryCeco = String(entry.ceco).trim().replace(/^(CEBE|CECO)/i, '');
        if (normalizedExpenseCecos.some(c => entryCeco.startsWith(c))) {
          globalMatch = true;
        }
      }

      return lineMatch || globalMatch;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [journalEntries, property, selectedYear]);

  // Total sums
  const totalTaxIncomes = useMemo(() => {
    return filteredTaxIncomes.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);
  }, [filteredTaxIncomes]);

  const totalTaxExpenses = useMemo(() => {
    return filteredTaxExpenses.reduce((sum, e) => sum + (parseFloat(e.total) || 0), 0);
  }, [filteredTaxExpenses]);

  if (!isOpen || !property) return null;

  const tabs = ['Ingresos', 'Gastos'];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <Window 
        title={`Extracto Fiscal - ${property.name || property.address || property.id}`}
        width={isMobile ? "100%" : "1200px"}
        initialPos={{ x: isMobile ? 0 : 50, y: isMobile ? 0 : 20 }}
        onClose={onClose}
        onMenuClick={() => setShowSidebar(!showSidebar)}
      >
        <div className="flex h-[750px] bg-[#d4d0c8] relative flex-col">
          
          {/* Top filter bar */}
          <div className="bg-[#f0f0f0] p-2 border-b border-[#808080] flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-slate-600">Filtrar por Año Fiscal:</span>
            <select
              className="win-input w-28 text-[10px]"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
            >
              <option value="Todas">Todas</option>
              {availableYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>

            <div className="ml-auto text-[10px] text-slate-600 uppercase flex gap-3">
              <span><strong>CEBE:</strong> {property.cebe || 'Sin asignar'}</span>
              <span><strong>CECO:</strong> {property.ceco || 'Sin asignar'}</span>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            {showSidebar && (
              <div className={`bg-[#f0f0f0] border-r border-[#808080] shrink-0 overflow-y-auto p-2 flex flex-col shadow-[inset_-1px_0_0_rgba(0,0,0,0.1)] ${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56' : 'w-56'}`}>
                <div className="bg-white border border-[#a0a0a0] flex flex-col">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); if (isMobile) setShowSidebar(false); }}
                      className={`w-full text-left px-4 py-2.5 text-[12px] transition-colors border-y ${
                        activeTab === tab
                          ? 'bg-[#c0c0c0] text-black border-[#a0a0a0] shadow-[inset_0px_1px_1px_rgba(0,0,0,0.1)] font-semibold'
                          : 'bg-white text-slate-700 border-transparent hover:bg-[#f8f8f8]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile backdrop to close sidebar */}
            {isMobile && showSidebar && (
              <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setShowSidebar(false)} />
            )}

            {/* Tab Content Container */}
            <div className="flex-1 bg-[#d4d0c8] flex flex-col relative overflow-hidden">
              <div className="flex-1 overflow-auto bg-[#d4d0c8] p-3">
                <div className="bg-[#d4d0c8] border border-white shadow-[1px_1px_0px_#000] p-4 min-h-full">
                  
                  {/* INGRESOS */}
                  {activeTab === 'Ingresos' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-400 pb-1 mb-4">
                        <h3 className="text-sm font-bold text-gray-800 uppercase">Ingresos Fiscales (CEBE)</h3>
                        <span className="text-[11px] font-bold text-slate-700">Total Ingresos: {totalTaxIncomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      
                      {!property.cebe ? (
                        <div className="p-4 bg-orange-50 border border-orange-200 text-orange-800 text-xs text-center rounded font-medium">
                          ⚠️ Este activo no tiene un CEBE Asociado. Asígnale uno en Datos para poder filtrar sus ingresos fiscales.
                        </div>
                      ) : (
                        <div className="border border-[#808080] bg-white overflow-auto">
                          <table className="win-table w-full text-[11px]">
                            <thead>
                              <tr className="sticky top-0 z-10 bg-[#e7e1d3]">
                                <th className="p-2 text-left w-24">Fecha</th>
                                <th className="p-2 text-left">Concepto</th>
                                <th className="p-2 text-left w-36">CEBE</th>
                                <th className="p-2 text-center w-36">Documento</th>
                                <th className="p-2 text-right w-36">Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredTaxIncomes.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                                    No se encontraron ingresos contables marcados como impuestos para el CEBE "{property.cebe}" en el periodo seleccionado.
                                  </td>
                                </tr>
                              ) : (
                                filteredTaxIncomes.map((e) => (
                                  <tr key={e.id} className="border-b border-gray-200 hover:bg-slate-50">
                                    <td className="p-2">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                                    <td className="p-2 truncate max-w-[200px]" title={e.description}>{e.description}</td>
                                    <td className="p-2 font-mono text-[10px]">{e.cebe}</td>
                                    <td className="p-2 text-center">
                                      {e.documentUrl ? (
                                        <button 
                                          onClick={() => setPreviewDoc({ url: e.documentUrl, name: e.documentName || 'Documento' })}
                                          className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 font-medium text-[10px]"
                                          title="Ver archivo adjunto"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          <span className="truncate max-w-[90px]" title={e.documentName}>{e.documentName}</span>
                                        </button>
                                      ) : (
                                        <span className="text-gray-400 italic text-[10px]">Sin adjunto</span>
                                      )}
                                    </td>
                                    <td className="p-2 text-right font-mono font-bold text-slate-800">
                                      {(e.total || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                    </td>
                                  </tr>
                                ))
                              )}
                              {filteredTaxIncomes.length > 0 && (
                                <tr className="bg-slate-100 font-bold border-t-2 border-gray-400">
                                  <td colSpan={4} className="p-2 text-right uppercase">Total:</td>
                                  <td className="p-2 text-right text-slate-850 font-mono">
                                    {totalTaxIncomes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* GASTOS */}
                  {activeTab === 'Gastos' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-400 pb-1 mb-4">
                        <h3 className="text-sm font-bold text-gray-800 uppercase">Gastos Fiscales (CECO)</h3>
                        <span className="text-[11px] font-bold text-slate-700">Total Gastos: {totalTaxExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                      
                      {!property.ceco ? (
                        <div className="p-4 bg-orange-50 border border-orange-200 text-orange-800 text-xs text-center rounded font-medium">
                          ⚠️ Este activo no tiene un CECO Asociado. Asígnale uno en Datos para poder filtrar sus gastos fiscales.
                        </div>
                      ) : (
                        <div className="border border-[#808080] bg-white overflow-auto">
                          <table className="win-table w-full text-[11px]">
                            <thead>
                              <tr className="sticky top-0 z-10 bg-[#e7e1d3]">
                                <th className="p-2 text-left w-24">Fecha</th>
                                <th className="p-2 text-left">Concepto</th>
                                <th className="p-2 text-left w-36">CECO</th>
                                <th className="p-2 text-center w-36">Documento</th>
                                <th className="p-2 text-right w-36">Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredTaxExpenses.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                                    No se encontraron gastos contables marcados como impuestos para el CECO "{property.ceco}" en el periodo seleccionado.
                                  </td>
                                </tr>
                              ) : (
                                filteredTaxExpenses.map((e) => (
                                  <tr key={e.id} className="border-b border-gray-200 hover:bg-slate-50">
                                    <td className="p-2">{e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
                                    <td className="p-2 truncate max-w-[200px]" title={e.description}>{e.description}</td>
                                    <td className="p-2 font-mono text-[10px]">{e.ceco}</td>
                                    <td className="p-2 text-center">
                                      {e.documentUrl ? (
                                        <button 
                                          onClick={() => setPreviewDoc({ url: e.documentUrl, name: e.documentName || 'Documento' })}
                                          className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 font-medium text-[10px]"
                                          title="Ver archivo adjunto"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          <span className="truncate max-w-[90px]" title={e.documentName}>{e.documentName}</span>
                                        </button>
                                      ) : (
                                        <span className="text-gray-400 italic text-[10px]">Sin adjunto</span>
                                      )}
                                    </td>
                                    <td className="p-2 text-right font-mono font-bold text-slate-800">
                                      {(e.total || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                    </td>
                                  </tr>
                                ))
                              )}
                              {filteredTaxExpenses.length > 0 && (
                                <tr className="bg-slate-100 font-bold border-t-2 border-gray-400">
                                  <td colSpan={4} className="p-2 text-right uppercase">Total:</td>
                                  <td className="p-2 text-right text-slate-850 font-mono">
                                    {totalTaxExpenses.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 shrink-0 pt-2 pb-1 pr-1 bg-[#d4d0c8] border-t border-[#808080]">
                <button 
                  className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase" 
                  onClick={onClose}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      </Window>

      {/* Internal Document Previewer Modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <Window 
            title={`Vista Previa: ${previewDoc.name}`}
            width={isMobile ? "100%" : "800px"}
            initialPos={{ x: isMobile ? 0 : 150, y: isMobile ? 0 : 100 }}
            onClose={() => setPreviewDoc(null)}
          >
            <div className="bg-white flex flex-col h-[600px] relative">
              <div className="flex-1 overflow-hidden p-2 flex flex-col items-center justify-center">
                {(previewDoc.url.toLowerCase().includes('.pdf') || previewDoc.name.toLowerCase().endsWith('.pdf')) ? (
                  <object 
                    data={previewDoc.url} 
                    type="application/pdf" 
                    className="w-full h-full border border-gray-300"
                    title={previewDoc.name}
                  >
                    <iframe 
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewDoc.url)}&embedded=true`} 
                      className="w-full h-full border-none"
                      title={previewDoc.name}
                    />
                  </object>
                ) : (previewDoc.url.toLowerCase().includes('image') || previewDoc.name.toLowerCase().match(/\.(jpg|jpeg|png)$/)) ? (
                  <img 
                    src={previewDoc.url} 
                    alt={previewDoc.name} 
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-4">
                    <p className="text-slate-600 mb-2">Este archivo no se puede previsualizar en el navegador.</p>
                    <a href={previewDoc.url} download={previewDoc.name} className="text-blue-600 underline font-bold" target="_blank" rel="noreferrer">
                      Descargar archivo
                    </a>
                  </div>
                )}
              </div>
              <div className="flex justify-end p-2 bg-[#d4d0c8] border-t border-[#808080]">
                <button onClick={() => setPreviewDoc(null)} className="px-6 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 text-[11px] font-bold uppercase">
                  Cerrar
                </button>
              </div>
            </div>
          </Window>
        </div>
      )}
    </div>
  );
}

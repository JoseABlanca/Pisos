import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { PanelLeft, TrendingUp, TrendingDown, Building2, Search } from 'lucide-react';
import { handleExportFormat } from '../utils/exportUtils';
import { useTableColumns } from '../hooks/useTableColumns';
import { exportToPDF } from '../utils/pdfExport';
import ZoomControl from '../components/ZoomControl';
import ResizableSidebar from '../components/ResizableSidebar';

const fmt = (v, dec = 2) =>
  (v || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const STATUSES = ['activo', 'finalizado', 'moroso', 'amortizado'];

export default function CfPortfolio() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  
  // Data State
  const [projects, setProjects] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);

  // UI Filters
  const [groupBy, setGroupBy] = useState('activo'); // 'activo' | 'plataforma'
  const [statusFilter, setStatusFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const DEFAULT_COLUMNS = [
    'groupName',
    'investment',
    'grossRents',
    'expenses',
    'netRents',
    'totalGross',
    'totalNet',
    'yieldGross',
    'yieldNet'
  ];
  const { visibleColumns, columnWidths } = useTableColumns('cf-portfolio', DEFAULT_COLUMNS);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch all required data from Firestore
  useEffect(() => {
    if (!user) return;
    const targetUserIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

    const unsubProj = onSnapshot(
      query(collection(db, 'cf_projects'), where('userId', 'in', targetUserIds)),
      (snap) => setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_projects:', err)
    );

    const unsubPlt = onSnapshot(
      query(collection(db, 'cf_platforms'), where('userId', 'in', targetUserIds)),
      (snap) => setPlatforms(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_platforms:', err)
    );

    const unsubTx = onSnapshot(
      query(collection(db, 'cf_transactions'), where('userId', 'in', targetUserIds)),
      (snap) => setTransactions(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching cf_transactions:', err)
    );

    const unsubJournal = onSnapshot(
      query(collection(db, 'journal_entries'), where('userId', 'in', targetUserIds)),
      (snap) => setJournalEntries(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error('Error fetching journal_entries:', err)
    );

    return () => {
      unsubProj();
      unsubPlt();
      unsubTx();
      unsubJournal();
    };
  }, [user, queryUserIds]);

  // Compute portfolio calculations
  const computedData = useMemo(() => {
    // 1. Filter projects based on status selection
    const filteredProjects = projects.filter(p => {
      if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
      return true;
    });

    const activeProjectIds = new Set(filteredProjects.map(p => p.id));

    // 2. Investment amount per project
    const projectInvestments = {};
    const platformInvestments = {};

    transactions.forEach(tx => {
      const pId = tx.projectId;
      const platId = tx.platformId;
      const amt = parseFloat(tx.amount) || 0;
      const isPurchase = tx.type === 'Compra';

      // Only count transaction if the project matches the status filter
      if (pId && activeProjectIds.has(pId)) {
        if (!projectInvestments[pId]) projectInvestments[pId] = 0;
        projectInvestments[pId] += isPurchase ? amt : -amt;

        if (platId) {
          if (!platformInvestments[platId]) platformInvestments[platId] = 0;
          platformInvestments[platId] += isPurchase ? amt : -amt;
        }
      }
    });

    // 3. Rental income and expenses per project
    const projectRents = {};

    filteredProjects.forEach(p => {
      const pId = p.id;
      const incomeCebe = String(p.incomeCebeId || '').trim().replace(/^(CEBE|CECO)/i, '');
      const expenseCeco = String(p.expenseCecoId || '').trim().replace(/^(CEBE|CECO)/i, '');

      let gross = 0;
      let expenses = 0;

      journalEntries.forEach(entry => {
        // Match income entries by CEBE
        if (incomeCebe) {
          const entryCebe = String(entry.cebe || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCebe && entryCebe.startsWith(incomeCebe)) {
            gross += parseFloat(entry.total) || 0;
          }
        }

        // Match expense entries by CECO
        if (expenseCeco) {
          const entryCeco = String(entry.ceco || '').trim().replace(/^(CEBE|CECO)/i, '');
          if (entryCeco && entryCeco.startsWith(expenseCeco)) {
            expenses += parseFloat(entry.total) || 0;
          }
        }
      });

      projectRents[pId] = {
        gross,
        expenses,
        net: gross - expenses
      };
    });

    // 4. Group rows by active or platform
    let rows = [];

    if (groupBy === 'plataforma') {
      platforms.forEach(plat => {
        const platId = plat.id;
        const platName = plat.name || platId;

        const investment = platformInvestments[platId] || 0;
        let gross = 0;
        let expenses = 0;

        filteredProjects.forEach(p => {
          if (p.platformId === platId) {
            const rents = projectRents[p.id] || { gross: 0, expenses: 0, net: 0 };
            gross += rents.gross;
            expenses += rents.expenses;
          }
        });

        const netRents = gross - expenses;
        const totalGross = investment + gross;
        const totalNet = investment + netRents;
        const yieldGross = investment > 0 ? (gross / investment) * 100 : 0;
        const yieldNet = investment > 0 ? (netRents / investment) * 100 : 0;

        if (investment !== 0 || gross !== 0 || expenses !== 0) {
          rows.push({
            id: platId,
            groupName: platName,
            investment,
            grossRents: gross,
            expenses,
            netRents,
            totalGross,
            totalNet,
            yieldGross,
            yieldNet
          });
        }
      });
    } else {
      filteredProjects.forEach(p => {
        const pId = p.id;
        const pName = p.name || pId;
        const platform = platforms.find(pl => pl.id === p.platformId);
        const platformName = platform ? platform.name : (p.platformId || '-');

        const investment = projectInvestments[pId] || 0;
        const rents = projectRents[pId] || { gross: 0, expenses: 0, net: 0 };
        const gross = rents.gross;
        const expenses = rents.expenses;
        const netRents = rents.net;
        const totalGross = investment + gross;
        const totalNet = investment + netRents;
        const yieldGross = investment > 0 ? (gross / investment) * 100 : 0;
        const yieldNet = investment > 0 ? (netRents / investment) * 100 : 0;

        if (investment !== 0 || gross !== 0 || expenses !== 0) {
          rows.push({
            id: pId,
            groupName: `${pName} (${platformName})`,
            investment,
            grossRents: gross,
            expenses,
            netRents,
            totalGross,
            totalNet,
            yieldGross,
            yieldNet
          });
        }
      });
    }

    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => (r.groupName || '').toLowerCase().includes(q));
    }

    // 5. Compute Grand Totals (Summary)
    let totalInvested = 0;
    let totalRentasBrutas = 0;
    let totalGastos = 0;

    // Sum overall totals from the filtered projects
    filteredProjects.forEach(p => {
      totalInvested += projectInvestments[p.id] || 0;
      const rents = projectRents[p.id] || { gross: 0, expenses: 0, net: 0 };
      totalRentasBrutas += rents.gross;
      totalGastos += rents.expenses;
    });

    const totalRentasNetas = totalRentasBrutas - totalGastos;
    const totalCurrentValueGross = totalInvested + totalRentasBrutas;
    const totalCurrentValueNet = totalInvested + totalRentasNetas;

    const avgReturnGross = totalInvested > 0 ? (totalRentasBrutas / totalInvested) * 100 : 0;
    const avgReturnNet = totalInvested > 0 ? (totalRentasNetas / totalInvested) * 100 : 0;

    return {
      rows,
      summary: {
        totalInvested,
        totalCurrentValueGross,
        totalCurrentValueNet,
        totalReturnGross: totalRentasBrutas,
        totalReturnNet: totalRentasNetas,
        avgReturnGross,
        avgReturnNet
      }
    };
  }, [projects, platforms, transactions, journalEntries, groupBy, statusFilter, searchQuery]);

  const { rows, summary } = computedData;

  // Ribbon event handling
  useEffect(() => {
    const onNew = () => {
      alert("El Portfolio es una vista de reporte consolidado. Para añadir una inversión, por favor introduce una compra en 'Transacciones CF'. Para añadir un activo, hazlo en 'CF Activos'.");
    };
    const onEdit = () => {
      alert("El Portfolio es una vista de reporte consolidado. Para modificar los activos o sus operaciones, ve a 'CF Activos' o 'Transacciones CF'.");
    };
    const onDelete = () => {
      alert("El Portfolio es una vista de reporte consolidado. Las transacciones se eliminan desde 'Transacciones CF'.");
    };
    const onExport = (e) => {
      const format = e.detail?.format || 'csv';
      const cols = [
        { header: groupBy === 'plataforma' ? 'Plataforma' : 'Activo / Proyecto', dataKey: 'groupName' },
        { header: 'Inversión (€)', dataKey: 'investment' },
        { header: 'Rentas Brutas (€)', dataKey: 'grossRents' },
        { header: 'Gastos (€)', dataKey: 'expenses' },
        { header: 'Rentas Netas (€)', dataKey: 'netRents' },
        { header: 'Importe Total (€)', dataKey: 'totalGross' },
        { header: 'Importe Total Neto (€)', dataKey: 'totalNet' },
        { header: 'Rentabilidad Bruta (%)', dataKey: 'yieldGross' },
        { header: 'Rentabilidad Neta (%)', dataKey: 'yieldNet' }
      ];
      if (format === 'pdf') {
        exportToPDF(rows, cols, 'CF Portfolio', 'cf_portfolio.pdf');
      } else {
        handleExportFormat(rows, 'CF Portfolio', format);
      }
    };

    window.addEventListener('cf-portfolio:new', onNew);
    window.addEventListener('cf-portfolio:edit', onEdit);
    window.addEventListener('cf-portfolio:delete', onDelete);
    window.addEventListener('cf-portfolio:export', onExport);

    return () => {
      window.removeEventListener('cf-portfolio:new', onNew);
      window.removeEventListener('cf-portfolio:edit', onEdit);
      window.removeEventListener('cf-portfolio:delete', onDelete);
      window.removeEventListener('cf-portfolio:export', onExport);
    };
  }, [rows, groupBy]);

  return (
    <div className="w-full h-full bg-[#d4d0c8] flex flex-col p-1 overflow-hidden font-sans">
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-1 p-1.5 bg-[#f0f4f9] border border-gray-300 rounded-sm shrink-0 select-none">
        
        {/* Total Invertido */}
        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-full text-blue-600"><Building2 className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Total Invertido</p>
            <p className="text-[13px] font-bold text-slate-800 font-mono">{fmt(summary.totalInvested)} €</p>
          </div>
        </div>

        {/* Valor Actual (Neto / Bruto) */}
        <div className="bg-white p-2 border border-slate-300 rounded-sm shadow-sm flex items-center space-x-3">
          <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Valor Actual (Bruto / Neto)</p>
            <div className="flex items-center gap-1 font-mono text-[12px] font-bold">
              <span className="text-slate-700" title="Valor Bruto (con Rentas Brutas)">{fmt(summary.totalCurrentValueGross)}</span>
              <span className="text-gray-400">/</span>
              <span className="text-slate-900 font-extrabold" title="Valor Neto (con Rentas Netas)">{fmt(summary.totalCurrentValueNet)}</span>
              <span className="text-[10px] text-slate-500 font-normal">€</span>
            </div>
          </div>
        </div>

        {/* Retorno Actual (Neto / Bruto) */}
        <div className={`bg-white p-2 border rounded-sm shadow-sm flex items-center space-x-3 ${summary.totalReturnNet >= 0 ? 'border-green-300' : 'border-red-300'}`}>
          <div className={`p-2 rounded-full ${summary.totalReturnNet >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {summary.totalReturnNet >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[9px] uppercase font-bold text-gray-500">Retorno Actual (Bruto / Neto)</p>
            <div className="flex items-center gap-1 font-mono text-[12px] font-bold">
              <span className="text-green-600" title="Retorno Bruto">{summary.totalReturnGross >= 0 ? '+' : ''}{fmt(summary.totalReturnGross)}</span>
              <span className="text-gray-400">/</span>
              <span className="text-green-800 font-extrabold" title="Retorno Neto">{summary.totalReturnNet >= 0 ? '+' : ''}{fmt(summary.totalReturnNet)}</span>
              <span className="text-[10px] text-slate-500 font-normal">€</span>
            </div>
          </div>
        </div>

        {/* Rentabilidad Media (Neta / Bruta) */}
        <div className="bg-[#4e80c8] p-2 border border-blue-600 rounded-sm shadow-sm flex items-center space-x-3 text-white">
          <div className="p-2 bg-white/20 rounded-full text-white"><TrendingUp className="w-4 h-4" /></div>
          <div>
            <p className="text-[9px] uppercase font-bold text-white/80">Rentabilidad Media (Bruta / Neta)</p>
            <div className="flex items-center gap-1 font-mono text-[12px] font-bold">
              <span className="text-blue-100" title="Rentabilidad Bruta">{fmt(summary.avgReturnGross)}%</span>
              <span className="text-white/55">/</span>
              <span className="text-white font-extrabold" title="Rentabilidad Neta">{fmt(summary.avgReturnNet)}%</span>
            </div>
          </div>
        </div>

      </div>

      {/* Workspace Area */}
      <div className="flex flex-row flex-1 overflow-hidden bg-white relative">
        
        {/* Left Sidebar */}
        {showSidebar && (
          <ResizableSidebar className=" bg-[#f0f4f9] border-r border-gray-200 flex flex-col shrink-0 transition-all select-none">
            <div className="bg-[#e4ebf5] border-b border-gray-200 p-2 text-[12px] font-bold text-slate-700">
              Filtros
            </div>
            
            <div className="p-4 text-[11px] space-y-4 flex-1 overflow-auto">
              
              {/* Group By Filter */}
              <div className="space-y-2">
                <label className="text-slate-700 font-bold">Agrupar por:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="cfPortGroupBy" 
                      checked={groupBy === 'activo'} 
                      onChange={() => setGroupBy('activo')} 
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" 
                    />
                    <span className={groupBy === 'activo' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Activo / Proyecto</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="cfPortGroupBy" 
                      checked={groupBy === 'plataforma'} 
                      onChange={() => setGroupBy('plataforma')} 
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" 
                    />
                    <span className={groupBy === 'plataforma' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Plataforma</span>
                  </label>
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2 pt-2 border-t border-gray-300">
                <label className="text-slate-700 font-bold">Estado del Activo:</label>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="cfPortStatus" 
                      checked={statusFilter === 'todos'} 
                      onChange={() => setStatusFilter('todos')} 
                      className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" 
                    />
                    <span className={statusFilter === 'todos' ? 'text-indigo-700 font-bold' : 'text-slate-700'}>Todos</span>
                  </label>
                  {STATUSES.map((s) => (
                    <label key={s} className="flex items-center space-x-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="cfPortStatus" 
                        checked={statusFilter === s} 
                        onChange={() => setStatusFilter(s)} 
                        className="text-indigo-600 focus:ring-indigo-500 cursor-pointer text-xs" 
                      />
                      <span className={statusFilter === s ? 'text-indigo-700 font-bold' : 'text-slate-700'}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stats Summary info */}
              <div className="pt-2 border-t border-gray-300 space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Estadísticas Filtradas</p>
                <p className="text-slate-700">Registros en Cartera: <span className="font-bold text-slate-900">{rows.length}</span></p>
                <p className="text-slate-700">Total Proyectos: <span className="font-bold text-slate-900">{projects.length}</span></p>
                <p className="text-slate-700">Total Plataformas: <span className="font-bold text-slate-900">{platforms.length}</span></p>
              </div>

            </div>
          </ResizableSidebar>
        )}

        {isMobile && showSidebar && (
          <div className="absolute inset-0 z-45 bg-black/30" onClick={() => setShowSidebar(false)} />
        )}

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          
          {/* Header Toolbar */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200 bg-[#f8fafc] select-none shrink-0">
            <div className="flex items-center space-x-3">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSidebar(!showSidebar); }}
                className="p-1.5 hover:bg-gray-100 rounded text-gray-500 border border-transparent hover:border-gray-300 flex items-center justify-center cursor-pointer"
                title={showSidebar ? "Ocultar panel" : "Mostrar panel"}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-2 pr-8 py-1 border-b border-gray-400 text-[12px] w-64 outline-none focus:border-blue-500 bg-transparent font-sans"
              />
              <Search className="w-4 h-4 absolute right-1 top-1/2 -translate-y-1/2 text-gray-500" />
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto border-b border-gray-200 bg-white relative">
            <table style={{ zoom: tableZoom }} className="clean-table">
              <thead>
                <tr>
                  {visibleColumns.includes('groupName') && (
                    <th style={{ width: columnWidths['groupName'] || '250px' }}>
                      {groupBy === 'plataforma' ? 'Plataforma' : 'Activo / Proyecto'}
                    </th>
                  )}
                  {visibleColumns.includes('investment') && <th style={{ width: columnWidths['investment'] || '120px' }} className="text-right">Inversión</th>}
                  {visibleColumns.includes('grossRents') && <th style={{ width: columnWidths['grossRents'] || '120px' }} className="text-right">Rentas Brutas</th>}
                  {visibleColumns.includes('expenses') && <th style={{ width: columnWidths['expenses'] || '110px' }} className="text-right">Gastos</th>}
                  {visibleColumns.includes('netRents') && <th style={{ width: columnWidths['netRents'] || '120px' }} className="text-right">Rentas Netas</th>}
                  {visibleColumns.includes('totalGross') && <th style={{ width: columnWidths['totalGross'] || '135px' }} className="text-right">Importe Total</th>}
                  {visibleColumns.includes('totalNet') && <th style={{ width: columnWidths['totalNet'] || '145px' }} className="text-right">Imp. Total Neto</th>}
                  {visibleColumns.includes('yieldGross') && <th style={{ width: columnWidths['yieldGross'] || '110px' }} className="text-right">Rent. Bruta</th>}
                  {visibleColumns.includes('yieldNet') && <th style={{ width: columnWidths['yieldNet'] || '110px' }} className="text-right">Rent. Neta</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="text-center py-8 text-gray-400 font-medium">
                      No hay datos en el Portfolio. Registra transacciones contables o de activos para ver tu cartera.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      {visibleColumns.includes('groupName') && <td className="font-semibold text-slate-700">{row.groupName}</td>}
                      {visibleColumns.includes('investment') && <td className="text-right font-mono">{fmt(row.investment)} €</td>}
                      {visibleColumns.includes('grossRents') && <td className="text-right font-mono text-green-600">{fmt(row.grossRents)} €</td>}
                      {visibleColumns.includes('expenses') && <td className="text-right font-mono text-red-500">{fmt(row.expenses)} €</td>}
                      {visibleColumns.includes('netRents') && <td className="text-right font-mono text-green-700 font-bold">{fmt(row.netRents)} €</td>}
                      {visibleColumns.includes('totalGross') && <td className="text-right font-mono">{fmt(row.totalGross)} €</td>}
                      {visibleColumns.includes('totalNet') && <td className="text-right font-mono font-bold text-slate-900">{fmt(row.totalNet)} €</td>}
                      {visibleColumns.includes('yieldGross') && <td className="text-right font-mono text-blue-600">{fmt(row.yieldGross)} %</td>}
                      {visibleColumns.includes('yieldNet') && <td className="text-right font-mono text-blue-800 font-bold">{fmt(row.yieldNet)} %</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Status Bar */}
          <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px] select-none shrink-0">
            <div>{rows.length} registros en cartera</div>
            <ZoomControl />
          </div>

        </div>

      </div>

    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  Printer, 
  BookOpen, 
  FileText, 
  Columns, 
  Building2, 
  Key, 
  Users, 
  Calendar, 
  RefreshCw, 
  CheckCircle 
} from 'lucide-react';

const SpanishAccountingNames = {
  '1': 'Financiación Básica',
  '2': 'Activo no Corriente',
  '3': 'Existencias',
  '4': 'Acreedores y Deudores',
  '5': 'Cuentas Financieras',
  '6': 'Compras y Gastos',
  '7': 'Ventas e Ingresos',
  
  '10': 'Capital',
  '17': 'Deudas a Largo Plazo',
  '21': 'Inmovilizaciones Materiales',
  '25': 'Otras Inversiones Financieras',
  '40': 'Proveedores',
  '41': 'Acreedores Varios',
  '43': 'Clientes / Inquilinos',
  '47': 'Administraciones Públicas',
  '57': 'Tesorería (Bancos/Caja)',
  '62': 'Servicios Exteriores',
  '629': 'Otros Servicios (Comunidad/Reformas)',
  '75': 'Otros Ingresos de Gestión',
  '752': 'Ingresos por Arrendamientos'
};

const getSelectableAccounts = (accountsList) => {
  const map = new Map();
  
  accountsList.forEach(a => {
    if (a.code) {
      map.set(String(a.code), { code: String(a.code), name: a.name, isDetail: true });
    }
  });
  
  accountsList.forEach(a => {
    if (!a.code) return;
    const str = String(a.code);
    
    [1, 2, 3].forEach(len => {
      if (str.length > len) {
        const prefix = str.substring(0, len);
        if (!map.has(prefix)) {
          const standardName = SpanishAccountingNames[prefix] || `Grupo/Subgrupo ${prefix}`;
          map.set(prefix, { code: prefix, name: standardName, isDetail: false });
        }
      }
    });
  });
  
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
};

const isAccountMatched = (accountCodeOrId, selectedAccounts, accountsList) => {
  if (!selectedAccounts || selectedAccounts.length === 0) return true;
  let code = accountCodeOrId;
  const acct = accountsList.find(a => a.id === code || a.code === code);
  if (acct) {
    code = acct.code;
  }
  if (!code) return false;
  return selectedAccounts.some(sel => {
    return String(code).startsWith(String(sel));
  });
};

export default function PrintPage() {
  const { user, queryUserIds } = useAuth();
  
  // States for selected report template and filter
  const [selectedTemplate, setSelectedTemplate] = useState('diario'); // diario, mayor, sumas_saldos, activos, alquileres, clientes
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedYears, setSelectedYears] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [selectedQuarters, setSelectedQuarters] = useState([]);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  
  // Database collections states
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscriptions to Firestore
  useEffect(() => {
    if (!user) return;
    const userIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
    
    setLoading(true);
    
    const unsubAccounts = onSnapshot(
      query(collection(db, 'accounts'), where('userId', 'in', userIds)),
      (snap) => {
        setAccounts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubEntries = onSnapshot(
      query(collection(db, 'journal_entries'), where('userId', 'in', userIds)),
      (snap) => {
        setJournalEntries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubProperties = onSnapshot(
      query(collection(db, 'properties'), where('userId', 'in', userIds)),
      (snap) => {
        setProperties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubRentals = onSnapshot(
      query(collection(db, 'rentals'), where('userId', 'in', userIds)),
      (snap) => {
        setRentals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCustomers = onSnapshot(
      query(collection(db, 'customers'), where('userId', 'in', userIds)),
      (snap) => {
        setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // Let loading finish after some time or when main data is retrieved
    const timer = setTimeout(() => setLoading(false), 800);

    return () => {
      unsubAccounts();
      unsubEntries();
      unsubProperties();
      unsubRentals();
      unsubCustomers();
      clearTimeout(timer);
    };
  }, [user, queryUserIds]);

  // Extract unique years from journal entries
  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    journalEntries.forEach(entry => {
      if (entry.date) {
        const y = new Date(entry.date).getFullYear();
        if (y) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [journalEntries]);

  // Hierarchical selectable accounts list
  const selectableAccountsList = useMemo(() => {
    return getSelectableAccounts(accounts);
  }, [accounts]);

  // Combined timeline and dropdown filters for print entries
  const filteredEntriesForPrint = useMemo(() => {
    let list = journalEntries;
    
    // 1. Year filter (either timeline or dropdown)
    if (selectedYears.length > 0) {
      list = list.filter(entry => {
        if (!entry.date) return false;
        const yr = new Date(entry.date).getFullYear().toString();
        return selectedYears.includes(yr);
      });
    } else {
      list = list.filter(entry => {
        if (!entry.date) return false;
        return new Date(entry.date).getFullYear() === selectedYear;
      });
    }
    
    // 2. Month / Quarter filters from timeline
    if (selectedMonths.length > 0 || selectedQuarters.length > 0) {
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      list = list.filter(entry => {
        if (!entry.date) return false;
        const m = new Date(entry.date).getMonth();
        
        const matchMonth = selectedMonths.includes(months[m]);
        const matchQuarter = selectedQuarters.some(q => {
          if (q === '1T') return [0, 1, 2].includes(m);
          if (q === '2T') return [3, 4, 5].includes(m);
          if (q === '3T') return [6, 7, 8].includes(m);
          if (q === '4T') return [9, 10, 11].includes(m);
          return false;
        });
        
        if (selectedMonths.length > 0 && selectedQuarters.length > 0) {
          return matchMonth || matchQuarter;
        } else if (selectedMonths.length > 0) {
          return matchMonth;
        } else {
          return matchQuarter;
        }
      });
    }
    
    return list;
  }, [journalEntries, selectedYear, selectedYears, selectedMonths, selectedQuarters]);

  // Handle Print execution
  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleExecutePrint = () => {
      window.print();
    };
    window.addEventListener('print:execute', handleExecutePrint);
    return () => window.removeEventListener('print:execute', handleExecutePrint);
  }, []);

  // Helper to format currency (no € symbol, trailing minus sign, clean alignment)
  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    const formatted = Math.abs(num).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num < 0 ? `${formatted}-` : `${formatted}\u00a0`;
  };

  // Helper for sentence case names
  const formatAccountName = (name) => {
    if (!name) return '';
    const lower = name.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  // Chunking helper for Diario de Movimientos (increased to 28 for fuller A4 page)
  const chunkDiario = (entriesList, maxRowsPerPage = 28) => {
    const pages = [];
    let currentPage = [];
    let currentRowCount = 0;
    
    entriesList.forEach(entry => {
      const entryRowsCount = 1 + (entry.lines ? entry.lines.length : 0);
      if (currentRowCount + entryRowsCount > maxRowsPerPage && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [entry];
        currentRowCount = entryRowsCount;
      } else {
        currentPage.push(entry);
        currentRowCount += entryRowsCount;
      }
    });
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  };

  // Chunking helper for Libro Mayor (increased to 32 for fuller A4 page)
  const chunkMayor = (activeAccounts, maxLinesPerPage = 32) => {
    const pages = [];
    let currentPageBlocks = [];
    let currentLineCount = 0;

    activeAccounts.forEach(am => {
      const totalMovementLines = am.lines.length;
      if (currentLineCount + totalMovementLines + 3 <= maxLinesPerPage) {
        currentPageBlocks.push({
          account: am.account,
          lines: am.lines,
          debitSum: am.debitSum,
          creditSum: am.creditSum,
          isFirst: true,
          isLast: true
        });
        currentLineCount += totalMovementLines + 3;
      } else {
        let remainingLines = [...am.lines];
        let pageIdx = 0;
        
        while (remainingLines.length > 0) {
          if (currentPageBlocks.length > 0 && currentLineCount + 4 > maxLinesPerPage) {
            pages.push(currentPageBlocks);
            currentPageBlocks = [];
            currentLineCount = 0;
          }
          
          const availableSlots = maxLinesPerPage - currentLineCount - 3;
          if (availableSlots <= 0) {
            pages.push(currentPageBlocks);
            currentPageBlocks = [];
            currentLineCount = 0;
            continue;
          }

          const chunkLines = remainingLines.slice(0, availableSlots);
          remainingLines = remainingLines.slice(availableSlots);
          
          currentPageBlocks.push({
            account: am.account,
            lines: chunkLines,
            debitSum: am.debitSum,
            creditSum: am.creditSum,
            isFirst: pageIdx === 0,
            isLast: remainingLines.length === 0,
            pageIdx: pageIdx
          });
          
          currentLineCount += chunkLines.length + 3;
          pageIdx++;
        }
      }
    });

    if (currentPageBlocks.length > 0) {
      pages.push(currentPageBlocks);
    }
    return pages;
  };

  // Flat list chunker
  const chunkFlatList = (list, itemsPerPage = 34) => {
    const pages = [];
    for (let i = 0; i < list.length; i += itemsPerPage) {
      pages.push(list.slice(i, i + itemsPerPage));
    }
    return pages;
  };

  // Reusable Page Header
  const renderPageHeader = (title) => {
    const isAccounting = ['Diario de Movimientos', 'Libro Mayor de Cuentas', 'Balance de Sumas y Saldos'].includes(title);
    const subtitle = isAccounting
      ? `Ejercicio Contable: ${selectedYears.length > 0 ? selectedYears.join(', ') : selectedYear}${selectedMonths.length > 0 || selectedQuarters.length > 0 ? ` (${[...selectedQuarters, ...selectedMonths].join(', ')})` : ''}`
      : `Ejercicio Contable: ${selectedYear}`;
    return (
      <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-end mb-4 select-none">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-slate-900">{title}</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase">{subtitle}</p>
        </div>
        <div className="text-right text-[10px] text-slate-500 font-mono">
          Fecha Emisión: {new Date().toLocaleDateString()}
        </div>
      </div>
    );
  };

  // Reusable Page Footer
  const renderPageFooter = (currentPage, totalPages, auditNumber) => {
    return (
      <div className="mt-auto pt-6 border-t border-slate-200 flex justify-between items-end text-[8px] text-slate-400 select-none">
        <div>
          <p className="font-bold text-slate-500">NEXO FINANCE CORP</p>
          <p>Generado mediante el módulo oficial de informes y auditoría contable.</p>
        </div>
        <div className="text-right">
          <p>Página {currentPage} de {totalPages}</p>
          <p className="font-mono">Auditoría Nº NEXO-{auditNumber}</p>
        </div>
      </div>
    );
  };

  // Paginated Rendering
  const renderPages = () => {
    const pageViews = [];
    const auditNumber = useMemo(() => Math.floor(Math.random() * 900000 + 100000), [selectedTemplate, selectedYear]);

    // 1. DIARIO DE MOVIMIENTOS
    if (selectedTemplate === 'diario') {
      const yearEntries = filteredEntriesForPrint
        .map(entry => {
          if (!entry.lines) return entry;
          const filteredLines = entry.lines.filter(l => 
            isAccountMatched(l.accountId, selectedAccounts, accounts)
          );
          return { ...entry, lines: filteredLines };
        })
        .filter(entry => entry.lines && entry.lines.length > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      const entryPages = chunkDiario(yearEntries, 28);
      const totalPages = entryPages.length || 1;

      if (entryPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Diario de Movimientos')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay asientos contables registrados para este año.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        entryPages.forEach((pageEntries, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Diario de Movimientos')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Fecha</th>
                      <th className="py-2 px-1 text-left w-16">Asiento Nº</th>
                      <th className="py-2 px-1 text-left">Concepto / Cuenta</th>
                      <th className="py-2 px-1 text-left w-20">CEBE/CECO</th>
                      <th className="py-2 px-1 text-right w-24">Debe</th>
                      <th className="py-2 px-1 text-right w-24">Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.flatMap((entry, entryIndex) => {
                      const rows = [];
                      rows.push(
                        <tr key={`entry-${entry.id}`} className="font-bold border-t border-slate-200">
                          <td className="py-1 px-1 text-slate-600">{new Date(entry.date).toLocaleDateString()}</td>
                          <td className="py-1 px-1 text-slate-600">{entry.number || entryIndex + 1}</td>
                          <td className="py-1 px-1 text-slate-900 uppercase" colSpan="2">{entry.description}</td>
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(entry.total)}</td>
                          <td className="py-1 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(entry.total)}</td>
                        </tr>
                      );
                      if (entry.lines) {
                        const uniqueCebes = new Set();
                        const uniqueCecos = new Set();
                        if (entry.cebe) uniqueCebes.add(entry.cebe);
                        if (entry.ceco) uniqueCecos.add(entry.ceco);
                        entry.lines.forEach(l => {
                          if (l.cebe) uniqueCebes.add(l.cebe);
                          if (l.ceco) uniqueCecos.add(l.ceco);
                        });

                        const centerDisplays = [];
                        uniqueCebes.forEach(c => centerDisplays.push(`CEBE: ${c}`));
                        uniqueCecos.forEach(c => centerDisplays.push(`CECO: ${c}`));

                        entry.lines.forEach((line, lineIndex) => {
                          const account = accounts.find(a => a.id === line.accountId);
                          const accDisplay = account ? `${account.code} - ${formatAccountName(account.name)}` : line.accountId || 'Cuenta';
                          const centerDisplay = centerDisplays[lineIndex] || '';
                          rows.push(
                            <tr key={`line-${entry.id}-${lineIndex}`} className="hover:bg-slate-50">
                              <td className="py-0.5 px-1" colSpan="2"></td>
                              <td className="py-0.5 px-1 text-slate-600 pl-4">{accDisplay}</td>
                              <td className="py-0.5 px-1 font-mono text-[9px] text-slate-500">{centerDisplay}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-600">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-600">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                            </tr>
                          );
                        });
                      }
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 2. LIBRO MAYOR
    if (selectedTemplate === 'mayor') {
      const yearEntries = filteredEntriesForPrint;
      const accountMovements = {};
      accounts.forEach(acc => {
        accountMovements[acc.id] = { account: acc, lines: [], debitSum: 0, creditSum: 0 };
      });
      yearEntries.forEach(entry => {
        if (entry.lines) {
          entry.lines.forEach(line => {
            if (accountMovements[line.accountId]) {
              const debit = parseFloat(line.debit) || 0;
              const credit = parseFloat(line.credit) || 0;
              accountMovements[line.accountId].lines.push({
                date: entry.date,
                entryNo: entry.number,
                description: entry.description,
                debit,
                credit
              });
              accountMovements[line.accountId].debitSum += debit;
              accountMovements[line.accountId].creditSum += credit;
            }
          });
        }
      });

      const activeAccounts = Object.values(accountMovements)
        .filter(am => am.lines.length > 0 && isAccountMatched(am.account.code, selectedAccounts, accounts))
        .sort((a, b) => (a.account.code || '').localeCompare(b.account.code || ''));

      const mayorPages = chunkMayor(activeAccounts, 32);
      const totalPages = mayorPages.length || 1;

      if (mayorPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Libro Mayor de Cuentas')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay movimientos registrados para este año.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        mayorPages.forEach((pageBlocks, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div className="flex flex-col gap-4">
                {renderPageHeader('Libro Mayor de Cuentas')}
                {pageBlocks.map((block, bIdx) => {
                  let runningBalance = 0;
                  const isAssetOrExpense = ['Activo', 'Gasto'].includes(block.account.type);
                  
                  if (!block.isFirst) {
                    const allAccLines = accountMovements[block.account.id].lines;
                    const precedingLines = allAccLines.slice(0, allAccLines.indexOf(block.lines[0]));
                    precedingLines.forEach(l => {
                      const move = l.debit - l.credit;
                      runningBalance += isAssetOrExpense ? move : -move;
                    });
                  }

                  return (
                    <div key={bIdx} className="mb-2 break-inside-avoid">
                      <div className="bg-slate-100 p-1 border border-slate-300 font-bold text-slate-800 flex justify-between text-[9px] mb-1.5 uppercase">
                        <span>Cuenta: {block.account.code} - {formatAccountName(block.account.name)} {!block.isFirst && `(Continuación - Pág. ${block.pageIdx + 1})`}</span>
                        <span>Tipo: {block.account.type}</span>
                      </div>
                      <table className="w-full text-[8.5px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-300 font-semibold text-slate-600">
                            <th className="py-0.5 px-1 text-left w-16">Fecha</th>
                            <th className="py-0.5 px-1 text-center w-12">Asiento</th>
                            <th className="py-0.5 px-1 text-left">Concepto</th>
                            <th className="py-0.5 px-1 text-right w-20">Debe</th>
                            <th className="py-0.5 px-1 text-right w-20">Haber</th>
                            <th className="py-0.5 px-1 text-right w-24">Saldo Acum.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!block.isFirst && (
                            <tr className="bg-slate-50 italic font-semibold text-slate-500">
                              <td className="py-0.5 px-1" colSpan="3">Saldo anterior (Arrastrado):</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums" colSpan="3">{formatCurrency(runningBalance)}</td>
                            </tr>
                          )}
                          {block.lines.map((line, idx) => {
                            const movement = line.debit - line.credit;
                            runningBalance += isAssetOrExpense ? movement : -movement;
                            return (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-0.5 px-1">{new Date(line.date).toLocaleDateString()}</td>
                                <td className="py-0.5 px-1 text-center font-mono">{line.entryNo || '-'}</td>
                                <td className="py-0.5 px-1 truncate max-w-[200px] uppercase">{line.description}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-650">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-650">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                                <td className="py-0.5 px-1 text-right font-sans tabular-nums font-bold text-slate-850">{formatCurrency(runningBalance)}</td>
                              </tr>
                            );
                          })}
                          {block.isLast && (
                            <tr className="bg-slate-50 font-bold border-t border-slate-300 text-[8.5px]">
                              <td className="py-0.5 px-1" colSpan="3">Suma de Movimientos y Saldo Final:</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(block.debitSum)}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(block.creditSum)}</td>
                              <td className="py-0.5 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(runningBalance)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 3. BALANCE DE SUMAS Y SALDOS
    if (selectedTemplate === 'sumas_saldos') {
      const yearEntries = filteredEntriesForPrint;
      const sumsMap = {};
      accounts.forEach(acc => {
        sumsMap[acc.id] = { code: acc.code, name: acc.name, type: acc.type, debit: 0, credit: 0 };
      });
      yearEntries.forEach(entry => {
        if (entry.lines) {
          entry.lines.forEach(line => {
            if (sumsMap[line.accountId]) {
              sumsMap[line.accountId].debit += parseFloat(line.debit) || 0;
              sumsMap[line.accountId].credit += parseFloat(line.credit) || 0;
            }
          });
        }
      });

      const list = Object.values(sumsMap)
        .filter(s => (s.debit > 0 || s.credit > 0) && isAccountMatched(s.code, selectedAccounts, accounts))
        .map(s => {
          const isAssetOrExpense = ['Activo', 'Gasto'].includes(s.type);
          const balanceDiff = s.debit - s.credit;
          return {
            ...s,
            debitBalance: isAssetOrExpense ? (balanceDiff > 0 ? balanceDiff : 0) : (balanceDiff < 0 ? Math.abs(balanceDiff) : 0),
            creditBalance: isAssetOrExpense ? (balanceDiff < 0 ? Math.abs(balanceDiff) : 0) : (balanceDiff > 0 ? balanceDiff : 0)
          };
        })
        .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

      const totals = list.reduce((t, acc) => {
        t.debitSum += acc.debit;
        t.creditSum += acc.credit;
        t.debitBalSum += acc.debitBalance;
        t.creditBalSum += acc.creditBalance;
        return t;
      }, { debitSum: 0, creditSum: 0, debitBalSum: 0, creditBalSum: 0 });

      const listPages = chunkFlatList(list, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Balance de Sumas y Saldos')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay cuentas con saldos para este ejercicio.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Balance de Sumas y Saldos')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-20">Código</th>
                      <th className="py-2 px-1 text-left">Cuenta</th>
                      <th className="py-2 px-1 text-right w-24">Sumas Debe</th>
                      <th className="py-2 px-1 text-right w-24">Sumas Haber</th>
                      <th className="py-2 px-1 text-right w-24">Saldo Deudor</th>
                      <th className="py-2 px-1 text-right w-24">Saldo Acreedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(acc => (
                      <tr key={acc.code} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-1 font-mono">{acc.code}</td>
                        <td className="py-1.5 px-1 font-bold text-slate-800 uppercase">{formatAccountName(acc.name)}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-650">{acc.debit > 0 ? formatCurrency(acc.debit) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums text-slate-650">{acc.credit > 0 ? formatCurrency(acc.credit) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums font-semibold text-blue-800">{acc.debitBalance > 0 ? formatCurrency(acc.debitBalance) : '0,00'}</td>
                        <td className="py-1.5 px-1 text-right font-sans tabular-nums font-semibold text-amber-900">{acc.creditBalance > 0 ? formatCurrency(acc.creditBalance) : '0,00'}</td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1" colSpan="2">TOTAL GENERAL:</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.debitSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(totals.creditSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-blue-900">{formatCurrency(totals.debitBalSum)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-amber-955">{formatCurrency(totals.creditBalSum)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 4. INVENTARIO DE ACTIVOS INMOBILIARIOS
    if (selectedTemplate === 'activos') {
      const listPages = chunkFlatList(properties, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Inventario de Activos Inmobiliarios')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay activos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Inventario de Activos Inmobiliarios')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">ID</th>
                      <th className="py-2 px-1 text-left w-32">Nombre Finca</th>
                      <th className="py-2 px-1 text-left">Dirección</th>
                      <th className="py-2 px-1 text-left w-20">CEBE/CECO</th>
                      <th className="py-2 px-1 text-center w-24">Cuenta Contable</th>
                      <th className="py-2 px-1 text-right w-24">Hip. Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono font-bold text-slate-650">{p.id}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{p.name}</td>
                        <td className="py-2 px-1 uppercase">{p.address}, {p.city}</td>
                        <td className="py-2 px-1 font-mono text-[9px] text-slate-500">
                          <div>BE: {p.cebe || '---'}</div>
                          <div>CO: {p.ceco || '---'}</div>
                        </td>
                        <td className="py-2 px-1 text-center font-mono">{p.accountingAccount || '---'}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums font-semibold text-red-650">
                          {p.mortgagePending > 0 ? formatCurrency(p.mortgagePending) : '0,00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 5. CONTRATOS DE ALQUILER
    if (selectedTemplate === 'alquileres') {
      const listPages = chunkFlatList(rentals, 32);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Listado de Contratos de Alquiler')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay contratos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Listado de Contratos de Alquiler')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Referencia</th>
                      <th className="py-2 px-1 text-left w-36">Inmueble</th>
                      <th className="py-2 px-1 text-left">Inquilinos</th>
                      <th className="py-2 px-1 text-center w-24">Período</th>
                      <th className="py-2 px-1 text-right w-20">Fianza</th>
                      <th className="py-2 px-1 text-right w-20">Renta</th>
                      <th className="py-2 px-1 text-center w-16">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(r => {
                      const prop = properties.find(p => p.id === r.propertyId);
                      const cust = customers.find(c => c.id === r.tenantId);
                      const tenantDisplay = r.tenants?.length > 0 
                        ? r.tenants.map(t => t.name).join(', ') 
                        : (cust ? cust.name : 'Ninguno');
                      
                      return (
                        <tr key={r.id || r.reference} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-1 font-mono font-bold text-slate-650">{r.reference || '---'}</td>
                          <td className="py-2 px-1 uppercase font-bold text-slate-800">{prop ? prop.name : r.propertyId}</td>
                          <td className="py-2 px-1 uppercase">{tenantDisplay}</td>
                          <td className="py-2 px-1 text-center font-mono text-[9px]">
                            {r.startDate ? new Date(r.startDate).toLocaleDateString() : '---'} al <br/>
                            {r.endDate ? new Date(r.endDate).toLocaleDateString() : 'INDET.'}
                          </td>
                          <td className="py-2 px-1 text-right font-sans tabular-nums">{r.depositAmount > 0 ? formatCurrency(r.depositAmount) : '---'}</td>
                          <td className="py-2 px-1 text-right font-sans tabular-nums font-bold text-green-700">{formatCurrency(r.rentAmount)}</td>
                          <td className="py-2 px-1 text-center uppercase font-bold text-[9px]">
                            <span className={`px-1 py-0.5 rounded ${r.status === 'activo' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                              {r.status || 'activo'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    // 6. FICHERO DE CLIENTES / INQUILINOS
    if (selectedTemplate === 'clientes') {
      const listPages = chunkFlatList(customers, 34);
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty" className="page-sheet relative">
            {renderPageHeader('Fichero General de Clientes / Arrendatarios')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay inquilinos registrados.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={pageIdx} className="page-sheet relative">
              <div>
                {renderPageHeader('Fichero General de Clientes / Arrendatarios')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">ID</th>
                      <th className="py-2 px-1 text-left w-36">Nombre Completo</th>
                      <th className="py-2 px-1 text-left w-24">NIF/DNI</th>
                      <th className="py-2 px-1 text-left w-24">Teléfono</th>
                      <th className="py-2 px-1 text-left">Correo Electrónico</th>
                      <th className="py-2 px-1 text-center w-16">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(c => (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono text-slate-650">{c.id?.substring(0, 6)}</td>
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{c.name} {c.lastName || ''}</td>
                        <td className="py-2 px-1 font-mono uppercase">{c.dni || '---'}</td>
                        <td className="py-2 px-1 font-mono">{c.phone || '---'}</td>
                        <td className="py-2 px-1 lowercase truncate max-w-[150px] text-slate-600" title={c.email}>{c.email || '---'}</td>
                        <td className="py-2 px-1 text-center uppercase font-bold text-[9px]">
                          <span className={`px-1.5 py-0.5 rounded ${c.status === 'activo' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                            {c.status || 'activo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }

    return pageViews;
  };

  return (
    <div className="flex flex-1 h-full min-h-0 bg-[#d4d0c8] overflow-hidden font-sans select-none p-2 gap-3 relative">
      {/* Print Stylesheet injection */}
      <style>{`
        .page-sheet {
          width: 210mm !important;
          height: 297mm !important;
          padding: 20mm !important;
          box-sizing: border-box !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          background-color: white !important;
          color: black !important;
          position: relative !important;
        }

        @media screen {
          .page-sheet {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
            border: 1px solid #cbd5e1 !important;
            margin-bottom: 24px !important;
          }
        }

        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-area, #print-area * {
            visibility: visible !important;
          }
          #print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .page-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Left panel - Templates list */}
      <div className="w-64 bg-[#f0f0f0] border border-[#808080] shrink-0 p-2 flex flex-col gap-3 win-bevel no-print">
        <div className="bg-white border border-[#a0a0a0] flex flex-col">
          <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[10px] border-b border-[#a0a0a0] text-slate-700">
            Plantillas Disponibles
          </div>
          {[
            { id: 'diario', name: 'Diario de Movimientos', icon: BookOpen },
            { id: 'mayor', name: 'Libro Mayor', icon: FileText },
            { id: 'sumas_saldos', name: 'Sumas y Saldos', icon: Columns },
            { id: 'activos', name: 'Inventario de Activos', icon: Building2 },
            { id: 'alquileres', name: 'Contratos de Alquiler', icon: Key },
            { id: 'clientes', name: 'Fichero de Clientes', icon: Users }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`w-full text-left px-3 py-2 text-[11px] transition-colors border-b border-slate-100 flex items-center gap-2 ${
                selectedTemplate === t.id
                  ? 'bg-[#c0c0c0] text-black font-semibold shadow-inner'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <t.icon className="w-4 h-4 text-blue-900/70 shrink-0" />
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        {/* Cuentas a Mostrar Filter (only for accounting reports) */}
        {['diario', 'mayor', 'sumas_saldos'].includes(selectedTemplate) && (
          <div className="bg-white border border-[#a0a0a0] flex flex-col flex-1 min-h-[200px] max-h-[350px] overflow-hidden">
            <div className="bg-[#cbd5e0] font-bold p-1.5 uppercase text-[9px] border-b border-[#a0a0a0] text-slate-700 flex justify-between items-center select-none shrink-0">
              <span>Cuentas a Mostrar</span>
              {selectedAccounts.length > 0 && (
                <button 
                  onClick={() => setSelectedAccounts([])}
                  className="text-[8px] text-blue-800 hover:underline lowercase font-semibold"
                >
                  [limpiar]
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 gap-1.5 flex flex-col bg-white">
              {selectableAccountsList.map(acc => {
                const indentClass = acc.code.length === 1 
                  ? '' 
                  : acc.code.length === 2 
                    ? 'pl-2' 
                    : acc.code.length === 3 
                      ? 'pl-4' 
                      : 'pl-6';
                
                const isSelected = selectedAccounts.includes(acc.code);
                
                return (
                  <label 
                    key={acc.code} 
                    className={`flex items-start gap-1.5 text-[10px] cursor-pointer hover:bg-slate-50 py-0.5 rounded select-none ${indentClass}`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedAccounts(prev => prev.filter(x => x !== acc.code));
                        } else {
                          setSelectedAccounts(prev => [...prev, acc.code]);
                        }
                      }}
                      className="mt-0.5"
                    />
                    <span className={`${!acc.isDetail ? 'font-bold text-slate-700' : 'text-slate-650'}`}>
                      {acc.code} - {acc.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Instruction Note */}
        <div className="mt-auto p-3 bg-blue-50 border border-blue-200 text-[10px] text-blue-800 leading-normal flex flex-col gap-1.5">
          <div className="font-bold flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>IMPRESIÓN EN NEXO</span>
          </div>
          <p>
            Al pulsar en <strong>Imprimir</strong> se abrirá la ventana de impresión nativa de tu navegador. 
            Hemos optimizado la hoja para ocultar el panel de Nexo e imprimir únicamente la hoja de reporte seleccionada.
          </p>
        </div>
      </div>

      {/* Quick Month Filter Bar (no-print) */}
      {['diario', 'mayor', 'sumas_saldos'].includes(selectedTemplate) && (
        <div className="w-10 bg-[#f0f0f0] border border-[#808080] flex flex-col items-center py-2 shrink-0 overflow-y-auto win-bevel no-print gap-1 select-none">
          {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => (
            <button 
              key={m} 
              onClick={() => setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
              className={`text-[9px] w-full text-center hover:font-bold py-0.5 transition-colors ${
                selectedMonths.includes(m) 
                  ? 'text-blue-700 font-bold bg-[#c0c0c0] shadow-inner' 
                  : 'text-slate-800 hover:text-blue-700'
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
          <div className="h-px bg-slate-400 w-full my-1"></div>
          {['1T', '2T', '3T', '4T'].map(t => (
            <button 
              key={t} 
              onClick={() => setSelectedQuarters(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
              className={`text-[9px] w-full text-center hover:font-bold py-0.5 transition-colors ${
                selectedQuarters.includes(t) 
                  ? 'text-blue-700 font-bold bg-[#c0c0c0] shadow-inner' 
                  : 'text-slate-800 hover:text-blue-700'
              }`}
            >
              {t}
            </button>
          ))}
          <div className="h-px bg-slate-400 w-full my-1"></div>
          {['2024', '2025', '2026', '2027'].map(yr => (
            <button 
              key={yr} 
              onClick={() => setSelectedYears(prev => prev.includes(yr) ? prev.filter(x => x !== yr) : [...prev, yr])}
              className={`text-[9px] w-full text-center hover:font-bold py-0.5 transition-colors ${
                selectedYears.includes(yr) 
                  ? 'text-blue-700 font-bold bg-[#c0c0c0] shadow-inner' 
                  : 'text-slate-800 hover:text-blue-700'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      )}

      {/* Main Preview Container */}
      <div className="flex-1 flex flex-col bg-[#526075]/20 border border-[#808080] win-bevel min-w-0 relative h-full">
        {/* Top Control Bar */}
        <div className="bg-[#f0f0f0] border-b border-[#808080] p-2 flex justify-between items-center shrink-0 no-print">
          <div className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-2">
            <span>Vista Previa de Impresión</span>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
          </div>

          <button
            onClick={handlePrint}
            className="btn-classic px-4 h-7 flex items-center gap-1.5 text-[11px] bg-blue-50 hover:bg-blue-100"
          >
            <Printer className="w-4 h-4 text-blue-850" />
            <span className="font-bold text-blue-950">IMPRIMIR REPORTE</span>
          </button>
        </div>

        {/* Paper Sheet Preview Area */}
        <div className="flex-1 overflow-auto p-4 flex justify-center bg-slate-400/30">
          <div 
            id="print-area" 
            className="flex flex-col gap-6 items-center animate-fadeIn"
          >
            {renderPages()}
          </div>
        </div>
      </div>
    </div>
  );
}

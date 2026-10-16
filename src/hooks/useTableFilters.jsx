import React, { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

let globalDraggedColumnKey = null;
let isDraggingColumn = false;

export const useTableFilters = ({ columnWidths = {}, updateColumnWidth = null } = {}) => {
  const { userPreferences, updatePreferences } = useAuth() || {};
  const [activeTableFilters, setActiveTableFilters] = useState({});
  const [openFilterMenu, setOpenFilterMenu] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Disabled loading old filters per user request
    if (!isLoaded) {
      setIsLoaded(true);
    }
  }, [isLoaded]);

  const persistFilters = (newFilters) => {
    // Disabled filter persistence per user request
  };
  
  // Custom hook to close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openFilterMenu && !e.target.closest('.filter-menu-popup') && !e.target.closest('.filter-btn')) {
        setOpenFilterMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openFilterMenu]);

  const getUniqueValues = (data, columnKey) => {
    if (!data || !Array.isArray(data)) return [];
    const values = data.map(item => {
      const val = item[columnKey];
      if (typeof val === 'number') {
        if (!Number.isInteger(val)) {
          return Number(val.toFixed(2)).toString();
        }
        return val.toString();
      }
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val?.toString() || '';
    });
    return [...new Set(values)].filter(Boolean).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b, 'es', { numeric: true });
    });
  };

  const [sortConfigs, setSortConfigs] = useState(() => {
    try {
      const saved = localStorage.getItem('app_table_sort_configs');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading sort configs from localStorage', e);
    }
    return {};
  });

  const [sortConfig, setSortConfig] = useState({ tableId: null, columnKey: null, direction: null });

  useEffect(() => {
    if (userPreferences?.tableSortConfigs && typeof userPreferences.tableSortConfigs === 'object') {
      setSortConfigs(prev => {
        const merged = { ...userPreferences.tableSortConfigs, ...prev };
        try {
          localStorage.setItem('app_table_sort_configs', JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    }
  }, [userPreferences]);

  const handleSort = (tableId, columnKey) => {
    setSortConfigs(prev => {
      const current = prev[tableId] || { columnKey: null, direction: null };
      let newDirection = 'asc';
      if (current.columnKey === columnKey) {
        if (current.direction === 'asc') newDirection = 'desc';
        else if (current.direction === 'desc') newDirection = null;
        else newDirection = 'asc';
      }
      
      const updated = {
        ...prev,
        [tableId]: newDirection ? { columnKey, direction: newDirection } : null
      };

      try {
        localStorage.setItem('app_table_sort_configs', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save sort configs to localStorage', err);
      }

      if (updatePreferences) {
        updatePreferences({
          ...(userPreferences || {}),
          tableSortConfigs: updated
        });
      }

      setSortConfig(newDirection ? { tableId, columnKey, direction: newDirection } : { tableId: null, columnKey: null, direction: null });

      return updated;
    });
  };

  const parseSortValue = (val, columnKey = '') => {
    if (val === undefined || val === null) {
      return { type: 'empty', val: null };
    }

    if (typeof val === 'number') {
      if (isNaN(val)) return { type: 'empty', val: null };
      return { type: 'number', val };
    }

    if (typeof val === 'boolean') {
      return { type: 'number', val: val ? 1 : 0 };
    }

    const str = String(val).trim();
    if (str === '' || str === '-' || str === '—' || str === 'N/A' || str === 'n/a' || str === '(Sin inquilino)' || str === 'Ninguno' || str === 'Sin cuenta') {
      return { type: 'empty', val: null };
    }

    const colLower = columnKey.toLowerCase();
    const isDateCol = colLower.includes('date') || colLower.includes('fecha') || colLower.includes('expiry') || colLower.includes('vencimiento') || colLower.includes('createdat') || colLower.includes('inicio') || colLower.includes('fin');

    if (isDateCol) {
      const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmyMatch) {
        const d = new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`);
        if (!isNaN(d.getTime())) return { type: 'date', val: d.getTime() };
      }
      const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (ymdMatch) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return { type: 'date', val: d.getTime() };
      }
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) return { type: 'date', val: parsed };
    }

    // Number or formatted number/currency (e.g. "1.250,50 €", "1250 €", "15 %", "-25.00")
    const cleanNum = str.replace(/[€$£%]/g, '').trim();
    if (/^[+-]?[\d\s.,]+$/.test(cleanNum)) {
      let numStr = cleanNum.replace(/\s+/g, '');
      const hasComma = numStr.includes(',');
      const hasDot = numStr.includes('.');

      if (hasComma && hasDot) {
        if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
          numStr = numStr.replace(/\./g, '').replace(',', '.');
        } else {
          numStr = numStr.replace(/,/g, '');
        }
      } else if (hasComma) {
        numStr = numStr.replace(',', '.');
      }
      const num = Number(numStr);
      if (!isNaN(num)) {
        return { type: 'number', val: num };
      }
    }

    return { type: 'string', val: str };
  };

  const applyTableSort = (data, tableId) => {
    if (!data || !Array.isArray(data) || data.length === 0) return data;
    const tableSort = sortConfigs[tableId] || (sortConfig.tableId === tableId ? sortConfig : null);
    if (!tableSort || !tableSort.columnKey || !tableSort.direction) return data;

    const { columnKey, direction } = tableSort;
    const mult = direction === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      const parsedA = parseSortValue(a[columnKey], columnKey);
      const parsedB = parseSortValue(b[columnKey], columnKey);

      // Empty values placed at bottom
      if (parsedA.type === 'empty' && parsedB.type === 'empty') return 0;
      if (parsedA.type === 'empty') return 1;
      if (parsedB.type === 'empty') return -1;

      if ((parsedA.type === 'number' && parsedB.type === 'number') || 
          (parsedA.type === 'date' && parsedB.type === 'date')) {
        return (parsedA.val - parsedB.val) * mult;
      }

      return String(parsedA.val).localeCompare(String(parsedB.val), 'es', { numeric: true, sensitivity: 'base' }) * mult;
    });
  };

  const applyTableFilters = (data, tableId) => {
    if (!data || !Array.isArray(data)) return [];
    const filters = activeTableFilters[tableId];
    let result = data;
    if (filters) {
      result = data.filter(item => {
        return Object.entries(filters).every(([columnKey, selectedValues]) => {
          // If selectedValues is undefined, it means "no filter" (show all).
          // If selectedValues is [], it means "nothing selected" (show none).
          if (selectedValues === undefined) return true;
          if (selectedValues.length === 0) return false;

          let val = item[columnKey];
          if (typeof val === 'number') {
            val = !Number.isInteger(val) ? Number(val.toFixed(2)).toString() : val.toString();
          } else if (typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          val = val?.toString() || '';
          return selectedValues.includes(val);
        });
      });
    }
    return applyTableSort(result, tableId);
  };

  const handleToggleFilterValue = (tableId, columnKey, value, allValues) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      let columnFilters = tableFilters[columnKey];
      if (columnFilters === undefined) {
        columnFilters = [...allValues];
      }
      
      const newColumnFilters = columnFilters.includes(value)
        ? columnFilters.filter(v => v !== value)
        : [...columnFilters, value];
        
      const newState = (() => {
        if (newColumnFilters.length === allValues.length) {
          return {
            ...prev,
            [tableId]: {
              ...tableFilters,
              [columnKey]: undefined
            }
          };
        }
        
        return {
          ...prev,
          [tableId]: {
            ...tableFilters,
            [columnKey]: newColumnFilters
          }
        };
      })();
      persistFilters(newState);
      return newState;
    });
  };

  const handleSelectAllFilters = (tableId, columnKey, select) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      const newState = {
        ...prev,
        [tableId]: {
          ...tableFilters,
          [columnKey]: select ? undefined : []
        }
      };
      persistFilters(newState);
      return newState;
    });
  };

  const clearAllFilters = () => {
    setActiveTableFilters({});
    persistFilters({});
  };

  const TableHeaderWithFilter = ({ label, columnKey, data, tableId, className = "", sortable = true }) => {
    const filterState = (activeTableFilters[tableId] || {})[columnKey];
    // It's active if it's NOT undefined (meaning some specific selection or empty array)
    const isActive = filterState !== undefined;
    
    const tableSort = sortConfigs[tableId] || (sortConfig.tableId === tableId ? sortConfig : null);
    const isSorted = tableSort && tableSort.columnKey === columnKey && Boolean(tableSort.direction);
    const sortDirection = isSorted ? tableSort.direction : null;

    const width = columnWidths[columnKey] || null;
    const style = width ? { width: `${width}px`, minWidth: `${width}px` } : {};

    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const th = e.currentTarget.parentElement;
      const startWidth = th.offsetWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      const handleMouseMove = (moveEvent) => {
        const newWidth = Math.max(30, startWidth + (moveEvent.clientX - startX));
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
        th.style.maxWidth = '';
      };

      const handleMouseUp = (upEvent) => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        const finalWidth = Math.max(30, startWidth + (upEvent.clientX - startX));
        
        if (updateColumnWidth && Math.abs(finalWidth - startWidth) > 2) {
          updateColumnWidth(columnKey, finalWidth);
        } else {
          const originalWidth = columnWidths[columnKey];
          if (originalWidth) {
            th.style.width = `${originalWidth}px`;
            th.style.minWidth = `${originalWidth}px`;
            th.style.maxWidth = '';
          } else {
            th.style.width = '';
            th.style.minWidth = '';
            th.style.maxWidth = '';
          }
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };
    
    return (
      <th 
        className={`${className} group relative hover:bg-slate-200/70 cursor-pointer select-none bg-inherit`} 
        style={style}
        onClick={() => {
          if (isDraggingColumn) return;
          if (sortable) {
            handleSort(tableId, columnKey);
          }
        }}
        title={sortable ? "Haz clic para ordenar" : ""}
      >
        <div
          className="w-full h-full"
          draggable
          onDragStart={(e) => {
            isDraggingColumn = true;
            globalDraggedColumnKey = columnKey;
            e.dataTransfer.setData('text/plain', columnKey);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnter={(e) => e.preventDefault()}
          onDragEnd={() => {
            globalDraggedColumnKey = null;
            setTimeout(() => { isDraggingColumn = false; }, 100);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain') || globalDraggedColumnKey;
            if (draggedId && draggedId !== columnKey) {
              window.dispatchEvent(new CustomEvent('reorder-column', { 
                detail: { draggedId, targetId: columnKey, tableId } 
              }));
            }
          }}
        >
          <div className="flex items-center justify-between h-full min-w-0 overflow-hidden">
            <div className="flex items-center gap-1 min-w-0 flex-1 pr-1">
              <span className="truncate min-w-0 block pointer-events-none">{label}</span>
              {sortable && (
                <span className="text-[10px] font-bold shrink-0 text-blue-700 ml-0.5">
                  {sortDirection === 'asc' ? '▲' : sortDirection === 'desc' ? '▼' : <span className="opacity-0 group-hover:opacity-40 text-slate-500">↕</span>}
                </span>
              )}
            </div>
            <button 
              className={`p-0.5 rounded-sm hover:bg-slate-300 transition-colors filter-btn flex-shrink-0 mr-1 ${isActive ? 'bg-slate-300 text-slate-700' : 'text-slate-400'}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const currentSaved = (activeTableFilters[tableId] || {})[columnKey];
                setOpenFilterMenu({
                  tableId,
                  columnKey,
                  x: rect.left,
                  y: rect.bottom + 2,
                  data,
                  draftSelected: currentSaved
                });
                setFilterSearch('');
              }}
              title="Filtrar columna"
            >
              <Filter className={`w-3 h-3 ${isActive ? 'fill-slate-400' : ''}`} />
            </button>
          </div>
          <div 
            className="absolute right-[-6px] top-0 bottom-0 w-3 cursor-col-resize hover:bg-slate-400/30 active:bg-slate-500/50 z-20"
            onMouseDown={handleMouseDown}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </th>
    );
  };

  const renderFilterMenu = () => {
    if (!openFilterMenu) return null;
    const { tableId, columnKey, x, y, data, draftSelected } = openFilterMenu;
    const allValues = getUniqueValues(data, columnKey);
    
    const filteredValues = allValues.filter(val => 
      val.toLowerCase().includes(filterSearch.toLowerCase())
    );

    const handleToggleDraft = (val) => {
      setOpenFilterMenu(prev => {
        if (!prev) return null;
        let current = prev.draftSelected;
        if (current === undefined) {
          current = [...allValues];
        }
        const updated = current.includes(val)
          ? current.filter(v => v !== val)
          : [...current, val];
        return { ...prev, draftSelected: updated };
      });
    };

    const handleSelectAllDraft = (select) => {
      setOpenFilterMenu(prev => prev ? { ...prev, draftSelected: select ? undefined : [] } : null);
    };

    const handleAccept = () => {
      let finalVal = draftSelected;
      if (Array.isArray(draftSelected) && draftSelected.length === allValues.length) {
        finalVal = undefined;
      }
      setActiveTableFilters(prev => {
        const tableFilters = prev[tableId] || {};
        const newState = {
          ...prev,
          [tableId]: {
            ...tableFilters,
            [columnKey]: finalVal
          }
        };
        persistFilters(newState);
        return newState;
      });
      setOpenFilterMenu(null);
    };

    return (
      <div 
        className="fixed z-50 bg-white border border-[#808080] shadow-lg win-bevel filter-menu-popup select-none"
        style={{ left: Math.min(x, window.innerWidth - 250), top: y, width: 230 }}
      >
        <div className="bg-[#f8fafc] text-gray-700 p-1 px-2 text-[11px] font-bold flex justify-between items-center cursor-default border-b border-[#d1d5db]">
          <span>Filtro: {columnKey}</span>
          <button onClick={() => setOpenFilterMenu(null)} className="hover:bg-gray-200 text-gray-500 px-1 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-2 flex flex-col gap-2">
          <input 
            type="text" 
            placeholder="Buscar..." 
            className="win-input text-xs w-full"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            autoFocus
          />
          <div className="flex space-x-1">
            <button 
              type="button"
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllDraft(true)}
            >
              Seleccionar Todo
            </button>
            <button 
              type="button"
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllDraft(false)}
            >
              Borrar Todo
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto border border-[#808080] bg-white p-1">
            {filteredValues.map(val => {
              const isChecked = draftSelected === undefined || (Array.isArray(draftSelected) && draftSelected.includes(val));
              return (
                <label key={val} className="flex items-center space-x-2 hover:bg-[#e0e0e0] text-[#333] px-1 cursor-pointer py-0.5 group">
                  <input 
                    type="checkbox" 
                    className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                    checked={isChecked}
                    onChange={() => handleToggleDraft(val)}
                  />
                  <span className="text-[10px] truncate font-normal">{val}</span>
                </label>
              );
            })}
          </div>

          <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-200 mt-1">
            <button 
              type="button"
              className="px-3 py-1 text-[10px] font-bold uppercase bg-slate-600 text-white hover:bg-slate-700 rounded shadow-sm cursor-pointer" 
              onClick={handleAccept}
            >
              Aceptar
            </button>
            <button 
              type="button"
              className="btn-classic text-[10px] px-3 py-1" 
              onClick={() => setOpenFilterMenu(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return {
    activeTableFilters,
    applyTableFilters,
    applyTableSort,
    sortConfig,
    sortConfigs,
    handleSort,
    clearAllFilters,
    TableHeaderWithFilter,
    renderFilterMenu,
    openFilterMenu,
    setOpenFilterMenu,
    handleToggleFilterValue,
    handleSelectAllFilters
  };
};

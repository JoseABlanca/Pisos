import React, { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const useTableFilters = ({ columnWidths = {}, updateColumnWidth = null } = {}) => {
  const { userPreferences, updatePreferences } = useAuth() || {};
  const [activeTableFilters, setActiveTableFilters] = useState({});
  const [openFilterMenu, setOpenFilterMenu] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (userPreferences && !isLoaded) {
      if (userPreferences.tableFilters) {
        setActiveTableFilters(userPreferences.tableFilters);
      }
      setIsLoaded(true);
    }
  }, [userPreferences, isLoaded]);

  const persistFilters = (newFilters) => {
    if (updatePreferences && userPreferences) {
      updatePreferences({
        ...userPreferences,
        tableFilters: newFilters
      });
    }
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

  const applyTableFilters = (data, tableId) => {
    if (!data || !Array.isArray(data)) return [];
    const filters = activeTableFilters[tableId];
    if (!filters) return data;

    return data.filter(item => {
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

  const [sortConfig, setSortConfig] = useState({ tableId: null, columnKey: null, direction: null });

  const handleSort = (tableId, columnKey) => {
    setSortConfig(prev => {
      if (prev.tableId === tableId && prev.columnKey === columnKey) {
        if (prev.direction === 'asc') return { tableId, columnKey, direction: 'desc' };
        if (prev.direction === 'desc') return { tableId: null, columnKey: null, direction: null };
      }
      return { tableId, columnKey, direction: 'asc' };
    });
  };

  const applyTableSort = (data, tableId) => {
    if (!data || !Array.isArray(data) || data.length === 0) return data;
    if (sortConfig.tableId !== tableId || !sortConfig.columnKey || !sortConfig.direction) return data;

    const { columnKey, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      let valA = a[columnKey];
      let valB = b[columnKey];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * mult;
      }

      if (typeof valA === 'string' && typeof valB === 'string' && (columnKey.toLowerCase().includes('date') || columnKey.toLowerCase().includes('fecha'))) {
        let dateA = Date.parse(valA);
        let dateB = Date.parse(valB);

        if (valA.includes('/')) {
          const parts = valA.split('/');
          if (parts.length === 3) dateA = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        }
        if (valB.includes('/')) {
          const parts = valB.split('/');
          if (parts.length === 3) dateB = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        }

        if (!isNaN(dateA) && !isNaN(dateB)) {
          return (dateA - dateB) * mult;
        }
      }

      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean' && String(valA).trim() !== '' && String(valB).trim() !== '') {
        return (numA - numB) * mult;
      }

      return String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' }) * mult;
    });
  };

  const TableHeaderWithFilter = ({ label, columnKey, data, tableId, className = "", sortable = true }) => {
    const filterState = (activeTableFilters[tableId] || {})[columnKey];
    // It's active if it's NOT undefined (meaning some specific selection or empty array)
    const isActive = filterState !== undefined;
    
    const isSorted = sortConfig.tableId === tableId && sortConfig.columnKey === columnKey;
    const sortDirection = isSorted ? sortConfig.direction : null;

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
        className={`${className} group relative hover:bg-slate-200/70 cursor-pointer select-none`} 
        style={style}
        onClick={() => {
          if (sortable) {
            handleSort(tableId, columnKey);
          }
        }}
      >
        <div
          className="w-full h-full"
          draggable
          onDragStart={(e) => {
            globalDraggedColumnKey = columnKey;
            e.dataTransfer.setData('text/plain', columnKey);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnter={(e) => e.preventDefault()}
          onDragEnd={() => { globalDraggedColumnKey = null; }}
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
                <span className="text-[9px] font-bold shrink-0 text-blue-700">
                  {sortDirection === 'asc' ? '▲' : sortDirection === 'desc' ? '▼' : <span className="opacity-0 group-hover:opacity-40 text-slate-500">↕</span>}
                </span>
              )}
            </div>
            <button 
              className={`p-0.5 rounded-sm hover:bg-slate-300 transition-colors filter-btn flex-shrink-0 mr-1 ${isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}
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
              <Filter className={`w-3 h-3 ${isActive ? 'fill-blue-200' : ''}`} />
            </button>
          </div>
          <div 
            className="absolute right-[-6px] top-0 bottom-0 w-3 cursor-col-resize hover:bg-blue-400/30 active:bg-blue-500/50 z-20"
            onMouseDown={handleMouseDown}
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
              className="px-3 py-1 text-[10px] font-bold uppercase bg-blue-600 text-white hover:bg-blue-700 rounded shadow-sm cursor-pointer" 
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
    handleSort,
    clearAllFilters,
    TableHeaderWithFilter,
    renderFilterMenu
  };
};

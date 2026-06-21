import React, { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';

export const useTableFilters = ({ columnWidths = {}, updateColumnWidth = null } = {}) => {
  const [activeTableFilters, setActiveTableFilters] = useState({});
  const [openFilterMenu, setOpenFilterMenu] = useState(null);
  const [filterSearch, setFilterSearch] = useState('');
  
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
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val?.toString() || '';
    });
    return [...new Set(values)].filter(Boolean).sort();
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
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        val = val?.toString() || '';
        return selectedValues.includes(val);
      });
    });
  };

  const handleToggleFilterValue = (tableId, columnKey, value, allValues) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      // If undefined, it means all were implicitly selected. So clicking one means we unselect it from allValues.
      let columnFilters = tableFilters[columnKey];
      if (columnFilters === undefined) {
        columnFilters = [...allValues];
      }
      
      const newColumnFilters = columnFilters.includes(value)
        ? columnFilters.filter(v => v !== value)
        : [...columnFilters, value];
        
      // If it has all values, we can reset to undefined
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
    });
  };

  const handleSelectAllFilters = (tableId, columnKey, select) => {
    setActiveTableFilters(prev => {
      const tableFilters = prev[tableId] || {};
      return {
        ...prev,
        [tableId]: {
          ...tableFilters,
          [columnKey]: select ? undefined : []
        }
      };
    });
  };

  const clearAllFilters = () => {
    setActiveTableFilters({});
  };

  const TableHeaderWithFilter = ({ label, columnKey, data, tableId, className = "" }) => {
    const filterState = (activeTableFilters[tableId] || {})[columnKey];
    // It's active if it's NOT undefined (meaning some specific selection or empty array)
    const isActive = filterState !== undefined;
    
    const [localWidth, setLocalWidth] = useState(null);

    useEffect(() => {
      if (columnWidths[columnKey]) {
        setLocalWidth(columnWidths[columnKey]);
      }
    }, [columnWidths, columnKey]);

    const width = localWidth || columnWidths[columnKey] || null;
    const style = width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : {};

    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const th = e.currentTarget.parentElement;
      const startWidth = th.offsetWidth;

      const handleMouseMove = (moveEvent) => {
        const newWidth = Math.max(30, startWidth + (moveEvent.clientX - startX));
        setLocalWidth(newWidth);
      };

      const handleMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        const finalWidth = Math.max(30, startWidth + (upEvent.clientX - startX));
        if (updateColumnWidth) {
          updateColumnWidth(columnKey, finalWidth);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };
    
    return (
      <th className={`${className} group relative`} style={style}>
        <div className="flex items-center justify-between h-full">
          <span className="truncate flex-1 pr-1">{label}</span>
          <button 
            className={`p-0.5 rounded-sm hover:bg-slate-300 transition-colors filter-btn flex-shrink-0 mr-1 ${isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setOpenFilterMenu({
                tableId,
                columnKey,
                x: rect.left,
                y: rect.bottom + 2,
                data
              });
              setFilterSearch('');
            }}
          >
            <Filter className={`w-3 h-3 ${isActive ? 'fill-blue-200' : ''}`} />
          </button>
        </div>
        <div 
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10"
          onMouseDown={handleMouseDown}
        />
      </th>
    );
  };

  const renderFilterMenu = () => {
    if (!openFilterMenu) return null;
    const { tableId, columnKey, x, y, data } = openFilterMenu;
    const allValues = getUniqueValues(data, columnKey);
    const selectedValues = (activeTableFilters[tableId] || {})[columnKey];
    
    const filteredValues = allValues.filter(val => 
      val.toLowerCase().includes(filterSearch.toLowerCase())
    );

    return (
      <div 
        className="fixed z-50 bg-white border border-[#808080] shadow-lg win-bevel filter-menu-popup"
        style={{ left: Math.min(x, window.innerWidth - 250), top: y, width: 220 }}
      >
        <div className="bg-[#5c5c9a] text-white p-1 text-xs font-bold flex justify-between items-center cursor-default">
          <span>Filtro: {columnKey}</span>
          <button onClick={() => setOpenFilterMenu(null)} className="hover:bg-red-500 px-1 rounded">
            <X className="w-3 h-3" />
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
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllFilters(tableId, columnKey, true)}
            >
              Seleccionar Todo
            </button>
            <button 
              className="btn-classic flex-1 py-0.5 text-[9px]"
              onClick={() => handleSelectAllFilters(tableId, columnKey, false)}
            >
              Borrar Todo
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border border-[#808080] bg-white p-1">
            {filteredValues.map(val => {
              const isChecked = selectedValues === undefined || selectedValues.includes(val);
              return (
                <label key={val} className="flex items-center space-x-2 hover:bg-[#0a246a] hover:text-white px-1 cursor-pointer py-0.5 group">
                  <input 
                    type="checkbox" 
                    className="w-3 h-3"
                    checked={isChecked}
                    onChange={() => handleToggleFilterValue(tableId, columnKey, val, allValues)}
                  />
                  <span className="text-[10px] truncate">{val}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-200 mt-1">
            <button className="btn-classic text-[10px] px-3 py-1" onClick={() => setOpenFilterMenu(null)}>
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
    clearAllFilters,
    TableHeaderWithFilter,
    renderFilterMenu
  };
};

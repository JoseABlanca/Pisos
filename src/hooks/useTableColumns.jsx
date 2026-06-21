import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export const useTableColumns = (tableId, defaultColumns) => {
  const { userPreferences, updatePreferences } = useAuth();
  
  const prefKey = `columns_${tableId}`;
  const widthPrefKey = `columnWidths_${tableId}`;
  
  // Inicializamos con defaultColumns, pero luego se sobreescribe con userPreferences
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [columnWidths, setColumnWidths] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (userPreferences) {
      if (userPreferences[prefKey]) {
        setVisibleColumns(userPreferences[prefKey]);
      }
      if (userPreferences[widthPrefKey]) {
        setColumnWidths(userPreferences[widthPrefKey]);
      }
      setIsLoaded(true);
    }
  }, [userPreferences, prefKey, widthPrefKey]);

  const toggleColumn = useCallback((colId) => {
    setVisibleColumns(prev => {
      const newColumns = prev.includes(colId)
        ? prev.filter(c => c !== colId)
        : [...prev, colId];
        
      // Guardar en Firestore asíncronamente
      updatePreferences({
        ...userPreferences,
        [prefKey]: newColumns
      });
      return newColumns;
    });
  }, [userPreferences, prefKey, updatePreferences]);

  // Sincronizar con el menú principal de añadir columnas
  useEffect(() => {
    const handleToggle = (e) => {
      const colId = e.detail.columnId;
      toggleColumn(colId);
    };
    
    window.addEventListener('toggle-column', handleToggle);
    return () => window.removeEventListener('toggle-column', handleToggle);
  }, [toggleColumn]);

  useEffect(() => {
    let tab = 'Clientes';
    if (tableId === 'rentals') tab = 'Alquileres';
    if (tableId === 'properties') tab = 'Activos';
    if (tableId === 'partners') tab = 'Propietarios';
    
    window.dispatchEvent(new CustomEvent('sync-columns', { detail: { tab, columns: visibleColumns } }));
  }, [visibleColumns, tableId]);

  const updateColumnWidth = (colId, width) => {
    const newWidths = { ...columnWidths, [colId]: width };
    setColumnWidths(newWidths);
    
    updatePreferences({
      ...userPreferences,
      [widthPrefKey]: newWidths
    });
  };

  return { visibleColumns, toggleColumn, columnWidths, updateColumnWidth };
};

import { useState, useEffect } from 'react';
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

  // Sincronizar con el menú principal de añadir columnas
  useEffect(() => {
    const handleToggle = (e) => {
      const colId = e.detail.columnId;
      toggleColumn(colId);
    };
    
    // Tab name in Layout might differ from tableId, but usually mapping is straightforward 
    // or just emit the event whenever visibleColumns changes
    window.addEventListener('toggle-column', handleToggle);
    return () => window.removeEventListener('toggle-column', handleToggle);
  }, [visibleColumns]); // dependency needed to have the latest visibleColumns inside toggleColumn

  useEffect(() => {
    // Notify layout of our current active columns
    // We guess the tab name based on tableId
    let tab = 'Clientes';
    if (tableId === 'rentals') tab = 'Alquileres';
    if (tableId === 'properties') tab = 'Activos';
    if (tableId === 'partners') tab = 'Propietarios';
    
    window.dispatchEvent(new CustomEvent('sync-columns', { detail: { tab, columns: visibleColumns } }));
  }, [visibleColumns, tableId]);

  const toggleColumn = (colId) => {
    const newColumns = visibleColumns.includes(colId)
      ? visibleColumns.filter(c => c !== colId)
      : [...visibleColumns, colId];
      
    setVisibleColumns(newColumns);
    
    // Guardar en Firestore asíncronamente
    updatePreferences({
      ...userPreferences,
      [prefKey]: newColumns
    });
  };

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

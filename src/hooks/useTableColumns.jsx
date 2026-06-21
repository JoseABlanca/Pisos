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

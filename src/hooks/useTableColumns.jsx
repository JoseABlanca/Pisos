import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const useTableColumns = (tableId, defaultColumns) => {
  const { userPreferences, updatePreferences } = useAuth();
  
  const prefKey = `columns_${tableId}`;
  
  // Inicializamos con defaultColumns, pero luego se sobreescribe con userPreferences
  const [visibleColumns, setVisibleColumns] = useState(defaultColumns);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (userPreferences && userPreferences[prefKey] && !isLoaded) {
      setVisibleColumns(userPreferences[prefKey]);
      setIsLoaded(true);
    } else if (!isLoaded) {
      setIsLoaded(true);
    }
  }, [userPreferences, prefKey, isLoaded]);

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

  return { visibleColumns, toggleColumn };
};

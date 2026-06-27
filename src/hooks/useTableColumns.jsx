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
    // Map tableId to the action prefix used in Layout ribbon items
    const actionMap = {
      'customers': 'customers',
      'properties': 'real-estate',
      'rentals': 'rentals',
      'partners': 'partner',
      'taxesTotal': 'taxes-total',
      'taxesRealEstate': 'taxes-re',
      'portfolio': 'portfolio',
      'rv-brokers': 'rv-broker',
      'rv-assets': 'rv-asset',
      'rv-transactions': 'rv-transaction',
      'cf-empresas': 'cf-empresa',
      'cf-activos': 'cf-activo',
      'cf-transactions': 'cf-transactions',
      'cf-portfolio': 'cf-portfolio',
    };
    const myAction = actionMap[tableId];

    const handleToggle = (e) => {
      const { columnId, action } = e.detail;
      // If action is provided, only react if it matches this table's action prefix
      if (action && myAction && !action.startsWith(myAction)) return;
      toggleColumn(columnId);
    };
    
    window.addEventListener('toggle-column', handleToggle);
    return () => window.removeEventListener('toggle-column', handleToggle);
  }, [toggleColumn, tableId]);

  useEffect(() => {
    let tab = 'Clientes';
    if (tableId === 'rentals') tab = 'Alquileres';
    if (tableId === 'properties') tab = 'Activos';
    if (tableId === 'partners') tab = 'Propietarios';
    if (tableId === 'taxesTotal') tab = 'Total';
    if (tableId === 'taxesRealEstate') tab = 'Inversiones inmobiliarias';
    if (tableId === 'rv-brokers') tab = 'Broker';
    if (tableId === 'rv-assets') tab = 'Activos RV';
    if (tableId === 'portfolio') tab = 'Portfolio';
    if (tableId === 'rv-transactions') tab = 'Transacciones';
    if (tableId === 'cf-empresas') tab = 'Plataforma';
    if (tableId === 'cf-activos') tab = 'CF Activos';
    if (tableId === 'cf-transactions') tab = 'Transacciones CF';
    if (tableId === 'cf-portfolio') tab = 'CF Portfolio';
    
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

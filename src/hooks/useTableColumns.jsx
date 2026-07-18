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

  const reorderColumn = useCallback((draggedId, targetId) => {
    setVisibleColumns(prev => {
      const draggedIndex = prev.indexOf(draggedId);
      const targetIndex = prev.indexOf(targetId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newColumns = [...prev];
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, draggedId);
      
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
      'customers': 'customer',
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
      'laboral-empresas': 'laboral-empresa',
      'laboral-contratos': 'laboral-contrato',
      'Analítica': 'analitica',
    };
    const myAction = actionMap[tableId];

    const handleToggle = (e) => {
      const { columnId, action } = e.detail;
      // If action is provided, only react if it matches this table's action prefix
      if (action && myAction && !action.startsWith(myAction)) return;
      toggleColumn(columnId);
    };

    const handleReorder = (e) => {
      const { draggedId, targetId, action } = e.detail;
      if (action && myAction && !action.startsWith(myAction)) return;
      reorderColumn(draggedId, targetId);
    };
    
    window.addEventListener('toggle-column', handleToggle);
    window.addEventListener('reorder-column', handleReorder);
    return () => {
      window.removeEventListener('toggle-column', handleToggle);
      window.removeEventListener('reorder-column', handleReorder);
    };
  }, [toggleColumn, reorderColumn, tableId]);

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
    if (tableId === 'laboral-empresas') tab = 'Empresas';
    if (tableId === 'laboral-contratos') tab = 'Contratos';
    if (tableId === 'Analítica') tab = 'Analítica';
    
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

  return { visibleColumns, toggleColumn, reorderColumn, columnWidths, updateColumnWidth };
};


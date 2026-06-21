import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Exporta un array de objetos a un documento PDF usando jspdf-autotable.
 * 
 * @param {Array<Object>} data Los datos filtrados a exportar
 * @param {Array<Object>} columns Definición de las columnas visibles: [{ header: 'Nombre', dataKey: 'name' }, ...]
 * @param {string} title Título del documento
 * @param {string} filename Nombre del archivo resultante (ej. "clientes.pdf")
 */
export const exportToPDF = (data, columns, title = 'Reporte', filename = 'reporte.pdf') => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  doc.setFontSize(16);
  doc.text(title, 40, 40);

  const tableData = data.map(item => {
    const row = {};
    columns.forEach(col => {
      // Extraemos el valor, podemos aplicar formato si es necesario
      let value = item[col.dataKey];
      
      // Si el valor es un objeto o array, lo convertimos a string para evitar errores en pdf
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      
      // Si es undefined o null lo dejamos como cadena vacía
      if (value === undefined || value === null) {
        value = '';
      }
      
      row[col.dataKey] = value;
    });
    return row;
  });

  doc.autoTable({
    startY: 60,
    head: [columns.map(col => col.header)],
    body: tableData.map(row => columns.map(col => row[col.dataKey])),
    theme: 'grid',
    headStyles: { fillColor: [0, 0, 128] }, // Azul corporativo (#000080)
    styles: { fontSize: 8, overflow: 'linebreak' },
    margin: { top: 60, right: 40, bottom: 40, left: 40 },
  });

  doc.save(filename);
};

export const exportToCSV = (data, filename) => {
  if (!data || !data.length) {
    alert("No hay datos para exportar.");
    return;
  }
  
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => 
    headers.map(header => {
      let cell = obj[header] === null || obj[header] === undefined ? '' : String(obj[header]);
      cell = cell.replace(/"/g, '""');
      if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
        cell = `"${cell}"`;
      }
      return cell;
    }).join(',')
  );
  
  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToJSON = (data, filename) => {
  if (!data || !data.length) {
    alert("No hay datos para exportar.");
    return;
  }
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToXML = (data, filename) => {
  if (!data || !data.length) {
    alert("No hay datos para exportar.");
    return;
  }
  
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<records>\n';
  data.forEach(row => {
    xml += '  <record>\n';
    Object.keys(row).forEach(key => {
      const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      xml += `    <${safeKey}>${String(row[key]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</${safeKey}>\n`;
    });
    xml += '  </record>\n';
  });
  xml += '</records>';
  
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportToExcel = (data, filename) => {
  // A simple fallback for Excel without external libraries is to export as CSV but with .xls extension and tab delimiters, 
  // or a simple HTML table. We'll use a simple HTML table method.
  if (!data || !data.length) {
    alert("No hay datos para exportar.");
    return;
  }
  
  const headers = Object.keys(data[0]);
  let html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>';
  html += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  data.forEach(row => {
    html += '<tr>' + headers.map(h => `<td>${row[h]}</td>`).join('') + '</tr>';
  });
  html += '</table></body></html>';
  
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const handleExportFormat = (data, filename, format) => {
  switch (format) {
    case 'json': return exportToJSON(data, filename);
    case 'xml': return exportToXML(data, filename);
    case 'excel': return exportToExcel(data, filename);
    case 'csv':
    default:
      return exportToCSV(data, filename);
  }
};

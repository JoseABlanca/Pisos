import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import Window from '../components/Window';
import { Upload, X, Check, AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react';

const TABLES_CONFIG = [
  {
    module: 'Inversiones inmobiliarias',
    name: 'Activos',
    collection: 'properties',
    idField: 'id',
    headers: ['id', 'name', 'address', 'city', 'cp', 'country', 'catastral', 'registry', 'm2', 'rooms', 'baths', 'year', 'efficiency', 'notes'],
    numeric: ['m2', 'rooms', 'baths', 'year'],
    booleans: ['hasMortgage']
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Propietarios',
    collection: 'partners',
    idField: 'id',
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'iban', 'ownership', 'status'],
    numeric: ['ownership'],
    booleans: []
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Clientes',
    collection: 'customers',
    idField: 'id',
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'city', 'cp', 'floor', 'status', 'notes'],
    numeric: [],
    booleans: []
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Alquileres',
    collection: 'rentals',
    idField: 'reference',
    headers: ['reference', 'propertyId', 'tenantIds', 'status', 'rentalType', 'duration', 'rentAmount', 'depositAmount', 'paymentPeriod', 'notes'],
    numeric: ['rentAmount', 'depositAmount'],
    booleans: ['actualizaIpc']
  },
  {
    module: 'Renta variable',
    name: 'Broker',
    collection: 'rv_brokers',
    idField: 'id',
    headers: ['id', 'name', 'accountNumber', 'regulation', 'currency', 'cashBalance', 'status', 'notes'],
    numeric: ['cashBalance'],
    booleans: []
  },
  {
    module: 'Renta variable',
    name: 'Activos RV',
    collection: 'rv_assets',
    idField: 'id',
    headers: ['id', 'name', 'isin', 'type', 'sector', 'currency', 'currentPrice', 'country', 'apiSource', 'notes'],
    numeric: ['currentPrice'],
    booleans: []
  },
  {
    module: 'Renta variable',
    name: 'Transacciones',
    collection: 'rv_transactions',
    idField: 'id',
    headers: ['id', 'assetId', 'brokerId', 'type', 'date', 'quantity', 'price', 'fee', 'exchangeRate', 'currency', 'notes'],
    numeric: ['quantity', 'price', 'fee', 'exchangeRate'],
    booleans: []
  },
  {
    module: 'Crowdfunding',
    name: 'CF Portfolio',
    collection: 'cf_investments',
    idField: 'id',
    headers: ['id', 'projectId', 'platformId', 'type', 'amount', 'currentValue', 'returnRate', 'startDate', 'endDate', 'status', 'notes'],
    numeric: ['amount', 'currentValue', 'returnRate'],
    booleans: []
  },
  {
    module: 'Crowdfunding',
    name: 'Empresas',
    collection: 'cf_platforms',
    idField: 'id',
    headers: ['id', 'name', 'type', 'country', 'regulation', 'website', 'cashBalance', 'currency', 'status', 'notes'],
    numeric: ['cashBalance'],
    booleans: []
  },
  {
    module: 'Crowdfunding',
    name: 'CF Activos',
    collection: 'cf_projects',
    idField: 'id',
    headers: ['id', 'name', 'platformId', 'type', 'sector', 'country', 'targetAmount', 'raisedAmount', 'annualRate', 'term', 'startDate', 'endDate', 'status', 'guaranteeType', 'ltv', 'notes'],
    numeric: ['targetAmount', 'raisedAmount', 'annualRate', 'term', 'ltv'],
    booleans: []
  }
];

function parseExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date number
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  // Format DD/MM/YYYY
  const parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (parts) {
    const day = parts[1].padStart(2, '0');
    const month = parts[2].padStart(2, '0');
    const year = parts[3];
    return `${year}-${month}-${day}`;
  }
  return s;
}

function parseBoolean(val) {
  if (!val) return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'sí' || s === 'si' || s === '1';
}

export default function Imports() {
  const { user, queryUserIds } = useAuth();
  
  const [selectedModule, setSelectedModule] = useState('Inversiones inmobiliarias');
  const [selectedTable, setSelectedTable] = useState(TABLES_CONFIG[0]);
  
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'
  const [loading, setLoading] = useState(false);

  // Filter tables based on module
  const availableTables = TABLES_CONFIG.filter(t => t.module === selectedModule);

  useEffect(() => {
    // Automatically select the first table of the module when module changes
    if (availableTables.length > 0) {
      setSelectedTable(availableTables[0]);
      resetState();
    }
  }, [selectedModule]);

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setErrors([]);
    setShowPreview(false);
  };

  useEffect(() => {
    const onClear = () => resetState();
    window.addEventListener('imports:clear', onClear);
    return () => window.removeEventListener('imports:clear', onClear);
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const selectedFile = e.dataTransfer.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = (fileToParse) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        processData(rawJson);
      } catch (err) {
        console.error(err);
        alert('Error al leer el archivo. Asegúrese de que es un archivo Excel (.xlsx/.xls) o CSV válido.');
        resetState();
      }
    };
    reader.readAsArrayBuffer(fileToParse);
  };

  const processData = (rawData) => {
    const expectedHeaders = selectedTable.headers;
    const validatedRows = [];
    const validationErrors = [];

    rawData.forEach((row, index) => {
      const cleanRow = {};
      
      // Clean and map headers case-insensitively
      Object.keys(row).forEach(k => {
        const cleanedKey = k.trim().toLowerCase();
        const matchedHeader = expectedHeaders.find(h => h.toLowerCase() === cleanedKey);
        if (matchedHeader) {
          cleanRow[matchedHeader] = row[k];
        } else {
          // Keep original key if not matching expected list
          cleanRow[k.trim()] = row[k];
        }
      });

      // Populate missing expected fields with empty strings
      expectedHeaders.forEach(h => {
        if (cleanRow[h] === undefined || cleanRow[h] === null) {
          cleanRow[h] = '';
        }
      });

      const parsedRow = { ...cleanRow };
      const rowErrors = [];

      // Validate ID / Reference field
      const keyField = selectedTable.idField;
      const keyValue = String(cleanRow[keyField] || '').trim();
      if (!keyValue) {
        rowErrors.push(`Fila ${index + 2}: El campo clave '${keyField}' está vacío.`);
      }

      // Format Date Fields
      ['startDate', 'endDate', 'date', 'expiry', 'mortgageStart'].forEach(dateF => {
        if (cleanRow[dateF] !== undefined && cleanRow[dateF] !== '') {
          parsedRow[dateF] = parseExcelDate(cleanRow[dateF]);
        }
      });

      // Format Tenant IDs (comma-separated list)
      if (cleanRow.tenantIds && typeof cleanRow.tenantIds === 'string') {
        parsedRow.tenantIds = cleanRow.tenantIds.split(',').map(id => id.trim()).filter(Boolean);
      } else if (cleanRow.tenantIds) {
        parsedRow.tenantIds = [String(cleanRow.tenantIds).trim()];
      }

      // Type cast numeric fields
      selectedTable.numeric.forEach(numF => {
        if (cleanRow[numF] !== undefined && cleanRow[numF] !== '') {
          const numVal = parseFloat(String(cleanRow[numF]).replace(/[^0-9.\-]/g, ''));
          if (isNaN(numVal)) {
            rowErrors.push(`Fila ${index + 2}: '${numF}' debe ser un valor numérico.`);
          } else {
            parsedRow[numF] = numVal;
          }
        } else {
          parsedRow[numF] = 0;
        }
      });

      // Type cast boolean fields
      selectedTable.booleans.forEach(boolF => {
        parsedRow[boolF] = parseBoolean(cleanRow[boolF]);
      });

      validatedRows.push(parsedRow);
      if (rowErrors.length > 0) {
        validationErrors.push(...rowErrors);
      }
    });

    setParsedData(validatedRows);
    setErrors(validationErrors);
    setShowPreview(true);
  };

  const handleConfirmImport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const collectionName = selectedTable.collection;
      const keyField = selectedTable.idField;
      const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];

      // ── STEP 1: If overwrite, delete existing documents ──────────────────
      if (importMode === 'replace') {
        const q = query(collection(db, collectionName), where('userId', 'in', qIds));
        const snapshot = await getDocs(q);
        
        // Delete in batches of 500 (Firestore limit)
        let batch = writeBatch(db);
        let count = 0;
        
        for (const docSnap of snapshot.docs) {
          batch.delete(docSnap.ref);
          count++;
          if (count === 500) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }

      // ── STEP 2: Save new records ──────────────────────────────────────────
      let batch = writeBatch(db);
      let count = 0;

      for (const row of parsedData) {
        // Build final object to store
        const finalRow = {
          ...row,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        };

        // Determine doc ID
        const docId = String(row[keyField]).trim();
        const docRef = doc(db, collectionName, docId);
        
        batch.set(docRef, finalRow, { merge: importMode === 'append' });
        count++;

        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      alert(`✅ ¡Importación completada! Se han procesado ${parsedData.length} registros en la tabla ${selectedTable.name}.`);
      resetState();
    } catch (err) {
      console.error(err);
      alert('Error durante la importación. Compruebe la conexión o los permisos de base de datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-3 font-sans overflow-auto">
      
      {/* Configuration dialog box */}
      <div className="border border-white border-b-[#808080] border-r-[#808080] shadow-[1px_1px_0px_#000] bg-[#d4d0c8] p-4 max-w-xl mx-auto w-full mb-4">
        <div className="bg-[#000080] text-white px-2 py-1 text-[11px] font-bold uppercase mb-4 shadow-sm flex items-center justify-between">
          <span>Configuración de Importación</span>
        </div>

        <div className="space-y-4">
          {/* Module Selector */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-bold text-gray-700 w-24 shrink-0">Módulo:</label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="win-input flex-1 cursor-pointer"
            >
              <option value="Inversiones inmobiliarias">Inversiones inmobiliarias</option>
              <option value="Renta variable">Renta variable</option>
              <option value="Crowdfunding">Crowdfunding</option>
            </select>
          </div>

          {/* Table Selector */}
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-bold text-gray-700 w-24 shrink-0">Tabla destino:</label>
            <select
              value={selectedTable.collection}
              onChange={(e) => {
                const target = TABLES_CONFIG.find(t => t.collection === e.target.value);
                if (target) {
                  setSelectedTable(target);
                  resetState();
                }
              }}
              className="win-input flex-1 cursor-pointer"
            >
              {availableTables.map(t => (
                <option key={t.collection} value={t.collection}>{t.name} (colección: {t.collection})</option>
              ))}
            </select>
          </div>

          {/* Mode Selector */}
          <div className="flex items-start gap-3 pt-2">
            <label className="text-[11px] font-bold text-gray-700 w-24 shrink-0">Modo de carga:</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="cursor-pointer"
                />
                <span>Adjuntar a datos existentes (actualiza si existe ID coincidente)</span>
              </label>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer text-red-800 font-semibold">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  Pisar / Reemplazar existentes (borra la tabla antes de importar)
                </span>
              </label>
            </div>
          </div>

          {/* File Upload Zone */}
          <div className="pt-2">
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
              className="border-2 border-dashed border-gray-400 bg-white hover:bg-gray-50/50 p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 shadow-inner"
            >
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-[#000080]" />
              <div>
                <span className="text-[12px] font-bold text-gray-700">Arrastre aquí su plantilla Excel/CSV</span>
                <p className="text-[10px] text-gray-500 mt-1">O haga clic para examinar archivos locales</p>
              </div>
            </div>
            {file && (
              <div className="mt-2 text-[11px] font-mono text-gray-700 bg-gray-100 p-1 border border-gray-300 flex justify-between items-center rounded-sm">
                <span>Archivo seleccionado: {file.name} ({Math.round(file.size / 1024)} KB)</span>
                <button onClick={resetState} className="text-red-700 hover:text-red-950 font-bold px-1.5 cursor-pointer">X</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retro Status Bar */}
      <div className="mt-auto pt-4">
        <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
          <div>Módulo seleccionado: {selectedModule} · Destino: {selectedTable.name} ({selectedTable.collection})</div>
          <div className="text-gray-500">Carga masiva · Excel / CSV</div>
        </div>
      </div>

      {/* Preview Modal Window */}
      {showPreview && (
        <Window
          title={`Previsualizar Importación - ${selectedTable.name}`}
          onClose={() => setShowPreview(false)}
          width="850px"
          height="550px"
        >
          <div className="flex flex-col h-full bg-[#d4d0c8] p-2 overflow-hidden">
            {/* Warning block if replace */}
            {importMode === 'replace' && (
              <div className="mb-2 p-2 bg-red-100 border border-red-400 text-[10px] text-red-800 flex items-center gap-2 rounded-sm font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                ¡ATENCIÓN! Se eliminarán todos los registros previos de la tabla "{selectedTable.name}" asociados a su usuario antes de proceder a la carga.
              </div>
            )}

            {/* Error logs if any */}
            {errors.length > 0 && (
              <div className="mb-2 p-2 bg-amber-50 border border-amber-400 max-h-24 overflow-y-auto rounded-sm">
                <div className="text-[10px] font-bold text-amber-800 flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Errores de Validación ({errors.length}):
                </div>
                <ul className="list-disc pl-4 text-[9px] font-mono text-amber-950 space-y-0.5">
                  {errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {/* Preview Grid Container */}
            <div className="flex-1 bg-white border border-[#808080] overflow-hidden flex flex-col shadow-inner">
              <div className="flex justify-between items-center bg-gray-100 p-2 border-b border-gray-300 text-[11px]">
                <span className="font-bold text-gray-700">Registros parsed en memoria ({parsedData.length})</span>
                <span className="text-gray-500 italic">Previsualización de los primeros 100 registros</span>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="clean-table w-full">
                  <thead>
                    <tr className="sticky top-0 bg-gray-100 shadow-[inset_0_-1px_0_#ccc]">
                      {selectedTable.headers.map(h => (
                        <th key={h} className="p-2 text-left font-bold uppercase text-[9px] bg-gray-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-blue-50/50 transition-colors">
                        {selectedTable.headers.map(h => {
                          const val = row[h];
                          const isEmptyClave = h === selectedTable.idField && !String(val).trim();
                          return (
                            <td
                              key={h}
                              className={`p-2 text-[11px] font-mono ${isEmptyClave ? 'bg-red-100 text-red-800 font-bold' : ''}`}
                            >
                              {Array.isArray(val) ? val.join(', ') : String(val === undefined || val === null ? '' : val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-400">
              <div className="text-[10px] text-gray-600">
                Modo: <span className="font-bold uppercase text-blue-900">{importMode === 'append' ? 'Adjuntar (Append)' : 'Reemplazar (Replace)'}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={loading || errors.length > 0}
                  className={`px-5 py-1.5 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-700" />
                      <span>Confirmar Importación</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-5 py-1.5 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-red-700" />
                  <span>Cancelar</span>
                </button>
              </div>
            </div>
          </div>
        </Window>
      )}

    </div>
  );
}

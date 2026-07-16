import { useState, useEffect } from 'react';
import ZoomControl from '../components/ZoomControl';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { registerJournalEntry } from '../services/accounting';
import Window from '../components/Window';
import { Upload, X, Check, AlertTriangle, FileSpreadsheet, RefreshCw, Download, Building2, TrendingUp, Landmark } from 'lucide-react';

const TABLES_CONFIG = [
  // ── INVERSIONES INMOBILIARIAS ──────────────────────────────────────────
  {
    module: 'Inversiones inmobiliarias',
    name: 'Activos',
    collection: 'properties',
    idField: 'id',
    icon: Building2,
    headers: ['id', 'name', 'address', 'city', 'cp', 'country', 'catastral', 'registry', 'm2', 'rooms', 'baths', 'year', 'efficiency', 'ceco', 'cebe', 'notes'],
    numeric: ['m2', 'rooms', 'baths', 'year'],
    booleans: ['hasMortgage'],
    example: {
      id: 'PROP001',
      name: 'Piso Centro',
      address: 'Calle Mayor 10, 2A',
      city: 'Madrid',
      cp: '28001',
      country: 'España',
      catastral: '1234567AB1234C0001DE',
      registry: 'Tomo 120, Libro 45, Finca 7890',
      m2: 85,
      rooms: 3,
      baths: 2,
      year: 1995,
      efficiency: 'E',
      ceco: 'CECO_PLAZA_001001',
      cebe: 'CEBE_POET_0001001',
      notes: 'Piso céntrico reformado en excelentes condiciones'
    }
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Propietarios',
    collection: 'partners',
    idField: 'id',
    icon: Building2,
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'iban', 'ownership', 'status'],
    numeric: ['ownership'],
    booleans: [],
    example: {
      id: 'S001',
      name: 'Juan Pérez',
      dni: '12345678A',
      phone: '600123456',
      email: 'juan.perez@example.com',
      address: 'Av. Constitución 4',
      iban: 'ES2112345678901234567890',
      ownership: 50,
      status: 'activo'
    }
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Clientes',
    collection: 'customers',
    idField: 'id',
    icon: Building2,
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'city', 'cp', 'floor', 'status', 'notes'],
    numeric: [],
    booleans: [],
    example: {
      id: 'CLI001',
      name: 'María García',
      dni: '87654321B',
      phone: '611987654',
      email: 'maria.garcia@example.com',
      address: 'Calle Luna 15, 3B',
      city: 'Barcelona',
      cp: '08002',
      floor: '3B',
      status: 'activo',
      notes: 'Inquilino puntual, contrato de larga estancia'
    }
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Alquileres',
    collection: 'rentals',
    idField: 'reference',
    icon: Building2,
    headers: ['reference', 'propertyId', 'tenantIds', 'status', 'rentalType', 'duration', 'rentAmount', 'depositAmount', 'paymentPeriod', 'incomeAccountId', 'incomeCebeId', 'expenseAccountId', 'expenseCecoId', 'notes'],
    numeric: ['rentAmount', 'depositAmount'],
    booleans: ['actualizaIpc'],
    example: {
      reference: 'CONT-2024-001',
      propertyId: 'PROP001',
      tenantIds: 'CLI001', // comma-separated if multiple
      status: 'activo',
      rentalType: 'vivienda habitual',
      duration: 'fijo',
      rentAmount: 850,
      depositAmount: 1700,
      paymentPeriod: 'mensual',
      incomeAccountId: '75200001',
      incomeCebeId: 'CEBE_POET_0001001',
      expenseAccountId: '62800001',
      expenseCecoId: 'CECO_PLAZA_001001',
      notes: 'Actualización automática IPC anual en diciembre'
    }
  },

  // ── RENTA VARIABLE ─────────────────────────────────────────────────────
  {
    module: 'Renta variable',
    name: 'Broker',
    collection: 'rv_brokers',
    idField: 'id',
    icon: TrendingUp,
    headers: ['id', 'name', 'accountNumber', 'regulation', 'currency', 'cashBalance', 'status', 'notes'],
    numeric: ['cashBalance'],
    booleans: [],
    example: {
      id: 'BR001',
      name: 'My Broker S.A.',
      accountNumber: 'ES91120034005600780090',
      regulation: 'CNMV (España)',
      currency: 'EUR',
      cashBalance: 15000,
      status: 'activo',
      notes: 'Cuenta principal de inversión a largo plazo'
    }
  },
  {
    module: 'Renta variable',
    name: 'Activos RV',
    collection: 'rv_assets',
    idField: 'id',
    icon: TrendingUp,
    headers: ['id', 'name', 'isin', 'type', 'sector', 'currency', 'currentPrice', 'country', 'apiSource', 'notes'],
    numeric: ['currentPrice'],
    booleans: [],
    example: {
      id: 'AAPL',
      name: 'Apple Inc.',
      isin: 'US0378331005',
      type: 'Acción',
      sector: 'Tecnología',
      currency: 'USD',
      currentPrice: 175.50,
      country: 'Estados Unidos',
      apiSource: 'Yahoo Finance',
      notes: 'Inversión en gigante tecnológico'
    }
  },
  {
    module: 'Renta variable',
    name: 'Transacciones',
    collection: 'rv_transactions',
    idField: 'id',
    icon: TrendingUp,
    headers: ['id', 'assetId', 'brokerId', 'type', 'date', 'quantity', 'price', 'fee', 'exchangeRate', 'currency', 'divisaAssetId', 'notes'],
    numeric: ['quantity', 'price', 'fee', 'exchangeRate'],
    booleans: [],
    example: {
      id: 'TX001',
      assetId: 'AAPL',
      brokerId: 'BR001',
      type: 'Compra',
      date: '2024-02-15',
      quantity: 10,
      price: 170.25,
      fee: 2.50,
      exchangeRate: 1.085,
      currency: 'USD',
      divisaAssetId: 'EURUSD=X',
      notes: 'Adquisición de títulos de Apple'
    }
  },

  // ── CROWDFUNDING ───────────────────────────────────────────────────────
  {
    module: 'Crowdfunding',
    name: 'CF Portfolio',
    collection: 'cf_investments',
    idField: 'id',
    icon: Landmark,
    headers: ['id', 'projectId', 'platformId', 'type', 'amount', 'currentValue', 'returnRate', 'startDate', 'endDate', 'status', 'notes'],
    numeric: ['amount', 'currentValue', 'returnRate'],
    booleans: [],
    example: {
      id: 'CFINV001',
      projectId: 'CF001',
      platformId: 'PLT001',
      type: 'Inmobiliario',
      amount: 1000,
      currentValue: 1080,
      returnRate: 8.50,
      startDate: '2024-01-10',
      endDate: '2024-12-10',
      status: 'activo',
      notes: 'Proyecto con liquidación de intereses mensual'
    }
  },
  {
    module: 'Crowdfunding',
    name: 'Plataforma',
    collection: 'cf_platforms',
    idField: 'id',
    icon: Landmark,
    headers: ['id', 'name', 'type', 'country', 'bankAccount', 'ceco', 'cebe', 'cashBalance', 'currency', 'status'],
    numeric: ['cashBalance'],
    booleans: [],
    example: {
      id: 'PLT001',
      name: 'Urbanitae',
      type: 'Inmobiliaria',
      country: 'España',
      bankAccount: 'ES2112345678901234567890',
      ceco: 'CECO_PLAZA_001001',
      cebe: 'CEBE_POET_0001001',
      cashBalance: 150,
      currency: 'EUR',
      status: 'activo'
    }
  },
  {
    module: 'Crowdfunding',
    name: 'CF Activos',
    collection: 'cf_projects',
    idField: 'id',
    icon: Landmark,
    headers: ['id', 'name', 'platformId', 'type', 'sector', 'country', 'targetAmount', 'raisedAmount', 'annualRate', 'term', 'startDate', 'endDate', 'status', 'guaranteeType', 'ltv', 'notes'],
    numeric: ['targetAmount', 'raisedAmount', 'annualRate', 'term', 'ltv'],
    booleans: [],
    example: {
      id: 'CF001',
      name: 'Promoción Madrid Sur',
      platformId: 'PLT001',
      type: 'Inmobiliario',
      sector: 'Residencial',
      country: 'España',
      targetAmount: 500000,
      raisedAmount: 500000,
      annualRate: 9.00,
      term: 18,
      startDate: '2024-01-10',
      endDate: '2025-07-10',
      status: 'activo',
      guaranteeType: 'Hipotecaria',
      ltv: 65,
      notes: 'Proyecto residencial, garantía hipotecaria primer grado'
    }
  },
  // ── CONTABILIDAD ────────────────────────────────────────────────────────
  {
    module: 'Contabilidad',
    name: 'Cuentas contables',
    collection: 'accounts',
    idField: 'code',
    icon: Landmark,
    headers: ['code', 'name', 'parentCode'],
    numeric: [],
    booleans: [],
    example: {
      code: '57200001',
      name: 'Banco Sabadell 1234',
      parentCode: '572'
    }
  },
  {
    module: 'Contabilidad',
    name: 'Asientos contables',
    collection: 'journal_entries',
    idField: 'asiento',
    icon: Landmark,
    headers: ['asiento', 'date', 'description', 'accountCode', 'lineDescription', 'ceco', 'cebe', 'debit', 'credit', 'document'],
    numeric: ['debit', 'credit'],
    booleans: [],
    example: {
      asiento: 'AS-001',
      date: '2024-02-15',
      description: 'Pago de suministro eléctrico',
      accountCode: '62800001',
      lineDescription: 'Gasto luz local principal',
      ceco: 'CECO_PLAZA_001001',
      cebe: 'CEBE_POET_0001001',
      debit: 150.25,
      credit: 0,
      document: 'FACT-2024-089'
    }
  }
];

function parseExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
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

function getAccountTypeByCode(code) {
  if (!code) return 'Activo';
  const firstChar = String(code).trim().charAt(0);
  switch (firstChar) {
    case '1': 
      if (code.startsWith('10') || code.startsWith('11') || code.startsWith('12')) return 'Patrimonio';
      return 'Pasivo';
    case '2': return 'Activo';
    case '3': return 'Activo';
    case '4': 
      if (code.startsWith('40') || code.startsWith('41') || code.startsWith('475')) return 'Pasivo';
      return 'Activo';
    case '5': 
      if (code.startsWith('52') || code.startsWith('55')) return 'Pasivo';
      return 'Activo';
    case '6': return 'Gasto';
    case '7': return 'Ingreso';
    case '8': return 'Gasto';
    case '9': return 'Ingreso';
    default: return 'Activo';
  }
}

export default function Importer() {
  const { tableZoom } = useOutletContext() || { tableZoom: 1 };
  const { user, queryUserIds } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') === 'plantillas' ? 'plantillas' : 'importaciones';
  const setActiveSubTab = (newTab) => {
    if (newTab === 'plantillas') {
      setSearchParams({ tab: 'plantillas' });
    } else {
      setSearchParams({});
    }
  };
  
  // Imports state
  const [selectedModule, setSelectedModule] = useState('Inversiones inmobiliarias');
  const [selectedTable, setSelectedTable] = useState(TABLES_CONFIG[0]);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importMode, setImportMode] = useState('append'); // 'append' | 'replace'
  const [loading, setLoading] = useState(false);

  const availableTables = TABLES_CONFIG.filter(t => t.module === selectedModule);

  useEffect(() => {
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

  const handleDownloadAll = () => {
    TABLES_CONFIG.forEach((config, idx) => {
      setTimeout(() => {
        downloadTemplate(config);
      }, idx * 300);
    });
  };

  useEffect(() => {
    const onClear = () => resetState();
    const onDownloadAll = () => handleDownloadAll();
    window.addEventListener('imports:clear', onClear);
    window.addEventListener('templates:download-all', onDownloadAll);
    return () => {
      window.removeEventListener('imports:clear', onClear);
      window.removeEventListener('templates:download-all', onDownloadAll);
    };
  }, [selectedModule, selectedTable, parsedData]);

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
      Object.keys(row).forEach(k => {
        const cleanedKey = k.trim().toLowerCase();
        const matchedHeader = expectedHeaders.find(h => h.toLowerCase() === cleanedKey);
        if (matchedHeader) {
          cleanRow[matchedHeader] = row[k];
        } else {
          cleanRow[k.trim()] = row[k];
        }
      });

      expectedHeaders.forEach(h => {
        if (cleanRow[h] === undefined || cleanRow[h] === null) {
          cleanRow[h] = '';
        }
      });

      const parsedRow = { ...cleanRow };
      const rowErrors = [];

      const keyField = selectedTable.idField;
      const keyValue = String(cleanRow[keyField] || '').trim();
      if (!keyValue) {
        rowErrors.push(`Fila ${index + 2}: El campo clave '${keyField}' está vacío.`);
      }

      ['startDate', 'endDate', 'date', 'expiry', 'mortgageStart'].forEach(dateF => {
        if (cleanRow[dateF] !== undefined && cleanRow[dateF] !== '') {
          parsedRow[dateF] = parseExcelDate(cleanRow[dateF]);
        }
      });

      if (cleanRow.tenantIds && typeof cleanRow.tenantIds === 'string') {
        parsedRow.tenantIds = cleanRow.tenantIds.split(',').map(id => id.trim()).filter(Boolean);
      } else if (cleanRow.tenantIds) {
        parsedRow.tenantIds = [String(cleanRow.tenantIds).trim()];
      }

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

      if (collectionName === 'accounts') {
        const q = query(collection(db, 'accounts'), where('userId', 'in', qIds));
        const existingSnap = await getDocs(q);
        const existingAccounts = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const allCodes = {};
        existingAccounts.forEach(acc => {
          allCodes[acc.code] = acc.id;
        });
        parsedData.forEach(row => {
          allCodes[row.code] = row.code; // Use code as ID for new ones
        });

        let batch = writeBatch(db);
        let count = 0;

        for (const row of parsedData) {
          const code = String(row.code).trim();
          const type = getAccountTypeByCode(code);
          
          let resolvedParentId = null;
          if (row.parentCode && String(row.parentCode).trim()) {
            resolvedParentId = allCodes[String(row.parentCode).trim()] || null;
          } else {
            for (let len = code.length - 1; len > 0; len--) {
              const prefix = code.substring(0, len);
              if (allCodes[prefix]) {
                resolvedParentId = allCodes[prefix];
                break;
              }
            }
          }

          const finalRow = {
            code,
            name: String(row.name).trim(),
            parentId: resolvedParentId,
            type,
            userId: user.uid,
            balance_actual: row.balance_actual !== undefined ? parseFloat(row.balance_actual) || 0 : 0,
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            order: Date.now()
          };

          const docRef = doc(db, 'accounts', code);
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

        alert(`✅ ¡Importación completada! Se han procesado ${parsedData.length} cuentas.`);
        resetState();
        return;
      }

      if (collectionName === 'journal_entries') {
        const qAcc = query(collection(db, 'accounts'), where('userId', 'in', qIds));
        const accSnap = await getDocs(qAcc);
        const accountsList = accSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const accountsByCode = {};
        accountsList.forEach(a => {
          accountsByCode[a.code] = a;
        });

        const grouped = {};
        parsedData.forEach(row => {
          const key = String(row.asiento || 'DEFAULT').trim();
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(row);
        });

        let successCount = 0;
        let errorsList = [];

        for (const [asientoKey, lines] of Object.entries(grouped)) {
          let totalDebit = 0;
          let totalCredit = 0;
          const formattedLines = [];
          let date = null;
          let globalDesc = '';

          for (const line of lines) {
            if (!date && line.date) date = line.date;
            if (!globalDesc && line.description) globalDesc = line.description;

            const code = String(line.accountCode || '').trim();
            const acct = accountsByCode[code];
            if (!acct) {
              errorsList.push(`Asiento ${asientoKey}: La cuenta contable ${code} no existe en el catálogo.`);
              continue;
            }

            const debit = parseFloat(line.debit) || 0;
            const credit = parseFloat(line.credit) || 0;
            totalDebit += debit;
            totalCredit += credit;

            formattedLines.push({
              accountId: acct.id,
              accountCode: code,
              description: line.lineDescription || line.description || '',
              document: line.document || '',
              ceco: line.ceco || '',
              cebe: line.cebe || '',
              debit,
              credit
            });
          }

          if (formattedLines.length < 2) {
            errorsList.push(`Asiento ${asientoKey}: Debe tener al menos dos apuntes.`);
            continue;
          }

          if (Math.abs(totalDebit - totalCredit) > 0.01) {
            errorsList.push(`Asiento ${asientoKey}: No cuadra por partida doble (Debe: ${totalDebit}, Haber: ${totalCredit}).`);
            continue;
          }

          try {
            const firstCebe = formattedLines.find(l => l.cebe)?.cebe || '';
            const firstCeco = formattedLines.find(l => l.ceco)?.ceco || '';
            const analytics = {
              cebe: firstCebe,
              ceco: firstCeco
            };

            await registerJournalEntry(
              user.uid,
              globalDesc || `Importación Asiento ${asientoKey}`,
              formattedLines,
              date || new Date().toISOString().split('T')[0],
              analytics
            );
            successCount++;
          } catch (e) {
            errorsList.push(`Asiento ${asientoKey}: Error al registrar - ${e.message}`);
          }
        }

        if (errorsList.length > 0) {
          alert(`⚠️ Importación parcial: Se registraron ${successCount} asientos, pero hubo ${errorsList.length} errores:\n\n` + errorsList.slice(0, 5).join('\n'));
        } else {
          alert(`✅ ¡Importación completada! Se han procesado ${successCount} asientos contables.`);
        }
        resetState();
        return;
      }

      if (importMode === 'replace') {
        const q = query(collection(db, collectionName), where('userId', 'in', qIds));
        const snapshot = await getDocs(q);
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

      let batch = writeBatch(db);
      let count = 0;

      for (const row of parsedData) {
        const finalRow = {
          ...row,
          userId: user.uid,
          updatedAt: new Date().toISOString()
        };

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

  // Templates methods
  const downloadTemplate = async (config) => {
    let data = [];
    if (user) {
      try {
        const collectionName = config.collection;
        const qIds = queryUserIds?.length > 0 ? queryUserIds : [user.uid];
        const q = query(collection(db, collectionName), where('userId', 'in', qIds));
        const snapshot = await getDocs(q);
        
        if (collectionName === 'journal_entries') {
          // Flatten journal entries so each line is a row in the excel
          snapshot.docs.forEach(docSnap => {
            const docData = docSnap.data();
            const entryNum = docData.number !== undefined ? String(docData.number) : (docData.asiento || docSnap.id.slice(-6).toUpperCase());
            const entryDate = docData.date || '';
            const entryDesc = docData.description || '';
            const entryCeco = docData.ceco || '';
            const entryCebe = docData.cebe || '';

            (docData.lines || []).forEach(line => {
              const row = {};
              config.headers.forEach(h => {
                if (h === 'asiento') {
                  row[h] = entryNum;
                } else if (h === 'date') {
                  row[h] = entryDate;
                } else if (h === 'description') {
                  row[h] = entryDesc;
                } else if (h === 'accountCode') {
                  row[h] = line.accountCode || '';
                } else if (h === 'lineDescription') {
                  row[h] = line.description || '';
                } else if (h === 'debit') {
                  row[h] = line.debit !== undefined ? Number(line.debit) : 0;
                } else if (h === 'credit') {
                  row[h] = line.credit !== undefined ? Number(line.credit) : 0;
                } else if (h === 'document') {
                  row[h] = line.document || '';
                } else if (h === 'ceco') {
                  row[h] = line.ceco || entryCeco || '';
                } else if (h === 'cebe') {
                  row[h] = line.cebe || entryCebe || '';
                } else {
                  row[h] = docData[h] !== undefined ? docData[h] : (line[h] !== undefined ? line[h] : '');
                }
              });
              data.push(row);
            });
          });
        } else {
          // Default mapping for other tables
          data = snapshot.docs.map(docSnap => {
            const docData = docSnap.data();
            const row = {};
            config.headers.forEach(h => {
              const val = docData[h];
              if (val === undefined || val === null) {
                row[h] = '';
              } else if (Array.isArray(val)) {
                row[h] = val.join(', ');
              } else {
                row[h] = val;
              }
            });
            return row;
          });
        }
      } catch (err) {
        console.error("Error fetching data for template:", err);
      }
    }

    if (data.length === 0) {
      data = [config.example];
    }

    const ws = XLSX.utils.json_to_sheet(data, { header: config.headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.name);
    const filename = `plantilla_${config.collection}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const groupedTemplates = TABLES_CONFIG.reduce((acc, current) => {
    if (!acc[current.module]) {
      acc[current.module] = [];
    }
    acc[current.module].push(current);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] font-sans overflow-hidden">
      {/* Las pestañas internas se controlan desde el Ribbon superior */}

      <div className="flex-1 overflow-auto p-4 min-h-0">
        {activeSubTab === 'importaciones' ? (
          /* IMPORTACIÓN VIEW */
          <div className="border border-white border-b-[#808080] border-r-[#808080] shadow-[1px_1px_0px_#000] bg-[#d4d0c8] p-4 max-w-xl mx-auto w-full mb-4">
            <div className="bg-[#000080] text-white px-2 py-1 text-[11px] font-bold uppercase mb-4 shadow-sm flex items-center justify-between">
              <span>Configuración de Importación</span>
            </div>

            <div className="space-y-4">
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
                  <option value="Contabilidad">Contabilidad</option>
                </select>
              </div>

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
        ) : (
          /* TEMPLATES VIEW */
          <div className="space-y-6 max-w-4xl mx-auto w-full mb-4">
            {Object.entries(groupedTemplates).map(([modName, items]) => (
              <div key={modName} className="border border-white border-b-[#808080] border-r-[#808080] shadow-[1px_1px_0px_#000] bg-[#d4d0c8]">
                <div className="bg-[#000080] text-white px-2 py-1 text-[11px] font-bold uppercase shadow-sm">
                  {modName}
                </div>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {items.map((item) => {
                    const IconComp = item.icon || FileSpreadsheet;
                    return (
                      <div
                        key={item.collection}
                        className="bg-white border border-gray-300 p-3 flex flex-col justify-between items-start hover:shadow-md transition-shadow relative shadow-sm"
                      >
                        <div className="flex items-center space-x-2.5 mb-2.5">
                          <div className="p-1.5 bg-[#4F46E5]/10 text-[#4F46E5] rounded">
                            <IconComp className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-[12px] font-bold text-slate-800 leading-tight">{item.name}</h4>
                            <p className="text-[9px] text-gray-400 font-mono">tabla: {item.collection}</p>
                          </div>
                        </div>

                        <div className="w-full flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="text-[9px] text-gray-500 font-bold uppercase">{item.headers.length} columnas</span>
                          <button
                            onClick={() => downloadTemplate(item)}
                            className="px-2.5 py-1 text-[10px] font-bold border border-gray-400 bg-gray-100 hover:bg-gray-200 text-slate-800 cursor-pointer shadow-sm flex items-center space-x-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Descargar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Retro Status Bar */}
      <div className="shrink-0 border-t border-[#808080] bg-[#f0f0f0] p-1 text-[10px] text-gray-500">
        <div className="flex justify-between items-center">
          <div>Sección: Importador · Sub-panel: {activeSubTab === 'importaciones' ? 'Importar Datos' : 'Descargar Plantillas'}</div>
          <div>Carga masiva · Excel / CSV</div>
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
            {importMode === 'replace' && (
              <div className="mb-2 p-2 bg-red-100 border border-red-400 text-[10px] text-red-800 flex items-center gap-2 rounded-sm font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                ¡ATENCIÓN! Se eliminarán todos los registros previos de la tabla "{selectedTable.name}" asociados a su usuario antes de proceder a la carga.
              </div>
            )}

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

            <div className="flex-1 bg-white border border-[#808080] overflow-hidden flex flex-col shadow-inner">
              <div className="flex justify-between items-center bg-gray-100 p-2 border-b border-gray-300 text-[11px]">
                <span className="font-bold text-gray-700">Registros parsed en memoria ({parsedData.length})</span>
                <span className="text-gray-500 italic">Previsualización de los primeros 100 registros</span>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table style={{ zoom: tableZoom }} className="clean-table w-full">
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
    
      {/* Bottom Bar for Zoom */}
      <div className="flex justify-end bg-[#f0f0f0] p-1 border-t border-gray-300 shrink-0 mt-auto w-full z-50">
        <ZoomControl />
      </div>
</div>
  );
}

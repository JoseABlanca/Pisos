import { useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Building2, TrendingUp, Landmark } from 'lucide-react';

const TABLES_CONFIG = [
  // ── INVERSIONES INMOBILIARIAS ──────────────────────────────────────────
  {
    module: 'Inversiones inmobiliarias',
    name: 'Activos',
    collection: 'properties',
    icon: Building2,
    headers: ['id', 'name', 'address', 'city', 'cp', 'country', 'catastral', 'registry', 'm2', 'rooms', 'baths', 'year', 'efficiency', 'notes'],
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
      notes: 'Piso céntrico reformado en excelentes condiciones'
    }
  },
  {
    module: 'Inversiones inmobiliarias',
    name: 'Propietarios',
    collection: 'partners',
    icon: Building2,
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'iban', 'ownership', 'status'],
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
    icon: Building2,
    headers: ['id', 'name', 'dni', 'phone', 'email', 'address', 'city', 'cp', 'floor', 'status', 'notes'],
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
    icon: Building2,
    headers: ['reference', 'propertyId', 'tenantIds', 'status', 'rentalType', 'duration', 'rentAmount', 'depositAmount', 'paymentPeriod', 'notes'],
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
      notes: 'Actualización automática IPC anual en diciembre'
    }
  },

  // ── RENTA VARIABLE ─────────────────────────────────────────────────────
  {
    module: 'Renta variable',
    name: 'Broker',
    collection: 'rv_brokers',
    icon: TrendingUp,
    headers: ['id', 'name', 'accountNumber', 'regulation', 'currency', 'cashBalance', 'status', 'notes'],
    example: {
      id: 'BR001',
      name: 'My Broker S.A.',
      accountNumber: 'ES91120034005600780090',
      regulation: 'CNMV (España)',
      currency: 'EUR',
      cashBalance: 5000,
      status: 'activo',
      notes: 'Broker para trading de acciones a largo plazo'
    }
  },
  {
    module: 'Renta variable',
    name: 'Activos RV',
    collection: 'rv_assets',
    icon: TrendingUp,
    headers: ['id', 'name', 'isin', 'type', 'sector', 'currency', 'currentPrice', 'country', 'apiSource', 'notes'],
    example: {
      id: 'AAPL',
      name: 'Apple Inc.',
      isin: 'US0378331005',
      type: 'Acción',
      sector: 'Tecnología',
      currency: 'USD',
      currentPrice: 180.50,
      country: 'EEUU',
      apiSource: 'Yahoo Finance',
      notes: 'Compañía tecnológica líder en hardware y servicios'
    }
  },
  {
    module: 'Renta variable',
    name: 'Transacciones',
    collection: 'rv_transactions',
    icon: TrendingUp,
    headers: ['id', 'assetId', 'brokerId', 'type', 'date', 'quantity', 'price', 'fee', 'exchangeRate', 'currency', 'notes'],
    example: {
      id: 'TX001',
      assetId: 'AAPL',
      brokerId: 'BR001',
      type: 'Compra',
      date: '2024-05-15',
      quantity: 10,
      price: 180.50,
      fee: 2.50,
      exchangeRate: 1.08,
      currency: 'USD',
      notes: 'Compra inicial de acciones AAPL'
    }
  },

  // ── CROWDFUNDING ───────────────────────────────────────────────────────
  {
    module: 'Crowdfunding',
    name: 'CF Portfolio',
    collection: 'cf_investments',
    icon: Landmark,
    headers: ['id', 'projectId', 'platformId', 'type', 'amount', 'currentValue', 'returnRate', 'startDate', 'endDate', 'status', 'notes'],
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
    name: 'Empresas',
    collection: 'cf_platforms',
    icon: Landmark,
    headers: ['id', 'name', 'type', 'country', 'regulation', 'website', 'cashBalance', 'currency', 'status', 'notes'],
    example: {
      id: 'PLT001',
      name: 'Urbanitae',
      type: 'Inmobiliaria',
      country: 'España',
      regulation: 'CNMV',
      website: 'https://urbanitae.com',
      cashBalance: 150,
      currency: 'EUR',
      status: 'activo',
      notes: 'Plataforma regulada de crowdfunding inmobiliario'
    }
  },
  {
    module: 'Crowdfunding',
    name: 'CF Activos',
    collection: 'cf_projects',
    icon: Landmark,
    headers: ['id', 'name', 'platformId', 'type', 'sector', 'country', 'targetAmount', 'raisedAmount', 'annualRate', 'term', 'startDate', 'endDate', 'status', 'guaranteeType', 'ltv', 'notes'],
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
  }
];

export default function ImportTemplates() {
  const downloadTemplate = (config) => {
    // Generate headers as first row, and example row as second row
    const data = [config.example];
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data, { header: config.headers });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, config.name);
    
    // Save file
    const filename = `plantilla_${config.collection}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handleDownloadAll = () => {
    TABLES_CONFIG.forEach((config, idx) => {
      // Delay downloads slightly to avoid browser blocking multiple downloads
      setTimeout(() => {
        downloadTemplate(config);
      }, idx * 300);
    });
  };

  useEffect(() => {
    window.addEventListener('templates:download-all', handleDownloadAll);
    return () => {
      window.removeEventListener('templates:download-all', handleDownloadAll);
    };
  }, []);

  // Group by module
  const modules = [...new Set(TABLES_CONFIG.map(t => t.module))];

  return (
    <div className="flex flex-col h-full bg-[#d4d0c8] p-3 font-sans overflow-auto">
      {/* Header Info */}
      <div className="mb-4 px-3 py-2 bg-[#fffbe6] border border-[#f0c040] text-[11px] text-[#7a6000] flex items-start gap-2 rounded-sm shadow-sm">
        <span className="font-bold text-sm">💡</span>
        <div>
          <span className="font-bold">Instrucciones para las Plantillas:</span>
          <p className="mt-1">Descarga la plantilla de Excel del modelo deseado. Rellena los datos manteniendo el formato exacto de las columnas. Se incluye una fila de ejemplo con datos válidos que debes reemplazar por tus registros reales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modules.map(moduleName => {
          const tables = TABLES_CONFIG.filter(t => t.module === moduleName);
          return (
            <div key={moduleName} className="border border-white border-b-[#808080] border-r-[#808080] shadow-[1px_1px_0px_#000] bg-[#d4d0c8] p-2 flex flex-col">
              <div className="bg-[#000080] text-white px-2 py-1 text-[11px] font-bold uppercase flex items-center gap-1.5 shadow-sm">
                <span>{moduleName}</span>
              </div>
              
              <div className="p-2 space-y-2 flex-1 bg-white border border-inset border-[#808080] mt-2 overflow-auto max-h-[450px]">
                {tables.map(table => {
                  const Icon = table.icon;
                  return (
                    <div key={table.collection} className="flex justify-between items-center p-2 border border-gray-200 hover:bg-[#f0f4f9] transition-colors rounded-sm">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-[#000080] shrink-0" />
                        <div>
                          <div className="text-[12px] font-bold text-gray-800">{table.name}</div>
                          <div className="text-[9px] font-mono text-gray-500">Colección: {table.collection}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadTemplate(table)}
                        className="px-3 py-1 border border-gray-400 bg-gray-100 hover:bg-gray-200 shadow-sm text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                        title="Descargar plantilla Excel (.xlsx)"
                      >
                        <Download className="w-3 h-3" />
                        <span>Descargar</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Retro Status Bar */}
      <div className="mt-auto pt-4">
        <div className="flex justify-between items-center bg-[#f0f0f0] p-1 border-t border-[#808080] text-[10px]">
          <div>{TABLES_CONFIG.length} plantillas disponibles para exportar</div>
          <div className="text-gray-500">Plantillas de importación · Excel (.xlsx)</div>
        </div>
      </div>
    </div>
  );
}

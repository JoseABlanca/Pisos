export const DEFAULT_PARTNERS = [
  { id: 'S001', name: 'José Blanco', dni: '12345678Z', phone: '600000001', email: 'jose@email.com', capital: '50.000', percentage: '50' },
  { id: 'S002', name: 'Ana García', dni: '87654321X', phone: '600000002', email: 'ana@email.com', capital: '30.000', percentage: '30' },
  { id: 'S003', name: 'Sociedad Inversora SL', dni: 'B12345678', phone: '912345678', email: 'info@sociedad.com', capital: '20.000', percentage: '20' },
];

export const DEFAULT_PROPERTIES = [
  { 
    id: 'RE001', 
    name: 'Edificio Gran Vía', 
    address: 'Calle Gran Vía 123, Madrid', 
    cp: '28013', 
    catastral: '1234567VK4713S0001AB',
    registry: 'Tomo 123, Libro 45, Finca 678',
    m2: '85 m²',
    rooms: '3',
    baths: '2',
    year: '2005',
    efficiency: 'B',
    notes: 'Propiedad reformada en 2022. Pintura y parqué nuevos.',
    tenants: [
      {
        name: 'Juan Pérez García',
        dni: '12345678Z',
        phone: '+34 600 000 000',
        email: 'juan.perez@email.com',
        contractDate: '2023-01-01',
        rent: 1200,
        deposit: 2400
      }
    ],
    hasMortgage: true,
    bank: 'Banco Santander',
    loanNumber: 'ES91 0049 1234 56 7890123456',
    loanAmount: '250.000,00 €',
    interest: '3.25 %',
    expiry: '2045-06-30',
    monthlyQuota: '845,20 €',
    services: {
      electricity: { cia: 'Endesa', ref: 'CTR-9821' },
      water: { cia: 'Canal Isabel II', ref: 'ACC-1102' },
      gas: { cia: 'Naturgy', ref: 'GAS-7732' },
      internet: { cia: 'Movistar', ref: 'FIB-5541' },
      insurance: { cia: 'Mapfre', ref: 'POL-123456' }
    },
    community: {
      name: 'C.P. Gran Vía 123',
      admin: 'GestiFincas S.L.',
      adminPhone: '91 444 55 66',
      fee: 75,
      paymentDay: 5
    }
  },
  { 
    id: 'RE002', 
    name: 'Piso Retiro', 
    address: 'Calle Alfonso XII 4, Madrid', 
    cp: '28014', 
    catastral: '9876543VK4713S0001XY',
    registry: 'Tomo 555, Libro 22, Finca 111',
    m2: '120 m²',
    rooms: '4',
    baths: '3',
    year: '1980',
    efficiency: 'D',
    notes: 'Vistas al Retiro.',
    tenants: [
      {
        name: 'Marta Sánchez',
        dni: '87654321X',
        phone: '+34 611 222 333',
        email: 'marta.s@email.com',
        contractDate: '2022-05-15',
        rent: 1800,
        deposit: 3600
      }
    ],
    hasMortgage: false,
    services: {
      electricity: { cia: 'Iberdrola', ref: 'CTR-1111' },
      water: { cia: 'Canal Isabel II', ref: 'ACC-2222' },
      gas: { cia: 'Naturgy', ref: 'GAS-3333' },
      internet: { cia: 'Orange', ref: 'FIB-4444' },
      insurance: { cia: 'Allianz', ref: 'POL-555555' }
    },
    community: {
      name: 'C.P. Alfonso XII 4',
      admin: 'Fincas Madrid',
      adminPhone: '91 123 44 55',
      fee: 120,
      paymentDay: 1
    }
  }
];

export const DEFAULT_RENTALS = [
  { 
    id: 'ALQ001', 
    propertyId: 'RE001', 
    propertyName: 'Edificio Gran Vía',
    status: 'activo', 
    name: 'Alquiler Principal - Gran Vía',
    duration: 'fijo',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    paymentType: 'Transferencia',
    prepaid: true,
    arrears: false,
    paymentDay: '1',
    paymentDayEnd: '5',
    receiptDay: '1',
    rentAmount: 1200,
    expenses: [
      { name: 'Comunidad', type: 'Fijo', amount: 75 }
    ],
    totalRent: 1125,
    depositAmount: 2400,
    depositType: 'en poder del arrendador',
    depositDate: '2024-01-01',
    rentRevision: 'no revisar',
    revisionIndexType: 'ipc',
    revisionDate: '',
    rentalType: 'Vivienda habitual',
    tenants: [
      { name: 'Juan Pérez García', share: 1200 }
    ],
    incomeItems: [],
    expenseItems: [],
    documents: [],
    receipts: []
  }
];

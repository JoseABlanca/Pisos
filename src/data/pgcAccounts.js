export const pgcAccounts = [
  {
    code: '1',
    name: 'FINANCIACIÓN BÁSICA',
    type: 'Patrimonio/Pasivo NC',
    children: [
      {
        code: '10',
        name: 'Capital',
        children: [
          { code: '100', name: 'Capital social' },
          { code: '101', name: 'Fondo social' },
          { code: '102', name: 'Capital' },
          {
            code: '103',
            name: 'Socios por desembolsos no exigidos',
            children: [
              { code: '1030', name: 'Socios por desembolsos no exigidos, capital social' }
            ]
          }
        ]
      },
      {
        code: '11',
        name: 'Reservas',
        children: [
          { code: '110', name: 'Prima de emisión o asunción' },
          { code: '112', name: 'Reserva legal' },
          { code: '113', name: 'Reservas voluntarias' },
          {
            code: '114',
            name: 'Reservas especiales',
            children: [
              { code: '1141', name: 'Reservas estatutarias' }
            ]
          }
        ]
      },
      {
        code: '12',
        name: 'Resultados pendientes de aplicación',
        children: [
          { code: '120', name: 'Remanente' },
          { code: '121', name: 'Resultados negativos de ejercicios anteriores' },
          { code: '129', name: 'Resultado del ejercicio' }
        ]
      },
      {
        code: '13',
        name: 'Subvenciones, donaciones y legados recibidos',
        children: [
          { code: '130', name: 'Subvenciones oficiales de capital' },
          { code: '131', name: 'Donaciones y legados de capital' }
        ]
      },
      {
        code: '17',
        name: 'Deudas a largo plazo por préstamos recibidos',
        children: [
          {
            code: '170',
            name: 'Deudas a largo plazo con entidades de crédito',
            children: [
              { code: '1700', name: 'Préstamos a largo plazo de entidades de crédito' }
            ]
          },
          { code: '171', name: 'Deudas a largo plazo' },
          { code: '173', name: 'Proveedores de inmovilizado a largo plazo' }
        ]
      }
    ]
  },
  {
    code: '2',
    name: 'ACTIVO NO CORRIENTE',
    type: 'Activo NC',
    children: [
      {
        code: '20',
        name: 'Inmovilizado intangible',
        children: [
          { code: '200', name: 'Investigación' },
          { code: '201', name: 'Desarrollo' },
          { code: '203', name: 'Propiedad industrial' },
          { code: '206', name: 'Aplicaciones informáticas' }
        ]
      },
      {
        code: '21',
        name: 'Inmovilizado material',
        children: [
          { code: '210', name: 'Terrenos y bienes naturales' },
          { code: '211', name: 'Construcciones' },
          { code: '212', name: 'Instalaciones técnicas' },
          { code: '213', name: 'Maquinaria' },
          { code: '214', name: 'Utillaje' },
          { code: '216', name: 'Mobiliario' },
          { code: '217', name: 'Equipos para procesos de información' },
          { code: '218', name: 'Elementos de transporte' }
        ]
      },
      {
        code: '28',
        name: 'Amortización acumulada del inmovilizado',
        children: [
          { code: '280', name: 'Amortización acumulada del inmovilizado intangible' },
          {
            code: '281',
            name: 'Amortización acumulada del inmovilizado material',
            children: [
              { code: '2813', name: 'Amortización acumulada de maquinaria' },
              { code: '2817', name: 'Amortización acumulada de equipos para procesos de información' }
            ]
          }
        ]
      }
    ]
  },
  {
    code: '3',
    name: 'EXISTENCIAS',
    type: 'Activo C',
    children: [
      {
        code: '30',
        name: 'Comerciales',
        children: [
          { code: '300', name: 'Mercaderías A' },
          { code: '301', name: 'Mercaderías B' }
        ]
      },
      {
        code: '31',
        name: 'Materias primas',
        children: [
          { code: '310', name: 'Materias primas A' }
        ]
      },
      {
        code: '32',
        name: 'Otros aprovisionamientos',
        children: [
          { code: '321', name: 'Combustibles' },
          { code: '322', name: 'Repuestos' }
        ]
      },
      {
        code: '35',
        name: 'Productos terminados',
        children: [
          { code: '350', name: 'Productos terminados A' }
        ]
      }
    ]
  },
  {
    code: '4',
    name: 'ACREEDORES Y DEUDORES POR OPERACIONES COMERCIALES',
    type: 'Activo/Pasivo C',
    children: [
      {
        code: '40',
        name: 'Proveedores',
        children: [
          {
            code: '400',
            name: 'Proveedores',
            children: [
              { code: '4000', name: 'Proveedores (euros)' },
              { code: '4004', name: 'Proveedores (moneda extranjera)' }
            ]
          },
          { code: '401', name: 'Proveedores, efectos comerciales a pagar' },
          { code: '407', name: 'Anticipos a proveedores' }
        ]
      },
      {
        code: '41',
        name: 'Acreedores varios',
        children: [
          { code: '410', name: 'Acreedores por prestaciones de servicios' }
        ]
      },
      {
        code: '43',
        name: 'Clientes',
        children: [
          {
            code: '430',
            name: 'Clientes',
            children: [
              { code: '4300', name: 'Clientes (euros)' }
            ]
          },
          {
            code: '431',
            name: 'Clientes, efectos comerciales a cobrar',
            children: [
              { code: '4310', name: 'Efectos comerciales en cartera' }
            ]
          }
        ]
      },
      {
        code: '46',
        name: 'Personal',
        children: [
          { code: '460', name: 'Anticipos de remuneraciones' },
          { code: '465', name: 'Remuneraciones pendientes de pago' }
        ]
      },
      {
        code: '47',
        name: 'Administraciones Públicas',
        children: [
          { code: '472', name: 'Hacienda Pública, IVA soportado' },
          {
            code: '475',
            name: 'Hacienda Pública, acreedora por conceptos fiscales',
            children: [
              { code: '4750', name: 'HP, acreedora por IVA' },
              { code: '4751', name: 'HP, acreedora por retenciones practicadas' }
            ]
          },
          { code: '476', name: 'Organismos de la Seguridad Social, acreedores' },
          { code: '477', name: 'Hacienda Pública, IVA repercutido' }
        ]
      }
    ]
  },
  {
    code: '5',
    name: 'CUENTAS FINANCIERAS',
    type: 'Activo C',
    children: [
      {
        code: '52',
        name: 'Deudas a corto plazo por préstamos recibidos',
        children: [
          {
            code: '520',
            name: 'Deudas a corto plazo con entidades de crédito',
            children: [
              { code: '5200', name: 'Préstamos a corto plazo de entidades de crédito' },
              { code: '5201', name: 'Deudas a corto plazo por crédito dispuesto' }
            ]
          }
        ]
      },
      {
        code: '57',
        name: 'Tesorería',
        children: [
          { code: '570', name: 'Caja, euros' },
          {
            code: '572',
            name: 'Bancos e instituciones de crédito c/c a la vista',
            children: [
              { code: '5720', name: 'Bancos c/c (Nombre del Banco)' }
            ]
          }
        ]
      }
    ]
  },
  {
    code: '6',
    name: 'COMPRAS Y GASTOS',
    type: 'Gasto',
    children: [
      {
        code: '60',
        name: 'Compras',
        children: [
          { code: '600', name: 'Compras de mercaderías' },
          { code: '602', name: 'Compras de otros aprovisionamientos' },
          { code: '607', name: 'Trabajos realizados por otras empresas' }
        ]
      },
      {
        code: '62',
        name: 'Servicios exteriores',
        children: [
          { code: '621', name: 'Arrendamientos y cánones' },
          { code: '622', name: 'Reparaciones y conservación' },
          { code: '623', name: 'Servicios de profesionales independientes' },
          { code: '624', name: 'Transportes' },
          { code: '625', name: 'Primas de seguros' },
          { code: '626', name: 'Servicios bancarios y similares' },
          { code: '627', name: 'Publicidad, propaganda y relaciones públicas' },
          { code: '628', name: 'Suministros (luz, agua, gas)' },
          { code: '629', name: 'Otros servicios' }
        ]
      },
      {
        code: '64',
        name: 'Gastos de personal',
        children: [
          { code: '640', name: 'Sueldos y salarios' },
          { code: '641', name: 'Indemnizaciones' },
          { code: '642', name: 'Seguridad Social a cargo de la empresa' }
        ]
      },
      {
        code: '66',
        name: 'Gastos financieros',
        children: [
          { code: '662', name: 'Intereses de deudas' }
        ]
      },
      {
        code: '68',
        name: 'Dotaciones para amortizaciones',
        children: [
          { code: '681', name: 'Dotación a la amortización del inmovilizado material' }
        ]
      }
    ]
  },
  {
    code: '7',
    name: 'VENTAS E INGRESOS',
    type: 'Ingreso',
    children: [
      {
        code: '70',
        name: 'Ventas de mercaderías, de producción propia, de servicios, etc.',
        children: [
          { code: '700', name: 'Ventas de mercaderías' },
          { code: '705', name: 'Prestaciones de servicios' }
        ]
      },
      {
        code: '75',
        name: 'Otros ingresos de gestión',
        children: [
          { code: '752', name: 'Ingresos por arrendamientos' },
          { code: '754', name: 'Ingresos por comisiones' }
        ]
      },
      {
        code: '76',
        name: 'Ingresos financieros',
        children: [
          { code: '760', name: 'Ingresos de participaciones en instrumentos de patrimonio' },
          { code: '761', name: 'Ingresos de valores representativos de deuda' },
          { code: '769', name: 'Otros ingresos financieros' }
        ]
      }
    ]
  }
];

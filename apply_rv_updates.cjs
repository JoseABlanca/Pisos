const fs = require('fs');
let file = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. Add rv_transactions to DEFAULT_ALL_COLUMNS
file = file.replace(
\      { id: 'gastosCompraVenta', label: 'Gastos Compra Venta' },
    ],\,
\      { id: 'gastosCompraVenta', label: 'Gastos Compra Venta' },
    ],
    rv_transactions: [
      { id: 'date', label: 'Fecha' },
      { id: 'type', label: 'Tipo' },
      { id: 'assetId', label: 'Ticker' },
      { id: 'brokerId', label: 'Broker' },
      { id: 'quantity', label: 'Cant.' },
      { id: 'price', label: 'Precio' },
      { id: 'fee', label: 'Comisión' },
      { id: 'currency', label: 'Divisa' },
      { id: 'totalAmountEUR', label: 'Total (EUR)' }
    ],\
);

// 2. Add State variables around rentPeriod
file = file.replace(
\  const [rentPeriod, setRentPeriod] = useState('mes'); // 'mes' or 'anual'\,
\  const [rentPeriod, setRentPeriod] = useState('mes'); // 'mes' or 'anual'
  const [rvBrokerFilter, setRvBrokerFilter] = useState([]);
  const [rvAssetFilter, setRvAssetFilter] = useState([]);
  const [showRvChart, setShowRvChart] = useState(false);
  const [rvChartType, setRvChartType] = useState('volumen');\
);

fs.writeFileSync('src/pages/PrintPage.jsx', file);
console.log('Step 1 and 2 updated');

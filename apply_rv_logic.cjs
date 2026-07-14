const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const rvOldBlock = `    // 8. TRANSACCIONES DE RENTA VARIABLE
    if (selectedTemplate === 'rv_transactions') {
      const chronTx = [...rvTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
      const listPages = chunkFlatList(chronTx, getLimit(34));
      const totalPages = listPages.length || 1;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-rv-tx" className="page-sheet relative">
            {renderPageHeader('Transacciones de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay transacciones registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={\`rv-tx-\${pageIdx}\`} className="page-sheet relative">
              <div>
                {renderPageHeader('Registro de Transacciones de Renta Variable')}
                <table className="w-full text-[8.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 font-semibold text-slate-600">
                      <th className="py-0.5 px-1 text-left w-16">Fecha</th>
                      <th className="py-0.5 px-1 text-left w-16">Tipo</th>
                      <th className="py-0.5 px-1 text-left w-16">Ticker</th>
                      <th className="py-0.5 px-1 text-left">Broker</th>
                      <th className="py-0.5 px-1 text-right w-16">Cant.</th>
                      <th className="py-0.5 px-1 text-right w-20">Precio</th>
                      <th className="py-0.5 px-1 text-right w-20">Comisión</th>
                      <th className="py-0.5 px-1 text-center w-12">Divisa</th>
                      <th className="py-0.5 px-1 text-right w-24">Total (EUR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((tx, idx) => {
                      const qty = parseFloat(tx.quantity) || 0;
                      const price = parseFloat(tx.price) || 0;
                      const fee = parseFloat(tx.fee) || 0;
                      const rate = parseFloat(tx.exchangeRate) || 1.0;
                      const totalAmountEUR = tx.type === 'Dividendo'
                        ? (qty * price - fee) / rate
                        : tx.type === 'Compra'
                          ? (qty * price + fee) / rate
                          : (qty * price - fee) / rate;

                      return (
                        <tr key={tx.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-0.5 px-1 font-mono text-slate-650">{formatDate(tx.date)}</td>
                          <td className="py-0.5 px-1 font-bold">
                            <span className={\`px-1 py-0.5 rounded text-[8px] uppercase \${
                              tx.type === 'Compra' ? 'bg-blue-100 text-blue-800' :
                              tx.type === 'Venta' ? 'bg-orange-100 text-orange-850' : 'bg-green-100 text-green-800'
                            }\`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-0.5 px-1 font-mono font-bold text-slate-800">{tx.assetId}</td>
                          <td className="py-0.5 px-1 uppercase text-slate-600 truncate max-w-[80px]">{tx.brokerId}</td>
                          <td className="py-0.5 px-1 text-right font-mono">{qty.toFixed(4)}</td>
                          <td className="py-0.5 px-1 text-right font-mono">{price.toFixed(2)}</td>
                          <td className="py-0.5 px-1 text-right font-mono">{fee.toFixed(2)}</td>
                          <td className="py-0.5 px-1 text-center font-mono text-[9px] text-slate-500">{tx.currency || 'EUR'}</td>
                          <td className="py-0.5 px-1 text-right font-sans font-bold tabular-nums text-slate-800">
                            {formatCurrency(totalAmountEUR)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }`;

const rvNewBlock = `    // 8. TRANSACCIONES DE RENTA VARIABLE
    if (selectedTemplate === 'rv_transactions') {
      let filteredTx = [...rvTransactions].map(tx => {
        const qty = parseFloat(tx.quantity) || 0;
        const price = parseFloat(tx.price) || 0;
        const fee = parseFloat(tx.fee) || 0;
        const rate = parseFloat(tx.exchangeRate) || 1.0;
        let totalAmountEUR = 0;
        if (tx.type === 'Dividendo') totalAmountEUR = (qty * price - fee) / rate;
        else if (tx.type === 'Compra') totalAmountEUR = (qty * price + fee) / rate;
        else totalAmountEUR = (qty * price - fee) / rate;
        return { ...tx, totalAmountEUR, qty, price, fee, rate };
      });

      // Filtros
      if (rvBrokerFilter.length > 0) {
        filteredTx = filteredTx.filter(tx => rvBrokerFilter.includes(tx.brokerId));
      }
      if (rvAssetFilter.length > 0) {
        filteredTx = filteredTx.filter(tx => rvAssetFilter.includes(tx.assetId));
      }

      // Ordenación
      if (sortCol1 !== 'none') {
        filteredTx.sort((a, b) => {
          let valA = a[sortCol1];
          let valB = b[sortCol1];
          if (sortCol1 === 'date') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
          if (valA < valB) return sortAsc1 ? -1 : 1;
          if (valA > valB) return sortAsc1 ? 1 : -1;
          return 0;
        });
      } else {
        filteredTx.sort((a, b) => new Date(b.date) - new Date(a.date)); // Default
      }

      // Gráficos (si procede)
      if (showRvChart && filteredTx.length > 0) {
        // Prepare chart data based on grouped periods (e.g. by month)
        const chartDataMap = {};
        [...filteredTx].sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(tx => {
          const d = new Date(tx.date);
          const monthKey = \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`;
          if (!chartDataMap[monthKey]) chartDataMap[monthKey] = { period: monthKey, compras: 0, ventas: 0, dividendos: 0 };
          if (tx.type === 'Compra') chartDataMap[monthKey].compras += tx.totalAmountEUR;
          if (tx.type === 'Venta') chartDataMap[monthKey].ventas += tx.totalAmountEUR;
          if (tx.type === 'Dividendo') chartDataMap[monthKey].dividendos += tx.totalAmountEUR;
        });
        const chartData = Object.values(chartDataMap);

        pageViews.push(
          <div key="rv-chart" className="page-sheet relative">
            {renderPageHeader('Histórico de Renta Variable')}
            <div className="flex flex-col items-center justify-center mt-10" style={{ height: '400px' }}>
              <span className="text-[12px] font-bold text-slate-700 mb-4 font-sans">Evolución (Compras, Ventas, Dividendos)</span>
              <ResponsiveContainer width="90%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} tickFormatter={(val) => \`€\${(val/1000).toFixed(0)}k\`} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="compras" name="Compras" stackId="a" fill="#1e40af" />
                  <Bar dataKey="ventas" name="Ventas" stackId="a" fill="#ea580c" />
                  <Bar dataKey="dividendos" name="Dividendos" stackId="a" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      }

      // Agrupación
      let listPages = [];
      let totalPages = 1;
      
      const visibleCols = (ALL_COLUMNS.rv_transactions || []).filter(col => cv(col.id));

      if (filteredTx.length === 0) {
        pageViews.push(
          <div key="empty-rv-tx" className="page-sheet relative">
            {renderPageHeader('Transacciones de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay transacciones registradas.</p>
            {renderPageFooter(showRvChart ? 2 : 1, showRvChart ? 2 : 1, auditNumber)}
          </div>
        );
      } else {
        if (groupCol1 !== 'none') {
          // Group logic
          const groupMap = {};
          filteredTx.forEach(tx => {
            const k = tx[groupCol1] || 'Sin Clasificar';
            if (!groupMap[k]) groupMap[k] = [];
            groupMap[k].push(tx);
          });
          const groupBlocks = Object.entries(groupMap).sort((a,b) => a[0].localeCompare(b[0])).map(([gName, rows]) => {
            return [
              { type: 'group-header', label: gName },
              ...rows.map(r => ({ ...r, type: 'group-item' }))
            ];
          }).filter(b => b.length > 0);
          listPages = paginateBlocks(groupBlocks, getLimit(22), Math.max(2, Math.floor(6 * heightRatio)));
        } else {
          listPages = chunkFlatList(filteredTx, getLimit(34));
        }
        
        totalPages = listPages.length || 1;

        listPages.forEach((pageItems, pageIdx) => {
          const actualPageIdx = showRvChart ? pageIdx + 1 : pageIdx;
          const actualTotalPages = showRvChart ? totalPages + 1 : totalPages;
          pageViews.push(
            <div key={\`rv-tx-\${pageIdx}\`} className="page-sheet relative flex flex-col justify-between">
              <div className="flex-1">
                {renderPageHeader('Registro de Transacciones de Renta Variable')}
                <table className="w-full text-[8.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 font-semibold text-slate-600 bg-transparent">
                      {visibleCols.map(col => {
                        let align = 'text-left';
                        if (['quantity', 'price', 'fee', 'totalAmountEUR'].includes(col.id)) align = 'text-right';
                        if (col.id === 'currency') align = 'text-center';
                        let width = 'auto';
                        if (['date', 'type', 'assetId', 'quantity'].includes(col.id)) width = 'w-16';
                        if (['price', 'fee'].includes(col.id)) width = 'w-20';
                        if (col.id === 'currency') width = 'w-12';
                        if (col.id === 'totalAmountEUR') width = 'w-24';
                        return (
                          <th key={col.id} className={\`py-0.5 px-1 \${align} \${width}\`}>{col.label}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((tx, idx) => {
                      if (tx.type === 'group-header') {
                        return (
                          <tr key={\`ghead-\${tx.label}-\${idx}\`} className="bg-slate-100/50 font-bold border-t border-slate-350">
                            <td colSpan={visibleCols.length} className="py-2 px-2 text-[10px] text-slate-800 font-sans tracking-wide uppercase">
                              {groupCol1 === 'brokerId' ? 'BROKER' : groupCol1 === 'assetId' ? 'TICKER' : groupCol1}: {tx.label}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={tx.id || idx} className="border-b border-slate-100 hover:bg-slate-50">
                          {visibleCols.map(col => {
                            if (col.id === 'date') return <td key={col.id} className="py-0.5 px-1 font-mono text-slate-650">{formatDate(tx.date)}</td>;
                            if (col.id === 'type') return <td key={col.id} className={\`py-0.5 px-1 font-bold uppercase text-[8px] \${tx.type === 'Compra' ? 'text-blue-700' : tx.type === 'Venta' ? 'text-orange-700' : 'text-green-700'}\`}>{tx.type}</td>;
                            if (col.id === 'assetId') return <td key={col.id} className="py-0.5 px-1 font-mono font-bold text-slate-800">{tx.assetId}</td>;
                            if (col.id === 'brokerId') return <td key={col.id} className="py-0.5 px-1 uppercase text-slate-600 truncate max-w-[80px]">{tx.brokerId}</td>;
                            if (col.id === 'quantity') return <td key={col.id} className="py-0.5 px-1 text-right font-mono">{tx.qty.toFixed(4)}</td>;
                            if (col.id === 'price') return <td key={col.id} className="py-0.5 px-1 text-right font-mono">{tx.price.toFixed(2)}</td>;
                            if (col.id === 'fee') return <td key={col.id} className="py-0.5 px-1 text-right font-mono">{tx.fee.toFixed(2)}</td>;
                            if (col.id === 'currency') return <td key={col.id} className="py-0.5 px-1 text-center font-mono text-[9px] text-slate-500">{tx.currency || 'EUR'}</td>;
                            if (col.id === 'totalAmountEUR') return <td key={col.id} className="py-0.5 px-1 text-right font-sans font-bold tabular-nums text-slate-800">{formatCurrency(tx.totalAmountEUR)}</td>;
                            return <td key={col.id} className="py-0.5 px-1">{tx[col.id]}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(actualPageIdx + 1, actualTotalPages, auditNumber)}
            </div>
          );
        });
      }
    }`;

// Find a subset that matches exactly what was present since the string replace can be picky with whitespace
const startMarker = "    // 8. TRANSACCIONES DE RENTA VARIABLE";
const endMarker = "    // 9. CARTERA DE CROWDFUNDING";
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + rvNewBlock + "\n\n" + content.substring(endIndex);
    fs.writeFileSync('src/pages/PrintPage.jsx', newContent);
    console.log("Successfully replaced rv_transactions block.");
} else {
    console.error("Could not find start or end markers for rv_transactions.");
}

const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. ALL_COLUMNS
const allColsRx = /rv_transactions: \[\s*\{ id: 'date', label: 'Fecha' \},/g;
if (content.match(allColsRx)) {
  content = content.replace(allColsRx, `rv_portfolio: [
      { id: 'assetId', label: 'Ticker' },
      { id: 'assetName', label: 'Activo' },
      { id: 'brokerId', label: 'Broker' },
      { id: 'quantity', label: 'Cant.' },
      { id: 'avgPrice', label: 'PMC' },
      { id: 'currentPrice', label: 'Precio Act.' },
      { id: 'totalCost', label: 'Inversión' },
      { id: 'currentValue', label: 'Valor Actual' },
      { id: 'pnl', label: 'Rendimiento (PnL)' }
    ],
    rv_transactions: [
      { id: 'date', label: 'Fecha' },`);
}

// 2. DEFAULT_VISIBLE_COLUMNS
const defColsRx = /plan_contable: new Set\(\['code','description'\]\)\s*\};/g;
if (content.match(defColsRx)) {
  content = content.replace(defColsRx, `plan_contable: new Set(['code','description']),
    rv_portfolio: new Set(['assetId', 'assetName', 'brokerId', 'quantity', 'avgPrice', 'currentPrice', 'totalCost', 'currentValue', 'pnl']),
    rv_transactions: new Set(['date', 'type', 'assetId', 'brokerId', 'quantity', 'price', 'fee', 'currency', 'totalAmountEUR'])
  };`);
}

// 3. Move chart to rv_portfolio
// First remove the chart from rv_transactions
const chartCodeRegex = /\s*\/\/ Gráficos \(si procede\)[\s\S]*?\/\/ Agrupación/g;
content = content.replace(chartCodeRegex, '\n      // Agrupación');

// Now, replace the entire rv_portfolio block
const rvPortOld = `    // 7. CARTERA DE RENTA VARIABLE
    if (selectedTemplate === 'rv_portfolio') {
      const listPages = chunkFlatList(computedRvHoldings.holdings, getLimit(30));
      const totalPages = listPages.length || 1;
      const sum = computedRvHoldings.summary;

      if (listPages.length === 0) {
        pageViews.push(
          <div key="empty-rv" className="page-sheet relative">
            {renderPageHeader('Cartera de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay posiciones registradas.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        listPages.forEach((pageItems, pageIdx) => {
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={\`rv-p-\${pageIdx}\`} className="page-sheet relative">
              <div>
                {renderPageHeader('Cartera de Renta Variable - Posiciones')}
                
                {pageIdx === 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-4 text-[10px] select-none no-print border border-slate-350 p-2 bg-slate-50">
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Inversión Total</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalCost)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Valor de Mercado</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalValue)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Rendimiento Total (PnL)</span>
                      <span className={\`font-mono font-bold text-[12px] \${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>
                        {formatCurrency(sum.pnl)} € ({sum.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Dividendos Cobrados</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.dividends)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Efectivo en Brokers</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.cash)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Total Cartera</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.grandTotal)} €</span>
                    </div>
                  </div>
                )}

                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      <th className="py-2 px-1 text-left w-16">Ticker</th>
                      <th className="py-2 px-1 text-left">Activo</th>
                      <th className="py-2 px-1 text-left w-20">Broker</th>
                      <th className="py-2 px-1 text-right w-16">Cant.</th>
                      <th className="py-2 px-1 text-right w-20">PMC</th>
                      <th className="py-2 px-1 text-right w-20">Precio Act.</th>
                      <th className="py-2 px-1 text-right w-24">Inversión</th>
                      <th className="py-2 px-1 text-right w-24">Valor Actual</th>
                      <th className="py-2 px-1 text-right w-24">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map(h => (
                      <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-1 font-bold text-slate-800 uppercase">{h.assetId}</td>
                        <td className="py-2 px-1 text-slate-700 truncate max-w-[120px]">{h.assetName}</td>
                        <td className="py-2 px-1 text-slate-600 uppercase text-[9px] truncate max-w-[80px]">{h.brokerId}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums">{h.quantity.toFixed(4)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums">{h.avgPrice.toFixed(2)}</td>
                        <td className="py-2 px-1 text-right font-mono tabular-nums font-bold text-slate-800">{h.currentPrice.toFixed(2)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(h.totalCost)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums font-bold text-slate-800">{formatCurrency(h.currentValue)}</td>
                        <td className={\`py-2 px-1 text-right font-sans font-bold tabular-nums \${h.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>
                          {h.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        <td className="py-2 px-1" colSpan="3">TOTAL POSICIONES:</td>
                        <td className="py-2 px-1" colSpan="3"></td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(sum.totalCost)}</td>
                        <td className="py-2 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(sum.totalValue)}</td>
                        <td className={\`py-2 px-1 text-right font-sans font-bold tabular-nums \${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>
                          {sum.pnlPercent.toFixed(2)}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(pageIdx + 1, totalPages, auditNumber)}
            </div>
          );
        });
      }
    }`;

// Since the regex or replace might fail if exact whitespace changes, we use markers
const startMarker = "    // 7. CARTERA DE RENTA VARIABLE";
const endMarker = "    // 8. TRANSACCIONES DE RENTA VARIABLE";
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

const rvPortNew = `    // 7. CARTERA DE RENTA VARIABLE
    if (selectedTemplate === 'rv_portfolio') {
      const sum = computedRvHoldings.summary;
      let holdings = [...computedRvHoldings.holdings];

      // Filtros
      if (rvBrokerFilter.length > 0) {
        holdings = holdings.filter(h => rvBrokerFilter.includes(h.brokerId));
      }
      if (rvAssetFilter.length > 0) {
        holdings = holdings.filter(h => rvAssetFilter.includes(h.assetId));
      }

      // Ordenación
      if (sortCol1 !== 'none') {
        holdings.sort((a, b) => {
          let valA = a[sortCol1];
          let valB = b[sortCol1];
          if (valA < valB) return sortDir1 === 'asc' ? -1 : 1;
          if (valA > valB) return sortDir1 === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // Gráficos (Histórico de Renta Variable)
      if (showRvChart) {
        // Prepare chart data based on grouped periods using all rvTransactions
        const chartDataMap = {};
        let txs = [...rvTransactions];
        // Apply same filters if needed? Usually historical chart is for the whole portfolio or filtered portfolio.
        if (rvBrokerFilter.length > 0) txs = txs.filter(tx => rvBrokerFilter.includes(tx.brokerId));
        if (rvAssetFilter.length > 0) txs = txs.filter(tx => rvAssetFilter.includes(tx.assetId));

        txs.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(tx => {
          const d = new Date(tx.date);
          const monthKey = \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`;
          if (!chartDataMap[monthKey]) chartDataMap[monthKey] = { period: monthKey, compras: 0, ventas: 0, dividendos: 0 };
          const qty = parseFloat(tx.quantity) || 0;
          const price = parseFloat(tx.price) || 0;
          const fee = parseFloat(tx.fee) || 0;
          const rate = parseFloat(tx.exchangeRate) || 1.0;
          let eur = 0;
          if (tx.type === 'Dividendo') eur = (qty * price - fee) / rate;
          else if (tx.type === 'Compra') eur = (qty * price + fee) / rate;
          else eur = (qty * price - fee) / rate;

          if (tx.type === 'Compra') chartDataMap[monthKey].compras += eur;
          if (tx.type === 'Venta') chartDataMap[monthKey].ventas += eur;
          if (tx.type === 'Dividendo') chartDataMap[monthKey].dividendos += eur;
        });
        const chartData = Object.values(chartDataMap);

        pageViews.push(
          <div key="rv-chart" className="page-sheet relative">
            {renderPageHeader('Histórico de Renta Variable (Cartera Consolidada)')}
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
      
      const cv = (colId) => isColVisible('rv_portfolio', colId);
      const visibleCols = (ALL_COLUMNS.rv_portfolio || []).filter(col => cv(col.id));

      if (holdings.length === 0) {
        pageViews.push(
          <div key="empty-rv" className="page-sheet relative">
            {renderPageHeader('Cartera de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay posiciones registradas.</p>
            {renderPageFooter(showRvChart ? 2 : 1, showRvChart ? 2 : 1, auditNumber)}
          </div>
        );
      } else {
        if (groupCol1 !== 'none') {
          const groupMap = {};
          holdings.forEach(h => {
            const k = h[groupCol1] || 'Sin Clasificar';
            if (!groupMap[k]) groupMap[k] = [];
            groupMap[k].push(h);
          });
          const groupBlocks = Object.entries(groupMap).sort((a,b) => a[0].localeCompare(b[0])).map(([gName, rows]) => {
            return [
              { type: 'group-header', label: gName },
              ...rows.map(r => ({ ...r, type: 'group-item' }))
            ];
          }).filter(b => b.length > 0);
          listPages = paginateBlocks(groupBlocks, getLimit(22), Math.max(2, Math.floor(6 * heightRatio)));
        } else {
          listPages = chunkFlatList(holdings, getLimit(30));
        }

        totalPages = listPages.length || 1;

        listPages.forEach((pageItems, pageIdx) => {
          const actualPageIdx = showRvChart ? pageIdx + 1 : pageIdx;
          const actualTotalPages = showRvChart ? totalPages + 1 : totalPages;
          const isLastPage = pageIdx === listPages.length - 1;
          pageViews.push(
            <div key={\`rv-p-\${pageIdx}\`} className="page-sheet relative flex flex-col justify-between">
              <div className="flex-1">
                {renderPageHeader('Cartera de Renta Variable - Posiciones')}
                
                {pageIdx === 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-4 text-[10px] select-none no-print border border-slate-350 p-2 bg-slate-50">
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Inversión Total</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalCost)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Valor de Mercado</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.totalValue)} €</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Rendimiento Total (PnL)</span>
                      <span className={\`font-mono font-bold text-[12px] \${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>
                        {formatCurrency(sum.pnl)} € ({sum.pnlPercent.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Dividendos Cobrados</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.dividends)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Efectivo en Brokers</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.cash)} €</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 font-bold block uppercase text-[8px]">Total Cartera</span>
                      <span className="font-mono font-bold text-slate-800 text-[12px]">{formatCurrency(sum.grandTotal)} €</span>
                    </div>
                  </div>
                )}

                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      {visibleCols.map(col => {
                        let align = 'text-left';
                        if (['quantity', 'avgPrice', 'currentPrice', 'totalCost', 'currentValue', 'pnl'].includes(col.id)) align = 'text-right';
                        let width = 'auto';
                        if (['assetId', 'quantity'].includes(col.id)) width = 'w-16';
                        if (['avgPrice', 'currentPrice', 'brokerId'].includes(col.id)) width = 'w-20';
                        if (['totalCost', 'currentValue', 'pnl'].includes(col.id)) width = 'w-24';
                        return <th key={col.id} className={\`py-2 px-1 \${align} \${width}\`}>{col.label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((h, ri) => {
                      if (h.type === 'group-header') {
                        return (
                          <tr key={\`ghead-\${h.label}-\${ri}\`} className="bg-slate-100/50 font-bold border-t border-slate-350">
                            <td colSpan={visibleCols.length} className="py-2 px-2 text-[10px] text-slate-800 font-sans tracking-wide uppercase">
                              {groupCol1 === 'brokerId' ? 'BROKER' : groupCol1 === 'assetId' ? 'TICKER' : groupCol1}: {h.label}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={h.id || ri} className="border-b border-slate-100 hover:bg-slate-50">
                          {visibleCols.map(col => {
                            if (col.id === 'assetId') return <td key={col.id} className="py-2 px-1 font-bold text-slate-800 uppercase">{h.assetId}</td>;
                            if (col.id === 'assetName') return <td key={col.id} className="py-2 px-1 text-slate-700 truncate max-w-[120px]">{h.assetName}</td>;
                            if (col.id === 'brokerId') return <td key={col.id} className="py-2 px-1 text-slate-600 uppercase text-[9px] truncate max-w-[80px]">{h.brokerId}</td>;
                            if (col.id === 'quantity') return <td key={col.id} className="py-2 px-1 text-right font-mono tabular-nums">{h.quantity.toFixed(4)}</td>;
                            if (col.id === 'avgPrice') return <td key={col.id} className="py-2 px-1 text-right font-mono tabular-nums">{h.avgPrice.toFixed(2)}</td>;
                            if (col.id === 'currentPrice') return <td key={col.id} className="py-2 px-1 text-right font-mono tabular-nums font-bold text-slate-800">{h.currentPrice.toFixed(2)}</td>;
                            if (col.id === 'totalCost') return <td key={col.id} className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(h.totalCost)}</td>;
                            if (col.id === 'currentValue') return <td key={col.id} className="py-2 px-1 text-right font-sans tabular-nums font-bold text-slate-800">{formatCurrency(h.currentValue)}</td>;
                            if (col.id === 'pnl') return <td key={col.id} className={\`py-2 px-1 text-right font-sans font-bold tabular-nums \${h.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>{h.pnlPercent.toFixed(2)}%</td>;
                            return <td key={col.id} className="py-2 px-1">{h[col.id]}</td>;
                          })}
                        </tr>
                      );
                    })}
                    {isLastPage && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[11px]">
                        {visibleCols.map((col, idx) => {
                          if (idx === 0) return <td key={col.id} className="py-2 px-1" colSpan={Math.max(1, visibleCols.findIndex(c => ['totalCost', 'currentValue', 'pnl'].includes(c.id)))}>TOTAL POSICIONES:</td>;
                          if (idx < visibleCols.findIndex(c => ['totalCost', 'currentValue', 'pnl'].includes(c.id))) return null;
                          if (col.id === 'totalCost') return <td key={col.id} className="py-2 px-1 text-right font-sans tabular-nums">{formatCurrency(sum.totalCost)}</td>;
                          if (col.id === 'currentValue') return <td key={col.id} className="py-2 px-1 text-right font-sans tabular-nums text-slate-900">{formatCurrency(sum.totalValue)}</td>;
                          if (col.id === 'pnl') return <td key={col.id} className={\`py-2 px-1 text-right font-sans font-bold tabular-nums \${sum.pnl >= 0 ? 'text-green-700' : 'text-red-700'}\`}>{sum.pnlPercent.toFixed(2)}%</td>;
                          return <td key={col.id} className="py-2 px-1"></td>;
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {renderPageFooter(actualPageIdx + 1, actualTotalPages, auditNumber)}
            </div>
          );
        });
      }
    }
`;

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + rvPortNew + "\n\n" + content.substring(endIndex);
}

// 4. Update the sidebar array checks to include 'rv_portfolio' for the Opciones Renta Variable sidebar itself
const optsRvRegex = /{ \['rv_transactions'\].includes\(selectedTemplate\) && \(/g;
if (content.match(optsRvRegex)) {
  content = content.replace(optsRvRegex, "{['rv_transactions', 'rv_portfolio'].includes(selectedTemplate) && (");
}

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Successfully updated PrintPage.jsx for rv_portfolio and defaults');

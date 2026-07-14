const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// Replace showRvChart state usage in Opciones Renta Variable
const chartFilterRegex = /<label className="flex items-center gap-1.5 text-\[9px\] font-bold text-slate-500 uppercase mt-2">\s*<input\s*type="checkbox"\s*checked=\{showRvChart\}\s*onChange=\{\(e\) => setShowRvChart\(e\.target\.checked\)\}\s*className="w-3 h-3"\s*\/>\s*<span>Mostrar Grficos<\/span>\s*<\/label>/;
const newChartFilter = `<label className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 uppercase mt-2">
                      <span>Gráfico</span>
                      <select 
                        value={rvChartType} 
                        onChange={(e) => setRvChartType(e.target.value)}
                        className="win-input w-full text-[11px] font-sans rounded h-[24px]"
                      >
                        <option value="none">Sin gráfico</option>
                        <option value="evolucion">Histórico (Volumen)</option>
                        <option value="pnl_eur">Beneficio Latente (€)</option>
                        <option value="pnl_pct">Beneficio Latente (%)</option>
                        <option value="allocation">Distribución (Acciones)</option>
                      </select>
                    </label>`;
content = content.replace(chartFilterRegex, newChartFilter);

// Replace the chart rendering block in rv_portfolio
const chartRenderRegex = /\/\/ Grficos \(Histrico de Renta Variable\)\s*if \(showRvChart\) \{[\s\S]*?renderPageFooter\(1, 1, auditNumber\)\s*<\/div>\s*\);\s*\}/;
const newChartRender = `// Gráficos (Histórico de Renta Variable)
      if (rvChartType !== 'none') {
        let chartComponent = null;

        if (rvChartType === 'evolucion') {
          const chartDataMap = {};
          let txs = [...rvTransactions];
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
          chartComponent = (
            <div className="flex flex-col items-center justify-center mt-10" style={{ height: '400px' }}>
              <span className="text-[12px] font-bold text-slate-700 mb-4 font-sans">Evolución Histórica (Compras, Ventas, Dividendos)</span>
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
          );
        } else if (rvChartType === 'pnl_eur' || rvChartType === 'pnl_pct') {
          const isEur = rvChartType === 'pnl_eur';
          const chartData = holdings
            .filter(h => isEur ? Math.abs(h.pnl) > 0.01 : Math.abs(h.pnlPercent) > 0.01)
            .sort((a, b) => isEur ? b.pnl - a.pnl : b.pnlPercent - a.pnlPercent);

          chartComponent = (
            <div className="flex flex-col items-center justify-center mt-10" style={{ height: '400px' }}>
              <span className="text-[12px] font-bold text-slate-700 mb-4 font-sans">
                Beneficio Latente por Acción ({isEur ? '€' : '%'})
              </span>
              <ResponsiveContainer width="90%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="symbol" tick={{fontSize: 10}} />
                  <YAxis tick={{fontSize: 10}} tickFormatter={(val) => isEur ? \`€\${(val).toFixed(0)}\` : \`\${val.toFixed(0)}%\`} />
                  <Tooltip formatter={(val) => isEur ? formatCurrency(val) : \`\${val.toFixed(2)}%\`} />
                  <Bar dataKey={isEur ? "pnl" : "pnlPercent"} fill="#1e40af">
                    {chartData.map((entry, index) => (
                      <Cell key={\`cell-\${index}\`} fill={(isEur ? entry.pnl : entry.pnlPercent) >= 0 ? '#16a34a' : '#ea580c'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        } else if (rvChartType === 'allocation') {
          const chartData = holdings
            .filter(h => h.currentValue > 0)
            .sort((a, b) => b.currentValue - a.currentValue);
          const COLORS = ['#1e40af', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#64748b'];

          chartComponent = (
            <div className="flex flex-col items-center justify-center mt-10" style={{ height: '400px' }}>
              <span className="text-[12px] font-bold text-slate-700 mb-4 font-sans">Distribución de Cartera por Acción</span>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    fill="#8884d8"
                    dataKey="currentValue"
                    nameKey="symbol"
                    label={({ symbol, percent }) => \`\${symbol} (\${(percent * 100).toFixed(1)}%)\`}
                    labelLine={true}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          );
        }

        pageViews.push(
          <div key="rv-chart" className="page-sheet relative">
            {renderPageHeader('Gráficos de Renta Variable (Cartera Consolidada)')}
            {chartComponent}
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      }`;
content = content.replace(chartRenderRegex, newChartRender);

// Replace usages of `showRvChart` for pagination footer
content = content.replace(/showRvChart \? 2 : 1/g, "rvChartType !== 'none' ? 2 : 1");
content = content.replace(/showRvChart \? pageIdx \+ 1 : pageIdx/g, "rvChartType !== 'none' ? pageIdx + 1 : pageIdx");
content = content.replace(/showRvChart \? totalPages \+ 1 : totalPages/g, "rvChartType !== 'none' ? totalPages + 1 : totalPages");

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Added rv charts and filters');

const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const regex = /if \(rvChartType !== 'none'\) \{([\s\S]*?pageViews\.push\([\s\S]*?\);\s*)\}/;

const newLogic = `if (rvChartType !== 'none') {
      if (rvChartType === 'historical_advanced') {
        const formatYAxis = (val) => {
          if (Math.abs(val) >= 1000) return \`€\${(val/1000).toFixed(1)}k\`;
          return \`€\${val}\`;
        };
        
        // Page 1: Evolución + Rentabilidad
        pageViews.push(
          <div key="rv-chart-hist-1" className="page-sheet relative flex flex-col">
            {renderPageHeader('Histórico de Renta Variable (Evolución y Rentabilidad)')}
            
            <div className="flex-1 flex flex-col justify-center gap-6 mt-6 px-4">
              <div className="h-[300px]">
                <span className="text-[12px] font-bold text-slate-700 mb-2 font-sans block">Evolución de la Plusvalía Latente</span>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rvLineData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => {
                        if(!val) return '';
                        const d = new Date(val);
                        return \`\${d.getMonth()+1}/\${d.getFullYear().toString().slice(2)}\`;
                    }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={rvMetricsUnit === 'EUR' ? formatYAxis : (v) => \`\${v.toFixed(1)}%\`} />
                    <Tooltip formatter={(value) => rvMetricsUnit === 'EUR' ? [\`\${Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}\`, 'Beneficio'] : [\`\${Number(value).toFixed(2)}%\`, 'Beneficio']} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" name={rvMetricsPrimary === 'VALOR' ? "Beneficio Total (€)" : "Plusvalía Latente (€)"} dataKey={rvMetricsUnit === 'EUR' ? (rvMetricsPrimary === 'VALOR' ? 'beneficioTotal' : 'beneficioLatente') : (rvMetricsPrimary === 'VALOR' ? 'rentabilidadPct' : 'plusvaliaPct')} stroke="#6366f1" fill="#818cf8" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="h-[300px]">
                <span className="text-[12px] font-bold text-slate-700 mb-2 font-sans block">Rentabilidad por Período</span>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rvBarData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatYAxis} />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar name={rvMetricsUnit === 'EUR' ? "Beneficio Período (€)" : "Rentabilidad Período (%)"} dataKey={rvMetricsUnit === 'EUR' ? "gains" : "gainsPct"} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {renderPageFooter(1, 2, auditNumber)}
          </div>
        );

        // Page 2: Drawdown + Distribución
        pageViews.push(
          <div key="rv-chart-hist-2" className="page-sheet relative flex flex-col">
            {renderPageHeader('Histórico de Renta Variable (Riesgo y Distribución)')}
            
            <div className="flex-1 flex flex-col justify-center gap-6 mt-6 px-4">
              <div className="h-[300px]">
                <span className="text-[12px] font-bold text-slate-700 mb-2 font-sans block">Drawdown del Portfolio</span>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rvDrawdownData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(val) => {
                        if(!val) return '';
                        const d = new Date(val);
                        return \`\${d.getMonth()+1}/\${d.getFullYear().toString().slice(2)}\`;
                    }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={rvMetricsUnit === 'EUR' ? formatYAxis : (v) => \`\${v.toFixed(1)}%\`} />
                    <Tooltip formatter={(value) => rvMetricsUnit === 'EUR' ? [\`\${Number(value).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}\`, 'Drawdown'] : [\`\${Number(value).toFixed(2)}%\`, 'Drawdown']} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area type="monotone" name="Drawdown Global" dataKey={rvMetricsUnit === 'EUR' ? "drawdownEUR" : "drawdownPct"} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {rvHistogramData && rvHistogramData.length > 0 && (
              <div className="h-[300px]">
                <span className="text-[12px] font-bold text-slate-700 mb-2 font-sans block">Distribución de Frecuencias</span>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rvHistogramData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} barCategoryGap={0} barGap={0}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar name="Frecuencia (Días/Meses)" dataKey="count" fill="#3b82f6" fillOpacity={0.45} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" name="Densidad Normal" dataKey="density" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              )}
            </div>
            {renderPageFooter(2, 2, auditNumber)}
          </div>
        );
      } else if (rvChartType === 'evolucion') {
$1
      }
    }`;

content = content.replace(regex, newLogic);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log("Fixed charts logic");

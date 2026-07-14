const fs = require('fs');
let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

// 1. rv_portfolio: support columnOrder and font-sans tabular-nums
const portRegex = /const visibleCols = \(ALL_COLUMNS\.rv_portfolio \|\| \[\]\)\.filter\(col => cv\(col\.id\)\);/g;
const portReplacement = `const visibleCols = (ALL_COLUMNS.rv_portfolio || []).filter(col => cv(col.id));
      if (columnOrder['rv_portfolio']) {
        const orderMap = new Map(columnOrder['rv_portfolio'].map((id, i) => [id, i]));
        visibleCols.sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
          return idxA - idxB;
        });
      }`;
content = content.replace(portRegex, portReplacement);
content = content.replace(/font-mono/g, "font-sans tabular-nums");

// 2. rv_transactions: replace the entire block to use visibleCols and columnOrder
const txStartMarker = "    // 8. TRANSACCIONES DE RENTA VARIABLE";
const txEndMarker = "    // 9. CARTERA DE CROWDFUNDING";
const txIdx1 = content.indexOf(txStartMarker);
const txIdx2 = content.indexOf(txEndMarker);

if (txIdx1 !== -1 && txIdx2 !== -1) {
  const newTxBlock = `    // 8. TRANSACCIONES DE RENTA VARIABLE
    if (selectedTemplate === 'rv_transactions') {
      let filteredTx = [...txsWithAmounts];
      
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
          if (valA < valB) return sortDir1 === 'asc' ? -1 : 1;
          if (valA > valB) return sortDir1 === 'asc' ? 1 : -1;
          return 0;
        });
      } else {
        filteredTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Default
      }

      // Agrupación y Paginación
      let listPages = [];
      let totalPages = 1;
      
      const cv = (colId) => isColVisible('rv_transactions', colId);
      const visibleCols = (ALL_COLUMNS.rv_transactions || []).filter(col => cv(col.id));
      if (columnOrder['rv_transactions']) {
        const orderMap = new Map(columnOrder['rv_transactions'].map((id, i) => [id, i]));
        visibleCols.sort((a, b) => {
          const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
          const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
          return idxA - idxB;
        });
      }

      if (filteredTx.length === 0) {
        pageViews.push(
          <div key="empty-rv-tx" className="page-sheet relative">
            {renderPageHeader('Registro de Transacciones de Renta Variable')}
            <p className="text-center py-12 text-slate-450 italic text-[10px]">No hay transacciones que mostrar.</p>
            {renderPageFooter(1, 1, auditNumber)}
          </div>
        );
      } else {
        if (groupCol1 !== 'none') {
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
          listPages = paginateBlocks(groupBlocks, getLimit(45), Math.max(2, Math.floor(6 * heightRatio)));
        } else {
          listPages = chunkFlatList(filteredTx, getLimit(50));
        }

        totalPages = listPages.length || 1;

        listPages.forEach((pageItems, pageIdx) => {
          pageViews.push(
            <div key={\`rv-t-\${pageIdx}\`} className="page-sheet relative flex flex-col justify-between">
              <div className="flex-1">
                {renderPageHeader('Registro de Transacciones de Renta Variable')}
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-100 font-bold text-slate-700">
                      {visibleCols.map(col => {
                        let align = 'text-left';
                        if (['quantity', 'price', 'fee', 'totalAmountEUR'].includes(col.id)) align = 'text-right';
                        let width = 'auto';
                        if (col.id === 'date') width = 'w-16';
                        if (col.id === 'type' || col.id === 'brokerId') width = 'w-20';
                        if (col.id === 'quantity' || col.id === 'price') width = 'w-20';
                        if (col.id === 'totalAmountEUR') width = 'w-24';
                        return <th key={col.id} className={\`py-2 px-1 \${align} \${width}\`}>{col.label}</th>;
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
                            if (col.id === 'date') return <td key={col.id} className="py-0.5 px-1 font-sans tabular-nums text-slate-650">{formatDate(tx.date)}</td>;
                            if (col.id === 'type') return <td key={col.id} className="py-0.5 px-1 font-bold text-[10px] text-slate-600 uppercase">{tx.type}</td>;
                            if (col.id === 'assetId') return <td key={col.id} className="py-0.5 px-1 font-bold text-slate-800 uppercase">{tx.assetId}</td>;
                            if (col.id === 'brokerId') return <td key={col.id} className="py-0.5 px-1 text-[9px] uppercase text-slate-500">{tx.brokerId}</td>;
                            if (col.id === 'quantity') return <td key={col.id} className="py-0.5 px-1 text-right font-sans tabular-nums">{(tx.qty || 0).toFixed(4)}</td>;
                            if (col.id === 'price') return <td key={col.id} className="py-0.5 px-1 text-right font-sans tabular-nums">{(tx.price || 0).toFixed(2)}</td>;
                            if (col.id === 'fee') return <td key={col.id} className="py-0.5 px-1 text-right font-sans tabular-nums">{(tx.fee || 0).toFixed(2)}</td>;
                            if (col.id === 'currency') return <td key={col.id} className="py-0.5 px-1 text-center font-sans tabular-nums">{tx.currency}</td>;
                            if (col.id === 'totalAmountEUR') return <td key={col.id} className="py-0.5 px-1 text-right font-sans font-bold tabular-nums text-slate-800">{formatCurrency(tx.totalAmountEUR || 0)}</td>;
                            return <td key={col.id} className="py-0.5 px-1">{tx[col.id]}</td>;
                          })}
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
    }

`;
  content = content.substring(0, txIdx1) + newTxBlock + "\n" + content.substring(txIdx2);
}

fs.writeFileSync('src/pages/PrintPage.jsx', content);
console.log('Successfully updated rv_transactions block for dynamic columns and column reordering');

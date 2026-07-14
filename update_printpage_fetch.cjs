const fs = require('fs');

let content = fs.readFileSync('src/pages/PrintPage.jsx', 'utf8');

const historyFetchCode = `
    const unsubRvHistory = onSnapshot(
      query(collection(db, 'rv_asset_history'), where('userId', 'in', userIds)),
      (snap) => {
        const hMap = {};
        snap.docs.forEach(d => {
          const data = d.data();
          if (!hMap[data.assetId]) hMap[data.assetId] = {};
          hMap[data.assetId][data.date] = data.close;
        });
        setRvAssetHistory(hMap);
      }
    );

    const unsubRvConfig = onSnapshot(
      doc(db, 'rv_config', userIds[0]),
      (snapConf) => {
        if (snapConf.exists()) setRvConfig(snapConf.data());
      }
    );
`;

const unsubAllCode = `
      if (unsubRvHistory) unsubRvHistory();
      if (unsubRvConfig) unsubRvConfig();
`;

// Insert after setCfInvestments
content = content.replace(
  /\(snap\) => setCfInvestments\(snap\.docs\.map\(doc => \(\{ id: doc\.id, \.\.\.doc\.data\(\) \}\)\)\)\r?\n\s*\);/,
  match => match + '\n' + historyFetchCode
);

content = content.replace(
  /if \(unsubCfInvestments\) unsubCfInvestments\(\);/,
  match => match + unsubAllCode
);

// Add the state variables
content = content.replace(
  /const \[cfInvestments, setCfInvestments\] = useState\(\[\]\);/,
  match => match + `\n  const [rvAssetHistory, setRvAssetHistory] = useState({});\n  const [rvConfig, setRvConfig] = useState({});`
);

fs.writeFileSync('src/pages/PrintPage.jsx', content, 'utf8');
console.log('Updated PrintPage.jsx fetching logic');

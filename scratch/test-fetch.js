const test = async () => {
  const ticker = 'AAPL';
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  
  const proxies = [
    { name: 'cors.lol', url: `https://cors.lol/?url=${encodeURIComponent(yahooUrl)}` },
    { name: 'workers.dev', url: `https://cors-proxy.htmldev.workers.dev/?url=${encodeURIComponent(yahooUrl)}` },
    { name: 'bridge.su', url: `https://cors.bridge.su/${yahooUrl}` }
  ];

  for (const proxy of proxies) {
    try {
      console.log(`\n--- Fetching via ${proxy.name} ---`);
      const resp = await fetch(proxy.url);
      console.log(`Status: ${resp.status}`);
      if (!resp.ok) continue;
      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      if (result) {
        console.log(`Success! Price: ${result.meta.regularMarketPrice}`);
      } else {
        console.log(`Failed. Result keys:`, Object.keys(json));
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
};

test();

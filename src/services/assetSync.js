import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

// Helper to fetch price from Yahoo Finance using CORS proxies
async function fetchYahooPrice(ticker) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  
  const proxies = [
    { url: `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`, mode: 'direct' },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`, mode: 'wrapped' },
  ];
  
  let lastError = 'No proxies succeeded';
  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy.url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const text = await resp.text();
      let json = null;
      if (proxy.mode === 'wrapped') {
        const outer = JSON.parse(text);
        json = JSON.parse(outer.contents);
      } else {
        json = JSON.parse(text);
      }
      
      const result = json?.chart?.result?.[0];
      if (result) {
        // First try regularMarketPrice
        const marketPrice = result.meta?.regularMarketPrice;
        if (marketPrice != null && marketPrice > 0) {
          return parseFloat(marketPrice);
        }
        // Fallback to close prices
        const closes = result.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter(c => c != null);
        if (validCloses.length > 0) {
          return parseFloat(validCloses[validCloses.length - 1]);
        }
      }
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }
  throw new Error(`Yahoo Finance (${ticker}): ${lastError}`);
}

// Helper to fetch price from CoinGecko
async function fetchCoinGeckoPrice(coinId, currency) {
  const vsCurrency = currency.toLowerCase();
  const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId.toLowerCase()}&vs_currencies=${vsCurrency}`;
  
  try {
    const resp = await fetch(cgUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}`);
    const json = await resp.json();
    const price = json?.[coinId.toLowerCase()]?.[vsCurrency];
    if (price != null) {
      return parseFloat(price);
    }
    throw new Error(`Price not found in response`);
  } catch (e) {
    throw new Error(`CoinGecko (${coinId}): ${e.message}`);
  }
}

/**
 * Updates prices for all assets of a user that have a configured API source.
 */
export async function syncAllAssetPrices(userId, targetUserIds = null) {
  const userIds = targetUserIds || [userId];
  
  try {
    // 1. Fetch all assets for user(s)
    const q = query(collection(db, 'rv_assets'), where('userId', 'in', userIds));
    const snap = await getDocs(q);
    const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    let updatedCount = 0;
    let failedCount = 0;
    const errors = [];
    
    // 2. Loop and sync prices in parallel
    const promises = assets.map(async (asset) => {
      const apiSource = asset.apiSource || 'Yahoo Finance';
      const ticker = asset.id.trim().toUpperCase();
      const currency = asset.currency || 'EUR';
      
      if (!asset.id) return;
      
      try {
        let price = null;
        if (apiSource === 'Yahoo Finance') {
          price = await fetchYahooPrice(ticker);
        } else if (apiSource === 'CoinGecko') {
          price = await fetchCoinGeckoPrice(asset.id, currency);
        } else {
          // Other APIs not implemented
          return;
        }
        
        if (price != null && !isNaN(price)) {
          const assetRef = doc(db, 'rv_assets', asset.id);
          await updateDoc(assetRef, {
            currentPrice: price,
            priceLastUpdated: new Date().toISOString()
          });
          updatedCount++;
        }
      } catch (err) {
        console.error(`Failed to sync price for asset ${asset.id}:`, err);
        failedCount++;
        errors.push(`${asset.id}: ${err.message}`);
      }
    });
    
    await Promise.all(promises);
    
    return {
      success: true,
      updatedCount,
      failedCount,
      errors
    };
  } catch (error) {
    console.error("Error syncing all asset prices:", error);
    throw error;
  }
}

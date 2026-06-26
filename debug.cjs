const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`PAGE ERROR:`, msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log(`PAGE EXCEPTION:`, error.message);
  });

  await page.goto('http://localhost:5173/rentals', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  
  console.log('Testing RealEstate page:');
  await page.goto('http://localhost:5173/real-estate', { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);
  
  await browser.close();
})();

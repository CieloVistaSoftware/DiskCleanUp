import { chromium } from 'playwright';

const BASE = 'http://localhost:5000';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const hasMenu = await page.locator('#sectionMenu').count();
    if (!hasMenu) throw new Error('Missing #sectionMenu');

    const navButtons = await page.locator('nav button[data-section]').count();
    if (navButtons !== 0) throw new Error(`Expected 0 nav section buttons, found ${navButtons}`);

    await page.selectOption('#sectionMenu', 'large');
    await page.waitForTimeout(100);
    const largeActive = await page.locator('#section-large.active-section').count();
    if (!largeActive) throw new Error('Dropdown change did not activate #section-large');

    await page.selectOption('#sectionMenu', 'ext-search');
    await page.waitForTimeout(100);
    const extActive = await page.locator('#section-ext-search.active-section').count();
    if (!extActive) throw new Error('Dropdown change did not activate #section-ext-search');

    console.log('PASS nav-dropdown-tests');
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error('FAIL nav-dropdown-tests:', e.message);
  process.exit(1);
});

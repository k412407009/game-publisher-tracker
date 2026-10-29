import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.WATCHLIST_URL || 'http://127.0.0.1:4173/';
const chromePath = process.env.CHROME_PATH;
const outputDir = fileURLToPath(new URL('../reports/', import.meta.url));
const browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
const issues = [];

async function inspectDesktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', message => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => issues.push(`pageerror: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#productRows tr');

  const heading = await page.locator('h1').innerText();
  const kpis = await page.locator('.kpi').count();
  const initialRows = await page.locator('#productRows tr').count();
  const initialFirst = await page.locator('#productRows .app-title').first().innerText();
  await page.locator('#cohortFilter').selectOption('june-2026');
  const cohortCount = await page.locator('#resultCount').innerText();
  const cohortHasOakever = await page.locator('#companyFilter').locator('option', { hasText: 'Oakever' }).count();
  await page.locator('#cohortFilter').selectOption('');

  await page.locator('[data-sort="ratings"]').click();
  const hottestFirst = await page.locator('#productRows .app-title').first().innerText();

  await page.locator('#releaseFilter').selectOption('all');
  await page.locator('#searchInput').fill('Cell Survivor');
  const searchCount = await page.locator('#resultCount').innerText();
  const searchFirst = await page.locator('#productRows .app-title').first().innerText();

  await page.locator('#searchInput').fill('Mini Tales');
  const miniTalesCount = await page.locator('#resultCount').innerText();
  const miniTalesDate = await page.locator('#productRows tr').first().locator('td').nth(2).innerText();
  const miniTalesExposure = await page.locator('#productRows tr').first().locator('td').nth(3).innerText();

  await page.locator('#searchInput').fill('Random Dice 2');
  const randomDiceCount = await page.locator('#resultCount').innerText();
  const randomDiceFirst = await page.locator('#productRows .app-title').first().innerText();

  await page.locator('[data-view="td"]').click();
  await page.waitForSelector('#view-td.is-active');
  const tdCards = await page.locator('.td-card').count();
  const tdKpis = await page.locator('.td-kpis article').count();
  const tdTopFirst = await page.locator('#tdTopRows tr').first().innerText();
  const tdRankingRows = await page.locator('#tdTopRows tr').count();
  const tdRankingIcons = await page.locator('#tdTopRows .td-ranking-icon').count();
  const tdProductHref = await page.locator('#tdTopRows .td-product-link').first().getAttribute('href');
  await page.locator('[data-td-sort="date"]').click();
  const tdDateSortedFirst = await page.locator('#tdTopRows .td-product-link').first().innerText();
  const tdDateSortDirection = await page.locator('[data-td-sort="date"]').locator('xpath=..').getAttribute('aria-sort');
  await page.locator('[data-td-sort="revenue"]').click();
  const tdRevenueSortedFirst = await page.locator('#tdTopRows .td-product-link').first().innerText();
  await page.locator('#tdSearch').fill('Dicero');
  const tdSearchCount = await page.locator('#tdResultCount').innerText();
  const tdSearchFirst = await page.locator('.td-card h3').first().innerText();
  await page.locator('#tdSearch').fill('');
  await page.locator('#showLiveTd').click();
  const liveTdFilter = await page.locator('#tagFilter').inputValue();
  const liveTdCount = await page.locator('#resultCount').innerText();
  await page.locator('[data-view="td"]').click();
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#view-td').offsetTop, behavior: 'instant' }));
  await page.screenshot({ path: `${outputDir}watchlist-td-desktop.png` });

  await page.locator('[data-view="accounts"]').click();
  await page.waitForSelector('#view-accounts.is-active');
  const accountCards = await page.locator('.account-card').count();
  const bokeText = await page.locator('.company-group').filter({ hasText: '波克城市' }).innerText();
  const treepllaAppleLink = await page.locator('.company-group').filter({ hasText: 'TREEPLLA' }).locator('a[href*="apps.apple.com"]').count();

  await page.locator('[data-view="method"]').click();
  const methods = await page.locator('.method-copy article').count();
  await page.locator('[data-view="products"]').click();
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.screenshot({ path: `${outputDir}watchlist-desktop.png` });

  return {
    heading: heading.replace(/\n/g, ' / '),
    kpis,
    initialRows,
    initialFirst,
    cohortCount,
    cohortHasOakever,
    hottestFirst,
    searchCount,
    searchFirst,
    miniTalesCount,
    miniTalesDate: miniTalesDate.replace(/\n/g, ' / '),
    miniTalesExposure: miniTalesExposure.replace(/\n/g, ' / '),
    randomDiceCount,
    randomDiceFirst,
    tdCards,
    tdKpis,
    tdTopFirst: tdTopFirst.replace(/\n/g, ' / '),
    tdRankingRows,
    tdRankingIcons,
    tdProductHref,
    tdDateSortedFirst,
    tdDateSortDirection,
    tdRevenueSortedFirst,
    tdSearchCount,
    tdSearchFirst,
    liveTdFilter,
    liveTdCount,
    accountCards,
    bokeAccountsVisible: ['Perfeggs', 'Higgs Studio', 'Cobby Labs'].every(name => bokeText.includes(name)),
    treepllaAppleLink,
    methods,
    outerOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  };
}

async function inspectMobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('console', message => {
    if (message.type() === 'error') issues.push(`mobile console: ${message.text()}`);
  });
  page.on('pageerror', error => issues.push(`mobile pageerror: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#productRows tr');
  const tableScrollable = await page.locator('#view-products .table-wrap').evaluate(element => element.scrollWidth > element.clientWidth);
  await page.locator('[data-view="td"]').click();
  await page.waitForSelector('#view-td.is-active');
  const tdCards = await page.locator('.td-card').count();
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('#view-td').offsetTop, behavior: 'instant' }));
  await page.screenshot({ path: `${outputDir}watchlist-td-mobile.png` });
  await page.screenshot({ path: `${outputDir}watchlist-mobile.png`, fullPage: true });
  return {
    navVisible: await page.locator('.view-nav').isVisible(),
    cardsVisible: await page.locator('.signal-card').count(),
    outerOverflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
    tableScrollable,
    tdCards
  };
}

const desktop = await inspectDesktop();
const mobile = await inspectMobile();
await browser.close();

console.log(JSON.stringify({ desktop, mobile, issues }, null, 2));
if (
  issues.length || desktop.kpis !== 5 || desktop.initialRows < 1 || !desktop.cohortCount || !desktop.cohortHasOakever || !desktop.treepllaAppleLink ||
  desktop.searchCount !== '1 款结果' || desktop.searchFirst !== 'Cell Survivor' ||
  desktop.miniTalesCount !== '1 款结果' || !desktop.miniTalesDate.includes('2024/12') ||
  !desktop.miniTalesExposure.includes('LoadComplete') || !desktop.miniTalesExposure.includes('DeepSeek复核') || desktop.randomDiceCount !== '1 款结果' ||
  desktop.randomDiceFirst !== 'Random Dice 2' ||
  desktop.tdKpis !== 5 || desktop.tdCards < 1 || !desktop.tdTopFirst.includes('Dicero') ||
  desktop.tdRankingRows < 1 || desktop.tdRankingIcons !== desktop.tdRankingRows ||
  !desktop.tdProductHref?.startsWith('https://play.google.com/') ||
  desktop.tdDateSortedFirst !== 'Pixel Defenders: Merge TD Game' || desktop.tdDateSortDirection !== 'descending' ||
  desktop.tdRevenueSortedFirst !== 'Dicero' ||
  desktop.tdSearchCount !== '1 / 58 款' || desktop.tdSearchFirst !== 'Dicero' ||
  desktop.liveTdFilter !== '塔防' || !parseInt(desktop.liveTdCount) ||
  desktop.accountCards < 1 || !desktop.bokeAccountsVisible || desktop.methods !== 4 ||
  desktop.outerOverflow || mobile.outerOverflow || !mobile.navVisible || !mobile.tableScrollable || mobile.tdCards < 1
) process.exitCode = 1;

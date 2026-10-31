/**
 * scraper.js
 * Handles Cloudflare bypass and HTML fetching from ext.to.
 * Strategy:
 *   1. Try axios (fast, works if CF challenge is absent).
 *   2. Fall back to Puppeteer-stealth (handles JS challenges).
 *   3. Optional: FlareSolverr proxy if configured.
 */

const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { BASE_URL, USER_AGENT, PUPPETEER_TIMEOUT, FLARESOLVERR_URL } = require('./config');

puppeteer.use(StealthPlugin());

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
  });
  return _browser;
}

/**
 * Fetch via FlareSolverr proxy (if URL configured).
 */
async function fetchViaFlareSolverr(url) {
  const res = await axios.post(FLARESOLVERR_URL, {
    cmd: 'request.get',
    url,
    maxTimeout: 60000,
  });
  if (res.data?.status === 'ok') {
    return res.data.solution.response;
  }
  throw new Error('FlareSolverr failed: ' + res.data?.message);
}

/**
 * Fetch via Puppeteer stealth (local headless Chrome).
 */
async function fetchViaPuppeteer(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PUPPETEER_TIMEOUT,
    });
    // Wait until the Cloudflare challenge is solved (if any)
    await page.waitForFunction(
      () => !document.title.toLowerCase().includes('just a moment'),
      { timeout: PUPPETEER_TIMEOUT }
    );
    return await page.content();
  } finally {
    await page.close();
  }
}

/**
 * Fetch via plain Axios (fastest, works for non-CF pages).
 */
async function fetchViaAxios(url) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': BASE_URL,
    },
    timeout: 15000,
  });
  return res.data;
}

/**
 * Main fetch with automatic fallback chain.
 * @param {string} path - URL path relative to BASE_URL, or absolute URL.
 * @returns {string} Raw HTML string.
 */
async function fetchHTML(path) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  // Priority 1: FlareSolverr (if configured)
  if (FLARESOLVERR_URL) {
    try {
      console.log(`[FlareSolverr] Fetching: ${url}`);
      return await fetchViaFlareSolverr(url);
    } catch (e) {
      console.warn('[FlareSolverr] Failed, falling back to Puppeteer:', e.message);
    }
  }

  // Priority 2: Puppeteer stealth
  try {
    console.log(`[Puppeteer] Fetching: ${url}`);
    return await fetchViaPuppeteer(url);
  } catch (e) {
    console.warn('[Puppeteer] Failed, falling back to Axios:', e.message);
  }

  // Priority 3: Plain Axios (for proxied / CF-free environments)
  console.log(`[Axios] Fetching: ${url}`);
  return await fetchViaAxios(url);
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { fetchHTML, closeBrowser };

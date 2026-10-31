/**
 * routes/browse.js
 * GET /api/browse?category=movies&page=1&sort=seeders
 * GET /api/trending?category=all
 * GET /api/latest?page=1
 */

const express = require('express');
const router = express.Router();
const { fetchHTML } = require('../scraper');
const { parseCategoryPage } = require('../parser');
const cache = require('../cache');

const VALID_CATEGORIES = ['movies', 'tv', 'music', 'games', 'software', 'anime', 'books', 'other', 'all'];

router.get('/browse', async (req, res) => {
  try {
    const { category = 'all', page = 1, sort = 'time', order = 'desc' } = req.query;

    if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Valid values: ${VALID_CATEGORIES.join(', ')}`
      });
    }

    const cacheKey = `browse:${category}:${page}:${sort}:${order}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, ...cached });

    const catPath = category === 'all' ? '' : `/en/cat/${category}`;
    const url = `${catPath}/?page=${page}&sort=${sort}&order=${order}`;
    const html = await fetchHTML(url || '/');
    const result = parseCategoryPage(html);

    const payload = { category, page: parseInt(page), totalPages: result.totalPages, count: result.torrents.length, torrents: result.torrents };
    cache.set(cacheKey, payload);
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Browse Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const { category = 'all' } = req.query;
    const cacheKey = `trending:${category}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, ...cached });

    const catPath = category === 'all' ? '/en/top/' : `/en/top/?cat=${category}`;
    const html = await fetchHTML(catPath);
    const result = parseCategoryPage(html);

    const payload = { category, count: result.torrents.length, torrents: result.torrents };
    cache.set(cacheKey, payload, 600);
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Trending Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/latest', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const cacheKey = `latest:${page}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, ...cached });

    const html = await fetchHTML(`/?page=${page}`);
    const result = parseCategoryPage(html);

    const payload = { page: parseInt(page), totalPages: result.totalPages, count: result.torrents.length, torrents: result.torrents };
    cache.set(cacheKey, payload, 120); // 2 min cache for latest
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Latest Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

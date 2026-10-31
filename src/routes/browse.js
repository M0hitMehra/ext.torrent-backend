/**
 * routes/browse.js
 * GET /api/browse?category=movies&page=1&sort=seeders
 * GET /api/trending?category=all
 * GET /api/latest?page=1
 */

const express = require('express');
const router = express.Router();
const indexer = require('../indexer');
const { fetchHTML } = require('../scraper');
const { parseCategoryPage } = require('../parser');
const cache = require('../cache');

const VALID_CATEGORIES = ['movies', 'tv', 'music', 'games', 'software', 'anime', 'books', 'other', 'all'];

router.get('/browse', async (req, res) => {
  try {
    const { category = 'all', page = 1, sort = 'seeders', order = 'desc' } = req.query;

    if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Valid values: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const cacheKey = `browse:${category.toLowerCase()}:${page}:${sort}:${order}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, ...cached });

    let torrents = [];
    let totalPages = 1;

    try {
      const result = await indexer.search({ q: category === 'all' ? '1080p' : category, category, page, sort, order });
      torrents = result.torrents || [];
      totalPages = result.totalPages || 1;
    } catch (e) {
      console.warn('[Indexer Browse Warn]', e.message);
    }

    if (torrents.length === 0) {
      try {
        const catPath = category === 'all' ? '' : `/en/cat/${category}`;
        const url = `${catPath}/?page=${page}&sort=${sort}&order=${order}`;
        const html = await fetchHTML(url || '/');
        const result = parseCategoryPage(html);
        torrents = result.torrents || [];
        totalPages = result.totalPages || 1;
      } catch (e) {
        console.warn('[ext.to Browse Warn]', e.message);
      }
    }

    const payload = {
      category,
      page: parseInt(page),
      totalPages,
      count: torrents.length,
      torrents,
    };

    cache.set(cacheKey, payload, 300);
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Browse Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const { category = 'all' } = req.query;
    const cacheKey = `trending:${category.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, ...cached });

    let torrents = [];

    try {
      const result = await indexer.trending(category);
      torrents = result.torrents || [];
    } catch (e) {
      console.warn('[Indexer Trending Warn]', e.message);
    }

    if (torrents.length === 0) {
      try {
        const catPath = category === 'all' ? '/en/top/' : `/en/top/?cat=${category}`;
        const html = await fetchHTML(catPath);
        const result = parseCategoryPage(html);
        torrents = result.torrents || [];
      } catch (e) {
        console.warn('[ext.to Trending Warn]', e.message);
      }
    }

    const payload = { category, count: torrents.length, torrents };
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

    let torrents = [];
    let totalPages = 1;

    try {
      const result = await indexer.latest(page);
      torrents = result.torrents || [];
      totalPages = result.totalPages || 1;
    } catch (e) {
      console.warn('[Indexer Latest Warn]', e.message);
    }

    if (torrents.length === 0) {
      try {
        const html = await fetchHTML(`/?page=${page}`);
        const result = parseCategoryPage(html);
        torrents = result.torrents || [];
        totalPages = result.totalPages || 1;
      } catch (e) {
        console.warn('[ext.to Latest Warn]', e.message);
      }
    }

    const payload = { page: parseInt(page), totalPages, count: torrents.length, torrents };
    cache.set(cacheKey, payload, 180);
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Latest Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

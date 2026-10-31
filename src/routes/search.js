/**
 * routes/search.js
 * GET /api/search?q=query&page=1&category=movies&sort=seeders
 */

const express = require('express');
const router = express.Router();
const indexer = require('../indexer');
const { fetchHTML } = require('../scraper');
const { parseListPage } = require('../parser');
const cache = require('../cache');

router.get('/', async (req, res) => {
  try {
    const { q, page = 1, category = 'all', sort = 'seeders', order = 'desc' } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required.' });
    }

    const cacheKey = `search:${q.trim().toLowerCase()}:${page}:${category}:${sort}:${order}`;
    const cached = cache.get(cacheKey);
    // Only return cache if it actually contains torrents
    if (cached && cached.torrents && cached.torrents.length > 0) {
      return res.json({ success: true, cached: true, ...cached });
    }

    let torrents = [];
    let totalPages = 1;

    // 1. Multi-source indexer (Apibay + Torrents-CSV)
    try {
      const result = await indexer.search({ q, category, page, sort, order });
      torrents = result.torrents || [];
      totalPages = result.totalPages || 1;
    } catch (e) {
      console.warn('[Indexer Search Error]', e.message);
    }

    // 2. If indexer had no results, attempt ext.to fallback
    if (torrents.length === 0) {
      try {
        const url = `/en/search/?q=${encodeURIComponent(q.trim())}&page=${page}&sort=${sort}&order=${order}`;
        const html = await fetchHTML(url);
        const result = parseListPage(html);
        if (result.torrents && result.torrents.length > 0) {
          torrents = result.torrents;
          totalPages = result.totalPages || 1;
        }
      } catch (e) {
        console.warn('[ext.to Scraper Error]', e.message);
      }
    }

    const payload = {
      query: q,
      category,
      page: parseInt(page),
      totalPages,
      count: torrents.length,
      torrents,
    };

    // ONLY cache if we actually have torrents!
    if (torrents.length > 0) {
      cache.set(cacheKey, payload, 300);
    }

    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Search Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

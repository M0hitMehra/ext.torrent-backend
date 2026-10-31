/**
 * routes/search.js
 * GET /api/search?q=query&page=1&category=movies&sort=seeders
 */

const express = require('express');
const router = express.Router();
const { fetchHTML } = require('../scraper');
const { parseListPage } = require('../parser');
const cache = require('../cache');
const { BASE_URL } = require('../config');

router.get('/', async (req, res) => {
  try {
    const { q, page = 1, category, sort = 'time', order = 'desc' } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required.' });
    }

    const cacheKey = `search:${q}:${page}:${category}:${sort}:${order}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, cached: true, ...cached });
    }

    // Build ext.to search URL
    // ext.to search format: /search/?q=QUERY&page=N
    let url = `/en/search/?q=${encodeURIComponent(q.trim())}&page=${page}`;
    if (sort) url += `&sort=${sort}&order=${order}`;

    const html = await fetchHTML(url);
    const result = parseListPage(html);

    const payload = {
      query: q,
      page: parseInt(page),
      totalPages: result.totalPages,
      count: result.torrents.length,
      torrents: result.torrents,
    };

    cache.set(cacheKey, payload);
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Search Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

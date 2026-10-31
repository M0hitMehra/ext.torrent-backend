/**
 * routes/torrent.js
 * GET /api/torrent/:id  - Full torrent detail with magnet, file list, metadata
 */

const express = require('express');
const router = express.Router();
const indexer = require('../indexer');
const { fetchHTML } = require('../scraper');
const { parseTorrentDetail } = require('../parser');
const cache = require('../cache');

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Torrent ID is required.' });

    const cacheKey = `torrent:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, cached: true, torrent: cached });

    let detail = null;

    // 1. Try indexer detail
    try {
      detail = await indexer.detail(id);
    } catch (e) {
      console.warn('[Indexer Detail Warn]', e.message);
    }

    // 2. If not found, try ext.to
    if (!detail || !detail.title) {
      const paths = [`/en/${id}/`, `/torrent/${id}/`, `/en/torrent/${id}/`];
      for (const path of paths) {
        try {
          const html = await fetchHTML(path);
          detail = parseTorrentDetail(html);
          if (detail && detail.title) break;
        } catch (_) {}
      }
    }

    if (!detail || !detail.title) {
      return res.status(404).json({ success: false, error: 'Torrent not found.' });
    }

    cache.set(cacheKey, detail, 600);
    res.json({ success: true, cached: false, torrent: detail });
  } catch (err) {
    console.error('[Torrent Detail Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

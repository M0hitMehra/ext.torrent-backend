/**
 * routes/torrent.js
 * GET /api/torrent/:id  - Full torrent detail with magnet, file list, metadata
 */

const express = require('express');
const router = express.Router();
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

    // Try common ext.to URL patterns for torrent detail
    const paths = [
      `/en/${id}/`,
      `/torrent/${id}/`,
      `/en/torrent/${id}/`,
    ];

    let detail = null;
    for (const path of paths) {
      try {
        const html = await fetchHTML(path);
        detail = parseTorrentDetail(html);
        if (detail.title) break;
      } catch (e) {
        continue;
      }
    }

    if (!detail || !detail.title) {
      return res.status(404).json({ success: false, error: 'Torrent not found.' });
    }

    cache.set(cacheKey, detail, 600); // Cache detail for 10 minutes
    res.json({ success: true, cached: false, torrent: detail });
  } catch (err) {
    console.error('[Torrent Detail Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

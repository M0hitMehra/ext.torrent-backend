/**
 * routes/magnet.js
 * GET /api/magnet/:id
 * Returns just the magnet link for a given torrent ID (lightweight, cached long).
 * Useful for the player to quickly get the magnet without fetching the full detail.
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

    // Check if we already have full detail cached
    const detailKey = `torrent:${id}`;
    const cached = cache.get(detailKey);
    if (cached && cached.magnet) {
      return res.json({ success: true, cached: true, id, magnet: cached.magnet, infoHash: cached.infoHash });
    }

    const magnetCacheKey = `magnet:${id}`;
    const magnetCached = cache.get(magnetCacheKey);
    if (magnetCached) {
      return res.json({ success: true, cached: true, ...magnetCached });
    }

    let magnet = null;
    let infoHash = null;

    // 1. Try indexer detail
    try {
      const d = await indexer.detail(id);
      if (d && d.magnet) {
        magnet = d.magnet;
        infoHash = d.infoHash;
      }
    } catch (_) {}

    // 2. Fallback to ext.to
    if (!magnet) {
      const paths = [`/en/${id}/`, `/torrent/${id}/`, `/en/torrent/${id}/`];
      for (const path of paths) {
        try {
          const html = await fetchHTML(path);
          const detail = parseTorrentDetail(html);
          if (detail && detail.magnet) {
            magnet = detail.magnet;
            infoHash = detail.infoHash;
            break;
          }
        } catch (_) {}
      }
    }

    if (!magnet) return res.status(404).json({ success: false, error: 'Magnet link not found.' });

    const payload = { id, magnet, infoHash };
    cache.set(magnetCacheKey, payload, 3600); // Cache for 1 hour
    res.json({ success: true, cached: false, ...payload });
  } catch (err) {
    console.error('[Magnet Error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

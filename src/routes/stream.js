/**
 * stream.js
 * Streaming source aggregator & resolver.
 * Scrapes and aggregates live high-definition streaming sources from PopcornTV API
 * and direct embed video networks (VidLink, VidCore, VidSrc, AutoEmbed, EmbedSU).
 */

const express = require('express');
const axios = require('axios');
const cache = require('../cache');

const router = express.Router();

const STREAM_CACHE_TTL = 3600; // 1 hour

/**
 * Fallback provider generator if upstream is unreachable
 */
function generateFallbackSources(type, id, season = 1, episode = 1) {
  const isMovie = type === 'movie';
  const sources = [
    {
      provider: 'VidLink (Ad-Free)',
      embedUrl: isMovie
        ? `https://vidlink.pro/movie/${id}?primaryColor=6366f1&autoplay=true`
        : `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=6366f1&autoplay=true`,
      quality: '1080p',
      status: 'active',
      adLevel: 'none',
    },
    {
      provider: 'VidCore HD',
      embedUrl: isMovie
        ? `https://vidcore.org/embed/movie/${id}`
        : `https://vidcore.org/embed/tv/${id}/${season}/${episode}`,
      quality: '1080p',
      status: 'active',
      adLevel: 'none',
    },
    {
      provider: 'AutoEmbed Player',
      embedUrl: isMovie
        ? `https://player.autoembed.cc/embed/movie/${id}?autoplay=1`
        : `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}?autoplay=1`,
      quality: '1080p',
      status: 'active',
      adLevel: 'light',
    },
    {
      provider: 'VixHD Stream',
      embedUrl: isMovie
        ? `https://vidsrc.hair/embed/movie/${id}?autoPlay=1`
        : `https://vidsrc.hair/embed/tv/${id}/${season}/${episode}?autoPlay=1`,
      quality: '1080p',
      status: 'active',
      adLevel: 'light',
    },
    {
      provider: 'EmbedSU Ultra',
      embedUrl: isMovie
        ? `https://embed.su/embed/movie/${id}`
        : `https://embed.su/embed/tv/${id}/${season}/${episode}`,
      quality: '1080p',
      status: 'active',
      adLevel: 'light',
    },
    {
      provider: 'MultiEmbed',
      embedUrl: isMovie
        ? `https://multiembed.mov/?video_id=${id}`
        : `https://multiembed.mov/?video_id=${id}&s=${season}&e=${episode}`,
      quality: '1080p',
      status: 'active',
      adLevel: 'light',
    },
  ];

  return sources;
}

/**
 * Fetch streaming sources from PopcornTV API with fallback
 */
async function fetchStreamSources(type, id, season, episode) {
  const cacheKey = `stream_${type}_${id}_${season || ''}_${episode || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return { cached: true, ...cached };
  }

  const upstreamUrl = type === 'movie'
    ? `https://popcorntv.site/api/stream/movie/${encodeURIComponent(id)}`
    : `https://popcorntv.site/api/stream/tv/${encodeURIComponent(id)}?s=${season || 1}&e=${episode || 1}`;

  try {
    const response = await axios.get(upstreamUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://popcorntv.site/',
      },
    });

    if (response.data && Array.isArray(response.data.sources) && response.data.sources.length > 0) {
      const data = {
        sources: response.data.sources,
        subtitles: response.data.subtitles || [],
      };
      cache.set(cacheKey, data, STREAM_CACHE_TTL);
      return { cached: false, ...data };
    }
  } catch (err) {
    console.warn(`[Stream API] PopcornTV upstream fetch failed for ${id}:`, err.message);
  }

  // Fallback to direct network resolvers
  const fallbackSources = generateFallbackSources(type, id, season, episode);
  const fallbackData = { sources: fallbackSources, subtitles: [] };
  cache.set(cacheKey, fallbackData, 600);
  return { cached: false, fallback: true, ...fallbackData };
}

// GET /api/stream/movie/:id
router.get('/movie/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Media ID (IMDb or TMDB) is required.' });
  }

  try {
    const result = await fetchStreamSources('movie', id);
    res.json({
      success: true,
      id,
      type: 'movie',
      cached: result.cached,
      sourcesCount: result.sources.length,
      sources: result.sources,
      subtitles: result.subtitles,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stream/tv/:id?s=1&e=1
router.get('/tv/:id', async (req, res) => {
  const { id } = req.params;
  const s = parseInt(req.query.s, 10) || 1;
  const e = parseInt(req.query.e, 10) || 1;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Media ID (IMDb or TMDB) is required.' });
  }

  try {
    const result = await fetchStreamSources('tv', id, s, e);
    res.json({
      success: true,
      id,
      type: 'tv',
      season: s,
      episode: e,
      cached: result.cached,
      sourcesCount: result.sources.length,
      sources: result.sources,
      subtitles: result.subtitles,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

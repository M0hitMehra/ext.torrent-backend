/**
 * meta.js
 * Free Rich Media Metadata API Route.
 * Fetches and resolves Director, Cast (with portraits & roles), Synopsis/Description,
 * Ratings, Genres, Runtime, Recommendations ("More Like This"), and Trailers.
 * Uses PopcornTV TMDB Gateway with fallback to Cinemeta (Stremio) and TVMaze.
 */

const express = require('express');
const axios = require('axios');
const cache = require('../cache');

const router = express.Router();
const META_CACHE_TTL = 86400; // 24 hours cache

/**
 * Strips release tags, resolutions, audio codecs, websites from title
 */
function cleanSearchTitle(rawTitle) {
  if (!rawTitle) return { title: '', year: null };
  let title = String(rawTitle);

  // Extract year if present
  let year = null;
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    year = yearMatch[1];
  }

  // Strip brackets, parens, braces
  title = title.replace(/\[[^\]]*\]/g, ' ');
  title = title.replace(/\([^)]*\)/g, ' ');
  title = title.replace(/\{[^}]*\}/g, ' ');

  // Remove common website prefixes or domains (e.g. www UIndex org, YTS.mx, 1337x)
  title = title.replace(/\b(www\.)?[a-zA-Z0-9-]+\.(org|to|mx|cc|ws|ag|pm|xyz|site|net|com|gg|bz)\b/gi, ' ');

  // Strip quality tags, codecs, audio, etc.
  title = title.replace(/\b(1080p|720p|2160p|4k|8k|uhd|fhd|bluray|blu-ray|bdrip|brrip|webrip|web-dl|webdl|hdrip|dvdrip|hdtv|cam|ts|telesync|x264|x265|hevc|h264|h265|avc|aac|ac3|dts|ddp5\.1|5\.1|dual|audio|multi|sub|hindi|telugu|tamil|extended|remastered|imax|unrated|directors\.cut|repack)\b.*/gi, '');

  // Strip TV season/episode patterns
  title = title.replace(/\b(s\d{1,2}e\d{1,2}|s\d{1,2}|season\s*\d{1,2}|complete)\b.*/gi, '');

  // Replace dots, underscores, dashes with space
  title = title.replace(/[._\-]+/g, ' ');

  // Strip non-alphanumeric (keep spaces and apostrophes)
  title = title.replace(/[^\w\s']/g, ' ');

  // Consolidate whitespace
  title = title.replace(/\s+/g, ' ').trim();

  return { title, year };
}

/**
 * Fetch rich metadata from PopcornTV TMDB Gateway
 */
async function fetchFromPopcornTMDB(query, forcedYear, forcedType) {
  const searchUrl = `https://popcorntv.site/api/tmdb/search/multi?query=${encodeURIComponent(query)}`;
  const searchRes = await axios.get(searchUrl, {
    timeout: 7000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  const results = searchRes.data?.results || [];
  if (results.length === 0) return null;

  // Filter or match best item
  let item = results.find(r => {
    if (forcedType && r.media_type !== forcedType) return false;
    if (forcedYear) {
      const releaseYear = (r.release_date || r.first_air_date || '').slice(0, 4);
      return releaseYear === String(forcedYear);
    }
    return true;
  }) || results[0];

  if (!item || !item.id) return null;

  const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
  const detailUrl = `https://popcorntv.site/api/tmdb/${mediaType}/${item.id}?append_to_response=credits,similar,videos`;
  const detailRes = await axios.get(detailUrl, {
    timeout: 7000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  const d = detailRes.data;
  if (!d) return null;

  // Extract Director(s) or Creator(s)
  const directors = (d.credits?.crew || [])
    .filter(c => c.job === 'Director')
    .map(c => c.name);
  const creators = (d.created_by || []).map(c => c.name);
  const director = directors.length > 0 ? directors.join(', ') : (creators.length > 0 ? creators.join(', ') : null);

  // Extract Top Cast with Photos
  const cast = (d.credits?.cast || []).slice(0, 10).map(c => ({
    name: c.name,
    character: c.character || 'Cast',
    photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
  }));

  // Extract Similar / Recommendations
  const recommendations = (d.similar?.results || []).slice(0, 8).map(r => ({
    id: r.id,
    title: r.title || r.name,
    year: (r.release_date || r.first_air_date || '').slice(0, 4),
    poster: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
    rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : null,
    type: mediaType,
  }));

  // Extract Trailer
  let trailerUrl = null;
  const youtubeVideo = (d.videos?.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  if (youtubeVideo?.key) {
    trailerUrl = `https://www.youtube.com/watch?v=${youtubeVideo.key}`;
  }

  // Runtime
  let runtime = null;
  if (d.runtime) {
    const hrs = Math.floor(d.runtime / 60);
    const mins = d.runtime % 60;
    runtime = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  } else if (d.episode_run_time?.length) {
    runtime = `${d.episode_run_time[0]}m / ep`;
  }

  return {
    id: d.id,
    title: d.title || d.name,
    originalTitle: d.original_title || d.original_name,
    tagline: d.tagline || null,
    overview: d.overview || '',
    releaseDate: d.release_date || d.first_air_date || null,
    year: (d.release_date || d.first_air_date || '').slice(0, 4) || forcedYear,
    rating: d.vote_average ? Number(d.vote_average.toFixed(1)) : null,
    voteCount: d.vote_count || 0,
    director,
    cast,
    genres: (d.genres || []).map(g => g.name),
    runtime,
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
    background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
    recommendations,
    trailerUrl,
    type: mediaType,
    source: 'tmdb',
  };
}

/**
 * Fallback to Cinemeta (Stremio Metadata Hub)
 */
async function fetchFromCinemeta(query, forcedType) {
  const type = forcedType === 'tv' ? 'series' : 'movie';
  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
  const res = await axios.get(url, { timeout: 6000 });
  const metas = res.data?.metas || [];
  if (metas.length === 0) return null;

  const item = metas[0];
  const detailUrl = `https://v3-cinemeta.strem.io/meta/${item.type}/${item.id}.json`;
  const detailRes = await axios.get(detailUrl, { timeout: 6000 });
  const d = detailRes.data?.meta;
  if (!d) return null;

  const cast = (d.cast || []).slice(0, 8).map(name => ({
    name,
    character: 'Cast',
    photo: null,
  }));

  return {
    id: d.id,
    title: d.name,
    overview: d.description || '',
    year: d.year,
    rating: d.imdbRating ? Number(d.imdbRating) : null,
    director: Array.isArray(d.director) ? d.director.join(', ') : d.director || null,
    cast,
    genres: d.genres || [],
    runtime: d.runtime,
    poster: d.poster,
    background: d.background,
    recommendations: [],
    trailerUrl: d.trailers?.[0]?.source ? `https://www.youtube.com/watch?v=${d.trailers[0].source}` : null,
    type: d.type === 'series' ? 'tv' : 'movie',
    source: 'cinemeta',
  };
}

/**
 * GET /api/meta
 * Query params: q (required), year, type
 */
router.get('/', async (req, res) => {
  const rawQuery = req.query.q || req.query.query;
  if (!rawQuery) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required.' });
  }

  const { title: cleanQ, year: extractedYear } = cleanSearchTitle(rawQuery);
  const year = req.query.year || extractedYear;
  const type = req.query.type || (req.query.category === 'tv' ? 'tv' : null);

  const queryToUse = cleanQ || rawQuery;
  const cacheKey = `rich_meta_${queryToUse.toLowerCase()}_${year || ''}_${type || ''}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ success: true, cached: true, data: cached });
  }

  try {
    let data = null;

    // 1. Primary: PopcornTV TMDB Gateway
    try {
      data = await fetchFromPopcornTMDB(queryToUse, year, type);
    } catch (err) {
      console.warn('[Meta API] Popcorn TMDB lookup failed, trying Cinemeta:', err.message);
    }

    // 2. Secondary fallback: Cinemeta
    if (!data) {
      try {
        data = await fetchFromCinemeta(queryToUse, type);
      } catch (err) {
        console.warn('[Meta API] Cinemeta lookup failed:', err.message);
      }
    }

    if (!data) {
      return res.status(404).json({ success: false, error: 'No metadata found for query.' });
    }

    cache.set(cacheKey, data, META_CACHE_TTL);
    return res.json({ success: true, cached: false, data });
  } catch (error) {
    console.error('[Meta API Error]', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve metadata.' });
  }
});

module.exports = router;
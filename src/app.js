/**
 * app.js
 * Express application setup — middleware, routes, error handling.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PORT, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } = require('./config');
const cache = require('./cache');

// Routes
const searchRoute     = require('./routes/search');
const torrentRoute    = require('./routes/torrent');
const browseRoute     = require('./routes/browse');
const categoriesRoute = require('./routes/categories');
const magnetRoute     = require('./routes/magnet');
const streamRoute     = require('./routes/stream');

const app = express();

// ─── Security & CORS ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

// ─── Health & Status ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'ext.to API Gateway',
    version: '1.1.0',
    engine: 'multi-source-hybrid',
    status: 'running',
    endpoints: {
      health:      'GET /',
      search:      'GET /api/search?q=query&page=1&sort=seeders',
      browse:      'GET /api/browse?category=movies&page=1',
      trending:    'GET /api/trending?category=all',
      latest:      'GET /api/latest?page=1',
      categories:  'GET /api/categories',
      torrent:     'GET /api/torrent/:id',
      magnet:      'GET /api/magnet/:id',
      streamMovie: 'GET /api/stream/movie/:id',
      streamTv:    'GET /api/stream/tv/:id?s=1&e=1',
      cacheStats:  'GET /api/cache/stats',
      cacheClear:  'DELETE /api/cache',
    },
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/search',     searchRoute);
app.use('/api/torrent',    torrentRoute);
app.use('/api/categories', categoriesRoute);
app.use('/api/magnet',     magnetRoute);
app.use('/api/stream',     streamRoute);

// Browse, trending, latest share one router
app.use('/api', browseRoute);

// ─── Cache Management ────────────────────────────────────────────────────────
app.get('/api/cache/stats', (req, res) => {
  res.json({ success: true, stats: cache.stats() });
});
app.delete('/api/cache', (req, res) => {
  cache.flush();
  res.json({ success: true, message: 'Cache cleared.' });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.path} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

module.exports = app;

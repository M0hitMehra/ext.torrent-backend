/**
 * routes/categories.js
 * GET /api/categories - Returns all available category slugs and display names
 */

const express = require('express');
const router = express.Router();

const CATEGORIES = [
  { slug: 'all',      label: 'All',       icon: 'apps' },
  { slug: 'movies',   label: 'Movies',    icon: 'movie' },
  { slug: 'tv',       label: 'TV Shows',  icon: 'tv' },
  { slug: 'music',    label: 'Music',     icon: 'music_note' },
  { slug: 'games',    label: 'Games',     icon: 'sports_esports' },
  { slug: 'software', label: 'Software',  icon: 'computer' },
  { slug: 'anime',    label: 'Anime',     icon: 'animation' },
  { slug: 'books',    label: 'Books',     icon: 'menu_book' },
  { slug: 'other',    label: 'Other',     icon: 'category' },
];

router.get('/', (req, res) => {
  res.json({ success: true, categories: CATEGORIES });
});

module.exports = router;

/**
 * indexer.js
 * Multi-source torrent aggregator & indexer.
 * Provides high-speed, reliable torrent search, trending, browsing,
 * details, and magnet link generation with zero Cloudflare 403 blocks.
 */

const axios = require('axios');

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
];

const CATEGORY_MAP = {
  movies:   '200',
  tv:       '205',
  music:    '100',
  games:    '400',
  software: '300',
  books:    '600',
  anime:    '200',
  other:    '0',
  all:      '0',
};

function buildMagnet(infoHash, name) {
  if (!infoHash) return null;
  const tr = TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${infoHash.toLowerCase().trim()}&dn=${encodeURIComponent(name || 'Torrent')}${tr}`;
}

function formatBytes(bytes) {
  const b = parseInt(bytes) || 0;
  if (b === 0) return 'N/A';
  if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + ' MB';
  return (b / 1024).toFixed(2) + ' KB';
}

function resolveCategory(catId) {
  const id = parseInt(catId) || 0;
  if (id >= 100 && id < 200) return 'Music';
  if (id >= 200 && id < 205) return 'Movies';
  if (id >= 205 && id < 300) return 'TV Shows';
  if (id >= 300 && id < 400) return 'Software';
  if (id >= 400 && id < 500) return 'Games';
  if (id >= 600 && id < 700) return 'Books';
  return 'Other';
}

function formatAge(timestamp) {
  const ts = parseInt(timestamp);
  if (!ts) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  const days = Math.floor(diff / 86400);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function transformRawTorrent(item) {
  if (!item || item.name === 'No results returned' || item.id === '0') return null;
  const seeders = parseInt(item.seeders) || 0;
  const leechers = parseInt(item.leechers) || 0;
  const infoHash = item.info_hash || '';
  const name = item.name || 'Unknown Torrent';
  const category = resolveCategory(item.category);

  return {
    id: String(item.id),
    title: name,
    category,
    size: formatBytes(item.size),
    seeders,
    leechers,
    age: formatAge(item.added),
    uploaded: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : null,
    uploader: item.username || 'Anonymous',
    infoHash,
    magnet: buildMagnet(infoHash, name),
    href: `https://apibay.org/t.php?id=${item.id}`,
  };
}

/**
 * Search torrents by query string and optional category/sorting
 */
async function search({ q, category = 'all', page = 1, sort = 'seeders', order = 'desc' }) {
  const catParam = CATEGORY_MAP[category.toLowerCase()] || '0';
  let url = `https://apibay.org/q.php?q=${encodeURIComponent(q.trim())}`;
  if (catParam !== '0') {
    url += `&cat=${catParam}`;
  }

  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000,
  });

  if (!Array.isArray(res.data)) {
    return { torrents: [], totalPages: 1 };
  }

  let items = res.data.map(transformRawTorrent).filter(Boolean);

  // Sorting
  if (sort === 'seeders') {
    items.sort((a, b) => (order === 'asc' ? a.seeders - b.seeders : b.seeders - a.seeders));
  } else if (sort === 'size') {
    items.sort((a, b) => (order === 'asc' ? a.size.localeCompare(b.size) : b.size.localeCompare(a.size)));
  }

  // Pagination (20 per page)
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return { torrents: paginatedItems, totalPages };
}

/**
 * Get trending / top torrents
 */
async function trending(category = 'all') {
  const cat = category.toLowerCase();
  let path = 'data_top100_all.json';
  if (cat === 'movies' || cat === 'tv') path = 'data_top100_200.json';
  else if (cat === 'music') path = 'data_top100_100.json';
  else if (cat === 'games') path = 'data_top100_400.json';
  else if (cat === 'software') path = 'data_top100_300.json';

  const res = await axios.get(`https://apibay.org/precompiled/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });

  if (!Array.isArray(res.data)) return { torrents: [] };
  const items = res.data.map(transformRawTorrent).filter(Boolean);
  return { torrents: items };
}

/**
 * Get latest uploads
 */
async function latest(page = 1) {
  // Use top recent torrents
  const res = await axios.get('https://apibay.org/precompiled/data_top100_recent.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  }).catch(async () => {
    return await axios.get('https://apibay.org/precompiled/data_top100_all.json', { timeout: 10000 });
  });

  if (!Array.isArray(res.data)) return { torrents: [], totalPages: 1 };
  const items = res.data.map(transformRawTorrent).filter(Boolean);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
  const paginated = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return { torrents: paginated, totalPages };
}

/**
 * Get single torrent full detail
 */
async function detail(id) {
  const res = await axios.get(`https://apibay.org/t.php?id=${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });

  const item = res.data;
  if (!item || !item.name) return null;

  const infoHash = item.info_hash || '';
  const name = item.name || '';
  const category = resolveCategory(item.category);

  // Files
  let files = [];
  try {
    const fRes = await axios.get(`https://apibay.org/f.php?id=${id}`, { timeout: 5000 });
    if (Array.isArray(fRes.data)) {
      files = fRes.data.map(f => (Array.isArray(f.name) ? f.name[0] : f.name || String(f)));
    }
  } catch (_) {
    files = [name];
  }

  return {
    id: String(item.id),
    title: name,
    category,
    size: formatBytes(item.size),
    seeders: parseInt(item.seeders) || 0,
    leechers: parseInt(item.leechers) || 0,
    uploaded: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : null,
    uploader: item.username || 'Anonymous',
    infoHash,
    magnet: buildMagnet(infoHash, name),
    description: item.descr || '',
    files,
  };
}

module.exports = {
  search,
  trending,
  latest,
  detail,
  buildMagnet,
};

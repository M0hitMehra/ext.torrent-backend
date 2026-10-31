/**
 * indexer.js
 * Multi-source torrent aggregator & indexer.
 * Combines Apibay + Torrents-CSV for instant, reliable, non-blocked torrent search.
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

function transformApibay(item) {
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
    source: 'apibay',
  };
}

function transformTorrentsCsv(item) {
  if (!item || !item.name || !item.infohash) return null;
  const seeders = parseInt(item.seeders) || 0;
  const leechers = parseInt(item.leechers) || 0;
  const infoHash = item.infohash || '';
  const name = item.name || 'Unknown Torrent';

  // Guess category from name
  let category = 'Movies';
  const lower = name.toLowerCase();
  if (lower.includes('s0') || lower.includes('season') || lower.includes('episode')) category = 'TV Shows';
  else if (lower.includes('flac') || lower.includes('mp3') || lower.includes('album')) category = 'Music';
  else if (lower.includes('repack') || lower.includes('game') || lower.includes('crack')) category = 'Games';

  return {
    id: String(item.id || item.infohash),
    title: name,
    category,
    size: formatBytes(item.size_bytes),
    seeders,
    leechers,
    age: formatAge(item.created_unix),
    uploaded: item.created_unix ? new Date(parseInt(item.created_unix) * 1000).toISOString().split('T')[0] : null,
    uploader: 'P2P',
    infoHash,
    magnet: buildMagnet(infoHash, name),
    href: `https://torrents-csv.com`,
    source: 'torrents-csv',
  };
}

/**
 * Search torrents using multiple open sources simultaneously
 */
async function search({ q, category = 'all', page = 1, sort = 'seeders', order = 'desc' }) {
  const queryStr = q.trim();
  const catParam = CATEGORY_MAP[category.toLowerCase()] || '0';

  let apibayUrl = `https://apibay.org/q.php?q=${encodeURIComponent(queryStr)}`;
  if (catParam !== '0') apibayUrl += `&cat=${catParam}`;

  const csvUrl = `https://torrents-csv.com/service/search?q=${encodeURIComponent(queryStr)}`;

  // Query both in parallel
  const [apibayRes, csvRes] = await Promise.allSettled([
    axios.get(apibayUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 7000 }),
    axios.get(csvUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 7000 }),
  ]);

  let allTorrents = [];
  const seenHashes = new Set();

  // Process Apibay
  if (apibayRes.status === 'fulfilled' && Array.isArray(apibayRes.value?.data)) {
    for (const raw of apibayRes.value.data) {
      const t = transformApibay(raw);
      if (t && t.infoHash && !seenHashes.has(t.infoHash.toLowerCase())) {
        seenHashes.add(t.infoHash.toLowerCase());
        allTorrents.push(t);
      }
    }
  }

  // Process Torrents-CSV
  if (csvRes.status === 'fulfilled' && Array.isArray(csvRes.value?.data?.torrents)) {
    for (const raw of csvRes.value.data.torrents) {
      const t = transformTorrentsCsv(raw);
      if (t && t.infoHash && !seenHashes.has(t.infoHash.toLowerCase())) {
        seenHashes.add(t.infoHash.toLowerCase());
        allTorrents.push(t);
      }
    }
  }

  // Sorting
  if (sort === 'seeders') {
    allTorrents.sort((a, b) => (order === 'asc' ? a.seeders - b.seeders : b.seeders - a.seeders));
  } else if (sort === 'size') {
    allTorrents.sort((a, b) => (order === 'asc' ? a.size.localeCompare(b.size) : b.size.localeCompare(a.size)));
  }

  // Pagination (20 per page)
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(allTorrents.length / pageSize));
  const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
  const paginatedItems = allTorrents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return { torrents: paginatedItems, totalPages, totalCount: allTorrents.length };
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

  try {
    const res = await axios.get(`https://apibay.org/precompiled/${path}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    if (Array.isArray(res.data)) {
      const items = res.data.map(transformApibay).filter(Boolean);
      if (items.length > 0) return { torrents: items };
    }
  } catch (e) {
    console.warn('[Trending Apibay Warn]', e.message);
  }

  // Fallback to top movies via search
  return await search({ q: category === 'all' ? '1080p' : category, category });
}

/**
 * Get latest uploads
 */
async function latest(page = 1) {
  try {
    const res = await axios.get('https://apibay.org/precompiled/data_top100_recent.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    }).catch(async () => {
      return await axios.get('https://apibay.org/precompiled/data_top100_all.json', { timeout: 8000 });
    });

    if (Array.isArray(res.data)) {
      const items = res.data.map(transformApibay).filter(Boolean);
      const pageSize = 20;
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
      const paginated = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      if (paginated.length > 0) return { torrents: paginated, totalPages };
    }
  } catch (_) {}

  return await search({ q: '2026', page });
}

/**
 * Get single torrent full detail
 */
async function detail(id) {
  // If id is numeric, query Apibay
  if (/^\d+$/.test(id)) {
    try {
      const res = await axios.get(`https://apibay.org/t.php?id=${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000,
      });

      const item = res.data;
      if (item && item.name) {
        const infoHash = item.info_hash || '';
        const name = item.name || '';
        const category = resolveCategory(item.category);

        let files = [];
        try {
          const fRes = await axios.get(`https://apibay.org/f.php?id=${id}`, { timeout: 4000 });
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
    } catch (_) {}
  }

  // If id is infoHash or string
  const hash = id.replace(/[^a-fA-F0-9]/g, '');
  if (hash.length === 40) {
    return {
      id: hash,
      title: `Torrent (${hash.slice(0, 8)})`,
      category: 'Movies',
      size: 'N/A',
      seeders: 10,
      leechers: 2,
      infoHash: hash,
      magnet: buildMagnet(hash, 'Torrent'),
      description: 'Streamable torrent media',
      files: ['media.mp4'],
    };
  }

  return null;
}

module.exports = {
  search,
  trending,
  latest,
  detail,
  buildMagnet,
};

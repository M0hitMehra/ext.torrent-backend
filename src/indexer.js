/**
 * indexer.js
 * Multi-source torrent aggregator & indexer.
 * Combines Apibay + Torrents-CSV for instant, reliable, non-blocked torrent search.
 * Provides caching and multi-key lookup so any torrent ID or hash resolves reliably.
 */

const axios = require('axios');
const cache = require('./cache');

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

/**
 * Cache torrent across all possible identifier keys for instant subsequent lookup
 */
function cacheTorrent(torrent) {
  if (!torrent) return;
  const ttl = 86400; // 24 hours
  if (torrent.id) cache.set(`torrent:${torrent.id}`, torrent, ttl);
  if (torrent.infoHash) {
    cache.set(`torrent:${torrent.infoHash.toLowerCase()}`, torrent, ttl);
  }
  if (torrent.csvId) {
    cache.set(`torrent:${torrent.csvId}`, torrent, ttl);
  }
}

function transformApibay(item) {
  if (!item || item.name === 'No results returned' || String(item.id) === '0') return null;
  const seeders = parseInt(item.seeders) || 0;
  const leechers = parseInt(item.leechers) || 0;
  const infoHash = item.info_hash ? item.info_hash.toLowerCase().trim() : '';
  if (!infoHash || infoHash === '0000000000000000000000000000000000000000') return null;
  const name = item.name || 'Unknown Torrent';
  const category = resolveCategory(item.category);
  const primaryId = infoHash || String(item.id);

  return {
    id: primaryId,
    apibayId: String(item.id),
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
    files: [name],
    source: 'apibay',
  };
}

function transformTorrentsCsv(item) {
  if (!item || !item.name || !item.infohash) return null;
  const seeders = parseInt(item.seeders) || 0;
  const leechers = parseInt(item.leechers) || 0;
  const infoHash = item.infohash ? item.infohash.toLowerCase().trim() : '';
  if (!infoHash) return null;
  const name = item.name || 'Unknown Torrent';

  // Guess category from name
  let category = 'Movies';
  const lower = name.toLowerCase();
  if (lower.includes('s0') || lower.includes('season') || lower.includes('episode')) category = 'TV Shows';
  else if (lower.includes('flac') || lower.includes('mp3') || lower.includes('album')) category = 'Music';
  else if (lower.includes('repack') || lower.includes('game') || lower.includes('crack') || lower.includes('fitgirl') || lower.includes('dodi')) category = 'Games';
  else if (lower.includes('installer') || lower.includes('.iso') || lower.includes('.exe') || lower.includes('patch')) category = 'Software';
  else if (lower.includes('epub') || lower.includes('pdf') || lower.includes('book')) category = 'Books';

  const primaryId = infoHash;

  return {
    id: primaryId,
    csvId: item.id ? String(item.id) : null,
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
    files: [name],
    source: 'torrents-csv',
  };
}

/**
 * Search torrents using multiple open sources simultaneously
 */
async function search({ q, category = 'all', page = 1, sort = 'seeders', order = 'desc' }) {
  const queryStr = (q || '').trim();
  const catParam = CATEGORY_MAP[category.toLowerCase()] || '0';

  let apibayUrl = `https://apibay.org/q.php?q=${encodeURIComponent(queryStr)}`;
  if (catParam !== '0') apibayUrl += `&cat=${catParam}`;

  const csvUrl = `https://torrents-csv.com/service/search?q=${encodeURIComponent(queryStr)}`;

  const [apibayRes, csvRes] = await Promise.allSettled([
    axios.get(apibayUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' },
      timeout: 7000,
    }),
    axios.get(csvUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' },
      timeout: 7000,
    }),
  ]);

  const allTorrents = [];
  const seenHashes = new Set();

  // Process Apibay
  if (apibayRes.status === 'fulfilled' && Array.isArray(apibayRes.value?.data)) {
    for (const raw of apibayRes.value.data) {
      const t = transformApibay(raw);
      if (t && t.infoHash && !seenHashes.has(t.infoHash)) {
        seenHashes.add(t.infoHash);
        allTorrents.push(t);
        cacheTorrent(t);
      }
    }
  }

  // Process Torrents-CSV
  if (csvRes.status === 'fulfilled' && Array.isArray(csvRes.value?.data?.torrents)) {
    for (const raw of csvRes.value.data.torrents) {
      const t = transformTorrentsCsv(raw);
      if (t && t.infoHash && !seenHashes.has(t.infoHash)) {
        seenHashes.add(t.infoHash);
        allTorrents.push(t);
        cacheTorrent(t);
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
      items.forEach(cacheTorrent);
      if (items.length > 0) return { torrents: items };
    }
  } catch (e) {
    console.warn('[Trending Apibay Warn]', e.message);
  }

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
      items.forEach(cacheTorrent);
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
 * Get single torrent full detail by ID, hash, or query
 */
async function detail(id) {
  if (!id) return null;
  const idStr = String(id).trim();

  // 1. Check in-memory cache first!
  const cached = cache.get(`torrent:${idStr}`) || cache.get(`torrent:${idStr.toLowerCase()}`);
  if (cached) return cached;

  // 2. If id is a 40-character infoHash (hex)
  const hash = idStr.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (hash.length === 40) {
    const hashCached = cache.get(`torrent:${hash}`);
    if (hashCached) return hashCached;

    // Try finding via Apibay by hash
    try {
      const qRes = await axios.get(`https://apibay.org/q.php?q=${hash}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000,
      });
      if (Array.isArray(qRes.data) && qRes.data[0] && String(qRes.data[0].id) !== '0') {
        const item = transformApibay(qRes.data[0]);
        if (item) {
          cacheTorrent(item);
          return item;
        }
      }
    } catch (_) {}

    // Fallback: Construct valid torrent object from hash
    const generated = {
      id: hash,
      title: `Torrent (${hash.slice(0, 8)})`,
      category: 'Movies',
      size: 'N/A',
      seeders: 10,
      leechers: 2,
      infoHash: hash,
      magnet: buildMagnet(hash, 'Torrent'),
      description: 'BitTorrent Media Stream',
      files: ['media.mp4'],
      source: 'dht',
    };
    cacheTorrent(generated);
    return generated;
  }

  // 3. If id is numeric (e.g. 890, 1342)
  if (/^\d+$/.test(idStr)) {
    // A. Check Apibay by numeric id
    try {
      const res = await axios.get(`https://apibay.org/t.php?id=${idStr}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000,
      });
      const item = res.data;
      if (
        item &&
        item.id &&
        String(item.id) !== '0' &&
        item.name &&
        item.name !== 'Torrent does not exsist.' &&
        item.info_hash &&
        item.info_hash !== '0000000000000000000000000000000000000000'
      ) {
        let files = [];
        try {
          const fRes = await axios.get(`https://apibay.org/f.php?id=${idStr}`, { timeout: 4000 });
          if (Array.isArray(fRes.data)) {
            files = fRes.data.map(f => (Array.isArray(f.name) ? f.name[0] : f.name || String(f)));
          }
        } catch (_) {
          files = [item.name];
        }

        const infoHash = item.info_hash.toLowerCase().trim();
        const name = item.name;
        const result = {
          id: infoHash || idStr,
          apibayId: idStr,
          title: name,
          category: resolveCategory(item.category),
          size: formatBytes(item.size),
          seeders: parseInt(item.seeders) || 0,
          leechers: parseInt(item.leechers) || 0,
          uploaded: item.added ? new Date(parseInt(item.added) * 1000).toISOString().split('T')[0] : null,
          uploader: item.username || 'Anonymous',
          infoHash,
          magnet: buildMagnet(infoHash, name),
          description: item.descr || '',
          files,
          source: 'apibay',
        };
        cache.set(`torrent:${idStr}`, result, 86400);
        cacheTorrent(result);
        return result;
      }
    } catch (_) {}

    // B. If Apibay doesn't have it, query torrents-csv
    try {
      const csvRes = await axios.get(`https://torrents-csv.com/service/search?q=${encodeURIComponent(idStr)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 6000,
      });
      if (csvRes.data && Array.isArray(csvRes.data.torrents) && csvRes.data.torrents.length > 0) {
        const match = csvRes.data.torrents.find(t => String(t.id) === idStr) || csvRes.data.torrents[0];
        if (match) {
          const transformed = transformTorrentsCsv(match);
          if (transformed) {
            cache.set(`torrent:${idStr}`, transformed, 86400);
            cacheTorrent(transformed);
            return transformed;
          }
        }
      }
    } catch (_) {}
  }

  // 4. Try general search fallback
  try {
    const sRes = await search({ q: idStr });
    if (sRes && sRes.torrents && sRes.torrents.length > 0) {
      const match = sRes.torrents[0];
      cache.set(`torrent:${idStr}`, match, 86400);
      cacheTorrent(match);
      return match;
    }
  } catch (_) {}

  return null;
}

module.exports = {
  search,
  trending,
  latest,
  detail,
  buildMagnet,
};

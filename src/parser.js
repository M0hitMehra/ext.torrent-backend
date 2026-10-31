/**
 * parser.js
 * Parses ext.to HTML pages into clean JSON objects.
 */

const cheerio = require('cheerio');

/**
 * Parse a torrent row into a standard torrent object.
 */
function parseTorrentRow($, el) {
  const $el = $(el);

  // Title & detail link
  const titleEl = $el.find('a.magnet, td.tl a').first();
  const title = titleEl.text().trim();
  const href = titleEl.attr('href') || '';
  const idMatch = href.match(/\/en\/(\w+)\//);
  const id = idMatch ? idMatch[1] : null;

  // Magnet link
  const magnetEl = $el.find('a[href^="magnet:"]');
  const magnet = magnetEl.attr('href') || null;

  // Cells: varies by page, grab text from tds
  const cells = $el.find('td').map((_, td) => $(td).text().trim()).get();

  // Category
  const categoryEl = $el.find('td.tc a, span.badge');
  const category = categoryEl.first().text().trim() || 'Unknown';

  // Size, Seeders, Leechers — typically last 3 numeric columns
  const size = cells[2] || cells[3] || 'N/A';
  const seeders = parseInt(cells[cells.length - 2]) || 0;
  const leechers = parseInt(cells[cells.length - 1]) || 0;

  // Age / date
  const age = $el.find('td.tda').text().trim() || null;

  return { id, title, category, size, seeders, leechers, age, magnet, href: `https://ext.to${href}` };
}

/**
 * Parse search results / browse page.
 * @param {string} html
 * @returns {{ torrents: Array, totalPages: number }}
 */
function parseListPage(html) {
  const $ = cheerio.load(html);
  const torrents = [];

  $('table.tl tbody tr, #torrentsTable tbody tr').each((_, el) => {
    const row = parseTorrentRow($, el);
    if (row.title) torrents.push(row);
  });

  // Pagination
  const lastPage = $('ul.pagination li a, div.pager a')
    .map((_, el) => parseInt($(el).text()))
    .get()
    .filter(n => !isNaN(n))
    .reduce((max, n) => Math.max(max, n), 1);

  return { torrents, totalPages: lastPage };
}

/**
 * Parse a torrent detail page.
 * @param {string} html
 * @returns {Object}
 */
function parseTorrentDetail(html) {
  const $ = cheerio.load(html);

  const title = $('h1, h2.torrent-title').first().text().trim();
  const magnet = $('a[href^="magnet:"]').first().attr('href') || null;
  const description = $('.torrent-description, #desc, .desc').text().trim();

  // Metadata table
  const meta = {};
  $('table.torrent-info tr, .torrent-details tr').each((_, el) => {
    const key = $(el).find('th, td:first-child').text().trim().toLowerCase().replace(/\s+/g, '_');
    const val = $(el).find('td:last-child, td:nth-child(2)').text().trim();
    if (key && val) meta[key] = val;
  });

  // File list
  const files = [];
  $('.filelist li, #files li, .file-list li').each((_, el) => {
    const name = $(el).text().trim();
    if (name) files.push(name);
  });

  // Image / poster
  const poster = $('img.torrent-image, .torrent-image img').first().attr('src') || null;

  // Screenshots / thumbnails
  const screenshots = [];
  $('a.fancybox img, .screenshots img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) screenshots.push(src);
  });

  const category = meta.category || $('span.label, .badge').first().text().trim();
  const size = meta.size || meta.total_size || 'N/A';
  const seeders = parseInt(meta.seeders) || 0;
  const leechers = parseInt(meta.leechers) || 0;
  const uploaded = meta.added || meta.date || null;
  const uploader = meta.uploader || meta.user || null;
  const infoHash = meta.info_hash || magnet?.match(/btih:([a-fA-F0-9]+)/)?.[1] || null;

  return {
    title,
    category,
    size,
    seeders,
    leechers,
    uploaded,
    uploader,
    infoHash,
    magnet,
    description,
    files,
    poster,
    screenshots,
    raw: meta,
  };
}

/**
 * Parse category/top page specifically.
 */
function parseCategoryPage(html) {
  return parseListPage(html);
}

module.exports = { parseListPage, parseTorrentDetail, parseCategoryPage };

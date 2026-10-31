require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || 'https://ext.to',
  CACHE_TTL: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100,
  USE_PUPPETEER: process.env.USE_PUPPETEER !== 'false', // Default true
  PUPPETEER_TIMEOUT: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
  FLARESOLVERR_URL: process.env.FLARESOLVERR_URL || null, // Optional: http://localhost:8191/v1
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

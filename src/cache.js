/**
 * cache.js
 * In-memory LRU cache powered by node-cache.
 * Key = full URL, Value = parsed JSON result.
 */

const NodeCache = require('node-cache');
const { CACHE_TTL } = require('./config');

const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 60, useClones: false });

function get(key) {
  return cache.get(key) || null;
}

function set(key, value, ttl) {
  cache.set(key, value, ttl || CACHE_TTL);
}

function del(key) {
  cache.del(key);
}

function flush() {
  cache.flushAll();
}

function stats() {
  return cache.getStats();
}

module.exports = { get, set, del, flush, stats };

/**
 * server.js
 * Entry point — starts Express server and handles graceful shutdown.
 */

const app = require('./src/app');
const { PORT } = require('./src/config');
const { closeBrowser } = require('./src/scraper');

const server = app.listen(PORT, () => {
  console.log(`\n🚀 ext.to API Gateway running at http://localhost:${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET http://localhost:${PORT}/api/search?q=avatar`);
  console.log(`   GET http://localhost:${PORT}/api/browse?category=movies`);
  console.log(`   GET http://localhost:${PORT}/api/trending`);
  console.log(`   GET http://localhost:${PORT}/api/latest`);
  console.log(`   GET http://localhost:${PORT}/api/categories`);
  console.log(`   GET http://localhost:${PORT}/api/torrent/:id`);
  console.log(`   GET http://localhost:${PORT}/api/magnet/:id`);
  console.log(`\n✅ Server is ready!\n`);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down...`);
  await closeBrowser();
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

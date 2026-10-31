# ext.to API Gateway

A Node.js REST API backend that scrapes **ext.to** (a major public torrent indexer) and serves clean JSON responses. Built for Android/TV mobile apps that need to search and stream torrents.

## 🚀 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check + endpoint list |
| `GET` | `/api/search?q=query&page=1` | Search torrents |
| `GET` | `/api/browse?category=movies&page=1` | Browse by category |
| `GET` | `/api/trending?category=all` | Top/trending torrents |
| `GET` | `/api/latest?page=1` | Latest uploads |
| `GET` | `/api/categories` | All available categories |
| `GET` | `/api/torrent/:id` | Full torrent details |
| `GET` | `/api/magnet/:id` | Just the magnet link (lightweight) |
| `GET` | `/api/cache/stats` | Cache statistics |
| `DELETE` | `/api/cache` | Clear cache |

### Search Parameters
- `q` — Search query (required)
- `page` — Page number (default: 1)
- `sort` — `time`, `seeders`, `leechers`, `size` (default: `time`)
- `order` — `asc` / `desc` (default: `desc`)

### Browse Parameters
- `category` — `all`, `movies`, `tv`, `music`, `games`, `software`, `anime`, `books`, `other`
- `page` — Page number
- `sort`, `order` — same as search

## 📦 Sample Response

```json
{
  "success": true,
  "cached": false,
  "query": "avatar",
  "page": 1,
  "totalPages": 12,
  "count": 20,
  "torrents": [
    {
      "id": "abc123",
      "title": "Avatar The Way of Water (2022) 1080p BluRay x265",
      "category": "Movies",
      "size": "2.4 GB",
      "seeders": 1540,
      "leechers": 120,
      "age": "2 days ago",
      "magnet": "magnet:?xt=urn:btih:...",
      "href": "https://ext.to/en/abc123/"
    }
  ]
}
```

## 🛠 Setup & Run Locally

```bash
# Clone the project
git clone <your-repo>
cd ext.to_app

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the server
npm start
```

The API will be available at `http://localhost:3000`.

## ☁️ Deploy to Render.com (Free)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect your GitHub repo.
4. Set these:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** `Node`
5. Add Environment Variables from `.env.example`.
6. Deploy — your API URL will be `https://extto-api.onrender.com`.

> ⚠️ **Free tier note:** Render free tier sleeps after 15 minutes of inactivity. The first request after sleep takes ~30s to wake up. Use [UptimeRobot](https://uptimerobot.com) (free) to ping `/` every 14 minutes to keep it awake.

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `BASE_URL` | `https://ext.to` | Target site base URL |
| `CACHE_TTL` | `300` | Cache TTL in seconds (5 min) |
| `USE_PUPPETEER` | `true` | Use headless browser for CF bypass |
| `PUPPETEER_TIMEOUT` | `30000` | Puppeteer page timeout in ms |
| `FLARESOLVERR_URL` | _(none)_ | Optional: FlareSolverr proxy URL (e.g., `http://localhost:8191/v1`) |

## 🏗 Architecture

```
Android / TV App
      │
      ▼
  Node.js REST API (This backend)
      │
      ├─── Cache (node-cache, in-memory)
      │
      ▼
  Cloudflare Bypass Layer
      ├─── FlareSolverr (if configured)
      └─── Puppeteer Stealth (fallback)
              │
              ▼
          ext.to (HTML scraping)
```

## ⚖️ Legal Notice

This is a research/educational project. The app only indexes publicly available torrent metadata. Users are responsible for complying with their local copyright laws.

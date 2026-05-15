/**
 * SPA + reverse proxy server — port 3000.
 *
 * Architecture (added 2026-05-06 to split frontend ↔ backend at runtime):
 *
 *   browser :3000
 *      │
 *      ├─ /api/v1/*   → proxy → http://127.0.0.1:8000 (osmosis-parser, FastAPI)
 *      ├─ /admin/api/*→ proxy → http://127.0.0.1:8000 (legacy admin login POST)
 *      ├─ /kpi-api/*  → proxy → http://127.0.0.1:11004 (kpi-engine, /monitor + /kpi)
 *      ├─ /api/*      → proxy → http://127.0.0.1:3001 (this repo's index.js)
 *      └─ everything else → static files in ../dist/ (Vite build output)
 *                          + SPA fallback to ../dist/index.html for client-side routing
 *
 * Why a separate file from index.js: index.js owns the frontend's
 * "local API" (DB-backed /api/* endpoints, ~3800 LOC). Mixing the SPA
 * proxy into it would couple two concerns. This file is small + reversible.
 *
 * No new npm dep — uses stdlib `http` for proxying.
 *
 * Start: scripts/start-frontend.sh, or: PORT=3000 node spa-proxy.js
 */
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Targets — env-overridable for non-localhost deployments.
const TARGETS = {
  '/api/v1/':    { host: '127.0.0.1', port: 8000 },   // osmosis-parser
  '/admin/api/': { host: '127.0.0.1', port: 8000 },   // legacy admin auth POST
  '/kpi-api/':   { host: '127.0.0.1', port: 11004 },   // kpi-engine (strip prefix)
  '/agent-api/': { host: '127.0.0.1', port: 8000 },   // OSMOSIS AI agent — through parser proxy at /api/v1/agent
  '/ml-api/':    { host: '127.0.0.1', port: 11002 },  // ML Engine — standalone service (extracted from parser 2026-05-10)
  '/agentic-api/': { host: '127.0.0.1', port: 11003 },// Agentic Engine — closed-loop orchestration (Phase 1: RCA from ML anomalies)
  '/fm-api/':    { host: '127.0.0.1', port: 8003 },   // osmosis-fm-parser (extracted 2026-05-14)
  '/dump-api/':  { host: '127.0.0.1', port: 8002 },   // osmosis-dump-parser
  '/api/':       { host: '127.0.0.1', port: 3001 },   // this repo's index.js
};

const app = express();

// Trust the first hop so X-Forwarded-* headers reach the upstream.
app.set('trust proxy', 1);

/**
 * Generic stream proxy. We deliberately do NOT buffer the body so that
 * large responses (KPI exports, file downloads) stream straight through.
 * Headers are forwarded both directions.
 */
function proxyTo(target, rewritePath) {
  return (req, res) => {
    const upstreamPath = rewritePath ? rewritePath(req.originalUrl) : req.originalUrl;
    const headers = { ...req.headers, host: `${target.host}:${target.port}` };

    const upstreamReq = http.request(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: upstreamPath,
        headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );

    upstreamReq.on('error', (err) => {
      // 502 because we know the upstream is unreachable; the SPA's error
      // handler can distinguish this from 4xx/5xx returned BY the upstream.
      console.error(`[spa-proxy] upstream ${target.host}:${target.port} error:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream_unreachable', detail: err.message }));
      }
    });

    req.pipe(upstreamReq);
  };
}

// Order matters: more-specific prefixes first so /api/v1/foo doesn't fall
// through to /api/. Express path-prefix matching is left-to-right.
app.use(
  '/api/v1',
  proxyTo(TARGETS['/api/v1/'], (url) => url),  // pass through path verbatim
);
app.use(
  '/admin/api',
  proxyTo(TARGETS['/admin/api/'], (url) => url),
);

// Browser hits to /admin/* are redirected to the Jinja admin panel on
// :8000 (added 2026-05-06 alongside removing AdminPanel/AdminLogin from
// the React SPA). /admin/api/* keeps proxying above so XHRs from the
// Jinja panel still work.
app.get(/^\/admin(\/.*)?$/, (req, res, next) => {
  if (req.path.startsWith('/admin/api/')) return next();   // proxied above
  const host = (req.headers.host || 'localhost').split(':')[0];
  res.redirect(302, `http://${host}:8000${req.originalUrl}`);
});
app.use(
  '/kpi-api',
  proxyTo(TARGETS['/kpi-api/'], (url) => url.replace(/^\/kpi-api/, '')),
);
// /agent-api/* → parser :8000 /api/v1/agent/* (the parser's agent_proxy.py
// forwards from there to the agent server at AGENT_URL). Mounting this
// before /api/ so it doesn't fall through to the local Express server.
app.use(
  '/agent-api',
  proxyTo(TARGETS['/agent-api/'], (url) => url.replace(/^\/agent-api/, '/api/v1/agent')),
);
// /ml-api/* → ml-engine :11002 /api/v1/ml/* (mounted before /api/ so the
// catch-all repo-3001 proxy doesn't claim it). Standalone service since
// 2026-05-10 — see /home/devmat/bmad-project/ml-engine.
app.use(
  '/ml-api',
  proxyTo(TARGETS['/ml-api/'], (url) => url.replace(/^\/ml-api/, '/api/v1/ml')),
);
// /agentic-api/* → agentic-engine :11003 /api/v1/agentic/* (Phase 1 of
// the closed-loop AI pipeline — Supervisor + RCA persistence layer over
// the existing :11000 LLM agents). 2026-05-12.
app.use(
  '/agentic-api',
  proxyTo(TARGETS['/agentic-api/'], (url) => url.replace(/^\/agentic-api/, '/api/v1/agentic')),
);
// /fm-api/* → osmosis-fm-parser :8003 (extracted 2026-05-14). Service
// only exposes /health + /status today; URLs forwarded as-is.
app.use(
  '/fm-api',
  proxyTo(TARGETS['/fm-api/'], (url) => url.replace(/^\/fm-api/, '')),
);
// /dump-api/* → osmosis-dump-parser :8002 (extracted 2025).
app.use(
  '/dump-api',
  proxyTo(TARGETS['/dump-api/'], (url) => url.replace(/^\/dump-api/, '')),
);
app.use(
  '/api',
  proxyTo(TARGETS['/api/'], (url) => url),
);

// Static SPA build. `index: false` so we serve assets but the SPA
// fallback below catches all unknown HTML routes.
app.use(express.static(DIST_DIR, { index: false, extensions: ['html'] }));

// SPA fallback — Vite's React Router needs every unknown path to load
// index.html so client-side routing can claim it. We refuse only when:
//   1. The path looks like a static asset (has a file extension), OR
//   2. The Accept header explicitly excludes HTML (e.g. Accept: application/json)
// Browsers always send `Accept: text/html,...` for navigations; tooling
// like curl sends `Accept: */*` which we treat as "wants HTML" too.
app.get(/^(?!\/(api|admin\/api|kpi-api|agent-api|ml-api|agentic-api|fm-api|dump-api)).*/, (req, res, next) => {
  const looksLikeAsset = /\.[a-z0-9]{1,6}$/i.test(req.path);
  const accept = req.headers.accept || '*/*';
  const wantsJson = accept.includes('application/json') && !accept.includes('text/html');
  if (looksLikeAsset || wantsJson) {
    return next();   // genuine 404 for missing asset / JSON endpoint
  }
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SPA + proxy on http://0.0.0.0:${PORT}`);
  console.log(`   /api/v1/*    → http://${TARGETS['/api/v1/'].host}:${TARGETS['/api/v1/'].port}`);
  console.log(`   /admin/api/* → http://${TARGETS['/admin/api/'].host}:${TARGETS['/admin/api/'].port}`);
  console.log(`   /kpi-api/*   → http://${TARGETS['/kpi-api/'].host}:${TARGETS['/kpi-api/'].port}`);
  console.log(`   /api/*       → http://${TARGETS['/api/'].host}:${TARGETS['/api/'].port}`);
  console.log(`   else         → ${DIST_DIR}\n`);
});

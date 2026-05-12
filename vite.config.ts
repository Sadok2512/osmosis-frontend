import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Backend proxy table — mirrors server/spa-proxy.js so vite preview
// (used in prod) also routes API prefixes to the right uvicorn ports.
// Without this, /ml-api/* etc. fall through to the SPA index.html and
// the frontend chokes on "Unexpected token '<' ... not valid JSON".
const _BACKEND_PROXY = {
  '/api/v1':     { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
  '/admin/api':  { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false },
  '/kpi-api':    { target: 'http://127.0.0.1:8001', changeOrigin: true, secure: false,
                   rewrite: (p: string) => p.replace(/^\/kpi-api/, '') },
  '/agent-api':  { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false,
                   rewrite: (p: string) => p.replace(/^\/agent-api/, '/api/v1/agent') },
  '/ml-api':     { target: 'http://127.0.0.1:11002', changeOrigin: true, secure: false,
                   rewrite: (p: string) => p.replace(/^\/ml-api/, '/api/v1/ml') },
  '/agentic-api':{ target: 'http://127.0.0.1:11003', changeOrigin: true, secure: false,
                   rewrite: (p: string) => p.replace(/^\/agentic-api/, '/api/v1/agentic') },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    proxy: _BACKEND_PROXY,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    proxy: _BACKEND_PROXY,
    // Vite 5 rejects requests whose Host header isn't in allowedHosts.
    // We're behind a Cloudflare tunnel + plain IP; accept any host so
    // the proxy works on app.qoebit.net, 185.248.33.125, and localhost.
    allowedHosts: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['react-grid-layout/legacy'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-map': ['leaflet', 'react-leaflet', 'react-leaflet-cluster'],
          'vendor-echarts': ['echarts'],
          'vendor-echarts-react': ['echarts-for-react'],
          'vendor-recharts': ['recharts'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
    // ECharts is intentionally isolated as a heavy visualization vendor chunk.
    // Keep the threshold above that vendor bundle while still warning on app chunks.
    chunkSizeWarningLimit: 1200,
  },
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
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

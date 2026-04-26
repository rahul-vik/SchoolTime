import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Use VITE_API_BASE_URL=/api in dev so export downloads hit the real API instead of index.html.
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});

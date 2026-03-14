import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:9009", // force IPv4 to avoid ::1
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:9009",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});

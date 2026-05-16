import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  server: {
    host: '127.0.0.1',
    hmr: {
      host: '127.0.0.1'
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setupTests.js"],
    globals: true,
    css: true
  }
});

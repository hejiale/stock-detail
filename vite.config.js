import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // 本地工具项目：不压缩，避免 Windows 杀毒扫描临时文件导致构建偶发失败
    minify: false,
    target: "esnext",
    chunkSizeWarningLimit: 3000
  }
});
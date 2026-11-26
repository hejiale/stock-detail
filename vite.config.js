import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleFundHoldingsRequest } from "./server/fund-holdings.mjs";

/** 本地开发 / 预览时代理基金持仓，绕开天天基金的 Referer 防盗链 */
function fundHoldingsProxy() {
  const middleware = (req, res, next) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      next();
      return;
    }
    if (url.pathname !== "/api/fund-holdings") {
      next();
      return;
    }
    handleFundHoldingsRequest(url, res);
  };
  return {
    name: "fund-holdings-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), fundHoldingsProxy()],
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
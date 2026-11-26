import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleFundHoldingsRequest } from "./server/fund-holdings.mjs";
import { handleMarketProxyRequest } from "./server/market-proxy.mjs";

/** 本地开发 / 预览时代理基金持仓与行情接口，绕开防盗链 / 系统代理 / CORS 限制 */
function localApiProxy() {
  const middleware = (req, res, next) => {
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
    } catch {
      next();
      return;
    }
    if (url.pathname === "/api/fund-holdings") {
      handleFundHoldingsRequest(url, res);
      return;
    }
    if (url.pathname === "/api/market-proxy") {
      handleMarketProxyRequest(url, res);
      return;
    }
    next();
  };
  return {
    name: "local-api-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), localApiProxy()],
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
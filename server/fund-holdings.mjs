/**
 * 基金持仓代理
 *
 * 天天基金 fundf10 的持仓接口带 Referer 防盗链，浏览器直接请求会 404；
 * 基金 App 的 FundMNInverstPosition 又会按浏览器 UA 返回“网络繁忙”。
 * 这里由本地服务端代取，避免浏览器端受这两层限制。
 */

const FUND_F10_URL = "https://fundf10.eastmoney.com/FundArchivesDatas.aspx";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://fundf10.eastmoney.com/"
};

export function normalizeFundCode(code) {
  const raw = String(code || "").replace(/\D/g, "");
  if (!raw) return "";
  return raw.padStart(6, "0").slice(-6);
}

/** 拉取基金最新季度持仓 HTML 片段（fundf10 返回的 apidata.content） */
export async function fetchFundHoldingsHtml(code, timeoutMs = 7000) {
  const fundCode = normalizeFundCode(code);
  if (!/^\d{6}$/.test(fundCode)) {
    throw new Error("基金代码无效");
  }

  const target =
    FUND_F10_URL +
    "?type=jjcc&code=" +
    encodeURIComponent(fundCode) +
    "&topline=10&_=" +
    Date.now();
  const resp = await fetch(target, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!resp.ok) {
    throw new Error("基金持仓请求失败（" + resp.status + "）");
  }
  const text = await resp.text();
  const matched = text.match(/content:"([\s\S]*?)",arryear/);
  if (!matched) {
    throw new Error("基金持仓返回无效");
  }
  return matched[1];
}

/** 供 Vite / 静态服务共用的中间件处理函数 */
export async function handleFundHoldingsRequest(url, res) {
  try {
    const code = url.searchParams.get("code") || "";
    const html = await fetchFundHoldingsHtml(code);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(html);
  } catch (err) {
    const message = String(err?.message || "基金持仓加载失败");
    const status = /基金代码无效/.test(message) ? 400 : 502;
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify({ error: message }));
  }
}
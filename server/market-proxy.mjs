/**
 * 行情数据代理
 *
 * 浏览器直连东方财富 / 新浪 / 腾讯时常受系统代理、CORS、Referer 限制
 * （例如系统代理把请求转给不可用的节点，浏览器侧只能看到 "Failed to fetch"）。
 * 这里由本地服务端代取，浏览器只请求同源的 /api/market-proxy。
 */

const PROXY_HOST_SUFFIXES = [
  "eastmoney.com",
  "sina.com.cn",
  "sinajs.cn",
  "gtimg.cn",
  "newyorkfed.org",
  "binance.vision",
  "binance.com"
];

const REFERER_RULES = [
  ["eastmoney.com", "https://quote.eastmoney.com/"],
  ["sina.com.cn", "https://finance.sina.com.cn/"],
  ["sinajs.cn", "https://finance.sina.com.cn/"],
  ["gtimg.cn", "https://gu.qq.com/"],
  ["newyorkfed.org", "https://www.newyorkfed.org/"]
];

const REQUEST_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return PROXY_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith("." + suffix)
  );
}

function refererFor(hostname) {
  const host = String(hostname || "").toLowerCase();
  const rule = REFERER_RULES.find(
    ([suffix]) => host === suffix || host.endsWith("." + suffix)
  );
  return rule ? rule[1] : "";
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(body));
}

/** 供 Vite / 静态服务共用的中间件处理函数 */
export async function handleMarketProxyRequest(url, res) {
  // 探测接口：前端据此判断当前是否由本地服务托管
  if (url.searchParams.get("ping") === "1") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const raw = url.searchParams.get("url") || "";
  let target;
  try {
    target = new URL(raw);
  } catch {
    sendJson(res, 400, { error: "行情地址无效" });
    return;
  }

  if (
    (target.protocol !== "https:" && target.protocol !== "http:") ||
    !isAllowedHost(target.hostname)
  ) {
    sendJson(res, 403, { error: "不允许代理该地址" });
    return;
  }

  try {
    const headers = {
      "User-Agent": REQUEST_UA,
      Accept: "application/json, text/plain, */*"
    };
    const referer = refererFor(target.hostname);
    if (referer) headers.Referer = referer;

    const upstream = await fetch(target.href, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(12000)
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type":
        upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
  } catch (err) {
    sendJson(res, 502, {
      error: String(err?.message || "行情代理请求失败")
    });
  }
}
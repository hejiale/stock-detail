import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Skeleton } from "antd";
import { LineChart } from "./Charts";
import { CopyCode } from "./Cells";
import {
  formatCryptoPrice,
  formatCryptoSigned,
  formatMarketCap,
  formatPct,
  formatVolume,
  isNum,
  marketApi,
  toneOf
} from "../lib/market";

const RANGE_DAYS = { "1w": 7, "1m": 30, "3m": 90, "1y": 365 };

function sliceRange(chart, range) {
  const list = (chart || []).filter((p) => p?.nav != null && p.date);
  if (!list.length || range === "day") return list;
  if (range === "ytd") {
    const year = String(list[list.length - 1].date).slice(0, 4);
    const slice = list.filter((p) => String(p.date).startsWith(year));
    return slice.length ? slice : list;
  }
  const days = RANGE_DAYS[range];
  if (!days) return list;
  const end = new Date(String(list[list.length - 1].date).slice(0, 10));
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startText = start.toISOString().slice(0, 10);
  const slice = list.filter((p) => String(p.date).slice(0, 10) >= startText);
  return slice.length ? slice : list;
}

export default function CryptoDetailModal({ open, code, presetName, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [range, setRange] = useState("day");

  useEffect(() => {
    if (!open || !code) return undefined;
    let alive = true;
    setLoading(true);
    setDetail(null);
    setError("");
    setRange("day");
    marketApi()
      .loadCryptoDetail(code)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((err) => {
        if (alive) setError(err?.message || "虚拟币详情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, code]);

  const quote = detail?.quote;
  const periods = detail?.periods || [];
  const chartPoints = useMemo(() => {
    if (range === "day") {
      return (detail?.hours || []).map((h) => ({
        label: `${String(h.date || "").slice(5, 10)} ${String(h.time || "").slice(0, 5)}`.trim(),
        value: h.close
      }));
    }
    return sliceRange(detail?.chart, range).map((p) => ({
      label: p.date,
      value: p.nav
    }));
  }, [detail, range]);

  const basicRows = useMemo(() => {
    const q = quote || {};
    return [
      ["交易对", q.symbol || (q.code ? `${q.code}USDT` : "--")],
      ["英文名", q.nameEn || "--"],
      ["今开", isNum(q.open) ? "$" + formatCryptoPrice(q.open) : "--"],
      ["24h最高", isNum(q.high) ? "$" + formatCryptoPrice(q.high) : "--"],
      ["24h最低", isNum(q.low) ? "$" + formatCryptoPrice(q.low) : "--"],
      ["昨收", isNum(q.preClose) ? "$" + formatCryptoPrice(q.preClose) : "--"],
      ["近1年最高", isNum(q.yearHigh) ? "$" + formatCryptoPrice(q.yearHigh) : "--"],
      ["近1年最低", isNum(q.yearLow) ? "$" + formatCryptoPrice(q.yearLow) : "--"],
      ["24h成交量", isNum(q.volume) ? formatVolume(q.volume) : "--"],
      ["24h成交额", isNum(q.amount) ? formatMarketCap(q.amount) + " USDT" : "--"],
      ["估算市值", isNum(q.marketCap) ? formatMarketCap(q.marketCap) + " USD" : "--"],
      ["流通量", isNum(q.circulating) ? formatMarketCap(q.circulating) : "--"],
      ["最大供应", q.maxSupply == null ? "无上限" : formatMarketCap(q.maxSupply)],
      ["24h成交笔数", isNum(q.trades) ? formatVolume(q.trades) : "--"]
    ];
  }, [quote]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      destroyOnHidden
      title={null}
      styles={{ body: { padding: 0 } }}
    >
      <div className="detail-head">
        <div className="detail-title-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="detail-title">
              {quote?.name || presetName || code || "虚拟币详情"}
            </div>
            <div className="detail-code">
              <span>{quote?.code || code}</span>
              <CopyCode code={quote?.code || code} name={quote?.name} />
              <span>· USDT 现货</span>
            </div>
          </div>
        </div>
        <div className="detail-price-row">
          <span className={`detail-price ${toneOf(quote?.change)}`}>
            {isNum(quote?.price) ? "$" + formatCryptoPrice(quote.price) : "--"}
          </span>
          <span className={`detail-chg ${toneOf(quote?.change)}`}>
            {formatPct(quote?.change)}
            {isNum(quote?.changeAmt) ? `（${formatCryptoSigned(quote.changeAmt)}）` : ""}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--muted-2)", paddingBottom: 3 }}>
            市值 {isNum(quote?.marketCap) ? formatMarketCap(quote.marketCap) : "--"}
          </span>
        </div>
      </div>

      <div className="detail-chart">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`watch-type-pill ${range === p.key ? "active" : ""}`}
              onClick={() => setRange(p.key)}
            >
              {p.title}{" "}
              <span className={toneOf(p.change)} style={{ fontSize: 11 }}>
                {formatPct(p.change)}
              </span>
            </button>
          ))}
        </div>
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : (
          <LineChart
            points={chartPoints}
            height={250}
            valueFormatter={(v) => "$" + formatCryptoPrice(v)}
            color="#f5b83d"
            emptyText="暂无价格走势"
          />
        )}
        <div className="stat-grid" style={{ marginTop: 12 }}>
          {basicRows.map(([k, v]) => (
            <div key={k}>
              <em>{k}</em>
              <b style={{ fontSize: 12 }}>{v}</b>
            </div>
          ))}
        </div>
        {quote?.desc ? (
          <div className="company-block" style={{ marginTop: 12 }}>
            {quote.desc}。市值按近似流通量估算，价格为币安 USDT 现货。
            </div>
        ) : null}
      </div>
    </Modal>
  );
}
import { useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Empty,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip
} from "antd";
import {
  AppstoreOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined
} from "@ant-design/icons";
import { TrendSparkline } from "../components/Charts";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  MARKET_CONFIG,
  clearIntradayCache,
  fetchRank,
  formatMarketCap,
  formatPct,
  formatPrice,
  isNum,
  toneOf,
  watchApi
} from "../lib/market";

const PAGE_SIZE = 20;

export default function MarketPage({ marketId }) {
  const cfg = MARKET_CONFIG[marketId] || MARKET_CONFIG.cn;
  const { openStock, openBoard, refreshKey } = useAppNav();
  const { message } = App.useApp();

  const [kind, setKind] = useState("gainers");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [added, setAdded] = useState(() => new Set());

  useEffect(() => {
    setKind("gainers");
    setPage(1);
    setRows([]);
    setTotal(0);
  }, [marketId]);

  useEffect(() => {
    const stored = watchApi().getLocalWatchStocks();
    setAdded(
      new Set(
        stored
          .filter((r) => Number(r.type) === Number(cfg.watchType))
          .map((r) => String(r.code).toUpperCase())
      )
    );
  }, [cfg.watchType, version, refreshKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    fetchRank(marketId, kind, PAGE_SIZE, page)
      .then((result) => {
        if (!alive) return;
        setRows(result.list);
        setTotal(result.total || result.list.length);
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err?.message || "涨跌榜加载失败，请稍后重试");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [marketId, kind, page, version]);

  const refresh = () => {
    clearIntradayCache();
    setVersion((v) => v + 1);
  };

  const addToWatch = async (row) => {
    try {
      await watchApi().addWatchStock(row.code, cfg.watchType, row.name);
      setAdded((prev) => new Set(prev).add(String(row.code).toUpperCase()));
      message.success(`已加入自选：${row.name || row.code}`);
    } catch (err) {
      message.error(err?.message || "加入自选失败");
    }
  };

  const stats = useMemo(() => {
    const list = rows.filter((r) => isNum(r.change));
    const up = list.filter((r) => Number(r.change) > 0).length;
    const down = list.filter((r) => Number(r.change) < 0).length;
    const avg = list.length
      ? list.reduce((sum, r) => sum + Number(r.change), 0) / list.length
      : null;
    const amount = list.reduce(
      (sum, r) => sum + (isNum(r.amount) ? Number(r.amount) : 0),
      0
    );
    const leader = list.reduce(
      (best, r) => (!best || Number(r.change) > Number(best.change) ? r : best),
      null
    );
    return { up, down, avg, amount, leader };
  }, [rows]);

  const columns = useMemo(() => {
    const cols = [
      {
        title: "#",
        width: 52,
        align: "center",
        fixed: "left",
        responsive: ["sm"],
        render: (_, __, i) => (
          <span className={`rank-index ${(page - 1) * PAGE_SIZE + i < 3 ? "top" : ""}`}>
            {(page - 1) * PAGE_SIZE + i + 1}
          </span>
        )
      },
      {
        title: "名称 / 代码",
        dataIndex: "name",
        fixed: "left",
        width: 220,
        render: (v, row) => {
          const isAdded = added.has(String(row.code).toUpperCase());
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <NameCell name={v} code={row.code} />
              </div>
              <Tooltip title={isAdded ? "已在自选" : "加入自选"}>
                <Button
                  size="small"
                  type="text"
                  className={`icon-action ${isAdded ? "is-added" : ""}`}
                  icon={isAdded ? <StarFilled /> : <StarOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isAdded) addToWatch(row);
                  }}
                />
              </Tooltip>
            </div>
          );
        }
      },
      {
        title: "最新价",
        dataIndex: "price",
        align: "right",
        width: 96,
        sorter: (a, b) => Number(a.price || 0) - Number(b.price || 0),
        render: (v, row) => (
          <span className={`num ${toneOf(row.change)}`}>
            {isNum(v) ? formatPrice(v, cfg.pricePrefix) : "--"}
          </span>
        )
      },
      {
        title: "涨跌幅",
        dataIndex: "change",
        align: "right",
        width: 104,
        sorter: (a, b) => Number(a.change || 0) - Number(b.change || 0),
        render: (v) => <ChangeCell value={v} />
      },
      {
        title: "涨跌额",
        dataIndex: "changeAmt",
        align: "right",
        width: 92,
        render: (v, row) => (
          <span className={`num ${toneOf(row.change)}`}>
            {isNum(v) ? (Number(v) > 0 ? "+" : "") + Number(v).toFixed(2) : "--"}
          </span>
        )
      },
      {
        title: "振幅",
        dataIndex: "amplitude",
        align: "right",
        width: 82,
        responsive: ["lg"],
        render: (v) => <span className="num">{isNum(v) ? formatPct(v) : "--"}</span>
      },
      {
        title: "最高",
        dataIndex: "high",
        align: "right",
        width: 88,
        responsive: ["xl"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatPrice(v, cfg.pricePrefix) : "--"}</span>
        )
      },
      {
        title: "最低",
        dataIndex: "low",
        align: "right",
        width: 88,
        responsive: ["xl"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatPrice(v, cfg.pricePrefix) : "--"}</span>
        )
      },
      {
        title: "今开",
        dataIndex: "open",
        align: "right",
        width: 88,
        responsive: ["xxl"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatPrice(v, cfg.pricePrefix) : "--"}</span>
        )
      },
      {
        title: "昨收",
        dataIndex: "preClose",
        align: "right",
        width: 88,
        responsive: ["xxl"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatPrice(v, cfg.pricePrefix) : "--"}</span>
        )
      },
      {
        title: "换手率",
        dataIndex: "turnoverRate",
        align: "right",
        width: 86,
        responsive: ["xl"],
        render: (v) => <span className="num">{isNum(v) ? formatPct(v) : "--"}</span>
      },
      {
        title: "市盈率",
        dataIndex: "pe",
        align: "right",
        width: 82,
        responsive: ["xxl"],
        render: (v) => (
          <span className="num">{isNum(v) ? Number(v).toFixed(2) : "--"}</span>
        )
      },
      {
        title: "成交额",
        dataIndex: "amount",
        align: "right",
        width: 100,
        responsive: ["lg"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
        )
      },
      {
        title: "总市值",
        dataIndex: "marketCap",
        align: "right",
        width: 100,
        responsive: ["xl"],
        render: (v) => (
          <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
        )
      },
      {
        title: "分时",
        width: 112,
        align: "center",
        render: (_, row) => (
          <TrendSparkline
            holding={{ code: row.code, market: row.market ?? cfg.marketCode, name: row.name }}
            baseline={
              isNum(row.price) && isNum(row.change)
                ? Number(row.price) / (1 + Number(row.change) / 100)
                : null
            }
            version={version}
          />
        )
      }
    ];
    return cols;
  }, [added, cfg, page, version, marketId, refreshKey]);

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            {cfg.label}行情
            <Tag>{cfg.short}</Tag>
          </h1>
          <div className="page-sub">
            <span>{cfg.name} · {kind === "gainers" ? "涨幅榜" : "跌幅榜"}</span>
            <span>共 {total ? total.toLocaleString() : "--"} 只</span>
            <span>第 {page} 页</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Segmented
            className="rank-toggle"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            options={[
              { label: "涨幅榜", value: "gainers" },
              { label: "跌幅榜", value: "losers" }
            ]}
          />
          <Button icon={<AppstoreOutlined />} onClick={() => openBoard(marketId)}>
            市场全景
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">上涨 / 下跌</div>
          <div className="stat-value">
            <span className="up">{stats.up}</span>
            <span style={{ color: "var(--muted-2)", fontSize: 15, margin: "0 6px" }}>/</span>
            <span className="down">{stats.down}</span>
          </div>
          <div className="stat-sub">当前页 {rows.length} 只</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均涨跌幅</div>
          <div className={`stat-value ${toneOf(stats.avg)}`}>{formatPct(stats.avg)}</div>
          <div className="stat-sub">当前页算术平均</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">当前页成交额</div>
          <div className="stat-value">{formatMarketCap(stats.amount)}</div>
          <div className="stat-sub">剔除无成交额标的</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">当前页领涨</div>
          <div className="stat-value" style={{ fontSize: 17 }}>
            {stats.leader?.name || "--"}
          </div>
          <div className="stat-sub">
            {stats.leader ? `${stats.leader.code} · ${formatPct(stats.leader.change)}` : "--"}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <AppstoreOutlined />
            {kind === "gainers" ? "涨幅排行" : "跌幅排行"}
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看详情 · 右侧可加入自选
              </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey={(row) => `${row.code}-${row.market}`}
          size="middle"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1500 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: total || rows.length,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
            showTotal: (t) => `共 ${t.toLocaleString()} 条`
          }}
          onRow={(row) => ({
            onClick: () => openStock(row, marketId)
          })}
          locale={{
            emptyText: error ? (
              <Empty description={error} />
            ) : (
              <Empty description="暂无数据" />
            )
          }}
        />
      </div>
    </div>
  );
}
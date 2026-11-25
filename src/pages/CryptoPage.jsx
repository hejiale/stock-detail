import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  formatCryptoPrice,
  formatCryptoSigned,
  formatMarketCap,
  formatPct,
  isNum,
  marketApi,
  toneOf
} from "../lib/market";

export default function CryptoPage() {
  const { openCrypto } = useAppNav();
  const [rows, setRows] = useState([]);
  const [sub, setSub] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    marketApi()
      .loadCryptoQuotes()
      .then((result) => {
        if (!alive) return;
        setRows(result?.list || []);
        setSub(result?.sub || "");
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err?.message || "虚拟币行情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => isNum(r.change));
    const up = valid.filter((r) => Number(r.change) > 0).length;
    const down = valid.filter((r) => Number(r.change) < 0).length;
    const amount = rows.reduce(
      (s, r) => s + (isNum(r.amount) ? Number(r.amount) : 0),
      0
    );
    const cap = rows.reduce(
      (s, r) => s + (isNum(r.marketCap) ? Number(r.marketCap) : 0),
      0
    );
    return { up, down, amount, cap };
  }, [rows]);

  const columns = [
    {
      title: "#",
      width: 46,
      align: "center",
      render: (_, __, i) => <span className={`rank-index ${i < 3 ? "top" : ""}`}>{i + 1}</span>
    },
    {
      title: "币种",
      dataIndex: "name",
      width: 210,
      render: (v, row) => <NameCell name={v} code={row.code} extra={row.symbol} />
    },
    {
      title: "最新价",
      dataIndex: "price",
      align: "right",
      width: 116,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>
          {isNum(v) ? "$" + formatCryptoPrice(v) : "--"}
        </span>
      )
    },
    {
      title: "涨跌幅",
      dataIndex: "change",
      align: "right",
      width: 104,
      render: (v) => <ChangeCell value={v} />
    },
    {
      title: "涨跌额",
      dataIndex: "changeAmt",
      align: "right",
      width: 110,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>
          {isNum(v) ? formatCryptoSigned(v) : "--"}
        </span>
      )
    },
    {
      title: "24h 最高",
      dataIndex: "high",
      align: "right",
      width: 110,
      responsive: ["lg"],
      render: (v) => (
        <span className="num">{isNum(v) ? "$" + formatCryptoPrice(v) : "--"}</span>
      )
    },
    {
      title: "24h 最低",
      dataIndex: "low",
      align: "right",
      width: 110,
      responsive: ["lg"],
      render: (v) => (
        <span className="num">{isNum(v) ? "$" + formatCryptoPrice(v) : "--"}</span>
      )
    },
    {
      title: "24h 成交额",
      dataIndex: "amount",
      align: "right",
      width: 120,
      responsive: ["md"],
      render: (v) => (
        <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
      )
    },
    {
      title: "市值",
      dataIndex: "marketCap",
      align: "right",
      width: 120,
      responsive: ["xl"],
      render: (v) => (
        <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
      )
    },
    {
      title: "操作",
      width: 72,
      align: "right",
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          className="icon-action"
          onClick={(e) => {
            e.stopPropagation();
            openCrypto(row.code, row.name);
          }}
        >
          详情
        </Button>
      )
    }
  ];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            虚拟币行情
            <Tag>CRYPTO</Tag>
          </h1>
          <div className="page-sub">
            <span>{sub || "主流币种 · USDT 计价 · 币安现货"}</span>
            <span>{rows.length} 种</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">币种数量</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">币安 USDT 现货</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">上涨 / 下跌</div>
          <div className="stat-value">
            <span className="up">{stats.up}</span>
            <span style={{ color: "var(--muted-2)", fontSize: 15, margin: "0 6px" }}>/</span>
            <span className="down">{stats.down}</span>
          </div>
          <div className="stat-sub">24 小时涨跌</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">24h 成交额合计</div>
          <div className="stat-value">{formatMarketCap(stats.amount)}</div>
          <div className="stat-sub">USDT 计价</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">估算市值合计</div>
          <div className="stat-value">{formatMarketCap(stats.cap)}</div>
          <div className="stat-sub">按流通量估算</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <ReloadOutlined />
            虚拟币列表
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看 K 线与币种资料
            </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey="code"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1050 }}
          onRow={(row) => ({ onClick: () => openCrypto(row.code, row.name) })}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <Empty description={error || "暂无虚拟币行情"} /> }}
        />
      </div>
    </div>
  );
}
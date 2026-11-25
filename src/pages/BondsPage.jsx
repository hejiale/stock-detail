import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Segmented, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  BOND_KINDS,
  formatMarketCap,
  formatPct,
  formatPrecisePrice,
  formatSigned,
  formatVolume,
  isNum,
  marketApi,
  toneOf
} from "../lib/market";

export default function BondsPage({ kind, onKindChange }) {
  const { message } = App.useApp();
  const { openStock } = useAppNav();
  const [rows, setRows] = useState([]);
  const [sub, setSub] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setRows([]);
    marketApi()
      .loadBondsQuotes(kind)
      .then((result) => {
        if (!alive) return;
        setRows(result?.list || []);
        setSub(result?.sub || "");
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err?.message || "债券行情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, version]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => isNum(r.change));
    const up = valid.filter((r) => Number(r.change) > 0).length;
    const down = valid.filter((r) => Number(r.change) < 0).length;
    const avg = valid.length
      ? valid.reduce((s, r) => s + Number(r.change), 0) / valid.length
      : null;
    const amount = rows.reduce(
      (s, r) => s + (isNum(r.amount) ? Number(r.amount) : 0),
      0
    );
    return { up, down, avg, amount };
  }, [rows]);

  const isConvertible = kind === "convertible";

  const columns = [
    {
      title: "#",
      width: 46,
      align: "center",
      render: (_, __, i) => <span className="rank-index">{i + 1}</span>
    },
    {
      title: "债券",
      dataIndex: "name",
      width: 210,
      render: (v, row) => (
        <NameCell
          name={v}
          code={row.code}
          extra={row.market === 1 ? "SH" : row.market === 0 ? "SZ" : ""}
        />
      )
    },
    {
      title: "最新价",
      dataIndex: "price",
      align: "right",
      width: 100,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>
          {isNum(v) ? formatPrecisePrice(v) : "--"}
        </span>
      )
    },
    {
      title: "涨跌额",
      dataIndex: "changeAmt",
      align: "right",
      width: 94,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>
          {isNum(v) ? formatSigned(v, 3) : "--"}
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
    ...(isConvertible
      ? [
          {
            title: "正股",
            dataIndex: "stockName",
            width: 130,
            render: (v, row) => (
              <span style={{ fontSize: 12 }}>
                {v || row.stockCode || "--"}
                {isNum(row.stockChange) ? (
                  <span className={toneOf(row.stockChange)} style={{ marginLeft: 6 }}>
                    {formatPct(row.stockChange)}
                  </span>
                ) : null}
              </span>
            )
          },
          {
            title: "转股价",
            dataIndex: "convertPrice",
            align: "right",
            width: 92,
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "转股价值",
            dataIndex: "convertValue",
            align: "right",
            width: 96,
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "溢价率",
            dataIndex: "premium",
            align: "right",
            width: 90,
            render: (v) => (
              <span className={`num ${toneOf(v)}`}>{isNum(v) ? formatPct(v) : "--"}</span>
            )
          },
          {
            title: "剩余规模",
            dataIndex: "remainSize",
            align: "right",
            width: 100,
            render: (v) =>
              isNum(v) ? formatMarketCap(Number(v) * 1e8) : "--"
          },
          {
            title: "成交额",
            dataIndex: "amount",
            align: "right",
            width: 100,
            render: (v) => (
              <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
            )
          }
        ]
      : [
          {
            title: "今开",
            dataIndex: "open",
            align: "right",
            width: 90,
            responsive: ["lg"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "最高",
            dataIndex: "high",
            align: "right",
            width: 90,
            responsive: ["lg"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "最低",
            dataIndex: "low",
            align: "right",
            width: 90,
            responsive: ["lg"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "昨收",
            dataIndex: "preClose",
            align: "right",
            width: 90,
            responsive: ["xl"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
            )
          },
          {
            title: "成交额",
            dataIndex: "amount",
            align: "right",
            width: 100,
            responsive: ["md"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatMarketCap(v) : "--"}</span>
            )
          },
          {
            title: "成交量",
            dataIndex: "volume",
            align: "right",
            width: 92,
            responsive: ["xl"],
            render: (v) => (
              <span className="num">{isNum(v) ? formatVolume(v) : "--"}</span>
            )
          }
        ])
  ];

  const current = BOND_KINDS.find((k) => k.id === kind) || BOND_KINDS[0];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            债券行情
            <Tag>{current.label}</Tag>
          </h1>
          <div className="page-sub">
            <span>{sub || "国债 / 地方债 / 企业债 / 可转债"}</span>
            <span>共 {rows.length} 只</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Segmented
            className="rank-toggle"
            value={kind}
            onChange={onKindChange}
            options={BOND_KINDS.map((k) => ({ label: k.label, value: k.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">当前品种</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{current.label}</div>
          <div className="stat-sub">{rows.length} 只可查看</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">上涨 / 下跌</div>
          <div className="stat-value">
            <span className="up">{stats.up}</span>
            <span style={{ color: "var(--muted-2)", fontSize: 15, margin: "0 6px" }}>/</span>
            <span className="down">{stats.down}</span>
          </div>
          <div className="stat-sub">按涨跌幅统计</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均涨跌幅</div>
          <div className={`stat-value ${toneOf(stats.avg)}`}>{formatPct(stats.avg)}</div>
          <div className="stat-sub">当前列表算术平均</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">成交额合计</div>
          <div className="stat-value">{formatMarketCap(stats.amount)}</div>
          <div className="stat-sub">仅统计有成交额标的</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <ReloadOutlined />
            {current.label}列表
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看分时与历史走势
            </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey={(row) => `${row.market}-${row.code}`}
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1000 }}
          onRow={(row) => ({
            onClick: () => openStock({ ...row, quote: row }, "cn")
          })}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <Empty description={error || "暂无债券行情"} /> }}
        />
      </div>
    </div>
  );
}
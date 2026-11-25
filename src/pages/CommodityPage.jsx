import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Segmented, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  formatPct,
  formatPrecisePrice,
  formatSigned,
  formatVolume,
  isNum,
  marketApi,
  toneOf
} from "../lib/market";

/**
 * 贵金属 / 原油等“品种行情”通用页 */
export default function CommodityPage({
  title,
  tag,
  kinds,
  kind,
  onKindChange,
  loaderName,
  fallbackSub
}) {
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
      [loaderName](kind)
      .then((result) => {
        if (!alive) return;
        setRows(result?.list || []);
        setSub(result?.sub || "");
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err?.message || "行情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, version, loaderName]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => isNum(r.change));
    const up = valid.filter((r) => Number(r.change) > 0).length;
    const down = valid.filter((r) => Number(r.change) < 0).length;
    const avg = valid.length
      ? valid.reduce((s, r) => s + Number(r.change), 0) / valid.length
      : null;
    const top = valid.reduce(
      (best, r) => (!best || Number(r.change) > Number(best.change) ? r : best),
      null
    );
    return { up, down, avg, top };
  }, [rows]);

  const current = kinds.find((k) => k.id === kind) || kinds[0];

  const columns = [
    {
      title: "#",
      width: 46,
      align: "center",
      render: (_, __, i) => <span className="rank-index">{i + 1}</span>
    },
    {
      title: "品种",
      dataIndex: "name",
      width: 210,
      render: (v, row) => <NameCell name={v} code={row.code} />
    },
    {
      title: "最新价",
      dataIndex: "price",
      align: "right",
      width: 108,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
      )
    },
    {
      title: "涨跌额",
      dataIndex: "changeAmt",
      align: "right",
      width: 96,
      render: (v, row) => (
        <span className={`num ${toneOf(row.change)}`}>{isNum(v) ? formatSigned(v, 3) : "--"}</span>
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
      title: "今开",
      dataIndex: "open",
      align: "right",
      width: 96,
      responsive: ["lg"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    },
    {
      title: "最高",
      dataIndex: "high",
      align: "right",
      width: 96,
      responsive: ["lg"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    },
    {
      title: "最低",
      dataIndex: "low",
      align: "right",
      width: 96,
      responsive: ["lg"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    },
    {
      title: "昨收/昨结",
      dataIndex: "preClose",
      align: "right",
      width: 100,
      responsive: ["xl"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    },
    {
      title: "成交量",
      dataIndex: "volume",
      align: "right",
      width: 92,
      responsive: ["xl"],
      render: (v) => <span className="num">{isNum(v) ? formatVolume(v) : "--"}</span>
    },
    {
      title: "持仓",
      dataIndex: "openInterest",
      align: "right",
      width: 92,
      responsive: ["xxl"],
      render: (v) => <span className="num">{isNum(v) ? formatVolume(v) : "--"}</span>
    },
    {
      title: "买入",
      dataIndex: "bid",
      align: "right",
      width: 90,
      responsive: ["xxl"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    },
    {
      title: "卖出",
      dataIndex: "ask",
      align: "right",
      width: 90,
      responsive: ["xxl"],
      render: (v) => <span className="num">{isNum(v) ? formatPrecisePrice(v) : "--"}</span>
    }
  ];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            {title}
            <Tag>{tag}</Tag>
          </h1>
          <div className="page-sub">
            <span>{sub || fallbackSub}</span>
            <span>共 {rows.length} 条</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Segmented
            className="rank-toggle"
            value={kind}
            onChange={onKindChange}
            options={kinds.map((k) => ({ label: k.label, value: k.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">当前分类</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{current.label}</div>
          <div className="stat-sub">{rows.length} 个品种</div>
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
          <div className="stat-label">领涨品种</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{stats.top?.name || "--"}</div>
          <div className="stat-sub">
            {stats.top ? formatPct(stats.top.change) : "--"}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <ReloadOutlined />
            {current.label}行情
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看分时 / 历史走势
            </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey={(row) => `${row.market}-${row.code}`}
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1100 }}
          onRow={(row) => ({
            onClick: () => openStock({ ...row, quote: row }, "cn")
          })}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <Empty description={error || "暂无行情数据"} /> }}
        />
      </div>
    </div>
  );
}
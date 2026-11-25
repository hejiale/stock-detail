import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Segmented, Table, Tag } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useAppNav } from "../lib/AppContext";
import {
  FED_KINDS,
  formatPct,
  isNum,
  marketApi,
  toneOf
} from "../lib/market";

function formatFedPct(v, digits = 2) {
  if (!isNum(v)) return "--";
  return Number(v).toFixed(digits) + "%";
}

function formatBp(v) {
  if (!isNum(v)) return "--";
  const bp = Math.round(Number(v) * 100);
  return (bp > 0 ? "+" : "") + bp + " BP";
}

export default function FedPage({ kind, onKindChange }) {
  const { openStock } = useAppNav();
  const [rows, setRows] = useState([]);
  const [sub, setSub] = useState("");
  const [target, setTarget] = useState({ from: null, to: null, asOf: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setRows([]);
    marketApi()
      .loadFedRates(kind)
      .then((result) => {
        if (!alive) return;
        setRows(result?.list || []);
        setSub(result?.sub || "");
        setTarget({
          from: result?.targetFrom ?? null,
          to: result?.targetTo ?? null,
          asOf: result?.asOf || result?.list?.[0]?.date || ""
        });
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setError(err?.message || "美联储利率加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [kind, version]);

  const current = FED_KINDS.find((k) => k.id === kind) || FED_KINDS[0];

  const overviewColumns = [
    {
      title: "指标",
      dataIndex: "name",
      width: 220,
      render: (v, row) => (
        <div className="name-cell">
          <span className="name-main">{v}</span>
          <span className="name-code">{row.code || ""}</span>
        </div>
      )
    },
    {
      title: "最新值",
      dataIndex: "valueText",
      align: "right",
      width: 110,
      render: (v, row) => (
        <span className="num">
          {v ? v + (row.unit || "") : "--"}
        </span>
      )
    },
    {
      title: "日期",
      dataIndex: "date",
      width: 110,
      render: (v) => <span className="num">{v || "--"}</span>
    },
    {
      title: "备注",
      width: 180,
      render: (_, row) => (
        <span style={{ fontSize: 12, color: "var(--muted-2)" }}>
          {row.kind === "target" ? "FOMC" : row.tip || (row.volume != null ? `量 ${row.volume}` : "--")}
        </span>
      )
    }
  ];

  const treasuryColumns = [
    { title: "日期", dataIndex: "date", width: 120 },
    {
      title: "2Y",
      dataIndex: "2Y",
      align: "right",
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "5Y",
      dataIndex: "5Y",
      align: "right",
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "10Y",
      dataIndex: "10Y",
      align: "right",
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "30Y",
      dataIndex: "30Y",
      align: "right",
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "2s10s 利差",
      dataIndex: "spread2s10s",
      align: "right",
      width: 110,
      render: (v) => (
        <span className={`num ${toneOf(v)}`}>{formatFedPct(v)}</span>
      )
    },
    {
      title: "10Y 变动",
      align: "right",
      width: 110,
      render: (_, row, i) => {
        const prev = rows[i + 1];
        const chg =
          isNum(row["10Y"]) && isNum(prev?.["10Y"])
            ? Number(row["10Y"]) - Number(prev["10Y"])
            : null;
        return <span className={`num ${toneOf(chg)}`}>{formatBp(chg)}</span>;
      }
    }
  ];

  const historyColumns = [
    { title: "日期", dataIndex: "date", width: 120 },
    {
      title: "EFFR",
      dataIndex: "value",
      align: "right",
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "目标区间",
      dataIndex: "targetText",
      align: "right",
      render: (v) => (
        <span className="num">{v ? v + "%" : "--"}</span>
      )
    },
    {
      title: "成交量（十亿）",
      dataIndex: "volume",
      align: "right",
      render: (v) => <span className="num">{isNum(v) ? v : "--"}</span>
    },
    {
      title: "1% 分位",
      dataIndex: "p1",
      align: "right",
      responsive: ["lg"],
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    },
    {
      title: "99% 分位",
      dataIndex: "p99",
      align: "right",
      responsive: ["lg"],
      render: (v) => <span className="num">{formatFedPct(v)}</span>
    }
  ];

  const targetText =
    target.from != null && target.to != null
      ? `${Number(target.from).toFixed(2)}–${Number(target.to).toFixed(2)}%`
      : target.from != null
        ? formatFedPct(target.from)
        : "--";

  const columns =
    kind === "treasury" ? treasuryColumns : kind === "history" ? historyColumns : overviewColumns;

  const rowKey = (row, i) => `${row.date || ""}-${row.code || ""}-${i}`;

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            美联储利率
            <Tag>{current.label}</Tag>
          </h1>
          <div className="page-sub">
            <span>{sub || "纽约联储 · 联邦基金目标区间 / EFFR / SOFR"}</span>
            <span>共 {rows.length} 条</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Segmented
            className="rank-toggle"
            value={kind}
            onChange={onKindChange}
            options={FED_KINDS.map((k) => ({ label: k.label, value: k.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">联邦基金目标利率</div>
          <div className="stat-value" style={{ fontSize: 26 }}>{targetText}</div>
          <div className="stat-sub">{target.asOf ? `数据日期 ${target.asOf}` : "纽约联储"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">数据类型</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{current.label}</div>
          <div className="stat-sub">{rows.length} 条记录</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最新日期</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {rows[0]?.date || target.asOf || "--"}
          </div>
          <div className="stat-sub">按数据源更新</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">利率口径</div>
          <div className="stat-value" style={{ fontSize: 18 }}>EFFR / SOFR</div>
          <div className="stat-sub">美联储公开市场操作</div>
        </div>
      </div>

      {kind === "overview" && target.from != null ? (
        <div className="panel-card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--muted-2)" }}>
            FEDERAL FUNDS TARGET RATE
          </div>
          <div style={{ fontSize: 34, fontWeight: 750, marginTop: 6 }}>{targetText}</div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
            {target.asOf ? `数据日期 ${target.asOf}` : ""}
          </div>
        </div>
      ) : null}

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <ReloadOutlined />
            {current.label}
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              收益率曲线与 EFFR 历史
            </span>
          </div>
        </div>
        {error ? (
          <div style={{ padding: 20 }}>
            <Alert type="error" showIcon message={error} />
          </div>
        ) : (
          <Table
            className="app-table"
            rowKey={rowKey}
            loading={loading}
            dataSource={rows}
            columns={columns}
            scroll={{ x: 760 }}
            pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
            locale={{ emptyText: <Empty description="暂无利率数据" /> }}
          />
        )}
      </div>
    </div>
  );
}
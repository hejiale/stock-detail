import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Segmented, Table, Tag, Tooltip } from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined
} from "@ant-design/icons";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  FUND_PERIODS,
  addFocusFund,
  formatPct,
  isNum,
  marketApi,
  toneOf,
  watchApi
} from "../lib/market";

export default function FundRankPage() {
  const { message } = App.useApp();
  const { openFund, bumpRefresh } = useAppNav();
  const [period, setPeriod] = useState("month");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [added, setAdded] = useState(() => new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setAdded(
      new Set(
        watchApi()
          .getLocalFocusFunds()
          .map((f) => String(f.code))
      )
    );
  }, [version]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    marketApi()
      .loadOpenFundRank(period, 30)
      .then((result) => {
        if (alive) setRows(result?.list || []);
      })
      .catch((err) => {
        if (alive) {
          setRows([]);
          setError(err?.message || "基金排行加载失败");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [period, version]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => isNum(r.change));
    const up = valid.filter((r) => Number(r.change) > 0).length;
    const avg = valid.length
      ? valid.reduce((s, r) => s + Number(r.change), 0) / valid.length
      : null;
    return { up, avg, top: rows[0] };
  }, [rows]);

  const addToFocus = async (row) => {
    try {
      await addFocusFund(row.code);
      setAdded((prev) => new Set(prev).add(String(row.code)));
      bumpRefresh?.();
      message.success(`已加入自选基金：${row.name || row.code}`);
    } catch (err) {
      const msg = String(err?.message || "添加失败");
      if (/已在|重复/.test(msg)) {
        setAdded((prev) => new Set(prev).add(String(row.code)));
        message.info("该基金已在自选基金中");
      } else {
        message.error(msg);
      }
    }
  };

  const addByKeyword = async (raw) => {
    const kw = String(raw || "").trim();
    if (!kw) return;
    setAdding(true);
    try {
      const results = await marketApi().searchFundList(kw);
      if (!results.length) {
        message.warning("未找到匹配的基金");
        return;
      }
      await addToFocus(results[0]);
    } catch (err) {
      message.error(err?.message || "查询失败");
    } finally {
      setAdding(false);
    }
  };

  const columns = [
    {
      title: "#",
      width: 46,
      align: "center",
      render: (_, __, i) => (
        <span className={`rank-index ${i < 3 ? "top" : ""}`}>{i + 1}</span>
      )
    },
    {
      title: "基金",
      dataIndex: "name",
      width: 260,
      render: (v, row) => <NameCell name={v} code={row.code} extra={row.date} />
    },
    {
      title: "单位净值",
      dataIndex: "nav",
      align: "right",
      width: 100,
      render: (v) => (
        <span className="num">{isNum(v) ? Number(v).toFixed(4) : "--"}</span>
      )
    },
    {
      title: "日涨幅",
      dataIndex: "dayChange",
      align: "right",
      width: 104,
      render: (v) => <ChangeCell value={v} />
    },
    {
      title: "区间涨幅",
      dataIndex: "change",
      align: "right",
      width: 108,
      render: (v) => <ChangeCell value={v} />
    },
    {
      title: "净值日期",
      dataIndex: "date",
      width: 106,
      responsive: ["md"],
      render: (v) => (
        <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{v || "--"}</span>
      )
    },
    {
      title: "操作",
      width: 100,
      align: "right",
      render: (_, row) => {
        const isAdded = added.has(String(row.code));
        return (
          <div className="mini-actions">
            <Tooltip title={isAdded ? "已在自选" : "加入自选基金"}>
              <Button
                size="small"
                type="text"
                className={`icon-action ${isAdded ? "is-added" : ""}`}
                icon={isAdded ? <StarFilled /> : <StarOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isAdded) addToFocus(row);
                }}
              />
            </Tooltip>
            <Button
              size="small"
              type="text"
              className="icon-action"
              onClick={(e) => {
                e.stopPropagation();
                openFund(row.code, row.name);
              }}
            >
              详情
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            基金涨幅榜
            <Tag>基金</Tag>
          </h1>
          <div className="page-sub">
            <span>开放式基金 · {FUND_PERIODS.find((p) => p.id === period)?.label}排行</span>
            <span>共 {rows.length} 只</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Segmented
            className="rank-toggle"
            value={period}
            onChange={setPeriod}
            options={FUND_PERIODS.map((p) => ({ label: p.label, value: p.id }))}
          />
          <Input.Search
            style={{ width: 240 }}
            allowClear
            enterButton={<PlusOutlined />}
            placeholder="代码或名称加入自选"
            loading={adding}
            onSearch={addByKeyword}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)} loading={loading}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">榜单数量</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">按区间涨幅排序</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">区间上涨占比</div>
          <div className="stat-value">
            {rows.length ? Math.round((stats.up / rows.length) * 100) + "%" : "--"}
          </div>
          <div className="stat-sub">
            {stats.up} / {rows.length} 只上涨
            </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均区间涨幅</div>
          <div className={`stat-value ${toneOf(stats.avg)}`}>{formatPct(stats.avg)}</div>
          <div className="stat-sub">当前榜单算术平均</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">榜首基金</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {stats.top?.name || "--"}
          </div>
          <div className="stat-sub">
            {stats.top ? `${stats.top.code} · ${formatPct(stats.top.change)}` : "--"}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <StarOutlined />
            {FUND_PERIODS.find((p) => p.id === period)?.label}排行
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看基金详情 · 星标加入自选基金
              </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey="code"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 860 }}
          onRow={(row) => ({ onClick: () => openFund(row.code, row.name) })}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <Empty description={error || "暂无排行数据"} /> }}
        />
      </div>
    </div>
  );
}
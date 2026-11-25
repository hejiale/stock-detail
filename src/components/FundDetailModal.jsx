import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Empty,
  Modal,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag
} from "antd";
import { StarFilled, StarOutlined } from "@ant-design/icons";
import { LineChart } from "./Charts";
import { CopyCode } from "./Cells";
import { useAppNav } from "../lib/AppContext";
import {
  formatPct,
  formatPrice,
  isNum,
  marketApi,
  toneOf,
  watchApi
} from "../lib/market";

const RANGE_DAYS = {
  Z: 7,
  Y: 30,
  "3Y": 90,
  "6Y": 180,
  "1N": 365,
  "2Y": 730,
  "3N": 1095,
  "5N": 1825
};

function sliceByRange(points, key) {
  const list = (points || []).filter((p) => p?.date && p.nav != null);
  if (!list.length || key === "LN") return list;
  if (key === "JN") {
    const year = String(list[list.length - 1].date).slice(0, 4);
    const slice = list.filter((p) => String(p.date).startsWith(year));
    return slice.length ? slice : list;
  }
  const days = RANGE_DAYS[key];
  if (!days) return list;
  const end = new Date(String(list[list.length - 1].date).slice(0, 10));
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const startText = start.toISOString().slice(0, 10);
  const endText = end.toISOString().slice(0, 10);
  const slice = list.filter((p) => {
    const d = String(p.date).slice(0, 10);
    return d >= startText && d <= endText;
  });
  return slice.length ? slice : list;
}

export default function FundDetailModal({ open, code, presetName, onClose }) {
  const { message } = App.useApp();
  const { bumpRefresh } = useAppNav();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [range, setRange] = useState("LN");
  const [tab, setTab] = useState("overview");
  const [inFocus, setInFocus] = useState(false);

  useEffect(() => {
    if (!open || !code) return undefined;
    let alive = true;
    setLoading(true);
    setDetail(null);
    setError("");
    setTab("overview");
    setRange("LN");
    setInFocus(
      !!watchApi()
        .getLocalFocusFunds()
        .some((f) => String(f.code) === String(code))
    );
    marketApi()
      .loadFundDetail(code)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        const keys = (data?.periods || []).map((p) => p.key);
        setRange(keys.includes("LN") ? "LN" : keys[keys.length - 1] || "LN");
      })
      .catch((err) => {
        if (alive) setError(err?.message || "基金详情加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, code]);

  const basic = detail?.basic;
  const periods = detail?.periods || [];
  const history = detail?.history || [];
  const chart = detail?.chart || [];

  const chartPoints = useMemo(
    () =>
      sliceByRange(chart, range).map((p) => ({ label: p.date, value: p.nav })),
    [chart, range]
  );

  const periodButtons = useMemo(() => {
    if (!periods.length) {
      return [
        { key: "LN", title: "成立以来" },
        { key: "1N", title: "近1年" },
        { key: "6Y", title: "近半年" },
        { key: "3Y", title: "近3月" }
      ];
    }
    return periods;
  }, [periods]);

  const addFocus = async () => {
    if (!code || inFocus) return;
    try {
      await watchApi().addFocusFund(code);
      setInFocus(true);
      bumpRefresh?.();
      message.success(`已加入自选基金：${basic?.name || presetName || code}`);
    } catch (err) {
      const msg = String(err?.message || "加入失败");
      if (/已在|重复/.test(msg)) {
        setInFocus(true);
        message.info("该基金已在自选基金中");
      } else {
        message.error(msg);
      }
    }
  };

  const holdings = detail?.holdings?.list || [];
  const holdingRows = holdings.map((h, i) => ({
    key: `${h.code || i}`,
    ...h,
    rank: i + 1
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnHidden
      title={null}
      className="fund-detail-modal"
      styles={{ body: { padding: 0 } }}
    >
      <div className="detail-head">
        <div className="detail-title-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="detail-title">
              {basic?.name || presetName || code || "基金详情"}
            </div>
            <div className="detail-code">
              <span>{basic?.code || code}</span>
              <CopyCode code={basic?.code || code} name={basic?.name} />
              {basic?.type ? <Tag color="blue">{basic.type}</Tag> : null}
              {basic?.riskLevel ? <Tag>{basic.riskLevel}</Tag> : null}
            </div>
          </div>
          <Space>
            <Button
              type={inFocus ? "default" : "primary"}
              icon={inFocus ? <StarFilled /> : <StarOutlined />}
              onClick={addFocus}
              disabled={inFocus}
            >
              {inFocus ? "已自选" : "加自选"}
            </Button>
          </Space>
        </div>
        <div className="detail-price-row">
          <span className="detail-price">
            {isNum(basic?.nav) ? Number(basic.nav).toFixed(4) : "--"}
          </span>
          <span className={`detail-chg ${toneOf(basic?.dayChange)}`}>
            {formatPct(basic?.dayChange)}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--muted-2)", paddingBottom: 3 }}>
            {basic?.navDate ? `净值日期 ${basic.navDate}` : ""}
          </span>
        </div>
      </div>

      <div className="detail-chart">
        <Tabs
          className="app-tabs"
          size="small"
          items={[
            { key: "overview", label: "走势与阶段" },
            { key: "holdings", label: `持仓 ${holdings.length}` },
            { key: "history", label: "历史净值" }
          ]}
          activeKey={tab}
          onChange={setTab}
        />
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : error ? (
          <Alert type="error" showIcon message={error} />
        ) : tab === "overview" ? (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {periodButtons.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`watch-type-pill ${range === p.key ? "active" : ""}`}
                  onClick={() => setRange(p.key)}
                >
                  {p.title}
                </button>
              ))}
            </div>
            <LineChart
              points={chartPoints}
              height={250}
              valueFormatter={(v) => Number(v).toFixed(4)}
              color="#4c9dff"
              emptyText="暂无净值走势"
            />
            <div className="period-grid" style={{ marginTop: 12 }}>
              {periods.map((p) => (
                <div
                  key={p.key}
                  className={`period-card ${range === p.key ? "active" : ""}`}
                  onClick={() => setRange(p.key)}
                >
                  <div className="period-label">{p.title}</div>
                  <div className={`period-value ${toneOf(p.change)}`}>
                    {formatPct(p.change)}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 10.5, color: "var(--muted-2)" }}>
                    {p.rank ? `同类 ${p.rank}` : p.hs300 != null ? `沪深300 ${formatPct(p.hs300)}` : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className="detail-section-title">基金概况</div>
            <div className="fund-basic-grid">
              {[
                ["基金公司", basic?.company],
                ["成立日期", basic?.establishDate],
                ["基金规模", isNum(basic?.scale) ? `${basic.scale} 亿元` : null],
                ["主题/行业", basic?.theme],
                ["申购状态", basic?.buyStatus],
                ["赎回状态", basic?.redeemStatus],
                ["业绩基准", basic?.bench],
                ["备注", basic?.comment]
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <em>{k}</em>
                    <span>{String(v)}</span>
                  </div>
                ))}
            </div>
          </>
        ) : tab === "holdings" ? (
          <>
            <div style={{ marginBottom: 8, fontSize: 12, color: "var(--muted-2)" }}>
              持仓截止 {detail?.holdings?.asOf || "--"}
            </div>
            {holdingRows.length ? (
              <Table
                className="app-table"
                size="small"
                pagination={false}
                dataSource={holdingRows}
                scroll={{ x: 560 }}
                columns={[
                  { title: "#", dataIndex: "rank", width: 50 },
                  {
                    title: "股票名称",
                    dataIndex: "name",
                    render: (v, row) => (
                      <div className="name-cell">
                        <span className="name-main">{v || row.code}</span>
                        <span className="name-code">{row.code}</span>
                      </div>
                    )
                  },
                  {
                    title: "持仓占比",
                    dataIndex: "ratio",
                    align: "right",
                    width: 110,
                    render: (v) => (isNum(v) ? Number(v).toFixed(2) + "%" : "--")
                  },
                  {
                    title: "最新价",
                    dataIndex: "price",
                    align: "right",
                    width: 100,
                    render: (v) => (isNum(v) ? formatPrice(v) : "--")
                  },
                  {
                    title: "涨跌幅",
                    dataIndex: "change",
                    align: "right",
                    width: 100,
                    render: (v) => (
                      <span className={toneOf(v)}>{formatPct(v)}</span>
                    )
                  }
                ]}
              />
            ) : (
              <Empty description="暂无持仓数据" />
            )}
          </>
        ) : (
          <Table
            className="app-table"
            size="small"
            pagination={{ pageSize: 10, size: "small" }}
            dataSource={history.map((h, i) => ({ key: `${h.date}-${i}`, ...h }))}
            columns={[
              { title: "净值日期", dataIndex: "date" },
              {
                title: "单位净值",
                dataIndex: "nav",
                align: "right",
                render: (v) => (isNum(v) ? Number(v).toFixed(4) : "--")
              },
              {
                title: "累计净值",
                dataIndex: "accNav",
                align: "right",
                render: (v) => (isNum(v) ? Number(v).toFixed(4) : "--")
              },
              {
                title: "日涨幅",
                dataIndex: "dayChange",
                align: "right",
                render: (v) => <span className={toneOf(v)}>{formatPct(v)}</span>
              }
            ]}
          />
        )}
      </div>

      {detail?.warnings?.length ? (
        <div style={{ padding: "0 20px 18px" }}>
          <Alert
            type="warning"
            showIcon
            message={detail.warnings.join("；")}
          />
        </div>
      ) : null}
    </Modal>
  );
}
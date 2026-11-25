import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip
} from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined
} from "@ant-design/icons";
import { LineChart } from "./Charts";
import { CopyCode, NumCell, ChangeCell } from "./Cells";
import { useAppNav } from "../lib/AppContext";
import {
  formatMarketCap,
  formatPct,
  formatPrecisePrice,
  formatPrice,
  formatSigned,
  formatVolume,
  isNum,
  marketApi,
  toneOf,
  watchApi
} from "../lib/market";

const WATCH_TYPE_BY_MARKET = {
  0: 1,
  1: 1,
  105: 2,
  106: 2,
  107: 2,
  116: 3,
  176: 5,
  177: 4
};

const RANGE_SPECS = [
  { id: "day", label: "分时" },
  { id: "1m", label: "近1月", days: 22 },
  { id: "3m", label: "近3月", days: 66 },
  { id: "6m", label: "近半年", days: 132 },
  { id: "1y", label: "近1年", days: 250 },
  { id: "ytd", label: "今年" }
];

function dispatchPeriodRows(profile) {
  return (profile?.reports || []).slice(0, 8).map((r) => ({
    key: `${r.date}-${r.label}`,
    period: r.label || r.date,
    date: r.date,
    revenue: r.revenue,
    profit: r.profit,
    revenueYoy: r.revenueYoy,
    profitYoy: r.profitYoy,
    debtRatio: r.debtRatio
  }));
}

export default function StockDetailDrawer({
  open,
  holding,
  onClose,
  allowWatch = true
}) {
  const { message } = App.useApp();
  const { bumpRefresh } = useAppNav();
  const [loading, setLoading] = useState(false);
  const [trend, setTrend] = useState(null);
  const [history, setHistory] = useState(null);
  const [quote, setQuote] = useState(null);
  const [profile, setProfile] = useState(null);
  const [errors, setErrors] = useState({});
  const [range, setRange] = useState("day");
  const [inWatch, setInWatch] = useState(false);
  const reqRef = useRef(0);

  const key = holding ? `${holding.market}:${holding.code}` : "";
  const watchType = holding ? WATCH_TYPE_BY_MARKET[Number(holding.market)] : null;
  const showWatch = allowWatch && !!watchType;

  useEffect(() => {
    if (!open || !holding?.code) return undefined;
    const api = marketApi();
    const reqId = ++reqRef.current;
    setLoading(true);
    setTrend(null);
    setHistory(null);
    setQuote(holding.quote || null);
    setProfile(null);
    setErrors({});
    setRange("day");

    setInWatch(
      !!watchApi()
        .getLocalWatchStocks()
        .some(
          (r) =>
            String(r.code).toUpperCase() === String(holding.code).toUpperCase() &&
            Number(r.type) === Number(watchType)
        )
    );

    Promise.allSettled([
      api.loadIntradayTrends(holding),
      api.loadDailyKlines(holding),
      api.loadStockQuoteDetail(holding),
      api.loadStockProfile(holding)
    ]).then(([trendRes, hisRes, quoteRes, profileRes]) => {
      if (reqId !== reqRef.current) return;
      setTrend(trendRes.status === "fulfilled" ? trendRes.value : null);
      setHistory(hisRes.status === "fulfilled" ? hisRes.value : null);
      setQuote(
        quoteRes.status === "fulfilled"
          ? { ...(holding.quote || {}), ...quoteRes.value }
          : holding.quote || null
      );
      setProfile(profileRes.status === "fulfilled" ? profileRes.value : null);
      setErrors({
        trend: trendRes.status === "rejected" ? trendRes.reason?.message : "",
        history: hisRes.status === "rejected" ? hisRes.reason?.message : "",
        quote: quoteRes.status === "rejected" ? quoteRes.reason?.message : "",
        profile:
          profileRes.status === "rejected" ? profileRes.reason?.message : ""
      });
      if (!trendRes.value && hisRes.status === "fulfilled") setRange("3m");
      setLoading(false);
    });

    return () => {
      reqRef.current += 1;
    };
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const periods = useMemo(() => {
    if (!history?.klines?.length) {
      return {
        day: quote?.change ?? null,
        "1m": null,
        "3m": null,
        "6m": null,
        "1y": null
      };
    }
    const base = marketApi().calcPeriodReturns(history.klines);
    return { ...base, day: quote?.change ?? base.day };
  }, [history, quote]);

  const chartPoints = useMemo(() => {
    if (range === "day") {
      return (trend?.points || []).map((p) => ({
        label: p.time,
        value: p.price
      }));
    }
    const spec = RANGE_SPECS.find((s) => s.id === range);
    const klines = history?.klines || [];
    let slice;
    if (range === "ytd") {
      const year = String(new Date().getFullYear());
      slice = klines.filter((k) => String(k.date).startsWith(year));
      if (!slice.length) slice = klines.slice(-250);
    } else {
      slice = spec?.days ? klines.slice(-spec.days) : klines;
    }
    return slice.map((k) => ({ label: k.date, value: k.close }));
  }, [range, trend, history]);

  const baseline = range === "day" ? trend?.preClose ?? null : null;
  const tone = toneOf(quote?.change);
  const priceText = isNum(quote?.price)
    ? formatPrice(quote.price, "")
    : "--";

  const quoteRows = useMemo(() => {
    const q = quote || {};
    const rows = [
      ["今开", isNum(q.open) ? formatPrecisePrice(q.open, 3) : "--"],
      ["最高", isNum(q.high) ? formatPrecisePrice(q.high, 3) : "--"],
      ["最低", isNum(q.low) ? formatPrecisePrice(q.low, 3) : "--"],
      ["昨收", isNum(q.preClose) ? formatPrecisePrice(q.preClose, 3) : "--"],
      ["涨跌额", isNum(q.changeAmt) ? formatSigned(q.changeAmt, 3) : "--"],
      ["振幅", isNum(q.amplitude) ? formatPct(q.amplitude) : "--"],
      ["成交量", isNum(q.volume) ? formatVolume(q.volume) : "--"],
      ["成交额", isNum(q.amount) ? formatMarketCap(q.amount) : "--"],
      ["换手率", isNum(q.turnoverRate) ? formatPct(q.turnoverRate) : "--"],
      ["量比", isNum(q.volumeRatio) ? Number(q.volumeRatio).toFixed(2) : "--"],
      ["市盈率", isNum(q.pe) ? Number(q.pe).toFixed(2) : "--"],
      ["市净率", isNum(q.pb) ? Number(q.pb).toFixed(2) : "--"],
      ["总市值", isNum(q.marketCap) ? formatMarketCap(q.marketCap) : "--"],
      ["流通市值", isNum(q.floatCap) ? formatMarketCap(q.floatCap) : "--"],
      ["涨停", isNum(q.limitUp) ? formatPrecisePrice(q.limitUp, 3) : "--"],
      ["跌停", isNum(q.limitDown) ? formatPrecisePrice(q.limitDown, 3) : "--"]
    ];
    return rows;
  }, [quote]);

  const reportRows = useMemo(() => dispatchPeriodRows(profile), [profile]);
  const holderRows = useMemo(
    () =>
      (profile?.holders?.list || []).map((h) => ({
        ...h,
        key: `${h.rank}-${h.name}`
      })),
    [profile]
  );

  const addToWatch = async () => {
    if (!showWatch || inWatch) return;
    try {
      await watchApi().addWatchStock(
        holding.code,
        watchType,
        quote?.name || holding.name
      );
      setInWatch(true);
      bumpRefresh?.();
      message.success(`已加入自选：${quote?.name || holding.name || holding.code}`);
    } catch (err) {
      message.error(err?.message || "加入自选失败");
    }
  };

  const reload = () => {
    if (!holding?.code) return;
    setLoading(true);
    const api = marketApi();
    Promise.allSettled([
      api.loadIntradayTrends(holding),
      api.loadDailyKlines(holding),
      api.loadStockQuoteDetail(holding)
    ]).then(([trendRes, hisRes, quoteRes]) => {
      setTrend(trendRes.status === "fulfilled" ? trendRes.value : null);
      setHistory(hisRes.status === "fulfilled" ? hisRes.value : null);
      setQuote(
        quoteRes.status === "fulfilled"
          ? { ...(holding.quote || {}), ...quoteRes.value }
          : holding.quote || null
      );
      setLoading(false);
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(820px, 100vw)"
      className="detail-drawer"
      title={null}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      {!holding ? null : (
        <>
          <div className="detail-head">
            <div className="detail-title-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="detail-title">{quote?.name || holding.name || holding.code}</div>
                <div className="detail-code">
                  <span>{holding.code}</span>
                  <CopyCode code={holding.code} name={holding.name} />
                  {quote?.date ? <span>· {quote.date}</span> : null}
                </div>
              </div>
              <Space>
                {showWatch ? (
                  <Button
                    type={inWatch ? "default" : "primary"}
                    icon={inWatch ? <StarFilled /> : <StarOutlined />}
                    onClick={addToWatch}
                    disabled={inWatch}
                  >
                    {inWatch ? "已自选" : "加自选"}
                  </Button>
                ) : null}
                <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
                  刷新
                </Button>
                <Button type="text" onClick={onClose}>
                  关闭
                </Button>
              </Space>
            </div>

            <div className="detail-price-row">
              <span className={`detail-price ${tone}`}>{priceText}</span>
              <span className={`detail-chg ${tone}`}>
                {isNum(quote?.changeAmt) ? formatSigned(quote.changeAmt, 3) : ""}{" "}
                {formatPct(quote?.change)}
                {tone === "up" ? <ArrowUpOutlined style={{ fontSize: 11 }} /> : null}
                {tone === "down" ? <ArrowDownOutlined style={{ fontSize: 11 }} /> : null}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--muted-2)", paddingBottom: 3 }}>
                走势数据来自东方财富 / 腾讯行情
              </span>
            </div>
          </div>

          <div className="detail-chart">
            <Tabs
              className="app-tabs"
              size="small"
              activeKey={range}
              onChange={setRange}
              items={RANGE_SPECS.map((s) => ({ key: s.id, label: s.label }))}
              tabBarExtraContent={
                loading ? <span style={{ fontSize: 11, color: "var(--muted-2)" }}>加载中…</span> : null
              }
            />
            {loading && !chartPoints.length ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : (
              <LineChart
                points={chartPoints}
                baseline={baseline}
                height={260}
                valueFormatter={(v) => formatPrecisePrice(v, 2)}
                emptyText={
                  range === "day"
                    ? errors.trend || "暂无当日分时（非交易时段或数据源暂时不可用）"
                    : errors.history || "暂无历史行情"
                }
              />
            )}

            <div className="period-grid" style={{ marginTop: 12 }}>
              {[
                ["day", "当日"],
                ["1m", "近1月"],
                ["3m", "近3月"],
                ["6m", "近半年"],
                ["1y", "近1年"],
                ["ytd", "今年以来"]
              ].map(([id, label]) => {
                const v = periods?.[id];
                return (
                  <div
                    key={id}
                    className={`period-card ${range === id ? "active" : ""}`}
                    onClick={() => setRange(id)}
                  >
                    <div className="period-label">{label}</div>
                    <div className={`period-value ${toneOf(v)}`}>{formatPct(v)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="detail-body">
            <div className="detail-section-title">盘口数据</div>
            <div className="stat-grid">
              {quoteRows.map(([k, v]) => (
                <div key={k}>
                  <em>{k}</em>
                  <b className={["今开", "最高", "最低", "昨收", "涨跌额"].includes(k) ? tone : ""}>
                    {v}
                  </b>
                </div>
              ))}
            </div>

            <div className="detail-section-title">阶段表现</div>
            <Descriptions
              size="small"
              column={{ xs: 2, sm: 2, md: 3 }}
              items={[
                { key: "1m", label: "近1月", children: <span className={toneOf(periods?.["1m"])}>{formatPct(periods?.["1m"])}</span> },
                { key: "3m", label: "近3月", children: <span className={toneOf(periods?.["3m"])}>{formatPct(periods?.["3m"])}</span> },
                { key: "6m", label: "近半年", children: <span className={toneOf(periods?.["6m"])}>{formatPct(periods?.["6m"])}</span> },
                { key: "1y", label: "近1年", children: <span className={toneOf(periods?.["1y"])}>{formatPct(periods?.["1y"])}</span> },
                { key: "ytd", label: "今年以来", children: <span className={toneOf(periods?.ytd)}>{formatPct(periods?.ytd)}</span> },
                {
                  key: "mcap",
                  label: "总市值",
                  children: formatMarketCap(profile?.marketCap?.total ?? quote?.marketCap)
                }
              ]}
            />

            <div className="detail-section-title">财务与公司资料</div>
            {profile ? (
              <>
                {reportRows.length ? (
                  <Table
                    className="app-table"
                    size="small"
                    pagination={false}
                    scroll={{ x: 520 }}
                    dataSource={reportRows}
                    columns={[
                      { title: "报告期", dataIndex: "period", width: 100 },
                      {
                        title: "营业收入",
                        dataIndex: "revenue",
                        align: "right",
                        render: (v) => formatMarketCap(v)
                      },
                      {
                        title: "净利润",
                        dataIndex: "profit",
                        align: "right",
                        render: (v) => formatMarketCap(v)
                      },
                      {
                        title: "营收同比",
                        dataIndex: "revenueYoy",
                        align: "right",
                        render: (v) => <span className={toneOf(v)}>{formatPct(v)}</span>
                      },
                      {
                        title: "利润同比",
                        dataIndex: "profitYoy",
                        align: "right",
                        render: (v) => <span className={toneOf(v)}>{formatPct(v)}</span>
                      },
                      {
                        title: "负债率",
                        dataIndex: "debtRatio",
                        align: "right",
                        render: (v) => (isNum(v) ? Number(v).toFixed(2) + "%" : "--")
                      }
                    ]}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={profile.financeError || "暂无财务数据"}
                  />
                )}

                {holderRows.length ? (
                  <>
                    <div className="detail-section-title" style={{ marginTop: 14 }}>
                      十大股东 · {profile.holders?.date || ""}
                    </div>
                    <Table
                      className="app-table"
                      size="small"
                      pagination={false}
                      dataSource={holderRows}
                      scroll={{ x: 520 }}
                      columns={[
                        { title: "#", dataIndex: "rank", width: 40 },
                        { title: "股东名称", dataIndex: "name", ellipsis: true },
                        {
                          title: "持股比例",
                          dataIndex: "ratio",
                          align: "right",
                          width: 90,
                          render: (v) => (isNum(v) ? Number(v).toFixed(2) + "%" : "--")
                        },
                        {
                          title: "变动",
                          dataIndex: "action",
                          width: 80,
                          render: (v) => (
                            <Tag
                              color={
                                v === "增持" || v === "新进"
                                  ? "red"
                                  : v === "减持"
                                    ? "green"
                                    : "default"
                              }
                            >
                              {v || "--"}
                            </Tag>
                          )
                        }
                      ]}
                    />
                  </>
                ) : null}

                {profile.company ? (
                  <>
                    <div className="detail-section-title" style={{ marginTop: 14 }}>
                      公司信息
                    </div>
                    <div className="company-block">
                      {(profile.company.rows || []).map(([k, v]) => (
                        <div className="company-row" key={k}>
                          <span className="company-k">{k}</span>
                          <span className="company-v">{v}</span>
                        </div>
                      ))}
                      {profile.company.mainBusiness ? (
                        <div className="company-row">
                          <span className="company-k">主营业务</span>
                          <span className="company-v">{profile.company.mainBusiness}</span>
                        </div>
                      ) : null}
                      {profile.company.profile ? (
                        <div className="company-row">
                          <span className="company-k">公司简介</span>
                          <span className="company-v">{profile.company.profile}</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <Alert
                    style={{ marginTop: 12 }}
                    type="info"
                    showIcon
                    message={profile.companyError || "暂无公司信息"}
                  />
                )}
              </>
            ) : loading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : (
              <Alert
                type="info"
                showIcon
                message={errors.profile || "该标的暂无财务资料"}
              />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
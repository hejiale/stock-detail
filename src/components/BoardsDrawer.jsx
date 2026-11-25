import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Skeleton,
  Space,
  Table,
  Tag
} from "antd";
import { ArrowLeftOutlined, ReloadOutlined, StarOutlined } from "@ant-design/icons";
import { TrendSparkline } from "./Charts";
import { ChangeCell, NameCell } from "./Cells";
import {
  MARKET_CONFIG,
  formatMarketCap,
  formatPct,
  formatPrice,
  isNum,
  marketApi,
  toneOf,
  watchApi
} from "../lib/market";

function breadthOf(breadth) {
  if (!breadth) return null;
  const up = Number(breadth.up) || 0;
  const down = Number(breadth.down) || 0;
  const flat = Number(breadth.flat) || 0;
  const total = up + down + flat;
  if (!total) return null;
  return { up, down, flat, total, limitUp: breadth.limitUp, limitDown: breadth.limitDown };
}

function BreadthBar({ breadth }) {
  const b = breadthOf(breadth);
  if (!b) return null;
  return (
    <div>
      <div className="breadth-bar">
        <i style={{ width: `${(b.up / b.total) * 100}%`, background: "var(--up)" }} />
        <i style={{ width: `${(b.flat / b.total) * 100}%`, background: "var(--flat)" }} />
        <i style={{ width: `${(b.down / b.total) * 100}%`, background: "var(--down)" }} />
      </div>
      <div className="breadth-legend">
        <span>涨 <b className="up">{b.up}</b></span>
        <span>平 <b>{b.flat}</b></span>
        <span>跌 <b className="down">{b.down}</b></span>
        {b.limitUp != null ? <span>涨停 <b className="up">{b.limitUp}</b></span> : null}
        {b.limitDown != null ? <span>跌停 <b className="down">{b.limitDown}</b></span> : null}
      </div>
    </div>
  );
}

function IndexGrid({ indices }) {
  if (!indices?.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无指数数据" />;
  }
  return (
    <div className="index-grid" style={{ padding: 0 }}>
      {indices.map((item, i) => {
        const baseline =
          isNum(item.price) && isNum(item.change)
            ? Number(item.price) / (1 + Number(item.change) / 100)
            : null;
        return (
          <div className="index-card" key={`${item.code}-${i}`}>
            <div className="idx-head">
              <span className="idx-name">{item.label || item.name || item.code}</span>
              <span className={`idx-chg ${toneOf(item.change)}`}>{formatPct(item.change)}</span>
            </div>
            <div className="idx-price">{isNum(item.price) ? formatPrice(item.price) : "--"}</div>
            <TrendSparkline
              holding={{ code: item.code, market: item.market, name: item.name }}
              baseline={baseline}
              width={190}
              height={30}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function BoardsDrawer({ open, marketId, onClose, onOpenStock }) {
  const { message } = App.useApp();
  const cfg = MARKET_CONFIG[marketId] || MARKET_CONFIG.cn;
  const [loading, setLoading] = useState(false);
  const [indices, setIndices] = useState([]);
  const [breadth, setBreadth] = useState(null);
  const [boards, setBoards] = useState([]);
  const [regions, setRegions] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [error, setError] = useState("");
  const [view, setView] = useState(null);
  const [viewList, setViewList] = useState([]);
  const [viewRank, setViewRank] = useState("gainers");
  const [viewLoading, setViewLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    setView(null);
    setIndices([]);
    setBreadth(null);
    setBoards([]);
    setRegions([]);
    setSectors([]);

    const api = marketApi();
    const tasks =
      marketId === "cn"
        ? [
            api.loadCnIndices(),
            api.loadCnSectorBoards(),
            api.loadCnRegionBoards(),
            api.loadCnLimitUpDown()
          ]
        : marketId === "us"
          ? [api.loadUsIndices(), api.loadUsMarketBreadth(), api.loadUsFamousSectorStats()]
          : marketId === "hk"
            ? [api.loadHkIndices(), api.loadHkMarketBreadth()]
            : marketId === "jp"
              ? [api.loadJpIndices(), api.loadJpMarketBreadth()]
              : [api.loadKrIndices(), api.loadKrMarketBreadth()];

    Promise.allSettled(tasks).then((results) => {
      if (!alive) return;
      const values = results.map((r) => (r.status === "fulfilled" ? r.value : null));
      setIndices(values[0] || []);
      if (marketId === "cn") {
        setBoards(values[1] || []);
        setRegions(values[2] || []);
        const limits = values[3];
        const sh = (values[0] || []).find((x) => x.code === "000001");
        const sz = (values[0] || []).find((x) => x.code === "399001");
        if (sh || sz) {
          setBreadth({
            up: (sh?.upCount || 0) + (sz?.upCount || 0),
            down: (sh?.downCount || 0) + (sz?.downCount || 0),
            flat: (sh?.flatCount || 0) + (sz?.flatCount || 0),
            limitUp: limits?.limitUp,
            limitDown: limits?.limitDown
          });
        }
      } else if (marketId === "us") {
        setBreadth(values[1]);
        setSectors(values[2] || []);
      } else {
        setBreadth(values[1]);
      }
      const failed = results.every((r) => r.status === "rejected");
      if (failed) setError("板块数据加载失败，请稍后重试");
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [open, marketId, reloadKey]);

  const loadView = async (target, rank = "gainers") => {
    setView(target);
    setViewRank(rank);
    setViewLoading(true);
    setViewList([]);
    try {
      const api = marketApi();
      let list = [];
      if (marketId === "cn") {
        list = await api.loadCnSectorStocks(target.codes, 50, rank, 1);
      } else if (marketId === "us") {
        list = await api.loadUsSectorStocks(target.code, rank, 50);
      }
      setViewList(list || []);
    } catch (err) {
      message.error(err?.message || "成分股加载失败");
    } finally {
      setViewLoading(false);
    }
  };

  const changeRank = (rank) => {
    if (!view || rank === viewRank) return;
    loadView(view, rank);
  };

  const addToWatch = async (row) => {
    try {
      await watchApi().addWatchStock(
        row.code,
        cfg.watchType,
        row.name
      );
      message.success(`已加入自选：${row.name || row.code}`);
    } catch (err) {
      message.error(err?.message || "加入自选失败");
    }
  };

  const stockColumns = useMemo(
    () => [
      {
        title: "股票",
        dataIndex: "name",
        render: (v, row) => <NameCell name={v} code={row.code} />,
        ellipsis: true
      },
      {
        title: "最新价",
        dataIndex: "price",
        align: "right",
        width: 100,
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
        width: 100,
        render: (v) => <ChangeCell value={v} />
      },
      {
        title: "操作",
        width: 90,
        align: "right",
        render: (_, row) => (
          <Space size={2}>
            <Button
              size="small"
              type="text"
              className="icon-action"
              icon={<StarOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                addToWatch(row);
              }}
            />
            <Button
              size="small"
              type="text"
              className="icon-action"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStock?.(row);
              }}
            >
              详情
            </Button>
          </Space>
        )
      }
    ],
    [cfg]
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(920px, 100vw)"
      className="board-drawer"
      title={
        <span>
          {cfg.name} · 市场全景
          {view ? (
            <span className="board-back" onClick={() => setView(null)} style={{ marginLeft: 14 }}>
              <ArrowLeftOutlined /> 返回全景
            </span>
          ) : null}
        </span>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={() => {
          if (view) loadView(view, viewRank);
          else setReloadKey((k) => k + 1);
        }}
        >
          刷新
        </Button>
      }
    >
      {loading ? (
        <div style={{ padding: 24 }}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : error ? (
        <div style={{ padding: 24 }}>
          <Alert type="error" showIcon message={error} />
        </div>
      ) : view ? (
        <div className="board-view">
          <div className="board-section-head">
            <h3>{view.name}</h3>
            <Tag color="blue">{view.code}</Tag>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button
                className={`watch-type-pill ${viewRank === "gainers" ? "active" : ""}`}
                onClick={() => changeRank("gainers")}
              >
                涨幅
              </button>
              <button
                className={`watch-type-pill ${viewRank === "losers" ? "active" : ""}`}
                onClick={() => changeRank("losers")}
              >
                跌幅
              </button>
            </div>
          </div>
          <Table
            className="app-table"
            size="small"
            rowKey="code"
            loading={viewLoading}
            dataSource={viewList}
            pagination={{ pageSize: 20, size: "small" }}
            scroll={{ x: 500 }}
            columns={stockColumns}
            onRow={(row) => ({
              onClick: () => onOpenStock?.(row)
            })}
            locale={{ emptyText: <Empty description="暂无成分股数据" /> }}
          />
        </div>
      ) : (
        <div className="board-view">
          {breadth ? (
            <div className="panel-card" style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 4 }}>
                市场涨跌分布
              </div>
              <BreadthBar breadth={breadth} />
            </div>
          ) : null}

          <div className="board-section-head">
            <h3>主要指数</h3>
          </div>
          <IndexGrid indices={indices} />

          {marketId === "cn" ? (
            <>
              <div className="board-section-head">
                <h3>行业板块</h3>
                <Tag>{boards.length}</Tag>
              </div>
              <div className="board-list">
                {boards.slice(0, 40).map((item, i) => (
                  <div
                    className="board-row"
                    key={item.code}
                    onClick={() =>
                      loadView({
                        code: item.code,
                        name: item.name,
                        codes: item.childCodes?.length ? item.childCodes : [item.code]
                      })
                    }
                  >
                    <span className={`board-index ${i < 3 ? "up" : ""}`}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="board-name">{item.name}</div>
                      <div className="board-meta">
                        {[
                          item.childCount > 1 ? `含${item.childCount}个细分` : "",
                          item.upCount || item.downCount
                            ? `涨${item.upCount || 0} / 跌${item.downCount || 0}`
                            : "",
                          item.leader
                            ? `领涨 ${item.leader}${
                                item.leaderChange != null ? " " + formatPct(item.leaderChange) : ""
                              }`
                            : ""
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <span className={`board-chg ${toneOf(item.change)}`}>
                      {formatPct(item.change)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="board-section-head">
                <h3>地域板块</h3>
                <Tag>{regions.length}</Tag>
              </div>
              <div className="board-list">
                {regions.slice(0, 40).map((item) => (
                  <div
                    className="board-row"
                    key={item.code}
                    onClick={() =>
                      loadView({
                        code: item.code,
                        name: item.name,
                        codes: [item.code]
                      })
                    }
                  >
                    <span className="board-index" />
                    <div style={{ minWidth: 0 }}>
                      <div className="board-name">
                        {/板块$/u.test(item.name) ? item.name : `${item.name}板块`}
                      </div>
                      <div className="board-meta">
                        涨 {item.upCount || 0} · 跌 {item.downCount || 0} · 市值{" "}
                        {formatMarketCap(item.mcap)}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted-2)" }}>查看</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {marketId === "us" && sectors.length ? (
            <>
              <div className="board-section-head">
                <h3>行业板块</h3>
                <Tag>{sectors.length}</Tag>
              </div>
              <div className="board-list">
                {sectors.map((item) => (
                  <div
                    className="board-row"
                    key={item.code}
                    onClick={() => loadView({ code: item.code, name: item.name }, "gainers")}
                  >
                    <span className="board-index" />
                    <div style={{ minWidth: 0 }}>
                      <div className="board-name">{item.name}</div>
                      <div className="board-meta">
                        涨 {item.upCount || 0} · 跌 {item.downCount || 0}
                      </div>
                    </div>
                    <span className={`board-chg ${toneOf(item.change)}`}>
                      {formatPct(item.change)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
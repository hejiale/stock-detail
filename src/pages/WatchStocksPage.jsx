import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Space, Table, Tag, Tooltip } from "antd";
import {
  DeleteOutlined,
  ReloadOutlined,
  StarOutlined
} from "@ant-design/icons";
import { TrendSparkline } from "../components/Charts";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  MARKET_CONFIG,
  WATCH_TYPES,
  formatPrice,
  isNum,
  loadWatchlistQuotes,
  removeWatch,
  toneOf,
  watchMetaOfType
} from "../lib/market";

export default function WatchStocksPage() {
  const { message, modal } = App.useApp();
  const { openStock, navigate, refreshKey } = useAppNav();
  const [type, setType] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  const meta = watchMetaOfType(type);
  const marketCfg = MARKET_CONFIG[meta.market];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    loadWatchlistQuotes(type)
      .then((list) => {
        if (alive) setRows(list);
      })
      .catch((err) => {
        if (alive) {
          setRows([]);
          setError(err?.message || "自选列表加载失败");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [type, version, refreshKey]);

  const confirmRemove = (row) => {
    modal.confirm({
      title: "移除自选",
      content: `确定从自选中移除 ${row.name || row.code}？`,
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await removeWatch(row.code);
          message.success("已移除自选");
          setVersion((v) => v + 1);
        } catch (err) {
          message.error(err?.message || "删除失败");
        }
      }
    });
  };

  const columns = useMemo(
    () => [
      {
        title: "#",
        width: 46,
        align: "center",
        render: (_, __, i) => <span className="rank-index">{i + 1}</span>
      },
      {
        title: "股票",
        dataIndex: "name",
        width: 200,
        render: (v, row) => <NameCell name={v} code={row.code} />
      },
      {
        title: "最新价",
        dataIndex: "price",
        align: "right",
        width: 110,
        render: (v, row) => (
          <span className={`num ${toneOf(row.change)}`}>
            {isNum(v) ? formatPrice(v, marketCfg.pricePrefix) : "--"}
          </span>
        )
      },
      {
        title: "涨跌幅",
        dataIndex: "change",
        align: "right",
        width: 108,
        render: (v) => <ChangeCell value={v} />
      },
      {
        title: "分时",
        width: 112,
        align: "center",
        responsive: ["md"],
        render: (_, row) => (
          <TrendSparkline
            holding={{ code: row.code, market: row.market, name: row.name }}
            baseline={
              isNum(row.price) && isNum(row.change)
                ? Number(row.price) / (1 + Number(row.change) / 100)
                : null
            }
            version={version}
          />
        )
      },
      {
        title: "操作",
        width: 96,
        align: "right",
        render: (_, row) => (
          <div className="mini-actions">
            <Tooltip title="查看详情">
              <Button
                size="small"
                type="text"
                className="icon-action"
                onClick={(e) => {
                  e.stopPropagation();
                  openStock(row, meta.market);
                }}
              >
                详情
              </Button>
            </Tooltip>
            <Tooltip title="移除自选">
              <Button
                size="small"
                type="text"
                className="icon-action"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  confirmRemove(row);
                }}
              />
            </Tooltip>
          </div>
        )
      }
    ],
    [marketCfg, meta.market, version]
  );

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            自选个股
            <Tag>自选</Tag>
          </h1>
          <div className="page-sub">
            <span>{meta.label} · {rows.length} 只</span>
            <span>自选数据保存在本机，登录后可同步账号</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)}>
            刷新
          </Button>
          <Button type="primary" icon={<StarOutlined />} onClick={() => navigate(marketCfg.key)}>
            去{meta.label}行情添加
          </Button>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="watch-type-bar">
            {WATCH_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                className={`watch-type-pill ${Number(type) === t.type ? "active" : ""}`}
                onClick={() => setType(t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看详情
            </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey={(row) => `${row.code}`}
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 700 }}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          onRow={(row) => ({ onClick: () => openStock(row, meta.market) })}
          locale={{
            emptyText: (
              <Empty
                description={
                  error || `暂无${meta.label}自选，去${meta.label}行情页点击星标添加`
                }
              >
                <Button type="primary" onClick={() => navigate(marketCfg.key)}>
                  去添加
                </Button>
              </Empty>
            )
          }}
        />
      </div>
    </div>
  );
}
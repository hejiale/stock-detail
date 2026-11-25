import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Space, Table, Tag, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { ChangeCell, NameCell } from "../components/Cells";
import { useAppNav } from "../lib/AppContext";
import {
  addFocusFund,
  formatPct,
  isNum,
  loadFocusFunds,
  marketApi,
  removeFocusFund,
  toneOf
} from "../lib/market";

export default function FocusFundsPage() {
  const { message, modal } = App.useApp();
  const { openFund, refreshKey, bumpRefresh } = useAppNav();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    loadFocusFunds()
      .then((list) => {
        if (alive) setRows(list);
      })
      .catch((err) => {
        if (alive) {
          setRows([]);
          setError(err?.message || "自选基金加载失败");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [version, refreshKey]);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => isNum(r.dayChange));
    const up = valid.filter((r) => Number(r.dayChange) > 0).length;
    const down = valid.filter((r) => Number(r.dayChange) < 0).length;
    const avg = valid.length
      ? valid.reduce((s, r) => s + Number(r.dayChange), 0) / valid.length
      : null;
    return { up, down, avg };
  }, [rows]);

  const addByKeyword = async (raw) => {
    const kw = String(raw || "").trim();
    if (!kw) return;
    setAdding(true);
    try {
      let code = kw.replace(/\D/g, "");
      let name = "";
      if (!code || kw.length > 6 || /[\u4e00-\u9fa5A-Za-z]/.test(kw)) {
        const results = await marketApi().searchFundList(kw);
        if (!results.length) {
          message.warning("未找到匹配的基金");
          return;
        }
        code = results[0].code;
        name = results[0].name;
      } else {
        const fund = await marketApi().resolveFund(code);
        code = fund.code;
        name = fund.name;
      }
      await addFocusFund(code);
      bumpRefresh?.();
      message.success(`已加入自选基金：${name || code}`);
      setVersion((v) => v + 1);
    } catch (err) {
      const msg = String(err?.message || "添加失败");
      if (/已在|重复/.test(msg)) {
        message.info("该基金已在自选基金中");
      } else {
        message.error(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = (row) => {
    modal.confirm({
      title: "移除自选基金",
      content: `确定移除 ${row.name || row.code}？`,
      okText: "移除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await removeFocusFund(row.code);
          message.success("已移除自选基金");
          setVersion((v) => v + 1);
        } catch (err) {
          message.error(err?.message || "删除失败");
        }
      }
    });
  };

  const columns = [
    {
      title: "#",
      width: 46,
      align: "center",
      render: (_, __, i) => <span className="rank-index">{i + 1}</span>
    },
    {
      title: "基金",
      dataIndex: "name",
      render: (v, row) => <NameCell name={v} code={row.code} extra={row.date} />
    },
    {
      title: "单位净值",
      dataIndex: "nav",
      align: "right",
      width: 110,
      render: (v) => (
        <span className="num">{isNum(v) ? Number(v).toFixed(4) : "--"}</span>
      )
    },
    {
      title: "日涨幅",
      dataIndex: "dayChange",
      align: "right",
      width: 108,
      render: (v) => <ChangeCell value={v} />
    },
    {
      title: "净值日期",
      dataIndex: "date",
      width: 110,
      responsive: ["md"],
      render: (v) => (
        <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{v || "--"}</span>
      )
    },
    {
      title: "操作",
      width: 110,
      align: "right",
      render: (_, row) => (
        <div className="mini-actions">
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
  ];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div className="page-head-main">
          <h1 className="page-title">
            自选基金
            <Tag>自选</Tag>
          </h1>
          <div className="page-sub">
            <span>共 {rows.length} 只基金</span>
            <span>净值与日涨幅来自天天基金 / 东方财富</span>
          </div>
        </div>
        <div className="page-head-actions">
          <Input.Search
            style={{ width: 260 }}
            allowClear
            enterButton={<PlusOutlined />}
            placeholder="输入基金代码或名称添加"
            loading={adding}
            onSearch={addByKeyword}
          />
          <Button icon={<ReloadOutlined />} onClick={() => setVersion((v) => v + 1)}>
            刷新
          </Button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-card">
          <div className="stat-label">自选基金</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">本机保存，登录后同步</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">上涨 / 下跌</div>
          <div className="stat-value">
            <span className="up">{stats.up}</span>
            <span style={{ color: "var(--muted-2)", fontSize: 15, margin: "0 6px" }}>/</span>
            <span className="down">{stats.down}</span>
          </div>
          <div className="stat-sub">按今日涨幅统计</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均日涨幅</div>
          <div className={`stat-value ${toneOf(stats.avg)}`}>{formatPct(stats.avg)}</div>
          <div className="stat-sub">自选基金算术平均</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最近净值日期</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {rows.find((r) => r.date)?.date || "--"}
          </div>
          <div className="stat-sub">基金净值通常 T+1 更新</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-toolbar">
          <div className="panel-toolbar-title">
            <PlusOutlined />
            自选基金列表
          </div>
          <div className="panel-toolbar-actions">
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              点击行查看基金详情
            </span>
          </div>
        </div>
        <Table
          className="app-table"
          rowKey="code"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 720 }}
          onRow={(row) => ({ onClick: () => openFund(row.code, row.name) })}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
          locale={{ emptyText: <Empty description={error || "暂无自选基金，可在上方搜索添加"} /> }}
        />
      </div>
    </div>
  );
}
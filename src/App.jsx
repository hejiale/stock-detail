import { useEffect, useMemo, useRef, useState } from "react";
import {
  AutoComplete,
  Button,
  Drawer,
  Input,
  Layout,
  Menu
} from "antd";
import {
  BankOutlined,
  DollarOutlined,
  FireOutlined,
  FundOutlined,
  GlobalOutlined,
  GoldOutlined,
  LeftOutlined,
  MenuOutlined,
  RightOutlined,
  SearchOutlined,
  StarFilled,
  ThunderboltOutlined
} from "@ant-design/icons";

import MarketPage from "./pages/MarketPage";
import WatchStocksPage from "./pages/WatchStocksPage";
import FocusFundsPage from "./pages/FocusFundsPage";
import FundRankPage from "./pages/FundRankPage";
import BondsPage from "./pages/BondsPage";
import CommodityPage from "./pages/CommodityPage";
import FedPage from "./pages/FedPage";
import CryptoPage from "./pages/CryptoPage";

import StockDetailDrawer from "./components/StockDetailDrawer";
import FundDetailModal from "./components/FundDetailModal";
import CryptoDetailModal from "./components/CryptoDetailModal";
import BoardsDrawer from "./components/BoardsDrawer";

import { AppContext } from "./lib/AppContext";
import {
  BOND_KINDS,
  FED_KINDS,
  MARKET_CONFIG,
  MARKET_LIST,
  METAL_KINDS,
  OIL_KINDS,
  formatDateTime,
  searchFunds,
  searchStocks
} from "./lib/market";

const { Sider, Content } = Layout;

const GROUP_META = {
  "grp:watch": { label: "自选", color: "#f5b83d" },
  "grp:markets": { label: "全球股市", color: "#4c9dff" },
  "grp:bonds": { label: "债券", color: "#22c77e" },
  "grp:metals": { label: "贵金属", color: "#f5b83d" },
  "grp:oil": { label: "原油", color: "#fb923c" },
  "grp:fed": { label: "美联储", color: "#a78bfa" }
};

function iconBadge(icon, color) {
  return (
    <span
      className="menu-icon-badge"
      style={{ color, background: `${color}1f` }}
    >
      {icon}
    </span>
  );
}

function dot(color) {
  return <span className="menu-sub-dot" style={{ background: color }} />;
}

const MENU_GROUPS = [
  {
    key: "grp:watch",
    label: "自选",
    color: "#f5b83d",
    icon: <StarFilled />,
    children: [
      { key: "watch:stocks", label: "自选个股" },
      { key: "watch:funds", label: "自选基金" }
    ]
  },
  {
    key: "grp:markets",
    label: "全球股市",
    color: "#4c9dff",
    icon: <GlobalOutlined />,
    children: MARKET_LIST.map((cfg) => ({
      key: cfg.key,
      label: `${cfg.label} ${cfg.short}`,
      color: cfg.color
    }))
  },
  {
    key: "fund:rank",
    label: "基金",
    color: "#22c77e",
    icon: <FundOutlined />
  },
  {
    key: "grp:bonds",
    label: "债券",
    color: "#22c77e",
    icon: <BankOutlined />,
    children: BOND_KINDS.map((k) => ({
      key: `bond:${k.id}`,
      label: k.label,
      color: "#22c77e"
    }))
  },
  {
    key: "grp:metals",
    label: "贵金属",
    color: "#f5b83d",
    icon: <GoldOutlined />,
    children: METAL_KINDS.map((k) => ({
      key: `metal:${k.id}`,
      label: k.label,
      color: "#f5b83d"
    }))
  },
  {
    key: "grp:oil",
    label: "原油",
    color: "#fb923c",
    icon: <FireOutlined />,
    children: OIL_KINDS.map((k) => ({
      key: `oil:${k.id}`,
      label: k.label,
      color: "#fb923c"
    }))
  },
  {
    key: "grp:fed",
    label: "美联储",
    color: "#a78bfa",
    icon: <DollarOutlined />,
    children: FED_KINDS.map((k) => ({
      key: `fed:${k.id}`,
      label: k.label,
      color: "#a78bfa"
    }))
  },
  {
    key: "crypto",
    label: "虚拟币",
    color: "#f59e0b",
    icon: <ThunderboltOutlined />
  }
];

const LEAF_META = {};
MENU_GROUPS.forEach((g) => {
  if (g.children) {
    g.children.forEach((child) => {
      LEAF_META[child.key] = {
        group: g.label,
        groupKey: g.key,
        label: child.label,
        color: child.color || g.color
      };
    });
  } else {
    LEAF_META[g.key] = {
      group: "概览",
      groupKey: g.key,
      label: g.label,
      color: g.color
    };
  }
});

function groupKeyOf(pageKey) {
  return LEAF_META[pageKey]?.groupKey || "grp:markets";
}

function buildMenuItems() {
  return MENU_GROUPS.map((g) => {
    if (g.children) {
      return {
        key: g.key,
        icon: iconBadge(g.icon, g.color),
        label: g.label,
        children: g.children.map((child) => ({
          key: child.key,
          icon: dot(child.color || g.color),
          label: child.label
        }))
      };
    }
    return {
      key: g.key,
      icon: iconBadge(g.icon, g.color),
      label: g.label
    };
  });
}

const MENU_ITEMS = buildMenuItems();

function isKeyValid(key) {
  return !!LEAF_META[key];
}

function initialPageKey() {
  const hash = String(window.location.hash || "").replace(/^#\/?/, "");
  return isKeyValid(hash) ? hash : "market:cn";
}

function SidebarBody({
  collapsed,
  pageKey,
  openKeys,
  onOpenChange,
  onSelect
}) {
  return (
    <>
      <div className="brand">
        <div className="brand-mark">
          <img src="./assets/icon_licai.png" alt="" />
        </div>
        {collapsed ? null : (
          <div className="brand-copy">
            <div className="brand-title">西方财富</div>
            <div className="brand-sub">MARKET DESK</div>
          </div>
        )}
      </div>
      <div className={`sider-menu-wrap ${collapsed ? "collapsed" : ""}`}>
        <Menu
          className="sider-menu"
          mode="inline"
          theme="dark"
          inlineCollapsed={collapsed}
          items={MENU_ITEMS}
          selectedKeys={[pageKey]}
          openKeys={collapsed ? undefined : openKeys}
          onOpenChange={onOpenChange}
          onClick={({ key }) => onSelect(key)}
        />
      </div>
      {!collapsed ? (
        <div className="sider-footer">
          <div className="sider-tip">
            行情数据来自东方财富 / 新浪 / 腾讯 / 币安，仅供参考
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  const [pageKey, setPageKey] = useState(initialPageKey);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openKeys, setOpenKeys] = useState([groupKeyOf(initialPageKey())]);
  const [stockSel, setStockSel] = useState(null);
  const [fundSel, setFundSel] = useState(null);
  const [cryptoSel, setCryptoSel] = useState(null);
  const [boardMarket, setBoardMarket] = useState(null);
  const [clock, setClock] = useState(formatDateTime());
  const [searchText, setSearchText] = useState("");
  const [searchOptions, setSearchOptions] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setClock(formatDateTime()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.location.hash = pageKey;
    const g = groupKeyOf(pageKey);
    setOpenKeys((prev) => (prev.includes(g) ? prev : [...prev, g]));
  }, [pageKey]);

  useEffect(() => {
    const onHash = () => {
      const key = String(window.location.hash || "").replace(/^#\/?/, "");
      if (isKeyValid(key)) setPageKey(key);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = (key) => {
    if (!isKeyValid(key)) return;
    setPageKey(key);
    setMobileOpen(false);
  };

  const activeMarket = useMemo(() => {
    if (pageKey.startsWith("market:")) return pageKey.split(":")[1];
    if (pageKey.startsWith("watch:")) return "cn";
    if (pageKey.startsWith("bond:") || pageKey.startsWith("metal:") || pageKey.startsWith("oil:")) {
      return "cn";
    }
    return "cn";
  }, [pageKey]);

  /* 全局搜索 */
  const onSearchChange = (value) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const kw = String(value || "").trim();
    if (kw.length < 2) {
      setSearchOptions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const [stockRes, fundRes] = await Promise.allSettled([
        searchStocks(kw, activeMarket),
        searchFunds(kw)
      ]);
      const options = [];
      const stocks = stockRes.status === "fulfilled" ? stockRes.value.slice(0, 6) : [];
      const funds = fundRes.status === "fulfilled" ? fundRes.value.slice(0, 4) : [];
      stocks.forEach((s) => {
        options.push({
          value: `stock|${s.code}|${s.name}|${s.market ?? ""}`,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{s.name}</span>
              <span style={{ color: "var(--muted-2)", fontSize: 11 }}>
                股票 · {s.code}
              </span>
            </div>
          )
        });
      });
      funds.forEach((f) => {
        options.push({
          value: `fund|${f.code}|${f.name}|`,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{f.name}</span>
              <span style={{ color: "var(--muted-2)", fontSize: 11 }}>
                基金 · {f.code}
              </span>
            </div>
          )
        });
      });
      setSearchOptions(options);
    }, 320);
  };

  const onSearchSelect = (value) => {
    const [kind, code, name, market] = String(value).split("|");
    setSearchText("");
    setSearchOptions([]);
    if (kind === "fund") {
      openFund(code, name);
    } else {
      const marketCode = Number(market);
      const holding = {
        code,
        name,
        market: Number.isFinite(marketCode) ? marketCode : MARKET_CONFIG[activeMarket].marketCode,
        quote: { code, name }
      };
      setStockSel({ holding, allowWatch: true });
    }
  };

  const openStock = (row, marketId) => {
    if (!row?.code) return;
    const cfg = MARKET_CONFIG[marketId || activeMarket] || MARKET_CONFIG.cn;
    const quote = row.quote || row;
    const holding = {
      name: row.name || quote.name,
      code: row.code,
      market: row.market != null ? row.market : cfg.marketCode,
      quote
    };
    setStockSel({ holding, allowWatch: !row.__noWatch });
  };

  const openFund = (code, presetName) => {
    if (!code) return;
    setFundSel({ code, name: presetName });
  };

  const openCrypto = (code, presetName) => {
    if (!code) return;
    setCryptoSel({ code, name: presetName });
  };

  const openBoard = (marketId) => {
    setBoardMarket(marketId || (pageKey.startsWith("market:") ? pageKey.split(":")[1] : "cn"));
  };

  const pageNode = useMemo(() => {
    if (pageKey === "watch:stocks") return <WatchStocksPage />;
    if (pageKey === "watch:funds") return <FocusFundsPage />;
    if (pageKey.startsWith("market:")) {
      const id = pageKey.split(":")[1];
      return <MarketPage key={id} marketId={id} />;
    }
    if (pageKey === "fund:rank") return <FundRankPage />;
    if (pageKey.startsWith("bond:")) {
      return (
        <BondsPage
          kind={pageKey.split(":")[1]}
          onKindChange={(k) => nav(`bond:${k}`)}
        />
      );
    }
    if (pageKey.startsWith("metal:")) {
      return (
        <CommodityPage
          title="贵金属行情"
          tag="METALS"
          kinds={METAL_KINDS}
          kind={pageKey.split(":")[1]}
          onKindChange={(k) => nav(`metal:${k}`)}
          loaderName="loadMetalsQuotes"
          fallbackSub="伦敦金/银及货币贵金属 · 盎司计价"
        />
      );
    }
    if (pageKey.startsWith("oil:")) {
      return (
        <CommodityPage
          title="原油行情"
          tag="OIL"
          kinds={OIL_KINDS}
          kind={pageKey.split(":")[1]}
          onKindChange={(k) => nav(`oil:${k}`)}
          loaderName="loadOilQuotes"
          fallbackSub="NYMEX WTI / ICE 布伦特 · 美元/桶"
        />
      );
    }
    if (pageKey.startsWith("fed:")) {
      return (
        <FedPage
          kind={pageKey.split(":")[1]}
          onKindChange={(k) => nav(`fed:${k}`)}
        />
      );
    }
    if (pageKey === "crypto") return <CryptoPage />;
    return <MarketPage marketId="cn" />;
  }, [pageKey]);

  const meta = LEAF_META[pageKey] || LEAF_META["market:cn"];

  const contextValue = useMemo(
    () => ({
      openStock,
      openFund,
      openCrypto,
      openBoard,
      navigate: nav,
      refreshKey,
      bumpRefresh: () => setRefreshKey((k) => k + 1)
    }),
    [pageKey, refreshKey]
  );

  const sidebarProps = {
    pageKey,
    openKeys,
    onOpenChange: setOpenKeys,
    onSelect: nav
  };

  return (
    <AppContext.Provider value={contextValue}>
      <Layout className="app-shell">
        <Sider
          width={248}
          collapsedWidth={76}
          collapsed={collapsed}
          trigger={null}
          className="app-sider"
          style={{ display: undefined }}
        >
          <SidebarBody collapsed={collapsed} {...sidebarProps} />
          <div
            className="sider-collapse"
            role="button"
            tabIndex={0}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "展开菜单" : "收起菜单"}
          >
            {collapsed ? <RightOutlined /> : <LeftOutlined />}
          </div>
        </Sider>

        <Layout className="app-main">
          <header className="app-header">
            <Button
              className="mobile-menu-btn"
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileOpen(true)}
            />
            <div className="header-title">
              <div className="header-title-mark">
                <GlobalOutlined />
              </div>
              <div>
                <h1>{meta.label}</h1>
                <div className="header-title-sub">
                  {meta.group} · 实时行情
                </div>
              </div>
            </div>

            <div className="header-search">
              <AutoComplete
                value={searchText}
                options={searchOptions}
                style={{ width: "100%" }}
                onSearch={onSearchChange}
                onSelect={onSearchSelect}
                onChange={setSearchText}
              >
                <Input
                  prefix={<SearchOutlined style={{ color: "var(--muted-2)" }} />}
                  placeholder="搜索代码 / 名称"
                  allowClear
                />
              </AutoComplete>
            </div>

            <div className="header-actions">
              <div className="live-clock">
                <span className="live-dot" />
                {clock}
              </div>
            </div>
          </header>

          <Content className="app-content">
            {pageNode}
          </Content>
        </Layout>
      </Layout>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        placement="left"
        width={280}
        className="mobile-drawer"
        title={null}
        styles={{ body: { padding: 0 } }}
      >
        <SidebarBody collapsed={false} {...sidebarProps} />
      </Drawer>

      <StockDetailDrawer
        open={!!stockSel}
        holding={stockSel?.holding}
        allowWatch={stockSel?.allowWatch !== false}
        onClose={() => setStockSel(null)}
      />
      <FundDetailModal
        open={!!fundSel}
        code={fundSel?.code}
        presetName={fundSel?.name}
        onClose={() => setFundSel(null)}
      />
      <CryptoDetailModal
        open={!!cryptoSel}
        code={cryptoSel?.code}
        presetName={cryptoSel?.name}
        onClose={() => setCryptoSel(null)}
      />
      <BoardsDrawer
        open={!!boardMarket}
        marketId={boardMarket || "cn"}
        onClose={() => setBoardMarket(null)}
        onOpenStock={(row) => openStock(row, boardMarket)}
      />
    </AppContext.Provider>
  );
}
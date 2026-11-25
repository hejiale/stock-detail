import React from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";

// 复用仓库已有行情 / 自选接口（IIFE，挂载到 window.MarketAPI / window.WatchlistAPI）
import "../api.js";
import "../watchlist-api.js";

import "./styles.css";
import App from "./App.jsx";

const root = createRoot(document.getElementById("root"));

root.render(
  <ConfigProvider
    locale={zhCN}
    theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorPrimary: "#4c9dff",
        colorInfo: "#4c9dff",
        colorSuccess: "#22c77a",
        colorError: "#ff5c5c",
        colorWarning: "#f5b83d",
        colorBgBase: "#070b12",
        colorBgContainer: "#0e1622",
        colorBgElevated: "#111b29",
        colorBorder: "rgba(148,163,184,0.14)",
        colorBorderSecondary: "rgba(148,163,184,0.09)",
        colorText: "#e8eef8",
        colorTextSecondary: "#8b9bb4",
        colorTextTertiary: "#63748c",
        borderRadius: 10,
        borderRadiusLG: 14,
        fontSize: 13,
        controlHeight: 34,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
      },
      components: {
        Layout: {
          siderBg: "#0a111b",
          headerBg: "transparent",
          bodyBg: "transparent"
        },
        Menu: {
          darkItemBg: "transparent",
          darkSubMenuItemBg: "transparent",
          darkItemColor: "#aebed4",
          darkItemHoverBg: "rgba(148,163,184,0.08)"
        },
        Table: {
          headerBg: "rgba(148,163,184,0.045)",
          headerColor: "#63748c",
          rowHoverBg: "rgba(76,157,255,0.055)",
          borderColor: "rgba(148,163,184,0.09)",
          bodySortBg: "transparent"
        },
        Modal: {
          contentBg: "#0e1622",
          headerBg: "#0e1622"
        },
        Drawer: {
          colorBgElevated: "#0e1622"
        },
        Segmented: {
          itemSelectedBg: "rgba(76,157,255,0.17)",
          itemSelectedColor: "#dbeafe"
        },
        Input: {
          activeBorderColor: "rgba(76,157,255,0.6)",
          hoverBorderColor: "rgba(148,163,184,0.3)"
        },
        Button: {
          defaultBg: "rgba(148,163,184,0.06)",
          defaultBorderColor: "rgba(148,163,184,0.16)"
        }
      }
    }}
  >
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>
);
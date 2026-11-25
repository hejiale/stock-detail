import { App } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { formatPct, toneOf } from "../lib/market";

export function CopyCode({ code, name }) {
  const { message } = App.useApp();
  if (!code) return null;

  const copy = async (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(code));
      } else {
        const ta = document.createElement("textarea");
        ta.value = String(code);
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      message.success(`已复制 ${name || code}`);
    } catch {
      message.error("复制失败");
    }
  };

  return (
    <button
      type="button"
      className="copy-btn"
      title="复制代码"
      onClick={copy}
      aria-label={`复制 ${code}`}
    >
      <CopyOutlined />
    </button>
  );
}

export function NameCell({ name, code, extra }) {
  return (
    <div className="name-cell">
      <span className="name-main" title={name || code}>
        {name || code || "--"}
      </span>
      <span className="name-code">
        {code || ""}
        {extra ? <span style={{ color: "var(--muted-2)" }}>· {extra}</span> : null}
        <CopyCode code={code} name={name} />
      </span>
    </div>
  );
}

export function ChangeCell({ value, badge = true, showArrow = true }) {
  const tone = toneOf(value);
  const text = formatPct(value);
  const arrow = tone === "up" ? "▲" : tone === "down" ? "▼" : "";
  return (
    <span className={badge ? `chg-badge ${tone}` : `num ${tone}`}>
      {text}
      {showArrow && tone !== "flat" ? (
        <span style={{ fontSize: 8, lineHeight: 1 }}>{arrow}</span>
      ) : null}
    </span>
  );
}

export function NumCell({ children, tone }) {
  return <span className={`num ${tone || ""}`}>{children}</span>;
}
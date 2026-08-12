/** 加载各 tab 弹窗片段后启动应用 */
(async function boot() {
  const rootEl = document.getElementById("modals-root");
  const partials = [
    "tabs/modals/toast.html",
    "tabs/modals/chart.html",
    "tabs/modals/cn-board.html",
    "tabs/modals/cn-board-stocks.html",
    "tabs/modals/cn-index-stocks.html",
    "tabs/modals/us-board.html",
    "tabs/modals/us-board-stocks.html",
    "tabs/modals/hk-board.html",
    "tabs/modals/jp-board.html",
    "tabs/modals/kr-board.html",
    "tabs/modals/profile.html",
    "tabs/modals/login.html",
    "tabs/modals/register.html"
  ];
  const htmls = await Promise.all(
    partials.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("加载失败: " + url);
      return res.text();
    })
  );
  rootEl.insertAdjacentHTML("beforebegin", htmls[0]);
  rootEl.innerHTML = htmls.slice(1).join("\n");

  render();
  switchTab(activeMainTab, { forceSync: true });
  updateTabArrows();
})().catch((err) => {
  console.error(err);
  const el = document.createElement("pre");
  el.style.cssText = "padding:16px;color:#b91c1c;white-space:pre-wrap";
  el.textContent = "页面初始化失败：\n" + (err && err.message ? err.message : err);
  document.body.prepend(el);
});

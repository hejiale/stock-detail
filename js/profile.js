    function filterReports(reports, kind) {
      return (reports || []).filter((r) => {
        if (kind === "annual") return r.kind === "annual";
        if (kind === "quarter") return r.kind === "quarter";
        return true;
      });
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function setProfileSectionExpanded(key, expanded) {
      const section = document.querySelector(`[data-profile-section="${key}"]`);
      const btn = document.querySelector(`[data-profile-section-toggle="${key}"]`);
      if (!section || !btn) return;
      section.classList.toggle("is-collapsed", !expanded);
      btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    function toggleProfileSection(key) {
      const btn = document.querySelector(`[data-profile-section-toggle="${key}"]`);
      if (!btn) return;
      const expanded = btn.getAttribute("aria-expanded") !== "false";
      setProfileSectionExpanded(key, !expanded);
    }

    function resetProfileSections() {
      ["finance", "holders", "company"].forEach((key) => {
        setProfileSectionExpanded(key, true);
      });
    }

    function renderProfileCompany(company, companyError) {
      const wrap = document.getElementById("profileCompany");
      const emptyEl = document.getElementById("profileCompanyEmpty");
      if (!wrap || !emptyEl) return;

      wrap.innerHTML = "";
      emptyEl.textContent = "";

      const rows = company?.rows || [];
      if (!rows.length && !company?.mainBusiness && !company?.profile) {
        emptyEl.textContent = companyError || "暂无公司信息";
        return;
      }

      wrap.innerHTML = rows
        .map(
          ([k, v]) => `
          <div class="profile-company-row">
            <div class="profile-company-k">${escapeHtml(k)}</div>
            <div class="profile-company-v">${escapeHtml(v)}</div>
          </div>`
        )
        .join("");

      if (company?.mainBusiness) {
        wrap.insertAdjacentHTML(
          "beforeend",
          `<div class="profile-company-block">
            <div class="profile-company-block-title">主营业务</div>
            <div class="profile-company-block-text">${escapeHtml(company.mainBusiness)}</div>
          </div>`
        );
      }
      if (company?.profile) {
        wrap.insertAdjacentHTML(
          "beforeend",
          `<div class="profile-company-block">
            <div class="profile-company-block-title">公司简介</div>
            <div class="profile-company-block-text">${escapeHtml(company.profile)}</div>
          </div>`
        );
      }
    }

    function renderProfileList(reports, kind, emptyMsg) {
      const wrap = document.getElementById("profileList");
      const headEl = document.getElementById("profileListHead");
      if (!wrap) return;
      const list = filterReports(reports, kind);

      if (!list.length) {
        wrap.innerHTML = emptyMsg
          ? `<div class="profile-holders-empty">${escapeHtml(emptyMsg)}</div>`
          : "";
        if (headEl) headEl.hidden = true;
        return;
      }

      if (headEl) headEl.hidden = false;

      wrap.innerHTML = list
        .map((r) => {
          const debt =
            r.debtRatio != null ? r.debtRatio.toFixed(2) + "%" : "--";
          return `
            <div class="profile-row">
              <div class="profile-period">
                <div class="period-label">${r.label || r.date || "--"}</div>
                <div class="period-date">${r.date || ""}</div>
              </div>
              <div class="profile-metric">
                <div class="metric-main">${formatMarketCap(r.revenue)}</div>
                ${formatYoy(r.revenueYoy)}
              </div>
              <div class="profile-metric">
                <div class="metric-main">${formatMarketCap(r.profit)}</div>
                ${formatYoy(r.profitYoy)}
              </div>
              <div class="profile-metric">
                <div class="metric-main" title="资产负债率">${debt}</div>
              </div>
            </div>`;
        })
        .join("");
    }

    function formatHolderChange(h) {
      const action = h.action || "--";
      let tone = "flat";
      if (action === "增持" || action === "新进") tone = "up";
      else if (action === "减持") tone = "down";

      let detail = "";
      if (h.changeRatio != null && !Number.isNaN(h.changeRatio)) {
        detail = formatPct(h.changeRatio);
      } else if (
        h.changeShares != null &&
        !Number.isNaN(h.changeShares) &&
        action !== "新进" &&
        action !== "不变"
      ) {
        const abs = Math.abs(h.changeShares);
        const sign = h.changeShares > 0 ? "+" : "-";
        if (abs >= 1e8) detail = sign + (abs / 1e8).toFixed(2) + "亿股";
        else if (abs >= 1e4) detail = sign + (abs / 1e4).toFixed(2) + "万股";
        else detail = sign + abs.toFixed(0) + "股";
      }

      return `<span class="holder-change ${tone}"><span class="action">${action}</span>${
        detail ? `<span class="detail">${detail}</span>` : ""
      }</span>`;
    }

    function renderProfileHolders(holders, holdersError) {
      const listEl = document.getElementById("profileHolders");
      const emptyEl = document.getElementById("profileHoldersEmpty");
      const summaryEl = document.getElementById("profileChangeSummary");
      const headEl = document.querySelector(".profile-holders-head");
      if (!listEl || !emptyEl || !summaryEl) return;

      listEl.innerHTML = "";
      emptyEl.textContent = "";
      summaryEl.hidden = true;
      summaryEl.innerHTML = "";

      if (!holders?.list?.length) {
        emptyEl.textContent = holdersError || "暂无股东数据";
        if (headEl) headEl.hidden = true;
        return;
      }

      if (headEl) headEl.hidden = false;

      const counts = { 新进: 0, 增持: 0, 减持: 0, 不变: 0 };
      holders.list.forEach((h) => {
        if (counts[h.action] != null) counts[h.action] += 1;
      });
      const chips = [];
      if (counts["新进"]) chips.push(`<span class="up">新进 ${counts["新进"]}</span>`);
      if (counts["增持"]) chips.push(`<span class="up">增持 ${counts["增持"]}</span>`);
      if (counts["减持"]) chips.push(`<span class="down">减持 ${counts["减持"]}</span>`);
      if (counts["不变"]) chips.push(`<span class="flat">不变 ${counts["不变"]}</span>`);
      if (chips.length) {
        summaryEl.hidden = false;
        summaryEl.innerHTML = `本期变动：${chips.join('<span class="sep">·</span>')}`;
      }

      listEl.innerHTML = holders.list
        .map(
          (h) => `
          <div class="profile-holder-row">
            <div class="holder-rank">${h.rank || "--"}</div>
            <div class="holder-name" title="${h.name}">${h.name}</div>
            <div class="holder-ratio">${
              h.ratio != null ? h.ratio.toFixed(2) + "%" : "--"
            }</div>
            <div class="holder-chg">${formatHolderChange(h)}</div>
          </div>`
        )
        .join("");
    }

    let profileRequestId = 0;

    async function openProfileModal() {
      const holding = openChartModal._state?.holding;
      if (!holding) {
        showToast("暂无个股信息");
        return;
      }

      const reqId = ++profileRequestId;
      const name = document.getElementById("chartModalName")?.textContent || holding.name;

      document.getElementById("profileModalName").textContent = name;
      const profileSub = document.getElementById("profileModalSub");
      if (profileSub) {
        profileSub.innerHTML = holding.code
          ? `代码 ${codeWithCopyHtml(holding.code, holding.name || name)} · 加载中…`
          : "加载中…";
      }
      document.getElementById("profileList").innerHTML = "";
      const financeHead = document.getElementById("profileListHead");
      if (financeHead) financeHead.hidden = true;
      renderProfileHolders(null, "");
      renderProfileCompany(null, "");
      document.querySelectorAll("#profileTabs .board-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.profileKind === "all");
      });
      openProfileModal._kind = "all";
      openProfileModal._data = null;
      resetProfileSections();

      showModal("profileModal");
      setStatus("profileStatus", "加载个股资料…");

      try {
        const profile = await loadStockProfile(holding);
        if (reqId !== profileRequestId) return;
        openProfileModal._data = profile;

        document.getElementById("profileModalName").textContent =
          profile.name || name;
        const profileSub = document.getElementById("profileModalSub");
        if (profileSub) {
          profileSub.innerHTML = profile.code
            ? `代码 ${codeWithCopyHtml(
                profile.code,
                profile.name || name
              )} · 金额单位：${profile.currencyLabel || "本币"}`
            : `金额单位：${profile.currencyLabel || "本币"}`;
        }

        const financeEmpty =
          profile.financeError && !profile.reports?.length
            ? profile.financeError
            : profile.reports?.length
              ? ""
              : "暂无财务数据";
        renderProfileList(profile.reports, "all", financeEmpty);
        renderProfileHolders(profile.holders, profile.holdersError);
        renderProfileCompany(profile.company, profile.companyError);
        setStatus("profileStatus", "");
      } catch (err) {
        if (reqId !== profileRequestId) return;
        setStatus("profileStatus", err.message || "加载失败");
      }
    }

    function setProfileKind(kind) {
      openProfileModal._kind = kind;
      document.querySelectorAll("#profileTabs .board-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.profileKind === kind);
      });
      const data = openProfileModal._data;
      if (!data) return;
      const filtered = filterReports(data.reports, kind);
      renderProfileList(
        data.reports,
        kind,
        filtered.length ? "" : "该分类暂无数据"
      );
    }

    function closeProfileModal() {
      profileRequestId += 1;
      openProfileModal._data = null;
      hideModal("profileModal");
      setStatus("profileStatus", "");
    }

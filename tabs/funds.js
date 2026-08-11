    function renderFundPicker() {
      const picker = document.getElementById("fundPicker");
      if (!picker) return;
      picker.innerHTML = WATCH_FUND_IDS.map((id) => {
        const fund = window.FUND_HOLDINGS[id];
        if (!fund) return "";
        const isActive = id === activeWatchFundId;
        const icon = isActive ? "assets/select_jijin.png" : "assets/jijin.png";
        return `<button class="fund-pick${
          isActive ? " active" : ""
        }" type="button" data-fund-pick="${id}"><span class="fund-pick-label">${fund.name}</span><img class="fund-pick-icon" src="${icon}" alt="" aria-hidden="true" /></button>`;
      }).join("");
      picker.hidden = activeMainTab !== "funds";
    }


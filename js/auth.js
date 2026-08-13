    function setAuthError(id, message) {
      const el = document.getElementById(id);
      if (!el) return;
      if (!message) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.textContent = message;
    }

    function setAuthSubmitting(submitId, loading) {
      const btn = document.getElementById(submitId);
      if (!btn) return;
      btn.disabled = !!loading;
      btn.classList.toggle("is-loading", !!loading);
    }

    function openLoginModal({ name = "", message = "" } = {}) {
      hideModal("registerModal");
      const nameInput = document.getElementById("loginName");
      const passwordInput = document.getElementById("loginPassword");
      if (nameInput && name) nameInput.value = name;
      if (passwordInput) passwordInput.value = "";
      setAuthError("loginError", message || "");
      setAuthSubmitting("loginSubmit", false);
      showModal("loginModal");
      requestAnimationFrame(() => {
        (nameInput?.value ? passwordInput : nameInput)?.focus();
      });
    }

    function closeLoginModal() {
      setAuthError("loginError", "");
      setAuthSubmitting("loginSubmit", false);
      hideModal("loginModal");
    }

    function openRegisterModal({ name = "" } = {}) {
      hideModal("loginModal");
      const nameInput = document.getElementById("registerName");
      const passwordInput = document.getElementById("registerPassword");
      const password2Input = document.getElementById("registerPassword2");
      if (nameInput) nameInput.value = name || nameInput.value || "";
      if (passwordInput) passwordInput.value = "";
      if (password2Input) password2Input.value = "";
      setAuthError("registerError", "");
      setAuthSubmitting("registerSubmit", false);
      showModal("registerModal");
      requestAnimationFrame(() => {
        (nameInput?.value ? passwordInput : nameInput)?.focus();
      });
    }

    function closeRegisterModal() {
      setAuthError("registerError", "");
      setAuthSubmitting("registerSubmit", false);
      hideModal("registerModal");
    }

    function onAuthSuccess() {
      if (!isWatchGroupTab(activeMainTab)) return;
      renderFundPicker();
      if (activeMainTab === "funds") {
        loadFocusFunds({ force: true }).catch(() => {});
        return;
      }
      loadWatchlist(watchlistState.type || 1, { force: true }).catch(() => {});
    }

    async function handleLoginSubmit(event) {
      event.preventDefault();
      const name = document.getElementById("loginName")?.value || "";
      const password = document.getElementById("loginPassword")?.value || "";
      setAuthError("loginError", "");
      setAuthSubmitting("loginSubmit", true);
      try {
        const user = await loginUser(name, password);
        closeLoginModal();
        showToast(`登录成功：${user.name}`);
        onAuthSuccess();
      } catch (err) {
        setAuthError("loginError", err?.message || "登录失败");
      } finally {
        setAuthSubmitting("loginSubmit", false);
      }
    }

    async function handleRegisterSubmit(event) {
      event.preventDefault();
      const name = String(document.getElementById("registerName")?.value || "").trim();
      const password = document.getElementById("registerPassword")?.value || "";
      const password2 = document.getElementById("registerPassword2")?.value || "";
      setAuthError("registerError", "");

      if (!name) {
        setAuthError("registerError", "请输入用户名");
        return;
      }
      if (!password) {
        setAuthError("registerError", "请输入密码");
        return;
      }
      if (password !== password2) {
        setAuthError("registerError", "两次输入的密码不一致");
        return;
      }

      setAuthSubmitting("registerSubmit", true);
      try {
        await registerUser(name, password);
        closeRegisterModal();
        showToast("注册成功，请登录");
        openLoginModal({ name, message: "注册成功，请登录" });
      } catch (err) {
        setAuthError("registerError", err?.message || "注册失败");
      } finally {
        setAuthSubmitting("registerSubmit", false);
      }
    }

    function ensureLoggedIn({ toast = true } = {}) {
      if (isLoggedIn()) return true;
      if (toast) showToast("请先登录");
      openLoginModal();
      return false;
    }

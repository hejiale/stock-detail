import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Input, Modal, Tabs } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { watchApi } from "../lib/market";

export default function AuthModal({ open, onClose, onSuccess }) {
  const { message } = App.useApp();
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    setTab("login");
    setError("");
    setLoading(false);
    form.resetFields();
  }, [open, form]);

  const submit = async (values) => {
    setError("");
    setLoading(true);
    try {
      const api = watchApi();
      if (tab === "login") {
        const user = await api.loginUser(values.name, values.password);
        message.success(`登录成功：${user.name}`);
        onSuccess?.(user);
        onClose?.();
      } else {
        if (values.password !== values.password2) {
          setError("两次输入的密码不一致");
          return;
        }
        await api.registerUser(values.name, values.password);
        message.success("注册成功，请登录");
        form.setFieldsValue({ password: "", password2: "" });
        form.setFieldValue("name", values.name);
        setTab("login");
        setError("注册成功，请使用刚才的密码登录");
      }
    } catch (err) {
      setError(err?.message || (tab === "login" ? "登录失败" : "注册失败"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
      title={null}
      destroyOnHidden
    >
      <div className="auth-card">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>西方财富</div>
          <div className="auth-tip" style={{ marginTop: 6, marginBottom: 0 }}>
            账号用于同步自选个股与自选基金；行情数据无需登录即可查看。
          </div>
        </div>

        <Tabs
          className="app-tabs"
          activeKey={tab}
          onChange={(k) => {
            setTab(k);
            setError("");
          }}
          items={[
            { key: "login", label: "登录" },
            { key: "register", label: "注册" }
          ]}
        />

        {error ? (
          <Alert
            type={/成功/.test(error) ? "success" : "error"}
            showIcon
            message={error}
            style={{ marginBottom: 12 }}
          />
        ) : null}

        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item
            name="name"
            label="用户名"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </Form.Item>
          {tab === "register" ? (
            <Form.Item
              name="password2"
              label="确认密码"
              rules={[{ required: true, message: "请再次输入密码" }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined />}
                placeholder="请再次输入密码"
                autoComplete="new-password"
              />
            </Form.Item>
          ) : null}
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
          >
            {tab === "login" ? "登录" : "注册"}
          </Button>
        </Form>
      </div>
    </Modal>
  );
}
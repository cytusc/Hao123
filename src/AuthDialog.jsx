import React, { useEffect, useState } from "react";
import { Grid2X2, LockKeyhole, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigation } from "./navigation";
import { api } from "./api";

export default function AuthDialog() {
  const { authOpen, setAuthOpen, authenticate, adminMode } = useNavigation();
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (authOpen) {
      setMode("login");
      setError("");
      setNotice("");
    }
  }, [authOpen]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "forgot" && !adminMode) {
        const data = await api("/auth/forgot-password", {
          method: "POST",
          body: { email: f.get("email") },
        });
        setNotice(data.message);
        return;
      }
      await authenticate(mode, {
        email: f.get("email"),
        password: f.get("password"),
        ...(mode === "register" ? { name: f.get("name") } : {}),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={authOpen} onOpenChange={setAuthOpen}>
      <DialogContent className="auth-dialog sm:max-w-[420px]">
        <DialogHeader>
          <span className="brand-symbol mb-3">
            <Grid2X2 size={23} />
          </span>
          <DialogTitle>
            {adminMode
              ? "管理员登录"
              : mode === "forgot"
                ? "找回账号"
                : mode === "login"
                  ? "用户登录"
                  : "创建你的轻导航账号"}
          </DialogTitle>
          <DialogDescription>
            {adminMode
              ? "使用管理账号进入导航管理台。"
              : mode === "forgot"
                ? "输入注册邮箱，我们会发送密码重置链接。"
                : "收藏、置顶和首页设置，换一台设备也还在。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          {!adminMode && mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="auth-name">昵称</Label>
              <Input
                id="auth-name"
                name="name"
                required
                maxLength={24}
                autoComplete="nickname"
                placeholder="怎么称呼你？"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="auth-email">邮箱</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="auth-password">密码</Label>
              <Input
                id="auth-password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="至少 8 位密码"
              />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-green-700" role="status">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <LoaderCircle className="animate-spin" />}
            {mode === "forgot"
              ? "发送重置邮件"
              : mode === "login"
                ? "登录"
                : "注册并登录"}
          </Button>
        </form>
        {!adminMode && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setNotice("");
            }}
          >
            {mode === "login" ? "还没有账号？创建账号" : "已有账号？返回登录"}
          </Button>
        )}
        {!adminMode && mode === "login" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMode("forgot");
              setError("");
              setNotice("");
            }}
          >
            忘记密码？
          </Button>
        )}
        <p className="auth-note">
          <LockKeyhole size={13} />
          {adminMode
            ? "仅限管理账号使用。"
            : "密码加密保存，访客仍可直接使用导航。"}
        </p>
      </DialogContent>
    </Dialog>
  );
}

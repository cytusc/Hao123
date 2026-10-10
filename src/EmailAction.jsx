import React, { useEffect, useState } from "react";
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
import { api } from "./api";

export default function EmailAction() {
  const verify = location.pathname === "/auth/verify";
  const [token] = useState(() => {
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    return value;
  });
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
  }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(
    token ? "" : "链接无效，请重新申请邮件链接。",
  );
  const submit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!verify && form.get("password") !== form.get("confirm")) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (verify) await api(`/auth/verify?token=${encodeURIComponent(token)}`);
      else
        await api("/auth/reset-password", {
          method: "POST",
          body: { token, password: form.get("password") },
        });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={() => location.assign("/")}>
      <DialogContent className="auth-dialog sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{verify ? "验证邮箱" : "重置密码"}</DialogTitle>
          <DialogDescription>
            {done
              ? verify
                ? "邮箱已验证，你可以返回导航继续使用。"
                : "密码已重置，所有设备已退出，请使用新密码登录。"
              : "链接只能使用一次，请确认这是你本人的操作。"}
          </DialogDescription>
        </DialogHeader>
        {!done && (
          <form onSubmit={submit} className="space-y-4">
            {!verify && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="reset-password">新密码</Label>
                  <Input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">确认新密码</Label>
                  <Input
                    id="reset-confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                  />
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !token} className="w-full">
              {busy ? "正在处理…" : verify ? "确认验证邮箱" : "确认重置密码"}
            </Button>
          </form>
        )}
        <Button variant="outline" onClick={() => location.assign("/")}>
          返回导航
        </Button>
      </DialogContent>
    </Dialog>
  );
}

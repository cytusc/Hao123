import React, { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, LogOut } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "./api";
import { useNavigation } from "./navigation";

export function AccountDialog({ open, onClose }) {
  const { user, logout, syncState } = useNavigation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", {
        method: "PUT",
        body: { current: f.get("current"), next: f.get("next") },
      });
      setNotice("密码已修改，其他设备已退出登录。");
      e.target.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!user) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="auth-dialog">
        <DialogHeader>
          <DialogTitle>你好，{user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="account-sync">
          <ShieldCheck size={18} />
          <span>
            常用网站与首页设置{syncState === "已同步" ? "已同步" : syncState}
          </span>
        </div>
        <form onSubmit={change} className="space-y-4">
          <h3 className="text-sm font-medium">修改密码</h3>
          <div className="space-y-2">
            <Label htmlFor="password-current">当前密码</Label>
            <Input
              id="password-current"
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-next">新密码</Label>
            <Input
              id="password-next"
              name="next"
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-green-700">
              {notice}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}修改密码
          </Button>
        </form>
        <Button
          variant="ghost"
          onClick={async () => {
            setBusy(true);
            try {
              await logout();
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          <LogOut size={16} />
          退出登录
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function SubmissionDialog({ open, onClose }) {
  const { categories } = useNavigation();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(categories[0]?.id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    try {
      const d = await api("/submissions");
      setItems(d.submissions);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    if (open) {
      load();
      setNotice("");
      setError("");
    }
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/submissions", {
        method: "POST",
        body: {
          name: f.get("name"),
          url: f.get("url"),
          categoryId: category,
          description: f.get("description"),
        },
      });
      e.target.reset();
      setNotice("已提交，审核结果会显示在下方。");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="auth-dialog sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>推荐一个好网站</DialogTitle>
          <DialogDescription>
            分享你发现的网站，通过审核后加入公开目录。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="submit-name">网站名称</Label>
            <Input id="submit-name" name="name" required maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="submit-url">网站地址</Label>
            <Input
              id="submit-url"
              name="url"
              type="url"
              required
              placeholder="https://www.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="submit-category">分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="submit-category" className="w-full">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem value={c.id} key={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="submit-description">简单介绍</Label>
            <Textarea
              id="submit-description"
              name="description"
              placeholder="这个网站有什么好用的？"
            />
          </div>
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
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}提交网站
          </Button>
        </form>
        <div className="submission-history">
          <h3>我的投稿</h3>
          {items.length ? (
            items.map((s) => (
              <div key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <p>
                    {s.note ||
                      new Date(s.createdAt).toLocaleDateString("zh-CN")}
                  </p>
                </div>
                <Badge
                  variant={s.status === "approved" ? "secondary" : "outline"}
                >
                  {
                    {
                      pending: "待审核",
                      approved: "已收录",
                      rejected: "已拒绝",
                    }[s.status]
                  }
                </Badge>
              </div>
            ))
          ) : (
            <p>提交后，可在这里查看审核进度。</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

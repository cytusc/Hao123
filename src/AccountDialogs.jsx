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
import { Switch } from "@/components/ui/switch";
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
  const {
    user,
    logout,
    syncState,
    prefs,
    setPrefs,
    clearHistory,
    refreshRecommendations,
    refreshUser,
  } = useNavigation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagsError, setTagsError] = useState("");
  const loadTags = async () => {
    const data = await api("/privacy/tags");
    setTags(data.tags);
    setTagsError("");
  };
  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    setError("");
    setNotice("");
    setTags([]);
    setTagsError("");
    setLoadingTags(true);
    api("/privacy/tags")
      .then((d) => {
        if (active) setTags(d.tags);
      })
      .catch((e) => {
        if (active) setTagsError(e.message);
      })
      .finally(() => {
        if (active) setLoadingTags(false);
      });
    refreshUser().catch(() => {});
    return () => {
      active = false;
    };
  }, [open, user?.id]);
  const privacyAction = async (action) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await loadTags();
      await refreshRecommendations();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const groups = Object.values(
    tags.reduce((all, t) => {
      const group = (all[t.categoryId] ||= {
        name: t.category,
        clicks: 0,
        sites: [],
      });
      group.clicks += t.clicks;
      group.sites.push(t);
      return all;
    }, {}),
  );
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
      <DialogContent className="auth-dialog max-h-[85dvh] overflow-y-auto">
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
        <section className="space-y-3 border-b pb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              邮箱{user.verified ? "已验证" : "尚未验证"}
            </span>
            {!user.verified && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  setNotice("");
                  try {
                    await api("/auth/resend-verification", { method: "POST" });
                    setNotice("验证邮件已发送，请查看收件箱和垃圾邮件。");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                发送验证邮件
              </Button>
            )}
          </div>
          {!user.verified && (
            <p className="text-xs text-muted-foreground">
              请验证邮箱，确保需要找回账号时可以收到邮件。
            </p>
          )}
        </section>
        <section className="space-y-3 border-b pb-4">
          <h3 className="text-sm font-medium">隐私与个性化</h3>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="account-personalized">
              个性化推荐与自动整理常用
            </Label>
            <Switch
              id="account-personalized"
              checked={prefs.personalized}
              disabled={busy}
              onCheckedChange={(value) =>
                setPrefs((p) => ({ ...p, personalized: value }))
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            只保存网站级汇总次数、分数与最后访问时间。关闭并同步后停止记录与使用你的偏好，改为精选与匿名热门；已有标签可单独删除或清空。
          </p>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">我的兴趣标签</h4>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || loadingTags || !tags.length}
              onClick={() => privacyAction(clearHistory)}
            >
              清空全部
            </Button>
          </div>
          {loadingTags ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在读取标签…
            </p>
          ) : tagsError ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => privacyAction(loadTags)}
            >
              重新加载标签
            </Button>
          ) : groups.length ? (
            groups.map((g) => (
              <div key={g.name} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {g.name} · {g.clicks} 次使用
                </p>
                {g.sites.map((t) => (
                  <div
                    key={t.siteId}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm">
                      {t.name} · {t.clicks} 次
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`删除 ${t.name} 兴趣标签`}
                      onClick={() =>
                        privacyAction(() =>
                          api(`/privacy/tags/${encodeURIComponent(t.siteId)}`, {
                            method: "DELETE",
                          }),
                        )
                      }
                    >
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              暂无兴趣标签。点击公开网站后才会产生汇总记录。
            </p>
          )}
          {tagsError && (
            <p role="alert" className="text-sm text-destructive">
              {tagsError}
            </p>
          )}
        </section>
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
          <Button type="submit" variant="outline" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}修改密码
          </Button>
        </form>
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

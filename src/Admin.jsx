import React, { useCallback, useEffect, useState } from "react";
import {
  Grid2X2,
  LayoutDashboard,
  Globe,
  FolderTree,
  Users,
  ClipboardCheck,
  Sparkles,
  Activity,
  ArrowUpRight,
  Plus,
  Search,
  Pencil,
  Trash2,
  LogOut,
  RefreshCw,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { api } from "./api";
import { useNavigation } from "./navigation";
import AdminMetrics from "./AdminMetrics";

const tabs = [
  ["overview", "概览", LayoutDashboard],
  ["metrics", "度量观测", Activity],
  ["sites", "网站管理", Globe],
  ["categories", "分类管理", FolderTree],
  ["users", "用户管理", Users],
  ["submissions", "投稿审核", ClipboardCheck],
  ["recommendation", "推荐算法", Sparkles],
];
const statusName = {
  approved: "已收录",
  disabled: "已下架",
  pending: "待审核",
  rejected: "已拒绝",
};
const iconChoices = [
  "Grid2X2",
  "Newspaper",
  "Clapperboard",
  "ShoppingBag",
  "MessagesSquare",
  "Mail",
  "Sparkles",
  "GraduationCap",
  "Wrench",
];
const emptySite = {
  name: "",
  url: "https://",
  categoryId: "",
  mark: "站",
  color: "#5577ba",
  description: "",
  status: "approved",
  sort: 0,
};
const emptyCategory = { id: "", name: "", icon: "Grid2X2", sort: 0 };
function Field({ label, id, children }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function Status({ status }) {
  return (
    <Badge
      variant={
        status === "approved"
          ? "secondary"
          : status === "rejected"
            ? "destructive"
            : "outline"
      }
    >
      {statusName[status] || status}
    </Badge>
  );
}

export default function Admin() {
  const { user, ready, setAuthOpen, categories, refreshCatalog, logout } =
    useNavigation();
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [metricsRevision, setMetricsRevision] = useState(0);
  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState({});
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setMetricsRevision((value) => value + 1);
    setBusy(true);
    setError("");
    try {
      const [o, s, u, p] = await Promise.all([
        api("/admin/overview"),
        api("/admin/sites"),
        api("/admin/users"),
        api("/admin/submissions"),
      ]);
      setOverview(o);
      setSites(s.sites);
      setUsers(u.users);
      setSubmissions(p.submissions);
      await refreshCatalog();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [user, refreshCatalog]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setFilter("");
    setPage(1);
  }, [tab]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const edit = (type, item) => {
    setEditor({ type, id: item?.id });
    setDraft(
      item
        ? { ...item }
        : {
            ...(type === "site" ? emptySite : emptyCategory),
            ...(type === "site" ? { categoryId: categories[0]?.id || "" } : {}),
          },
    );
    setEditorError("");
  };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditorError("");
    try {
      let body =
        editor.type === "site"
          ? {
              name: draft.name,
              url: draft.url,
              categoryId: draft.categoryId,
              mark: draft.mark,
              color: draft.color,
              description: draft.description,
              status: draft.status,
              sort: Number(draft.sort),
            }
          : {
              id: draft.id,
              name: draft.name,
              icon: draft.icon,
              sort: Number(draft.sort),
            };
      if (editor.type === "review") {
        body = { status: draft.status, note: draft.note };
        await api(`/admin/submissions/${editor.id}/review`, {
          method: "POST",
          body,
        });
      } else {
        const resource = editor.type === "site" ? "sites" : "categories";
        await api(`/admin/${resource}${editor.id ? `/${editor.id}` : ""}`, {
          method: editor.id ? "PUT" : "POST",
          body,
        });
      }
      setEditor(null);
      setNotice(editor.type === "review" ? "审核结果已保存" : "已保存");
      await load();
    } catch (e) {
      setEditorError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const perform = async () => {
    setSaving(true);
    try {
      if (confirmation.kind === "delete")
        await api(`/admin/${confirmation.resource}/${confirmation.item.id}`, {
          method: "DELETE",
        });
      else
        await api(`/admin/users/${confirmation.item.id}`, {
          method: "PATCH",
          body: { disabled: !confirmation.item.disabled },
        });
      setConfirmation(null);
      setNotice("操作已完成");
      await load();
    } catch (e) {
      setError(e.message);
      setConfirmation(null);
    } finally {
      setSaving(false);
    }
  };
  const filtered = (
    tab === "sites"
      ? sites
      : tab === "categories"
        ? categories
        : tab === "users"
          ? users
          : submissions
  ).filter((item) =>
    JSON.stringify([
      item.name,
      item.email,
      item.url,
      item.category,
      item.status,
    ])
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice(
    (Math.min(page, totalPages) - 1) * 10,
    Math.min(page, totalPages) * 10,
  );
  if (!ready)
    return (
      <div className="admin-gate">
        <LoaderCircle className="animate-spin" />
        <p>正在检查登录状态…</p>
      </div>
    );
  if (!user || user.role !== "admin")
    return (
      <div className="admin-gate">
        <span className="brand-symbol">
          <Grid2X2 />
        </span>
        <h1>轻导航管理后台</h1>
        <p>
          {user
            ? "当前账号没有管理权限，请使用管理员账号登录。"
            : "使用管理员账号登录，管理网站、分类与用户。"}
        </p>
        <div className="flex gap-3">
          {user && (
            <Button
              variant="outline"
              onClick={() => logout().catch((e) => setError(e.message))}
            >
              退出当前账号
            </Button>
          )}
          <Button onClick={() => setAuthOpen(true)}>管理员登录</Button>
          <Button variant="outline" asChild>
            <a href="/">返回首页</a>
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Grid2X2 size={22} />
          </span>
          <span className="brand-name">好123</span>
        </a>
        <p className="admin-sidebar-caption">导航管理台</p>
        <nav className="admin-navigation">
          {tabs.map(([id, label, Icon]) => (
            <Button
              key={id}
              variant={tab === id ? "secondary" : "ghost"}
              className={`admin-nav-item ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              {label}
              {id === "submissions" && overview?.pending > 0 && (
                <Badge className="ml-auto" variant="outline">
                  {overview.pending}
                </Badge>
              )}
            </Button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <span className="admin-avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <span>管理员</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="退出登录"
            onClick={() => logout().catch((e) => setError(e.message))}
          >
            <LogOut size={17} />
          </Button>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <span>{tabs.find((t) => t[0] === tab)?.[1]}</span>
          <div className="flex items-center gap-3">
            <Badge variant="outline">管理后台</Badge>
            <Button asChild variant="ghost" size="sm">
              <a href="/">
                打开前台
                <ArrowUpRight size={14} />
              </a>
            </Button>
          </div>
        </header>
        <main className="admin-content">
          <div className="admin-page-heading">
            <div>
              <h1>{tabs.find((t) => t[0] === tab)?.[1]}</h1>
              <p>
                {
                  {
                    overview: "看看导航站的运行情况。",
                    metrics: "观察账号找回与配置同步，先建立真实使用基线。",
                    sites: "维护网站信息，让每一个入口都准确好用。",
                    categories: "整理网站目录，保持清楚的分类。",
                    users: "查看账号与使用状态。",
                    submissions: "让用户发现的好网站，进入导航目录。",
                    recommendation: "用轻量、可解释的规则，让首页越来越顺手。",
                  }[tab]
                }
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={busy}
              >
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                刷新
              </Button>
              {(tab === "sites" || tab === "categories") && (
                <Button
                  size="sm"
                  onClick={() => edit(tab === "sites" ? "site" : "category")}
                >
                  <Plus size={15} />
                  {tab === "sites" ? "添加网站" : "添加分类"}
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="admin-error">
              {error}
              <Button variant="ghost" size="sm" onClick={load}>
                重试
              </Button>
            </div>
          )}
          {notice && (
            <div role="status" className="admin-success">
              {notice}
            </div>
          )}
          {tab === "metrics" && <AdminMetrics refreshKey={metricsRevision} />}
          {tab === "overview" && (
            <>
              <div className="admin-stats">
                {[
                  ["已收录网站", overview?.sites, Globe],
                  ["网站分类", overview?.categories, FolderTree],
                  ["注册用户", overview?.users, Users],
                  ["待审核投稿", overview?.pending, ClipboardCheck],
                ].map(([label, value, Icon]) => (
                  <Card key={label} className="gap-3 py-5">
                    <CardHeader className="flex-row items-center justify-between">
                      <CardDescription>{label}</CardDescription>
                      <Icon size={19} className="text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <span className="admin-stat-value">{value ?? "—"}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="admin-overview-grid">
                <Card>
                  <CardHeader>
                    <CardTitle>常用网站排行</CardTitle>
                    <CardDescription>
                      基于已开启个性化的用户点击，不展示个人访问记录。
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {overview?.topSites?.length ? (
                      <div className="admin-ranking">
                        {overview.topSites.map((s, i) => (
                          <div key={s.name}>
                            <span>{i + 1}</span>
                            <strong>{s.name}</strong>
                            <span className="admin-ranking-bar">
                              <i
                                style={{
                                  width: `${(s.clicks / overview.topSites[0].clicks) * 100}%`,
                                }}
                              />
                            </span>
                            <span>{s.clicks} 次</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="admin-empty">
                        <Globe size={27} />
                        <h3>还没有点击数据</h3>
                        <p>用户登录并访问网站后，这里会显示实际排行。</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>今天可以做什么</CardTitle>
                    <CardDescription>
                      从目录质量开始，保持首页简单好用。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setTab("submissions")}
                    >
                      处理 {overview?.pending || 0} 个待审核投稿
                      <ChevronRight />
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setTab("sites")}
                    >
                      维护网站目录
                      <ChevronRight />
                    </Button>
                    <div className="admin-algorithm-note">
                      <Sparkles size={18} />
                      <div>
                        <strong>规则推荐已接通</strong>
                        <p>
                          点击频次按 7
                          天半衰期衰减，结合分类偏好与相似访问补充推荐。
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
          {["sites", "categories", "users", "submissions"].includes(tab) && (
            <Card className="admin-resource-card">
              <CardHeader className="admin-table-toolbar">
                <div className="relative w-full max-w-sm">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label="搜索管理数据"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                    placeholder={
                      tab === "users"
                        ? "搜索昵称或邮箱"
                        : "搜索名称、网址或状态"
                    }
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  共 {filtered.length} 条
                </span>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(tab === "sites"
                        ? ["网站", "分类", "状态", "排序", "操作"]
                        : tab === "categories"
                          ? ["分类", "标识", "网站数量", "排序", "操作"]
                          : tab === "users"
                            ? [
                                "用户",
                                "邮箱",
                                "角色",
                                "状态",
                                "注册时间",
                                "操作",
                              ]
                            : [
                                "投稿网站",
                                "提交人",
                                "分类",
                                "状态",
                                "说明",
                                "操作",
                              ]
                      ).map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((item) => (
                      <TableRow key={item.id}>
                        {tab === "sites" && (
                          <>
                            <TableCell>
                              <div className="admin-site-name">
                                <span
                                  style={{
                                    color: item.color,
                                    background: `${item.color}12`,
                                  }}
                                >
                                  {item.mark}
                                </span>
                                <div>
                                  <strong>{item.name}</strong>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {new URL(item.url).hostname}
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell>
                              <Status status={item.status} />
                            </TableCell>
                            <TableCell>{item.sort}</TableCell>
                          </>
                        )}
                        {tab === "categories" && (
                          <>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>{item.id}</TableCell>
                            <TableCell>
                              {
                                sites.filter((s) => s.categoryId === item.id)
                                  .length
                              }
                            </TableCell>
                            <TableCell>{item.sort}</TableCell>
                          </>
                        )}
                        {tab === "users" && (
                          <>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>{item.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.role === "admin" ? "管理员" : "用户"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.disabled ? "destructive" : "secondary"
                                }
                              >
                                {item.disabled ? "已停用" : "正常"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {new Date(item.createdAt).toLocaleDateString(
                                "zh-CN",
                              )}
                            </TableCell>
                          </>
                        )}
                        {tab === "submissions" && (
                          <>
                            <TableCell>
                              <div className="admin-submission-name">
                                <strong>{item.name}</strong>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {new URL(item.url).hostname}
                                </a>
                              </div>
                            </TableCell>
                            <TableCell>{item.userName}</TableCell>
                            <TableCell>
                              {categories.find((c) => c.id === item.categoryId)
                                ?.name || item.categoryId}
                            </TableCell>
                            <TableCell>
                              <Status status={item.status} />
                            </TableCell>
                            <TableCell className="max-w-48 whitespace-normal">
                              {item.note || item.description || "—"}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          <div className="flex gap-1">
                            {["sites", "categories"].includes(tab) && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`编辑${item.name}`}
                                  onClick={() =>
                                    edit(
                                      tab === "sites" ? "site" : "category",
                                      item,
                                    )
                                  }
                                >
                                  <Pencil size={15} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`删除${item.name}`}
                                  onClick={() =>
                                    setConfirmation({
                                      kind: "delete",
                                      resource: tab,
                                      item,
                                    })
                                  }
                                >
                                  <Trash2
                                    size={15}
                                    className="text-muted-foreground"
                                  />
                                </Button>
                              </>
                            )}
                            {tab === "users" && item.role !== "admin" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setConfirmation({ kind: "toggle", item })
                                }
                              >
                                {item.disabled ? "启用" : "停用"}
                              </Button>
                            )}
                            {tab === "submissions" &&
                              item.status === "pending" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditor({ type: "review", id: item.id });
                                    setDraft({
                                      status: "approved",
                                      note: "",
                                      name: item.name,
                                    });
                                    setEditorError("");
                                  }}
                                >
                                  审核
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!visible.length && (
                  <div className="admin-empty">
                    <Search size={25} />
                    <h3>{filter ? "没有匹配的记录" : "这里还没有记录"}</h3>
                    <p>
                      {filter ? "试试其他关键词。" : "新增数据后会显示在这里。"}
                    </p>
                  </div>
                )}
                <div className="admin-pagination">
                  <span>
                    第 {Math.min(page, totalPages)} / {totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      aria-label="上一页"
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      aria-label="下一页"
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {tab === "recommendation" && (
            <div className="admin-recommendation">
              <Card>
                <CardHeader>
                  <CardTitle>让常用的更近，让新发现更准</CardTitle>
                  <CardDescription>
                    规则版推荐，无需大模型调用。数据库中的点击聚合会实时参与排序。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="algorithm-steps">
                    {[
                      ["手动选择", "置顶始终优先，隐藏的网站不再推荐。"],
                      [
                        "近期常用",
                        "每次点击累加权重；每过 7 天，历史权重减半。",
                      ],
                      [
                        "分类偏好",
                        "常用某个分类时，补充该分类的其他精选网站。",
                      ],
                      [
                        "相似访问",
                        "过去 30 天有共同访问的用户，贡献你还没用过的网站。",
                      ],
                      [
                        "冷启动兜底",
                        "没有历史时展示精选目录和真实的聚合热门。",
                      ],
                    ].map(([title, text]) => (
                      <div key={title}>
                        <span className="algorithm-step-dot" />
                        <div>
                          <strong>{title}</strong>
                          <p>{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>隐私与运行状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <Badge variant="secondary">服务端隐私开关生效</Badge>
                    <p className="admin-help-text">
                      关闭个性化时停止采集，使用静态常用顺序；已关闭用户的数据不参与群体推荐。用户可清空点击记录。
                    </p>
                  </div>
                  <div>
                    <strong className="text-sm">累计记录点击</strong>
                    <p className="admin-stat-value mt-2">
                      {overview?.clicks ?? 0}
                    </p>
                    <p className="admin-help-text">
                      只保存用户与网站的聚合计数、衰减分数和最近时间，不保存逐次访问日志。
                    </p>
                  </div>
                  <div>
                    <strong className="text-sm">推荐解释</strong>
                    <p className="admin-help-text">
                      首页展示“你最近常用”“你常用的分类”“访问相似网站的人也常用”等实际排序原因。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="admin-dialog sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {editor?.type === "review"
                ? `审核「${draft.name}」`
                : editor?.type === "site"
                  ? editor.id
                    ? "编辑网站"
                    : "添加网站"
                  : editor?.id
                    ? "编辑分类"
                    : "添加分类"}
            </DialogTitle>
            <DialogDescription>
              {editor?.type === "review"
                ? "通过后网站会进入公开目录。"
                : "保存后会立即更新导航目录。"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {editor?.type === "site" && (
              <>
                <Field label="网站名称" id="site-name">
                  <Input
                    id="site-name"
                    required
                    maxLength={40}
                    value={draft.name || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="网站地址" id="site-url">
                  <Input
                    id="site-url"
                    type="url"
                    required
                    value={draft.url || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, url: e.target.value })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="分类" id="site-category">
                    <Select
                      value={draft.categoryId}
                      onValueChange={(v) =>
                        setDraft({ ...draft, categoryId: v })
                      }
                    >
                      <SelectTrigger id="site-category" className="w-full">
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
                  </Field>
                  <Field label="状态" id="site-status">
                    <Select
                      value={draft.status}
                      onValueChange={(v) => setDraft({ ...draft, status: v })}
                    >
                      <SelectTrigger id="site-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approved">已收录</SelectItem>
                        <SelectItem value="disabled">已下架</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="文字标记" id="site-mark">
                    <Input
                      id="site-mark"
                      required
                      maxLength={4}
                      value={draft.mark || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, mark: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="颜色" id="site-color">
                    <Input
                      id="site-color"
                      required
                      pattern="#[0-9a-fA-F]{6}"
                      value={draft.color || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, color: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="排序" id="site-sort">
                    <Input
                      id="site-sort"
                      type="number"
                      min={0}
                      max={10000}
                      required
                      value={draft.sort ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, sort: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="简介" id="site-description">
                  <Textarea
                    id="site-description"
                    value={draft.description || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {editor?.type === "category" && (
              <>
                <Field label="分类名称" id="category-name">
                  <Input
                    id="category-name"
                    required
                    maxLength={24}
                    value={draft.name || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="分类标识（英文、数字或短横线）" id="category-id">
                  <Input
                    id="category-id"
                    required
                    disabled={!!editor.id}
                    pattern="[a-zA-Z0-9_-]{1,64}"
                    value={draft.id || ""}
                    onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  />
                </Field>
                <Field label="图标" id="category-icon">
                  <Select
                    value={draft.icon}
                    onValueChange={(v) => setDraft({ ...draft, icon: v })}
                  >
                    <SelectTrigger id="category-icon" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconChoices.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          {icon}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="排序" id="category-sort">
                  <Input
                    id="category-sort"
                    required
                    type="number"
                    min={0}
                    max={10000}
                    value={draft.sort ?? 0}
                    onChange={(e) =>
                      setDraft({ ...draft, sort: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {editor?.type === "review" && (
              <>
                <Field label="审核结果" id="review-status">
                  <Select
                    value={draft.status}
                    onValueChange={(v) => setDraft({ ...draft, status: v })}
                  >
                    <SelectTrigger id="review-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">通过并收录</SelectItem>
                      <SelectItem value="rejected">拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={
                    draft.status === "rejected"
                      ? "拒绝原因（必填）"
                      : "审核说明"
                  }
                  id="review-note"
                >
                  <Textarea
                    id="review-note"
                    required={draft.status === "rejected"}
                    value={draft.note || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, note: e.target.value })
                    }
                  />
                </Field>
              </>
            )}
            {editorError && (
              <p className="text-sm text-destructive" role="alert">
                {editorError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditor(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="animate-spin" />}保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent className="admin-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirmation?.kind === "delete"
                ? `删除「${confirmation.item.name}」？`
                : `${confirmation?.item.disabled ? "启用" : "停用"}「${confirmation?.item.name}」？`}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.kind === "delete"
                ? "删除后将从目录移除；存在关联网站或投稿的分类无法删除。"
                : "停用会立即退出该用户的所有登录设备。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button variant="destructive" disabled={saving} onClick={perform}>
              确认
              {confirmation?.kind === "delete"
                ? "删除"
                : confirmation?.item.disabled
                  ? "启用"
                  : "停用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

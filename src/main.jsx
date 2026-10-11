import React, { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search,
  Settings2,
  Plus,
  X,
  ArrowUpRight,
  ChevronRight,
  Grid2X2,
  Bookmark,
  Check,
  ShieldCheck,
  Sparkles,
  Newspaper,
  Clapperboard,
  ShoppingBag,
  MessagesSquare,
  Mail,
  GraduationCap,
  Wrench,
  SlidersHorizontal,
  RotateCcw,
  Heart,
  CloudSun,
  TrainFront,
  Package,
  Languages,
  MapPin,
  FileText,
  Pin,
  ExternalLink,
} from "lucide-react";
import { defaultIds, engines } from "./data";
import { NavigationProvider, useNavigation } from "./navigation";
import AuthDialog from "./AuthDialog";
import EmailAction from "./EmailAction";
import SyncConflictDialog from "./SyncConflictDialog";
import { AccountDialog, SubmissionDialog } from "./AccountDialogs";
import SearchStage from "./SearchStage";
import useLocalClock from "./useLocalClock";
import { getBannerTheme } from "./bannerTheme.mjs";
import Feedback, { useFeedback } from "./Feedback";
import { getQuickLinks } from "./quickLinks.mjs";
import { CommonSkeleton, DirectorySkeleton } from "./Skeleton";
import "./admin.css";
import "./styles.css";

const Admin = lazy(() => import("./Admin"));
const adminMode =
  location.pathname === "/admin" || location.pathname.startsWith("/admin/");

const icons = {
  Newspaper,
  Clapperboard,
  ShoppingBag,
  MessagesSquare,
  Mail,
  Sparkles,
  GraduationCap,
  Wrench,
};
function Mark({ site, small = false }) {
  return (
    <span
      className={`site-mark ${small ? "small" : ""}`}
      style={{ "--site-color": site.color }}
    >
      {site.mark}
    </span>
  );
}
function Modal({ title, children, onClose, feedbackHost }) {
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <div className="modal-feedback-target" ref={feedbackHost} />
      {children}
    </dialog>
  );
}
function App() {
  const now = useLocalClock();
  const theme = getBannerTheme(now);
  const {
    categories,
    prefs,
    setPrefs,
    saveFailed,
    user,
    ready,
    preferencesLoading,
    error,
    catalogError,
    syncState,
    setAuthOpen,
    record,
    clearHistory,
    retrySync,
    importLocal,
    recommendation,
  } = useNavigation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const allSites = categories.flatMap((c) =>
    c.sites.map((s) => ({ ...s, category: c.name, categoryId: c.id })),
  );
  const [active, setActive] = useState("all");
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(false);
  const { toast, notify, dismiss } = useFeedback();
  const [feedbackHost, setFeedbackHost] = useState(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState("");
  const [resultAnnouncement, setResultAnnouncement] = useState("");
  const [clearingHistory, setClearingHistory] = useState(false);
  const contentRef = useRef();
  const sites = [...allSites, ...prefs.custom];
  const quickLinks = getQuickLinks({ sites, prefs, user, recommendation });
  const find = (id) => sites.find((s) => s.id === id);
  const learned = user
    ? (recommendation?.common ?? []).map((s) => s.id)
    : prefs.personalized
      ? Object.entries(prefs.history)
          .sort(
            (a, b) =>
              b[1].score * Math.pow(0.5, (Date.now() - b[1].time) / 604800000) -
              a[1].score * Math.pow(0.5, (Date.now() - a[1].time) / 604800000),
          )
          .map(([id]) => id)
      : [];
  const common = [...new Set([...prefs.pinned, ...learned, ...defaultIds])]
    .filter((id) => !prefs.hidden.includes(id) && find(id))
    .slice(0, 9)
    .map(find);
  const togglePin = (site) => {
    const pinned = prefs.pinned.includes(site.id);
    if (!pinned && prefs.pinned.length >= 9) {
      notify("最多置顶 9 个网站，请先取消一个置顶", "info");
      return;
    }
    setPrefs((p) => ({
      ...p,
      pinned: pinned
        ? p.pinned.filter((id) => id !== site.id)
        : [...p.pinned, site.id],
      hidden: p.hidden.filter((id) => id !== site.id),
    }));
    notify(pinned ? `已取消置顶${site.name}` : `已置顶${site.name}`);
  };
  const link = (site, className = "", children = null) =>
    site ? (
      <a
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={() => record(site.id)}
      >
        {children || site.name}
      </a>
    ) : null;
  const chooseCategory = (id) => {
    setActive(id);
    setSubmitted(null);
  };
  const search = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSubmitted(query.trim());
    requestAnimationFrame(() =>
      contentRef.current?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      }),
    );
  };
  const results =
    submitted === null
      ? []
      : sites.filter((s) =>
          `${s.name} ${s.description || ""} ${s.category || ""} ${s.url}`
            .toLowerCase()
            .includes(submitted.toLowerCase()),
        );
  useEffect(() => {
    setResultAnnouncement("");
    if (submitted === null) return;
    const timer = setTimeout(
      () => setResultAnnouncement(`“${submitted}” 找到 ${results.length} 个网站`),
      40,
    );
    return () => clearTimeout(timer);
  }, [submitted, results.length]);
  const addCustom = (e) => {
    e.preventDefault();
    let parsed;
    try {
      parsed = new URL(url.includes("://") ? url : `https://${url}`);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname.includes(".")
      )
        throw new Error();
    } catch {
      setFormError("请输入有效的网站地址，例如 https://www.example.com");
      return;
    }
    if (!name.trim()) {
      setFormError("请填写网站名称");
      return;
    }
    if (prefs.pinned.length >= 9) {
      setFormError("最多置顶 9 个网站，请先取消一个置顶");
      return;
    }
    const existing = sites.find(
      (s) => new URL(s.url).hostname === parsed.hostname,
    );
    if (existing) {
      if (!prefs.pinned.includes(existing.id)) togglePin(existing);
      setModal(null);
      return;
    }
    const site = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      url: parsed.href,
      mark: name.trim()[0],
      color: "#5577ba",
    };
    setPrefs((p) => ({
      ...p,
      custom: [...p.custom, site],
      pinned: [...p.pinned, site.id],
    }));
    setModal(null);
    notify(`已添加${site.name}`);
  };
  const effectiveActive = categories.some((c) => c.id === active)
    ? active
    : "all";
  const visibleCategories =
    effectiveActive === "all"
      ? categories
      : categories.filter((c) => c.id === effectiveActive);
  return (
    <div className={prefs.largeText ? "app large-text" : "app"}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={() => document.getElementById("main-content")?.focus({ preventScroll: true })}
      >
        跳到主内容
      </a>
      <SearchStage
        theme={theme}
        header={
          <header className="header">
            <div className="header-inner">
              <a
                href="#"
                className="brand"
                aria-label="好123轻导航首页"
                onClick={() => {
                  chooseCategory("all");
                  setQuery("");
                }}
              >
                <span className="brand-symbol">
                  <Grid2X2 size={23} strokeWidth={2.5} />
                </span>
                <span className="brand-name">
                  好<span>123</span>
                </span>
                <span className="brand-divider" />
                <span className="brand-caption">轻导航</span>
              </a>
              <nav className="top-nav" aria-label="主导航">
                <button
                  className={
                    active === "all" && submitted === null ? "selected" : ""
                  }
                  onClick={() => chooseCategory("all")}
                >
                  网址导航
                </button>
                <button
                  className={
                    active === "ai" && submitted === null ? "selected" : ""
                  }
                  onClick={() => chooseCategory("ai")}
                >
                  AI 工具
                </button>
                <button
                  onClick={() => {
                    setEditing(true);
                    document
                      .getElementById("common")
                      .scrollIntoView({
                        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                      });
                  }}
                >
                  我的常用
                </button>
              </nav>
              <button
                className="settings-button"
                aria-label="首页设置"
                onClick={() => setModal("settings")}
              >
                <Settings2 size={17} />
                <span>首页设置</span>
              </button>
              <button
                className="login-button"
                aria-label={user ? user.name : "用户登录"}
                disabled={!ready}
                onClick={() =>
                  user ? setAccountOpen(true) : setAuthOpen(true)
                }
              >
                {user ? (
                  <>
                    <span className="user-avatar">{user.name[0]}</span>
                    {user.name}
                  </>
                ) : (
                  "用户登录"
                )}
              </button>
            </div>
          </header>
        }
      >
        <div className="stage-intro">
          <div className="date-line">
            <span>
              {now.getMonth() + 1}月{now.getDate()}日
            </span>
            <span>
              {
                [
                  "星期日",
                  "星期一",
                  "星期二",
                  "星期三",
                  "星期四",
                  "星期五",
                  "星期六",
                ][now.getDay()]
              }
            </span>
            <span className="date-separator" />
            <span>今天，也从这里开始</span>
          </div>
          <h1>{theme.greeting}，上网简单一点。</h1>
        </div>
        {prefs.showSearch ? (
          <div className="search-area">
            <div className="engine-tabs" aria-label="搜索引擎">
              {Object.entries(engines).map(([id, engine]) => (
                <button
                  key={id}
                  aria-pressed={prefs.engine === id}
                  className={prefs.engine === id ? "active" : ""}
                  onClick={() => setPrefs((p) => ({ ...p, engine: id }))}
                >
                  {engine.name}
                </button>
              ))}
            </div>
            <form className="search-box" onSubmit={search}>
              <Search size={22} />
              <input
                aria-label="搜索网站或关键词"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜网站，或搜你想知道的"
              />
              <kbd aria-hidden="true">↵</kbd>
              <button type="submit">搜索一下</button>
            </form>
            <div className="search-suggestions">
              <span>便捷入口</span>
              {quickLinks.map((site) => (
                <React.Fragment key={site.id}>{link(site)}</React.Fragment>
              ))}
            </div>
          </div>
        ) : (
          <button
            className="restore-search"
            onClick={() => setPrefs((p) => ({ ...p, showSearch: true }))}
          >
            <Search size={18} />
            显示搜索框
          </button>
        )}
      </SearchStage>

      <main className="main-container" id="main-content" tabIndex={-1}>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {resultAnnouncement}
        </div>
        {(error || catalogError) && (
          <div className="service-notice" role="status">
            <span>{error || catalogError}</span>
            <button onClick={retrySync}>重试</button>
          </div>
        )}
        <section
          className="common-section"
          id="common"
          aria-labelledby="common-title"
        >
          <div className="section-heading">
            <div className="title-group">
              <Bookmark size={19} />
              <h2 id="common-title">我的常用</h2>
              <span className="section-note">
                {prefs.personalized ? "常去的网站，就在手边" : "已关闭自动排序"}
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? <Check size={15} /> : <SlidersHorizontal size={15} />}{" "}
              {editing ? "完成" : "管理"}
            </button>
          </div>
          {!error && !catalogError && prefs.pinned.length === 0 &&
          (preferencesLoading || (user && !ready)) ? (
            <CommonSkeleton />
          ) : (
            <div className="common-grid">
              {common.map((site) => (
                <div className="common-item" key={site.id}>
                  {link(
                    site,
                    "common-link",
                    <>
                      <Mark site={site} />
                      <span>{site.name}</span>
                      {prefs.pinned.includes(site.id) && (
                        <Pin className="pinned-mark" size={11} />
                      )}
                    </>,
                  )}
                  {editing && (
                    <div className="edit-controls">
                      <button
                        aria-label={`${prefs.pinned.includes(site.id) ? "取消置顶" : "置顶"}${site.name}`}
                        className={
                          prefs.pinned.includes(site.id) ? "is-pinned" : ""
                        }
                        onClick={() => togglePin(site)}
                      >
                        <Pin size={12} />
                      </button>
                      <button
                        aria-label={`移除${site.name}`}
                        onClick={() => {
                          setPrefs((p) => ({
                            ...p,
                            hidden: [...p.hidden, site.id],
                            pinned: p.pinned.filter((id) => id !== site.id),
                          }));
                          notify(`已从常用移除${site.name}`);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                className="add-common"
                onClick={() => {
                  setName("");
                  setUrl("");
                  setFormError("");
                  setModal("add");
                }}
              >
                <span>
                  <Plus size={23} />
                </span>
                添加网站
              </button>
            </div>
          )}
        </section>

        <div className="directory-layout" ref={contentRef}>
          <section className="directory" aria-labelledby="directory-title">
            <div className="directory-heading">
              <div className="title-group">
                <Grid2X2 size={19} />
                <h2 id="directory-title">
                  {submitted !== null ? "搜索结果" : "发现好网站"}
                </h2>
              </div>
              <span className="directory-caption">精选网站，放心直达</span>
            </div>
            {submitted === null ? (
              <>
                <nav className="category-tabs" aria-label="网站分类">
                  <button
                    className={active === "all" ? "active" : ""}
                    aria-pressed={active === "all"}
                    onClick={() => chooseCategory("all")}
                  >
                    全部分类
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      className={active === c.id ? "active" : ""}
                      aria-pressed={active === c.id}
                      onClick={() => chooseCategory(c.id)}
                    >
                      {c.name
                        .replace("新闻资讯", "新闻")
                        .replace("视频娱乐", "视频")
                        .replace("购物生活", "购物")
                        .replace("社交社区", "社交")
                        .replace("邮箱办公", "办公")
                        .replace("学习成长", "学习")
                        .replace("实用工具", "工具")}
                    </button>
                  ))}
                </nav>
                {categories.length === 0 && !error && !catalogError ? (
                  <DirectorySkeleton />
                ) : (
                  <div className="category-list">
                    {visibleCategories.map((c) => {
                      const Icon = icons[c.icon] || Grid2X2;
                      return (
                        <div className="category-row" key={c.id}>
                          <button
                            className="category-label"
                            onClick={() => chooseCategory(c.id)}
                          >
                            <Icon size={17} />
                            <span>{c.name}</span>
                          </button>
                          <div className="category-sites">
                            {c.sites.map((site, i) => (
                              <React.Fragment key={site.id}>
                                {link(
                                  site,
                                  i === 0 ? "featured-site" : "",
                                  <>
                                    {site.name}
                                    {site.id === "deepseek" && (
                                      <span className="tiny-tag">热门</span>
                                    )}
                                  </>,
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {effectiveActive !== "all" && (
                  <div className="channel-details">
                    <h3>
                      {categories.find((c) => c.id === effectiveActive)?.name}
                      精选
                    </h3>
                    <div className="channel-grid">
                      {visibleCategories[0]?.sites.map((site) => (
                        <div className="channel-site" key={site.id}>
                          {link(
                            site,
                            "channel-link",
                            <>
                              <Mark site={site} small />
                              <span>{site.name}</span>
                              <ArrowUpRight size={15} />
                            </>,
                          )}
                          <button
                            className="icon-button"
                            aria-label={`置顶${site.name}`}
                            onClick={() => togglePin(site)}
                          >
                            {prefs.pinned.includes(site.id) ? (
                              <Check size={16} />
                            ) : (
                              <Plus size={16} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="search-results">
                <div className="results-summary">
                  <span>
                    “{submitted}” 找到 {results.length} 个网站
                  </span>
                  <button
                    className="text-button"
                    onClick={() => setSubmitted(null)}
                  >
                    返回分类
                  </button>
                </div>
                {results.length ? (
                  results.map((site) => (
                    <div className="result-item" key={site.id}>
                      <Mark site={site} small />
                      <div>
                        {link(site, "result-name")}
                        <p>
                          {site.description || site.category || "自定义网站"}{" "}
                          <span>{new URL(site.url).hostname}</span>
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        onClick={() => togglePin(site)}
                        aria-label={`置顶${site.name}`}
                      >
                        <Bookmark size={17} />
                      </button>
                      {link(
                        site,
                        "result-visit",
                        <>
                          访问
                          <ArrowUpRight size={15} />
                        </>,
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Search size={28} />
                    <h3>还没有找到这个网站</h3>
                    <p>
                      试试更短的名称，或用{engines[prefs.engine].name}搜索。
                    </p>
                  </div>
                )}
                <a
                  className="web-search"
                  href={`${engines[prefs.engine].url}${encodeURIComponent(submitted)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Search size={17} />用{engines[prefs.engine].name}搜索“
                  {submitted}”<ExternalLink size={15} />
                </a>
              </div>
            )}
            <div className="directory-bottom">
              <ShieldCheck size={15} />
              <span>外链在新窗口打开，首页始终在这里</span>
              <button onClick={() => setModal("about")}>
                关于收录
                <ChevronRight size={13} />
              </button>
            </div>
          </section>

          <aside className="sidebar">
            <section className="daily-tools">
              <div className="side-heading">
                <h2>日常小帮手</h2>
                <Wrench size={17} />
              </div>
              <div className="tool-grid">
                {[
                  ["weather", "查天气", CloudSun],
                  ["12306", "买车票", TrainFront],
                  ["kuaidi", "查快递", Package],
                  ["translate", "翻译", Languages],
                  ["amap", "看地图", MapPin],
                  ["ilovepdf", "转 PDF", FileText],
                ].map(([id, label, ToolIcon]) => (
                  <React.Fragment key={id}>
                    {link(
                      find(id),
                      "tool-link",
                      <>
                        <span className={`tool-symbol tool-${id}`}>
                          <ToolIcon size={24} strokeWidth={1.6} />
                        </span>
                        <span>{label}</span>
                      </>,
                    )}
                  </React.Fragment>
                ))}
              </div>
            </section>
            {user && prefs.personalized && recommendation.sites.length > 0 && (
              <section className="ai-discovery personal-discovery">
                <div className="side-heading">
                  <h2>
                    <Sparkles size={17} />
                    猜你想用
                  </h2>
                </div>
                <p className="side-description">
                  根据你的常用习惯，发现下一个好网站。
                </p>
                {recommendation.sites.slice(0, 4).map((site) => (
                  <div className="ai-site" key={site.id}>
                    {link(
                      site,
                      "ai-site-link",
                      <>
                        <Mark site={site} small />
                        <div>
                          <strong>{site.name}</strong>
                          <p>{site.reason}</p>
                        </div>
                        <ArrowUpRight size={15} />
                      </>,
                    )}
                  </div>
                ))}
              </section>
            )}
            <div className="quiet-note">
              <span className="note-icon">
                <Heart size={18} />
              </span>
              <div>
                <strong>清清爽爽，刚刚好。</strong>
                <p>
                  少一点打扰，多一点顺手。
                  <br />
                  让首页回到上网的起点。
                </p>
              </div>
            </div>
          </aside>
        </div>
        {saveFailed && (
          <p className="storage-warning">
            浏览器未允许保存数据，当前设置仅在本次打开时有效。
          </p>
        )}
        <footer className="footer">
          <div>
            <span className="footer-brand">好123</span>
            <span>一个简单好用的上网起点</span>
          </div>
          <div>
            <button onClick={() => setModal("about")}>关于轻导航</button>
            <button onClick={() => setModal("settings")}>隐私与设置</button>
            <button
              onClick={() =>
                user ? setSubmissionOpen(true) : setAuthOpen(true)
              }
            >
              提交网站
            </button>
          </div>
        </footer>
      </main>

      {modal === "add" && (
        <Modal title="添加常用网站" onClose={() => setModal(null)} feedbackHost={setFeedbackHost}>
          <p className="modal-description">
            选一个常用网站，或添加你自己的网址。
          </p>
          <div className="pick-sites">
            {defaultIds.filter((id) => find(id)).map((id) => {
              const site = find(id);
              return (
                <button
                  key={id}
                  className={prefs.pinned.includes(id) ? "picked" : ""}
                  onClick={() => togglePin(site)}
                >
                  <Mark site={site} small />
                  {site.name}
                  {prefs.pinned.includes(id) ? (
                    <Check size={14} />
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              );
            })}
          </div>
          <form className="add-form" onSubmit={addCustom}>
            <h3>自定义网站</h3>
            <label>
              网站名称
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的博客"
                maxLength={16}
                required
              />
            </label>
            <label>
              网站地址
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.example.com"
                required
              />
            </label>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary-button" type="submit">
              <Plus size={16} />
              添加到常用
            </button>
          </form>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="让首页更顺手" onClose={() => setModal(null)} feedbackHost={setFeedbackHost}>
          <p className="modal-description">
            {user
              ? `常用与设置同步到你的账号（${syncState}）。`
              : "设置保存在当前浏览器，登录后可跨设备同步。"}
          </p>
          {[
            [
              "personalized",
              "自动整理常用",
              "根据你在这里的点击，把常去的网站排在前面。",
            ],
            ["largeText", "大字模式", "放大网站名称，阅读更轻松。"],
            ["showSearch", "显示搜索框", "在首页保留搜索框和搜索引擎选择。"],
          ].map(([key, title, description]) => (
            <div className="setting-row" key={key}>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
              <button
                role="switch"
                aria-checked={prefs[key]}
                aria-label={title}
                className={`switch ${prefs[key] ? "on" : ""}`}
                onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
              >
                <span />
              </button>
            </div>
          ))}
          <div className="setting-row">
            <div>
              <strong>默认搜索引擎</strong>
              <p>联网搜索时使用的搜索引擎。</p>
            </div>
            <select
              aria-label="默认搜索引擎"
              value={prefs.engine}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, engine: e.target.value }))
              }
            >
              {Object.entries(engines).map(([id, e]) => (
                <option key={id} value={id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={18} />
            <p>
              {user
                ? "开启自动整理时，点击计数与最近访问时间保存到账号，用于常用排序与推荐。关闭后停止记录点击，你可随时清空。最少的账户与同步操作记录另保留 90 天，不含邮箱、网址或兴趣内容。"
                : "访客点击记录仅保存在你的浏览器。关闭自动整理后不再记录点击，手动置顶仍保留。"}
            </p>
          </div>
          <button
            className="reset-button"
            disabled={clearingHistory}
            aria-busy={clearingHistory}
            onClick={async (event) => {
              const returnFocus = event.currentTarget;
              if (clearingHistory) return;
              setClearingHistory(true);
              try {
                await clearHistory();
                notify("已清空点击记录", "success", returnFocus);
              } catch (e) {
                notify(e.message, "error", returnFocus);
              } finally {
                setClearingHistory(false);
              }
            }}
          >
            <RotateCcw size={15} />
            {clearingHistory ? "正在清空…" : "清空点击记录"}
          </button>
          <button
            className="reset-button"
            onClick={() => {
              setPrefs((p) => ({ ...p, hidden: [] }));
              notify("已恢复移除的常用网站");
            }}
          >
            <Bookmark size={15} />
            恢复移除的常用网站
          </button>
          {user && (
            <button
              className="reset-button"
              onClick={() => {
                importLocal();
                notify("已将本机常用加入账号");
              }}
            >
              <Bookmark size={15} />
              将本机常用加入账号
            </button>
          )}
          <button
            className="primary-button settings-done"
            onClick={() => setModal(null)}
          >
            完成设置
          </button>
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="关于好123轻导航" onClose={() => setModal(null)} feedbackHost={setFeedbackHost}>
          <div className="about-body">
            <span className="brand-symbol">
              <Grid2X2 size={26} />
            </span>
            <h3>一个简单好用的上网起点。</h3>
            <p>
              精选新闻、视频、购物、办公和学习等常用网站，让你少翻找、快一步。
            </p>
            <p>
              访客常用保存在本机，登录后可同步常用与设置。你也可以提交喜欢的网站，审核通过后加入公开目录。点击记录用于可关闭、可清空的个性化推荐。
            </p>
            <p>
              搜索会先查找站内网站，也可以继续使用你选择的搜索引擎。外部网站的服务与内容由其运营方提供。
            </p>
          </div>
        </Modal>
      )}
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
      <SubmissionDialog
        open={submissionOpen}
        onClose={() => setSubmissionOpen(false)}
      />
      <Feedback toast={toast} onDismiss={dismiss} host={feedbackHost} />
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  ["/auth/verify", "/auth/reset-password"].includes(location.pathname) ? (
    <EmailAction />
  ) : (
    <NavigationProvider adminMode={adminMode}>
      {adminMode ? (
        <Suspense fallback={<div className="admin-gate">正在加载…</div>}>
          <Admin />
        </Suspense>
      ) : (
        <App />
      )}
      <AuthDialog />
      {!adminMode && <SyncConflictDialog />}
    </NavigationProvider>
  ),
);

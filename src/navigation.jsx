import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { categories as seedCategories } from "./data";
import { api } from "./api";

const defaults = {
  pinned: [],
  hidden: [],
  custom: [],
  history: {},
  personalized: true,
  largeText: false,
  showSearch: true,
  engine: "baidu",
};
function guestPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("hao123-prefs-v1"));
    return p &&
      Array.isArray(p.pinned) &&
      Array.isArray(p.hidden) &&
      Array.isArray(p.custom)
      ? { ...defaults, ...p }
      : defaults;
  } catch {
    return defaults;
  }
}
const cloudPrefs = (p) => ({
  pinned: p.pinned,
  hidden: p.hidden,
  custom: p.custom,
  personalized: p.personalized,
  largeText: p.largeText,
  showSearch: p.showSearch,
  engine: p.engine,
});
const Context = createContext(null);
export const useNavigation = () => useContext(Context);

export function NavigationProvider({ children }) {
  const [categories, setCategories] = useState(seedCategories);
  const [prefs, rawSetPrefs] = useState(guestPrefs);
  const prefsRef = useRef(prefs);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [syncState, setSyncState] = useState("");
  const [recommendation, setRecommendation] = useState({
    common: [],
    sites: [],
    method: "",
  });
  const [authOpen, setAuthOpen] = useState(false);
  const chain = useRef(Promise.resolve());
  const lastSaved = useRef("");
  const userRef = useRef(null);
  const epoch = useRef(0);
  prefsRef.current = prefs;
  userRef.current = user;
  const setPrefs = useCallback(
    (updater) =>
      rawSetPrefs((old) =>
        typeof updater === "function" ? updater(old) : updater,
      ),
    [],
  );
  const refreshCatalog = useCallback(async () => {
    try {
      const data = await api("/catalog");
      setCategories(data.categories);
      setCatalogError("");
    } catch {
      setCatalogError("目录服务暂时不可用，正在展示本机精选目录。");
    }
  }, []);
  const refreshRecommendations = useCallback(async () => {
    const version = epoch.current;
    try {
      const data = await api("/recommendations");
      if (version === epoch.current) setRecommendation(data);
    } catch {
      /* Keep current recommendations; catalog and sync errors are displayed separately. */
    }
  }, []);
  const hydrate = useCallback(async (nextUser) => {
    epoch.current++;
    if (nextUser) {
      const p = await api("/preferences");
      lastSaved.current = JSON.stringify(p);
      rawSetPrefs({ ...defaults, ...p, history: {} });
    } else {
      lastSaved.current = "";
      rawSetPrefs(guestPrefs());
    }
    setUser(nextUser);
    setRecommendation({ common: [], sites: [], method: "" });
    setError("");
    setSyncState(nextUser ? "已同步" : "");
  }, []);
  useEffect(() => {
    let alive = true;
    refreshCatalog();
    api("/auth/me")
      .then(async (data) => {
        if (alive) await hydrate(data.user);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [hydrate, refreshCatalog]);
  useEffect(() => {
    if (ready) refreshRecommendations();
  }, [user, ready, refreshRecommendations]);
  const persist = useCallback(async (p, account) => {
    if (!account) return;
    const serialized = JSON.stringify(cloudPrefs(p));
    if (serialized === lastSaved.current) return;
    setSyncState("正在同步");
    const task = chain.current
      .catch(() => {})
      .then(async () => {
        if (userRef.current?.id !== account.id) return;
        await api("/preferences", { method: "PUT", body: cloudPrefs(p) });
        lastSaved.current = serialized;
        setSyncState("已同步");
        setError("");
      });
    chain.current = task;
    return task;
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      try {
        localStorage.setItem("hao123-prefs-v1", JSON.stringify(prefs));
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
      return;
    }
    if (JSON.stringify(cloudPrefs(prefs)) === lastSaved.current) return;
    setSyncState("等待同步");
    const timer = setTimeout(
      () =>
        persist(prefs, user)
          .then(refreshRecommendations)
          .catch((e) => {
            setError(`配置同步失败：${e.message}`);
            setSyncState("同步失败");
          }),
      350,
    );
    return () => clearTimeout(timer);
  }, [prefs, user, ready, persist, refreshRecommendations]);
  const authenticate = async (mode, form) => {
    const data = await api(`/auth/${mode}`, { method: "POST", body: form });
    await hydrate(data.user);
    setAuthOpen(false);
  };
  const logout = async () => {
    await persist(prefsRef.current, userRef.current);
    await chain.current;
    await api("/auth/logout", { method: "POST" });
    await hydrate(null);
  };
  const record = (id) => {
    if (!prefs.personalized) return;
    if (!user) {
      setPrefs((p) => {
        const old = p.history[id];
        const score = old
          ? old.score * Math.pow(0.5, (Date.now() - old.time) / 604800000)
          : 0;
        return {
          ...p,
          history: {
            ...p.history,
            [id]: { score: score + 1, time: Date.now() },
          },
        };
      });
      return;
    }
    if (id.startsWith("custom-")) return;
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        await api("/clicks", { method: "POST", body: { siteId: id } });
        await refreshRecommendations();
      })
      .catch((e) => {
        setError(`点击记录未保存：${e.message}`);
      });
  };
  const clearHistory = async () => {
    await chain.current.catch(() => {});
    if (user) await api("/history", { method: "DELETE" });
    setPrefs((p) => ({ ...p, history: {} }));
    await refreshRecommendations();
  };
  const retrySync = async () => {
    try {
      await persist(prefsRef.current, userRef.current);
      await refreshCatalog();
      await refreshRecommendations();
    } catch (e) {
      setError(e.message);
    }
  };
  const importLocal = () => {
    const p = guestPrefs();
    setPrefs((old) => ({
      ...old,
      pinned: [...new Set([...old.pinned, ...p.pinned])].slice(0, 9),
      custom: [
        ...old.custom,
        ...p.custom.filter((s) => !old.custom.some((x) => x.id === s.id)),
      ].slice(0, 100),
    }));
  };
  return (
    <Context.Provider
      value={{
        categories,
        prefs,
        setPrefs,
        user,
        ready,
        error,
        catalogError,
        saveFailed,
        syncState,
        recommendation,
        authOpen,
        setAuthOpen,
        authenticate,
        logout,
        record,
        clearHistory,
        retrySync,
        importLocal,
        refreshCatalog,
        refreshRecommendations,
      }}
    >
      {children}
    </Context.Provider>
  );
}

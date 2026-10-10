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
import { cloudPrefs, mergePreferences } from "./preferenceSync.mjs";

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
const Context = createContext(null);
export const useNavigation = () => useContext(Context);

export function NavigationProvider({ children, adminMode = false }) {
  const authPath = adminMode ? "/admin/auth" : "/auth";
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
  const prefsVersionRef = useRef(0);
  const conflictRef = useRef(false);
  const [syncConflict, setSyncConflict] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  prefsRef.current = prefs;
  userRef.current = user;
  const setPrefs = useCallback((updater) => {
    const next =
      typeof updater === "function" ? updater(prefsRef.current) : updater;
    prefsRef.current = next;
    rawSetPrefs(next);
  }, []);
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
    if (adminMode) return;
    const version = epoch.current;
    try {
      const data = await api("/recommendations");
      if (version === epoch.current) setRecommendation(data);
    } catch {
      /* Keep current recommendations; catalog and sync errors are displayed separately. */
    }
  }, [adminMode]);
  const hydrate = useCallback(
    async (nextUser) => {
      const currentEpoch = ++epoch.current;
      let nextPrefs;
      if (nextUser && !adminMode) {
        const p = await api("/preferences");
        if (currentEpoch !== epoch.current) return;
        prefsVersionRef.current = p.version;
        lastSaved.current = JSON.stringify(cloudPrefs(p));
        nextPrefs = { ...defaults, ...cloudPrefs(p), history: {} };
      } else {
        prefsVersionRef.current = 0;
        lastSaved.current = "";
        nextPrefs = guestPrefs();
      }
      prefsRef.current = nextPrefs;
      rawSetPrefs(nextPrefs);
      userRef.current = nextUser;
      conflictRef.current = false;
      setSyncConflict(false);
      setUser(nextUser);
      setRecommendation({ common: [], sites: [], method: "" });
      setError("");
      setSyncState(nextUser && !adminMode ? "已同步" : "");
    },
    [adminMode],
  );
  useEffect(() => {
    let alive = true;
    refreshCatalog();
    api(`${authPath}/me`)
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
  }, [hydrate, refreshCatalog, authPath]);
  useEffect(() => {
    if (ready) refreshRecommendations();
  }, [user, ready, refreshRecommendations]);
  const persist = useCallback(
    async (p, account) => {
      if (!account || adminMode) return;
      const currentEpoch = epoch.current;
      const serialized = JSON.stringify(cloudPrefs(p));
      if (serialized === lastSaved.current) return;
      setSyncState("正在同步");
      const task = chain.current
        .catch(() => {})
        .then(async () => {
          if (
            userRef.current?.id !== account.id ||
            currentEpoch !== epoch.current
          )
            return;
          if (conflictRef.current) {
            const e = new Error("请先处理其他设备的配置变更");
            e.status = 409;
            throw e;
          }
          if (serialized === lastSaved.current) return;
          let saved;
          try {
            saved = await api("/preferences", {
              method: "PUT",
              body: { ...cloudPrefs(p), version: prefsVersionRef.current },
            });
          } catch (e) {
            if (e.status === 409 && currentEpoch === epoch.current) {
              conflictRef.current = true;
              setSyncConflict(true);
              setSyncState("配置有冲突");
            }
            throw e;
          }
          if (currentEpoch !== epoch.current) return;
          prefsVersionRef.current = saved.version;
          lastSaved.current = serialized;
          setSyncState("已同步");
          setError("");
          // Reconcile edits made while this request was in flight, including a
          // revert to the previous saved value that initially needed no request.
          setSaveRevision((value) => value + 1);
        });
      chain.current = task;
      return task;
    },
    [adminMode],
  );
  useEffect(() => {
    if (!ready || adminMode) return;
    if (!user) {
      try {
        localStorage.setItem("hao123-prefs-v1", JSON.stringify(prefs));
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
      return;
    }
    if (syncConflict) return;
    if (JSON.stringify(cloudPrefs(prefs)) === lastSaved.current) return;
    setSyncState("等待同步");
    const timer = setTimeout(
      () =>
        persist(prefs, user)
          .then(refreshRecommendations)
          .catch((e) => {
            setError(`配置同步失败：${e.message}`);
            setSyncState(e.status === 409 ? "配置有冲突" : "同步失败");
          }),
      350,
    );
    return () => clearTimeout(timer);
  }, [
    prefs,
    user,
    ready,
    persist,
    refreshRecommendations,
    adminMode,
    syncConflict,
    saveRevision,
  ]);
  const resolveSyncConflict = async (choice) => {
    const account = userRef.current;
    const currentEpoch = epoch.current;
    if (!account) return;
    const task = chain.current
      .catch(() => {})
      .then(async () => {
        const cloud = await api("/preferences");
        if (currentEpoch !== epoch.current) return;
        let resolved = cloud;
        if (choice !== "cloud") {
          const local = prefsRef.current;
          const next =
            choice === "merge"
              ? mergePreferences(cloud, local)
              : cloudPrefs(local);
          resolved = await api("/preferences", {
            method: "PUT",
            body: { ...next, version: cloud.version },
          });
        }
        if (currentEpoch !== epoch.current) return;
        prefsVersionRef.current = resolved.version;
        lastSaved.current = JSON.stringify(cloudPrefs(resolved));
        setPrefs({ ...defaults, ...cloudPrefs(resolved), history: {} });
        conflictRef.current = false;
        setSyncConflict(false);
        setSyncState("已同步");
        setError("");
        await refreshRecommendations();
      });
    chain.current = task;
    return task;
  };
  const authenticate = async (mode, form) => {
    const data = await api(`${authPath}/${adminMode ? "login" : mode}`, {
      method: "POST",
      body: form,
    });
    await hydrate(data.user);
    setAuthOpen(false);
  };
  const logout = async () => {
    await chain.current.catch(() => {});
    if (!conflictRef.current) await persist(prefsRef.current, userRef.current);
    await chain.current.catch(() => {});
    await api(`${authPath}/logout`, { method: "POST" });
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
        adminMode,
        categories,
        prefs,
        setPrefs,
        user,
        ready,
        error,
        catalogError,
        saveFailed,
        syncState,
        syncConflict,
        resolveSyncConflict,
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
        refreshUser: async () => {
          const data = await api(`${authPath}/me`);
          setUser(data.user);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

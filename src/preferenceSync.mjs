export const cloudPrefs = (p) => ({
  pinned: p.pinned,
  hidden: p.hidden,
  custom: p.custom,
  personalized: p.personalized,
  largeText: p.largeText,
  showSearch: p.showSearch,
  engine: p.engine,
});

export function mergePreferences(cloud, local) {
  const custom = [...cloud.custom];
  for (const site of local.custom) {
    if (!custom.some((s) => s.id === site.id || s.url === site.url))
      custom.push(site);
  }
  const aliases = new Map(
    local.custom.map((s) => [
      s.id,
      custom.find((c) => c.id === s.id || c.url === s.url)?.id || s.id,
    ]),
  );
  const mapID = (id) => aliases.get(id) || id;
  const available = new Set(custom.map((s) => s.id));
  const valid = (id) => !id.startsWith("custom-") || available.has(id);
  const pinned = [
    ...new Set([...cloud.pinned, ...local.pinned.map(mapID)]),
  ].filter(valid);
  // Hidden wins over pinned. Privacy is preserved if either device opted out.
  const hidden = [...new Set([...cloud.hidden, ...local.hidden.map(mapID)])];
  const merged = {
    ...cloudPrefs(local),
    custom,
    hidden,
    pinned: pinned.filter((id) => !hidden.includes(id)),
    personalized: cloud.personalized && local.personalized,
  };
  if (merged.pinned.length > 9 || hidden.length > 200 || custom.length > 100) {
    throw new Error(
      "合并后超出数量上限（置顶 9、隐藏 200、自定义 100），请采用云端或使用本机配置。",
    );
  }
  return merged;
}

const fallbackIds = ["12306", "weather", "kuaidi", "translate"];

export function getQuickLinks({ sites, prefs, user, recommendation }) {
  const ids = user
    ? [
        ...prefs.pinned,
        ...(prefs.personalized ? recommendation.common.map((site) => site.id) : []),
        ...fallbackIds,
      ]
    : fallbackIds;
  const byId = new Map(sites.map((site) => [site.id, site]));
  return [...new Set(ids)]
    .filter((id) => !prefs.hidden.includes(id) && byId.has(id))
    .slice(0, 4)
    .map((id) => byId.get(id));
}

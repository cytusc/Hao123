// Calendar and hours use the visitor's local time, matching the date on the page.
export function getBannerTheme(now) {
  const month = now.getMonth() + 1;
  const hour = now.getHours();
  const season = month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer"
      : month >= 9 && month <= 11 ? "autumn" : "winter";
  const period = hour >= 5 && hour < 11 ? "morning"
    : hour >= 11 && hour < 17 ? "day"
      : hour >= 17 && hour < 22 ? "evening" : "night";
  const greeting = { morning: "早上好", day: hour < 14 ? "中午好" : "下午好", evening: "晚上好", night: "夜深了" }[period];
  return { season, period, greeting };
}

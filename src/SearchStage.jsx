import MinimalBanner from "./MinimalBanner";

export default function SearchStage({ theme, header, children }) {
  return (
    <section
      className="search-stage"
      data-season={theme.season}
      data-period={theme.period}
      aria-label="搜索与便捷入口"
    >
      <MinimalBanner period={theme.period} />
      {header}
      <div className="stage-inner">{children}</div>
    </section>
  );
}

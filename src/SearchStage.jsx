export default function SearchStage({ header, children }) {
  return (
    <>
      {header}
      <section className="search-stage" aria-label="搜索与便捷入口">
        <div className="stage-inner">{children}</div>
      </section>
    </>
  );
}

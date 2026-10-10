import { useEffect, useRef } from "react";
const assets = import.meta.glob("./assets/search-banner/superpowers/themes/*/*.png", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const depths = [0.15, 0.5, 1];

export default function SearchStage({ theme, header, children }) {
  const stageRef = useRef(null);
  const scene = `${theme.season}-${theme.period}`;
  const layers = depths.map((depth, index) => ({
    depth,
    src: assets[`./assets/search-banner/superpowers/themes/${scene}/${index}.png`],
  }));

  useEffect(() => {
    const stage = stageRef.current;
    const staticScene = window.matchMedia(
      "(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)",
    );
    let frame = 0;
    let currentX = 0;
    let currentY = 0;
    let targetX = 0;
    let targetY = 0;

    const animate = () => {
      currentX += (targetX - currentX) * 0.09;
      currentY += (targetY - currentY) * 0.09;
      const settled =
        Math.abs(targetX - currentX) < 0.02 &&
        Math.abs(targetY - currentY) < 0.02;
      if (settled) {
        currentX = targetX;
        currentY = targetY;
      }
      stage.style.setProperty("--scene-x", `${currentX}px`);
      stage.style.setProperty("--scene-y", `${currentY}px`);
      frame = settled ? 0 : requestAnimationFrame(animate);
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const move = (event) => {
      if (staticScene.matches || event.pointerType !== "mouse") return;
      const bounds = stage.getBoundingClientRect();
      targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * -48;
      targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * -12;
      start();
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      start();
    };
    const updateMotion = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      currentX = currentY = targetX = targetY = 0;
      stage.style.setProperty("--scene-x", "0px");
      stage.style.setProperty("--scene-y", "0px");
    };
    const hide = () => {
      if (document.hidden) updateMotion();
    };

    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerleave", reset);
    staticScene.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", reset);
      staticScene.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  return (
    <section
      className="search-stage"
      data-season={theme.season}
      data-period={theme.period}
      ref={stageRef}
      aria-label="搜索与便捷入口"
    >
      <div className="search-scene" aria-hidden="true">
        {layers.map(({ src, depth }) => (
          <div
            key={src}
            className="search-scene-layer"
            style={{ "--depth": depth, backgroundImage: `url("${src}")` }}
          />
        ))}
      </div>
      {header}
      <div className="stage-inner">{children}</div>
    </section>
  );
}

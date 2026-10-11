import React from "react";

export function SkeletonBlock({ width = "100%", height = "1em", radius = 4, className = "" }) {
  return <span aria-hidden="true" className={`skeleton skeleton-shimmer ${className}`} style={{ width, height, borderRadius: radius }} />;
}

export function CommonSkeleton() {
  return (
    <div className="common-grid" role="status" aria-busy="true" aria-label="正在加载我的常用…">
      {Array.from({ length: 10 }, (_, index) => (
        <div className="common-item" key={index} aria-hidden="true">
          <div className="common-link">
            <SkeletonBlock className="site-mark" width={null} height={null} radius={null} />
            <span className="skeleton-text-line"><SkeletonBlock width="4em" /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DirectorySkeleton() {
  return (
    <div className="category-list" role="status" aria-busy="true" aria-label="正在加载网站目录…">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="category-row" key={index} aria-hidden="true">
          <div className="category-label"><SkeletonBlock width="5em" /></div>
          <div className="category-sites">
            {Array.from({ length: 10 }, (_, site) => (
              <span className="skeleton-site" key={site}><SkeletonBlock width="75%" /></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

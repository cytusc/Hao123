const PALETTES = {
  day: { sky: "#e4e4e8", ridges: ["#b5b5bc", "#94949e", "#767680", "var(--page-background)"] },
  night: { sky: "#1d1d1f", ridges: ["#343438", "#45454b", "#63636b", "var(--page-background)"] },
};

// Fixed paths keep the landscape static; CSS composites only the wrapper transform.
const RIDGES = [
  "M0 102 C100 90 160 32 280 62 S470 134 610 70 S800 40 940 88 S1120 24 1280 66 S1430 102 1600 50 V240 H0Z",
  "M0 138 C150 110 190 80 320 108 S500 160 680 112 S880 86 1020 120 S1260 84 1400 112 S1500 104 1600 92 V240 H0Z",
  "M0 166 C170 152 220 126 390 154 S580 182 760 146 S980 154 1110 148 S1370 168 1600 134 V240 H0Z",
  "M0 228 C180 228 250 224 430 226 S660 232 840 226 S1050 230 1240 224 S1450 230 1600 226 V240 H0Z",
];

const SCENES = Object.fromEntries(Object.entries(PALETTES).map(([period, palette]) => [
  period,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 240" preserveAspectRatio="none"><rect width="1600" height="240" fill="${palette.sky}"/>${RIDGES.map((path, index) => `<path d="${path}" fill="${palette.ridges[index]}"/>`).join("")}</svg>`,
]));

export default function MinimalBanner({ period }) {
  const svg = SCENES[period === "night" ? "night" : "day"];
  return (
    <div className="minimal-banner" aria-hidden="true">
      <div className="minimal-banner-inner" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

// Regenerate local CC0 derivatives. Requires ImageMagick's `convert` command.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../src/assets/search-banner/superpowers/", import.meta.url));
const scenes = { spring: [74, 75, 76], summer: [30, 31, 88], autumn: [30, 78, 79], winter: [68, 69, 70] };
const width = 137, height = 89;
function convert(args, input) {
  const result = spawnSync("convert", args, { input, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return result.stdout;
}
function light(r, g, b, period) {
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const palette = {
    day: [r, g, b],
    morning: [r * 0.83 + 39, g * 0.83 + 25, b * 0.8 + 18],
    evening: [r * 0.8 + luminance * 0.22 + 16, g * 0.46 + luminance * 0.14 + 12, b * 0.45 + luminance * 0.17 + 30],
    night: [luminance * 0.14 + r * 0.08 + 5, luminance * 0.22 + g * 0.06 + 10, luminance * 0.38 + b * 0.08 + 25],
  }[period];
  return palette.map(value => Math.min(255, Math.round(value)));
}
for (const [season, layers] of Object.entries(scenes)) {
  for (const period of ["morning", "day", "evening", "night"]) {
    const dest = join(root, "themes", `${season}-${period}`);
    mkdirSync(dest, { recursive: true });
    layers.forEach((id, index) => {
      const original = convert([join(root, "originals", `${id}.png`), "-depth", "8", "rgba:-"]);
      const pixels = Buffer.from(original);
      for (let i = 0; i < pixels.length; i += 4) {
        const color = light(pixels[i], pixels[i + 1], pixels[i + 2], period);
        color.forEach((value, channel) => { pixels[i + channel] = value; });
      }
      // Draw celestial details in native pixel coordinates; alpha stays intact elsewhere.
      const put = (x, y, color) => {
        const offset = (y * width + x) * 4;
        if (x >= 0 && x < width && y >= 0 && y < height) pixels.set([...color, 255], offset);
      };
      if (index === 0 && period === "night") {
        for (const [x, y] of [[8,33],[25,42],[45,31],[65,40],[82,34],[100,44],[130,30]]) put(x,y,[157,182,215]);
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
          if (x*x+y*y <= 25 && (x+3)*(x+3)+(y-1)*(y-1) > 24) put(116+x,37+y,[230,239,247]);
        }
      }
      if (index === 0 && (period === "morning" || period === "evening")) {
        for (let y=-4; y<=4; y++) for (let x=-4; x<=4; x++) {
          if (x*x+y*y <= 16) put(116+x,43+y,period === "morning" ? [255,234,170] : [255,188,128]);
        }
      }
      const png = convert(["-size", `${width}x${height}`, "-depth", "8", "rgba:-", "-strip", "PNG32:-"], pixels);
      writeFileSync(join(dest, `${index}.png`), png);
    });
  }
}
console.log("Generated 16 seasonal scenes, each with three 137 × 89 pixel layers.");

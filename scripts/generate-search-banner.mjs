import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Generate once during development; the app only loads the resulting SVG files.
// Upstream: westboy31/Landscape-Generator, MIT (see vendor directory).
const width = 3840;
const height = 360;
let seed = 1232026;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// The upstream generator needs only this small SVG DOM surface. Keeping it here
// makes regeneration reproducible with Node alone, without a browser dependency.
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
class SvgNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
    this.content = "";
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  appendChild(child) { this.children.push(child); }
  set innerHTML(value) { this.content = value; this.children = []; }
  get outerHTML() {
    const attributes = Object.entries(this.attributes)
      .filter(([name]) => name !== "class" && name !== "id")
      .map(([name, value]) => ` ${name}="${escape(String(value).trim().replace(/\s+/g, " "))}"`).join("");
    return `<${this.tagName}${attributes}>${this.content}${this.children.map(child => child.outerHTML).join("")}</${this.tagName}>`;
  }
}

const scene = new SvgNode("svg");
const math = Object.create(Math);
math.random = random;
const context = vm.createContext({
  Math: math,
  console,
  document: { createElementNS: (_namespace, tag) => new SvgNode(tag) },
});
const upstream = new URL("./vendor/landscape-generator/LandscapeGenerator.js", import.meta.url);
vm.runInContext(readFileSync(upstream, "utf8"), context, { filename: fileURLToPath(upstream) });
context.generateLandscape(scene, width, height, {
  fogBool: false,
  sunshineBool: false,
  minMountainWidth: 240,
  maxMountainWidth: 560,
  minHorizonY: 76,
  maxHorizonY: 76,
  maxMountainHeight: 38,
  minMountainsRangeNumber: 3,
  maxMountainsRangeNumber: 3,
  minSunPositionX: 3040,
  maxSunPositionX: 3040,
  minSunPositionY: 104,
  maxSunPositionY: 104,
  minSunRadius: 30,
  maxSunRadius: 30,
  minPlainsNumber: 2,
  maxPlainsNumber: 2,
  minPlainsHeight: 316,
  maxPlainsHeight: 346,
  minBirdsNumber: 3,
  maxBirdsNumber: 3,
});

const byId = (id) => scene.children.find(node => node.attributes.id === id);
const paint = (node, fill) => {
  node.setAttribute("fill", fill);
  return node.outerHTML;
};
const sun = paint(byId("Sun"), "#ffe3b3");
const birds = scene.children.filter(node => node.attributes.id?.startsWith("Bird "))
  .map(node => { node.setAttribute("stroke", "#d2e4de"); node.setAttribute("stroke-width", "1.6"); return node.outerHTML; }).join("");
const layers = {
  "sky.svg": `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#497f8d"/><stop offset="1" stop-color="#b4d4bf"/></linearGradient><radialGradient id="glow"><stop stop-color="#ffdfb1" stop-opacity=".28"/><stop offset="1" stop-color="#ffdfb1" stop-opacity="0"/></radialGradient></defs><rect width="3840" height="360" fill="url(#sky)"/><ellipse cx="3040" cy="104" rx="340" ry="200" fill="url(#glow)"/>${sun}${birds}`,
  "far-mountains.svg": paint(byId("Mountains 1"), "#82b4b0"),
  "middle-mountains.svg": paint(byId("Mountains 2"), "#538f8e"),
  "near-mountains.svg": paint(byId("Mountains 3"), "#326e73"),
  "foreground.svg": paint(byId("Plain 1"), "#28585f") + paint(byId("Plain 2"), "#1f454e"),
};
const output = new URL("../src/assets/search-banner/", import.meta.url);
const license = readFileSync(new URL("./vendor/landscape-generator/LICENSE", import.meta.url), "utf8").trim();
mkdirSync(output, { recursive: true });
for (const [name, body] of Object.entries(layers)) {
  writeFileSync(new URL(name, output), `<!-- Generated with Landscape-Generator by westboy31. See SOURCES.md.\n\n${license}\n-->\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`);
}
console.log(`Generated ${Object.keys(layers).length} SVG layers with seed 1232026.`);

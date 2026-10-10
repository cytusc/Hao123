# Superpowers 四季与时段横幅

素材来自 [sparklinlabs/superpowers-asset-packs](https://github.com/sparklinlabs/superpowers-asset-packs)，作者 Pixel-boy / Sparklin Labs，采用 **CC0 1.0 Universal**（完整文本见 `LICENSE.txt`），允许商用、修改与再分发，不要求署名。

固定上游版本：`e8674a03ab4456802f71f848c4df79eccca23f7a`。`originals/` 保留原始 PNG 字节，均为 **137 × 89 px**，已与上游 Git blob 校验。

| 季节 | 上游背景 | 分层编号 |
|---|---|---|
| 春季绿野 | 28 | 74 / 75 / 76 |
| 夏季海岸 | 35 | 30 / 31 / 88 |
| 秋季田野 | 30 | 30 / 78 / 79 |
| 冬季雪景 | 26 | 68 / 69 / 70 |

`themes/` 为本项目派生素材，并非上游原有的 16 套背景。保留原始几何形状和透明度，对早晨、傍晚、深夜重新配色，并在天空层加入像素太阳、月牙、星点；白天保留原始颜色。生成脚本为 `scripts/generate-seasonal-banner.mjs`，在项目根目录运行 `npm run generate:seasonal-banner`（需要 ImageMagick 的 `convert`）。派生素材继续使用 CC0。

按访问者浏览器本地时间选择：春 3–5 月、夏 6–8 月、秋 9–11 月、冬 12–2 月；早晨 05:00–11:00、白天 11:00–17:00、傍晚 17:00–22:00、深夜 22:00–次日 05:00。区间包含起点，不包含终点。整分钟更新，并在页面重新可见或窗口获取焦点时立即校准。日期、问候语和背景使用同一时钟。

展示按 3 倍整数比例（411 × 267 px）横向平铺，使用 `image-rendering: pixelated`，不拉伸素材。三个图层采用不同视差深度，触屏与减少动画模式保持静止。资源全部本地加载，不依赖 GitHub 或素材 CDN。此前 `sky.png`、`sea.png`、`islands.png` 作为原始海岸版本保留，当前首页不加载。

| 本地原始文件 | 上游路径 | SHA-256 |
|---|---|---|
| `originals/30.png` | `backgrounds/layers/30.png` | `8f89fc432857c1deeae5df3782a11de8126b14c41dfd46c84aaad17617582eaa` |
| `originals/31.png` | `backgrounds/layers/31.png` | `68f01b1f90172df18514d78f641b5f1b8d87990a4ea1ee99be7df5a46fc7dfe2` |
| `originals/68.png` | `backgrounds/layers/68.png` | `88e4c49ca75902d658f95ac372b5330538173264a2e035d956f1d1b2b67508e6` |
| `originals/69.png` | `backgrounds/layers/69.png` | `23a52b65ad27009acab9d2c8728ca5ca9f086e5644cfdabc96d2de41a5090637` |
| `originals/70.png` | `backgrounds/layers/70.png` | `b5a5acfe967cc236e58502b929c1f56252388775603227fd7e3ea053db1a3803` |
| `originals/74.png` | `backgrounds/layers/74.png` | `b194be937073d73be8cf9403d7ff4ff4516d4790b0b2e39b22c4c934955d7fba` |
| `originals/75.png` | `backgrounds/layers/75.png` | `f7d7b5ed6494943a8528e12a7915cae26f4b11b28c945df56e0fab3b45a53444` |
| `originals/76.png` | `backgrounds/layers/76.png` | `dcd682c66a122b27ba2f5772824ba7b79e2109fc0c9827bdcc42e5bb9c044202` |
| `originals/78.png` | `backgrounds/layers/78.png` | `3d471e513b3fb44385149a90db13d2fc1f768c118b5004e84122305d8c313d52` |
| `originals/79.png` | `backgrounds/layers/79.png` | `75795fa13b38cd8d3543b21fa9428b829877bda9d46b8b7215a72d1f0b0bbc9d` |
| `originals/88.png` | `backgrounds/layers/88.png` | `d1d5b852c1ec09f279ab70d56185de618fa77f28a66ebea00e517339c9a890b7` |

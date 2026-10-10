# 搜索横幅素材来源

当前首页使用 [Superpowers 四季与时段像素场景](superpowers/SOURCES.md)，素材采用 CC0 许可；完整许可证保存在 `superpowers/LICENSE.txt`。

以下 Landscape Generator 山景作为此前方案保留，当前首页不加载：

横幅为本项目使用 [Landscape Generator](https://github.com/westboy31/Landscape-Generator) 生成的分层 SVG 山景。生成器作者：westboy31；许可：MIT。

- 上游固定版本：`7653c9513188d891e041f342c885fbe1b19416b6`
- 原始生成器：`scripts/vendor/landscape-generator/LandscapeGenerator.js`（保留原始源码）
- 完整版权与许可：`scripts/vendor/landscape-generator/LICENSE`，Copyright (c) 2022 westboy31
- 生成脚本：`scripts/generate-search-banner.mjs`
- 重新生成：在项目根目录执行 `npm run generate:banner`，只需要 Node.js。
- 随机种子：`1232026`；画布：`3840 × 360`；预设与配色见生成脚本。

生成器负责太阳、飞鸟、三层山脉和前景曲线的几何形状；本项目固定随机种子、重新配色、添加 SVG 天空渐变，并将结果拆为 `sky.svg`、`far-mountains.svg`、`middle-mountains.svg`、`near-mountains.svg`、`foreground.svg`。所有图层本地加载，没有外部图片请求，浏览器运行时不执行生成器。

发布或分发包含生成器的项目时，请保留上述 MIT 版权与许可文件。

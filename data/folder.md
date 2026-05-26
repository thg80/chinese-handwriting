# data 文件夹

一旦我所属的文件夹有所变化，请更新我。

## 架构说明

存放静态数据资源，含带难度分级的汉字字库（JSON + 内联 JS）。

## 文件清单

- `dictionary.json` — 汉字字库（JSON 格式），从 `mapull/chinese-dictionary` 批量构建，含 11441 个常用汉字，每条含 `frequency`（0-5 分级）、`strokes`（笔画数）、拼音及例词数组 `words[{word, text}]`（含释义）。
- `dictionary.js` — 字库内联脚本（`window.__DICTIONARY__`），数据与 `dictionary.json` 一致，覆盖全量 11441 字。
- `dictionary-common.js` — 常用字子集内联脚本（`window.__DICTIONARY__`），仅含 frequency 0-2 的 3395 字（~676KB）。`index.html` 优先加载此文件加速首屏，全量字库通过 XHR 异步加载 `dictionary.json` 补齐。

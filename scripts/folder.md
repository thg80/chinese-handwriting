# scripts 文件夹

一旦我所属的文件夹有所变化，请更新我。

## 架构说明

存放一次性或定期的数据构建脚本，不参与运行时。

## 文件清单

- `build-dict.js` — Node.js 脚本，读取 mapull/chinese-dictionary 的 `char_base.json`（frequency 分级）、`char_detail.json`（专属例词与释义）、`word.json`（补充词），生成本项目所需的 `data/dictionary.json`（全量 11441 字）、`data/dictionary.js`（全量内联脚本）和 `data/dictionary-common.js`（常用字 freq 0-2 子集内联脚本 ~676KB）。选词优先从 words 数量多的 explanation 中取，保留 `word` 与 `text`（释义）字段。
- `build-inline.js` — Node.js 脚本，将 `index.html` 引用的外部 CSS/JS 全部内联，额外注入全量 `dictionary.js` 使离线版无需 XHR 即可使用全部字库，生成单文件离线版 `index-inline.html`。

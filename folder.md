# Chinese-Handwriting 根目录

一旦我所属的文件夹有所变化，请更新我。

## 架构说明

单页 Web 应用，纯前端实现中文手写练习。用户根据拼音与例词提示在 Canvas 上手写汉字，自评熟悉度，系统优先复现生疏字。支持按《通用规范汉字表》frequency 分级自由选择难度。

## 文件清单

- `index.html` — 入口页面，承载所有 UI 结构（多文件版，依赖 css/、js/、data/）。
- `index-inline.html` — 内联单文件版，CSS 与全部 JS 已内联，适合移动设备离线直接打开。
- `css/` — 样式目录，宣纸风格视觉体系。
- `js/` — 脚本目录，业务逻辑与手写板封装。
- `data/` — 数据目录，汉字字库 JSON。
- `start-server.bat` — Windows 批处理脚本，双击启动本地 HTTP 服务器（自动检测 Python/Node，绑定 0.0.0.0 支持局域网访问，自动获取并显示本机局域网 IP）。
- `start-server.sh` — Bash 脚本，一键启动本地 HTTP 服务器（跨平台，自动检测 Python/Node，绑定 0.0.0.0 支持局域网访问，自动获取并显示本机局域网 IP）。
- `scripts/` — 构建脚本目录，包含字库构建与内联打包。
- `CHANGELOG.md` — 更改记录，任何改动必须登记。
- `ROADMAP.md` — 后续更新计划与待办清单，指导项目演进方向。

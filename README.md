# 提笔忘字 ✍️

中文手写练习工具。根据拼音与例词提示在画板上手写汉字，自评熟悉度，系统基于间隔重复算法优先复现生疏字。

**在线体验：** 部署到 Cloudflare Pages 后在此填入链接

## 功能

- 拼音 + 例词提示（含词语释义）
- Canvas 手写板（支持鼠标 / 触摸）
- 11441 字字库，按《通用规范汉字表》frequency 0-5 分级
- 难度选择：全部 / 常用 / 进阶 / 高级
- 自评熟悉度：会写 / 不会写 / 长按已认识
- 间隔重复算法：熟悉度越高，复现间隔越长
- 复习面板：按日期、状态筛选，查看下次复习时间
- 批量选择：选一批字集中复习，或放回待学
- 学习统计：总学习字数、已掌握率、连续打卡、近 7 天趋势
- 数据导出 / 导入（JSON），换设备或清缓存后可恢复
- 键盘快捷键：空格查看答案，1 会写 / 2 不会写
- 两种抽字模式：先复习（优先待复习字） / 混合（新旧混合）
- 田字格手写板，离屏缓存加速
- 答案以半透明水印覆盖在手写区上，方便对照

## 使用方式

### 在线访问

部署到 Cloudflare Pages / Vercel 等静态托管即可。

### 本地运行

需要 Python 3 或 Node.js：

```bash
# Windows：双击 start-server.bat
# 或命令行：
python -m http.server 8080 --bind 0.0.0.0
```

然后打开 http://localhost:8080。

### 离线使用

项目根目录的 `index-inline.html` 是内联单文件版，所有 CSS 和 JS 已打包在 HTML 内，适合移动设备直接双击打开。

## 项目结构

```
index.html              入口页面（多文件版）
index-inline.html       内联单文件版（离线可用）
css/
  style.css             全局样式，宣纸风格
js/
  canvas.js             手写板驱动（田字格、触摸/鼠标事件）
  app.js                业务逻辑核心（抽字、评价、复习队列、统计）
  review.js             复习面板（筛选、排序、卡片网格）
data/
  dictionary.json       字库 JSON（11441 字）
  dictionary.js         字库内联脚本
  dictionary-common.js  常用字子集（freq 0-2，3395 字，首屏加载）
scripts/
  build-dict.js         从 mapull/chinese-dictionary 构建字库
  build-inline.js       生成内联单文件版
```

## 技术栈

纯前端，无框架无依赖，ES5 语法兼容旧版浏览器。

- 数据持久化：localStorage
- 字库来源：[mapull/chinese-dictionary](https://github.com/mapull/chinese-dictionary)
- 字典懒加载：首屏仅加载 3395 常用字（676KB），全量字库异步加载

## License

MIT

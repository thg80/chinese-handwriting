# 更改记录

## 2026-05-23

- 字典懒加载（`scripts/build-dict.js`、`data/dictionary-common.js`、`index.html`、`js/app.js`、`scripts/build-inline.js`）
  - 新增 `dictionary-common.js`：`build-dict.js` 新增子集输出，只含 frequency 0-2 的 3395 个常用字（~676KB），替代原先全量 11441 字（~1.9MB）的内联脚本。
  - `index.html` 改为加载 `dictionary-common.js`，首屏 JS 解析量从 1.9MB 降至 676KB。
  - `app.js` 新增 `_loadFullDictionary()`：通过 XHR 异步请求 `dictionary.json`（全量 3.3MB），加载完成后合并至 `fullDictionary` 并重新应用当前难度筛选。新增 `_fullDictLoading` / `_fullDictDegraded` 状态标志，pool 为空时自动退而使用已有字库，避免"无字"报错。XHR 失败时降级为动态 `<script>` 标签加载 `dictionary.js`（兼容 `file://` 协议）。
  - `build-inline.js` 在 `app.js` 之后额外注入全量 `dictionary.js`，离线时 `_loadFullDictionary()` 通过 `setTimeout` 延迟检测到全量数据已就绪，跳过 XHR。内联版体积从 1.97MB 增至 2.6MB。
  - 默认难度"常用"(0,1,2) 完全不依赖异步加载，用户打开即可使用。
- 修复 CSS 语法错误：`.btn-difficult` 选择器缺失（`css/style.css:415-417`）
- 提取魔法数字为命名常量，新增跨文件常量 13 个（`js/app.js`、`js/canvas.js`）
- 去重 `REVIEW_INTERVALS` 定义，`review.js` 优先读取 `app.js` 暴露的 `window.__REVIEW_INTERVALS`（`js/app.js`、`js/review.js`）
- Canvas 田字格离屏缓存 + resize 防抖（`js/canvas.js`）
- 可访问性提升：Canvas aria-label + `:focus-visible` 键盘焦点样式（`index.html`、`css/style.css`）
- 复习列表分页加载：超过 200 张卡时分批渲染，降低 DOM 节点数（`js/review.js`）
- 修复不认识的字无限重复：新增 `_sessionDifficult` 会话去重（`js/app.js`）
  - 当剩余复习字数极少时，点"不认识"后该字会因熟悉度 < 20 的间隔为 0 天而立刻回到待复习池，无限循环。
  - 新增 `_sessionDifficult` 集合：`markDifficult()` 中将当前字加入，`pickChar()` 中过滤掉这些字；当当前池（due/new）全部标记过时自动扩大至全量候选池（保留标记，从另一类池选字），仅当所有字都被标记过一遍时才清空集合重新开始。

## 2026-05-21

- 复习页卡片日期显示改为下次复习间隔（`js/review.js`、`css/style.css`）：
  - 原卡片底部显示"上次复习日期"（如 `05-18`），改为显示下次复习间隔（如"今天"、"明天"、"3天后"、"逾期2天"）。
  - 间隔算法与 `app.js` 中 `getDueChars()` 一致：熟悉度 0-20 间隔 0 天、20-40 间隔 1 天、40-60 间隔 3 天、60-80 间隔 7 天、80-100 间隔 15 天。
  - 已逾期的卡片日期文字以朱红色加粗显示（`.card-overdue` 样式），一眼可辨。
  - `review.js` 中新增 `REVIEW_INTERVALS` 常量，`enrich()` 函数新增 `nextReviewLabel` 和 `overdue` 字段计算。

## 2026-05-18

- 复习页布局紧凑化改造（`index.html`、`css/style.css`、`index-inline.html`）：
  - 将"选择"按钮右对齐到日期 chips 行（`review-date-row` 布局），原先独占一行的工具栏与日期行合并。
  - 将"统计""导出""导入"三个按钮内联到状态筛选行的最右侧（`review-status-row` 末尾），用竖线分隔符与排序下拉框隔开，去掉原来独占一行的 data-io-bar。
  - 取消 `.review-toolbar` 和 `.data-io-bar` 两层 wrapper DOM 结构，`.review-filters` gap 从 12px 减至 8px，整体更紧凑，字卡网格上移。
  - 按钮文字"导出数据""导入数据"简化为"导出""导入"以节省空间。
  - 各操作按钮添加 `white-space: nowrap`，避免小屏幕下按钮内文字折行。
- 操作流程优化：将"查看答案"按钮移到手写区下方（`index.html`、`css/style.css`、`index-inline.html`）：
  - 原提示卡内布局为「拼音+例词 → 查看答案 → 答案文字 → 手写区 → 评价」，操作流不自然（先看答案再手写）。
  - 将 `#revealBtn` 从 `.prompt-card` 中移出，新建 `.reveal-section` 区域置于手写区与评价按钮之间。
  - 新流程：提示 → 手写 → 点"查看答案" → 评价，更符合实际练习节奏。
  - PC 网格布局增加 `"reveal reveal"` 行（跨两列），`#practiceSection .reveal-section { grid-area: reveal; }`。
- 答案显示改为手写区水印覆盖层（`index.html`、`css/style.css`、`js/app.js`、`index-inline.html`）：
  - 去掉 `.prompt-header` 横向排布方案，将 `#answer` 从提示卡中移出，改为置于 `.canvas-wrapper` 内的 `.answer-overlay` 绝对定位层。
  - 揭晓前覆盖层 `display: none` 不占任何空间，彻底消除布局跳动；揭晓后以半透明水印（`opacity: 0.25`）浮于手写区正上方，`pointer-events: none` 不影响继续书写。
  - 答案字号使用 `clamp(6rem, 55vmin, 10rem)`，自适应 canvas 大小，方便直接对照笔迹。
  - `renderPrompt()` 与 `revealAnswer()` 改为控制 `#answerOverlay` 的显隐。
- 统计面板改为弹窗覆盖层显示（`index.html`、`css/style.css`、`js/review.js`、`index-inline.html`）：
  - `css/style.css` 中 `.stats-panel` 从内联块改为 `position: fixed` 全屏半透明覆盖层，居中弹出白色统计卡片。
  - 面板内容包裹在 `.stats-panel-inner` 中，限制最大宽度 360px、最大高度 80vh（可滚动）。
  - 点击遮罩背景也可关闭弹窗（`e.target === this` 判断），与确认弹窗交互一致。
- 手写区清除按钮从右下角移到左下角（`css/style.css`、`index-inline.html`）：
- 添加 familiarity 缓存减少重复遍历（`js/app.js`、`index-inline.html`）：
  - 新增 `_famListCache` 与 `_famMapCache`，`getFamiliarity()` 与 `getFamiliarityMap()` 首次读取后缓存结果，后续调用直接复用。
  - 新增 `setFamiliarity(list)` 包装函数，写入 localStorage 的同时自动清空缓存，保证一致性。
  - 将 `updateFamiliarity`、`resetFamiliarity`、`markKnown`、`migrateFamiliarity`、`importData` 中的直接 `setStorage(STORAGE_KEYS.familiarity, ...)` 全部替换为 `setFamiliarity(...)`，确保所有写路径都触发缓存失效。
- 修复启动脚本局域网访问问题（`start-server.bat`、`start-server.sh`）：
  - Python `http.server` 默认绑定 `localhost`，仅本机可访问；添加 `--bind 0.0.0.0` 参数使其监听所有网络接口，局域网内其他设备可直接访问。
  - 新增局域网 IP 自动获取：通过 Python socket 连接外部地址（8.8.8.8:80）获取本机出口 IP，兼容多网卡环境。
  - 启动时同时输出"本机访问: http://localhost:PORT"和"局域网访问: http://IP:PORT"两行地址，方便跨设备打开。
- 添加 localStorage 容量监控（`js/app.js`、`index-inline.html`）：
  - `setStorage()` 中捕获 `QuotaExceededError`（code 22），空间已满时立即弹窗提示导出备份。
  - 新增 `checkStorageWarning()`，每 20 次写入检查一次总占用量（UTF-16 估算），超过 4MB 时弹窗提醒用户备份。
  - `init()` 启动时执行一次容量检查，防止用户数据已经很大但未被察觉。

## 2026-05-17

- 修复长按"会写"确认弹窗定位到错误字符的 bug（`js/app.js`）：
  - 原实现中 `click` 事件监听与长按事件并存，短按时 `click` 先触发 `markMastered()` → `goNext()` 跳到下一字，长按后确认弹窗操作的是新字而非原字。
  - 改为统一在 `mouseup`/`touchend` 中处理：短按（< 500ms）直接调用 `markMastered()`，长按（≥ 500ms）弹出确认框并阻止 click 事件传播。
  - 移除独立的 `click` 监听，避免与长按竞争。

## 2026-05-17

- 区分复习页跳转与新字练习（`js/app.js`、`css/style.css`、`index.html`、`index-inline.html`）：
  - 新增 `isReviewMode` 状态标志：从复习页跳转的字标记为复习模式，随机抽字为练习模式。
  - 复习模式下：顶部标签文字变为"复习"，提示区右上角显示琥珀色"复习中"徽章，评价按钮文字变为"记住了"/"没记住"。
  - 练习模式下：顶部标签为"练习"，无徽章，评价按钮为"会写"/"不会写"。
  - 批量复习队列中的每个字都保持复习模式，队列结束后自动恢复练习模式；主动点击"练习"标签也恢复练习模式。
- 复习页增加批量选择与批量操作功能（`index.html`、`js/review.js`、`js/app.js`、`css/style.css`、`index-inline.html`）：
  - 复习页工具栏增加"选择"按钮，点击进入选择模式后卡片左上角出现圆形复选框，支持逐一点选/全选/取消全选。
  - 卡片在选中时边框加深、背景微变，复选框填充黑色打勾。
  - "批量复习"按钮：将选中字加入复习队列，依次跳转练习页，评价后自动进入下一个字，队列为空时自动切回复习页（`js/app.js` 新增 `reviewQueue`、`inBatchReview`、`startBatchReview`、`nextInQueue`，修改 `goNext` 支持队列模式，暴露 `__startBatchReview`）。
  - "放回待学"按钮：将选中字熟悉度归零，卡片从复习列表消失（`js/app.js` 新增 `resetFamiliarity`，暴露 `__resetFamiliarity`）。
  - 筛选/排序变化时自动退出选择模式；`css/style.css` 新增工具栏、选择态卡片、复选框样式。
- 修复复习页熟悉度进度条不可见 bug（`css/style.css`、`js/review.js`）：
  - `.familiarity-bar` 缺 `display: block` 导致 `<span>` 内联元素不响应 width/height/min-width；加 `display: block` 后进度条恢复正常渲染。
  - 进度条高度从 3px 增至 4px，加淡色背景托底；评分过低时仍显示 min-width: 6px；颜色按熟悉度分三级（<30 红、30-60 琥珀、≥60 绿）；日期旁显示熟悉度数字值。
- 引入熟悉度系统替代二态掌握模型（`js/app.js`、`js/review.js`、`css/style.css`、`index.html`、`index-inline.html`）：
  - 存储模型升级：废除 `chw_mastered`/`chw_difficult` 二态存储，改以 `chw_familiarity`（0-100 评分数组），`init()` 自动迁移旧数据。
  - 加权抽字算法：`pickChar` 按熟悉度权重随机抽取——熟悉度 0-20 权重 50、20-40 权重 30、40-60 权重 15、60-80 权重 5、80-100 权重 1，低熟悉度字高频复现，高熟悉度字不消失。
  - 涨幅按难度调整：`markMastered` 根据字 frequency 分级——常用字（freq 0-2）+8、进阶（freq 3-4）+12、高级（freq 5）+16；`markDifficult` 统一 -15，均限幅 0-100。
  - 统计栏改为三态+平均熟悉度："已掌握 ≥80 / 需复习 40-80 / 在学 <40 / 平均熟悉度"。
  - 复习面板升级：卡片底部增加 3px 绿色熟悉度进度条；状态筛选改为 familiarity 阈值（需复习 <60 / 已掌握 ≥80）；排序增加"熟悉度"选项（从低到高）。
  - 暴露 `window.__getFamiliarityMap` 连接 app.js 与 review.js。
- 优化释义排版与宽屏布局（`js/app.js`、`css/style.css`、`index-inline.html`）：
  - `js/app.js` 中 `renderPrompt` 将词语用 `<span class="word-line">` 包裹，每个词语+解释独占一行，去掉全角空格连接，解决长释义换行不可控问题。
  - `css/style.css` 中 `.word-explain` 去掉 `white-space: nowrap`，允许长释义自然换行；新增 `.word-line { display: block; line-height: 1.8; }`。
  - 宽屏布局优化：平板端（≥768px）`main/tab-bar` 最大宽度增至 680px，复习面板 6 列；PC 端（≥1024px）`main/tab-bar` 最大宽度增至 920px，练习面板改为 CSS Grid 两列布局（提示区在左、手写区在右，手写区放大至 360px），复习面板 8 列。
- 升级例词数据结构，支持词语释义显示（`scripts/build-dict.js`、`js/app.js`、`css/style.css`、`data/dictionary.js`、`data/dictionary.json`、`index-inline.html`）：
  - `scripts/build-dict.js` 例词提取逻辑重构：`char_detail.json` 中的 words 从字符串数组改为 `{word, text}` 对象数组，保留每条例词的释义；选词策略从"混合所有释义后按词长排序"改为"优先从 words 数量多的 explanation 中取词"（义项覆盖面通常更广、更常用），解决常用字选出"南薰""南离"等生僻词的问题。
  - `js/app.js` 中 `renderPrompt` 兼容新旧格式：新格式下在提示区显示 `＿词（释义）`，旧格式（无释义）保持原样显示。
  - `css/style.css` 新增 `.word-explain` 样式，释义文字缩小字号、使用 muted 色，与主词语区分。
  - 重新运行 `build-dict.js` 生成 `data/dictionary.json` 与 `data/dictionary.js`（11441 字）。
  - 新建 `scripts/build-inline.js` 自动化生成 `index-inline.html`，重新打包内联最新代码与字库。
  - 更新 `scripts/folder.md` 记录新脚本。
- 修复写字区不居中问题（`js/app.js`、`css/style.css`）：
  - `js/app.js` 中 `switchView` 恢复练习面板时原使用 `style.display = "block"`，覆盖了 CSS 中 `main { display: flex }`，导致 `align-items: center` 失效；改为 `style.display = ""` 以恢复 flex 布局，使手写区在从复习页切回后仍保持居中。
  - `css/style.css` 中为 `.canvas-wrapper` 补充 `margin: 0 auto`，作为额外的居中保险。
- 修复复习界面日期 chips 选中状态不跟随问题（`js/review.js`）：
  - `renderDateChips` 每次重绘时总是把 `active` 类硬编码在"全部"按钮上，没有根据 `currentDateFilter` 设置；改为按当前筛选值动态添加 `active` 类，使点击"今天"/"昨天"后选中提示正确保留。

## 2026-05-17

- 修复平板兼容性问题（`index.html`、`js/canvas.js`、`js/app.js`）：
  - `index.html` 中 CSS/JS 路径添加 `./` 前缀，提升相对路径在部分平板文件管理器中的解析稳定性。
  - `js/canvas.js` 将 `const`/`let`、箭头函数改为 `var` 与普通函数，消除旧版平板浏览器（iOS 9 以下、Android 4.4 以下）的语法错误。
  - `js/app.js` 给 `setStorage` 添加 try-catch，防止在 `file://` 协议或隐私模式下 `localStorage` 被禁用时抛出异常中断脚本。
- 更新 `js/folder.md` 记录上述兼容性说明。
- 创建内联单文件版 `index-inline.html`（约 1MB）：使用 Node.js 脚本将 `css/style.css`、`data/dictionary.js`、`js/canvas.js`、`js/app.js`、`js/review.js` 全部内联到 HTML 中，解决移动设备直接打开本地 HTML 时无法加载外部 CSS/JS 的问题。
- 更新 `folder.md`、`index.html` 头部注释、`ROADMAP.md`，记录单文件版与部署待办。
- 创建快捷启动脚本 `start-server.bat`（Windows）与 `start-server.sh`（跨平台 Bash）：自动检测 Python3/Python/Node.js，启动本地 HTTP 服务器（端口 8080），自动打开浏览器，并输出访问地址。
- 更新 `folder.md` 记录启动脚本。

## 2026-05-16

- 初始化项目，确定最小可用版本范围（随机抽字、手写板、会写/不会写自评、生疏字优先复现）。
- 创建根目录架构说明 `folder.md`。
- 创建字库 `data/dictionary.json`，收录 100 个常用汉字（含拼音、例词）。
- 创建 `index.html`、`css/style.css`、`js/app.js`、`js/canvas.js`。
- 修复 `data/dictionary.json` 中单引号与多余引号导致的格式错误，验证 JSON 合法。
- 从 `mapull/chinese-dictionary` 批量构建字库：创建 `scripts/build-dict.js`，读取 `char_base.json`（21056 字）与 `word.json`（320349 词），提取 11249 个带拼音与例词的汉字，覆盖 `data/dictionary.json`。
- 创建 `scripts/folder.md`。
- 修复双击打开时的 CORS 问题：新增 `data/dictionary.js` 内联字库数据，`index.html` 直接脚本引入；`js/app.js` 优先使用 `window.__DICTIONARY__`，降级时才 fetch。
- 更新 `index.html`、`js/app.js`、`data/folder.md` 的相关注释与依赖说明。
- 实现难度分级功能：重写 `scripts/build-dict.js` 合并 `char_base.json`（frequency 分级）、`char_detail.json`（解释与专属例词）、`word.json`（补充词），输出 11441 字（含 frequency/strokes 字段）。
- `index.html` 增加难度选择器（全部/常用/进阶/高级），`js/app.js` 增加难度过滤与记忆逻辑，`css/style.css` 增加选择器样式。
- 更新 `ROADMAP.md`、`data/folder.md`、`scripts/folder.md`、`js/folder.md` 相关文档。
- 初始化 git 仓库，`.gitignore` 排除上游源数据与系统文件，首次提交。：创建 `js/review.js`（日期筛选、状态筛选、排序、字符卡片网格），`index.html` 增加练习/复习标签切换栏与复习面板 DOM，`js/app.js` 增加 `chw_log` 学习日志记录与视图切换逻辑，`css/style.css` 增加标签栏与复习面板样式。

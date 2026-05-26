/**
 * 文件input: 依赖外部 data/dictionary-common.js 提供常用字库（全局 window.__DICTIONARY__，含 frequency/strokes/words[{word,text}] 字段），异步加载 data/dictionary.json 补齐全量字库。依赖 js/canvas.js 暴露 clearCanvas()。setStorage 带 try-catch，兼容 file:// 与隐私模式。
 * 文件output: 对外驱动应用生命周期（抽字、难度过滤、揭示答案、熟悉度评价、统计、批量复习队列、复习/练习模式切换、长按已认识、数据导出/导入、键盘快捷键），含 familiarity 缓存与 localStorage 容量监控，暴露视图切换与熟悉度接口。
 * 文件pos: 在系统局部的地位是业务逻辑中枢，连接数据层、表现层与本地存储。
 * 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。
 */

(function () {
  // ---- 命名常量 ----
  var LONG_PRESS_MS = 500;          // 长按阈值（毫秒）
  var LOG_MAX_ENTRIES = 2000;       // 日志最大条数
  var STORAGE_WARN_MB = 4;          // localStorage 容量告警阈值（MB）
  var STORAGE_CHECK_FREQ = 20;      // 每 N 次写入检查一次容量
  var MIXED_DUE_RATIO = 0.7;        // 混合模式下待复习字占比
  var FAM_KNOWN_SCORE = 80;         // "已认识"直接设置的熟悉度
  var FAM_MASTERED_FIRST_BONUS = 15; // 首次掌握额外奖励
  var DIFF_PENALTY = -15;           // "不会写"熟悉度扣减

  var STORAGE_KEYS = {
    difficult: "chw_difficult",
    mastered: "chw_mastered",
    difficulty: "chw_difficulty",
    log: "chw_log",
    familiarity: "chw_familiarity",
    reviewMode: "chw_review_mode",
  };

  var fullDictionary = [];
  var filteredPool = [];
  var currentDifficulty = "0,1,2";
  var currentChar = null;
  var reviewQueue = [];
  var inBatchReview = false;
  var isReviewMode = false;
  var _fullDictLoading = false;  // 是否正在异步加载全量字库
  var _fullDictDegraded = false; // file:// 下 XHR 失败，标记已降级（仅常用字可用）

  // 熟悉度缓存：避免每次读取都重新 parse JSON + 遍历
  var _famListCache = null;
  var _famMapCache = null;

  function getStorage(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      return [];
    }
  }

  var _storageWarned = false;
  var _storageCheckCounter = 0;

  function setStorage(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      // 每 20 次写入检查一次容量，避免频繁计算
      _storageCheckCounter++;
      if (_storageCheckCounter % STORAGE_CHECK_FREQ === 0) checkStorageWarning();
    } catch (e) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        alert("本地存储空间已满，学习记录可能无法保存！请立即导出数据备份。");
      }
      // file:// 或隐私模式下 localStorage 被禁用，静默降级
    }
  }

  function checkStorageWarning() {
    if (_storageWarned) return;
    try {
      var total = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k) total += localStorage.getItem(k).length;
      }
      // UTF-16 每个字符 2 字节，粗略估算
      var mb = total * 2 / 1024 / 1024;
      if (mb > STORAGE_WARN_MB) {
        _storageWarned = true;
        alert("本地存储已使用约 " + mb.toFixed(1) + " MB，接近上限。建议导出数据备份，以防清缓存后丢失进度。");
      }
    } catch (e) {}
  }

  function getLog() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.log)) || [];
    } catch (e) {
      return [];
    }
  }

  function appendLog(char, status) {
    var log = getLog();
    log.push({ char: char, status: status, time: new Date().toISOString() });
    // 仅保留最近 2000 条，防止无限增长
    if (log.length > LOG_MAX_ENTRIES) log = log.slice(-LOG_MAX_ENTRIES);
    setStorage(STORAGE_KEYS.log, log);
  }

  // ---- 熟悉度系统 ----
  function _invalidateFamCache() {
    _famListCache = null;
    _famMapCache = null;
  }

  function getFamiliarity() {
    if (_famListCache !== null) return _famListCache;
    try {
      _famListCache = JSON.parse(localStorage.getItem(STORAGE_KEYS.familiarity)) || [];
    } catch (e) {
      _famListCache = [];
    }
    return _famListCache;
  }

  function getFamiliarityMap() {
    if (_famMapCache !== null) return _famMapCache;
    var list = getFamiliarity();
    _famMapCache = {};
    for (var i = 0; i < list.length; i++) {
      _famMapCache[list[i].char] = list[i];
    }
    return _famMapCache;
  }

  function setFamiliarity(list) {
    _invalidateFamCache();
    setStorage(STORAGE_KEYS.familiarity, list);
  }

  function updateFamiliarity(char, delta) {
    var list = getFamiliarity();
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].char === char) {
        found = list[i];
        break;
      }
    }
    if (!found) {
      found = { char: char, score: 0, lastReview: new Date().toISOString() };
      list.push(found);
    }
    found.score = Math.max(0, Math.min(100, found.score + delta));
    found.lastReview = new Date().toISOString();
    setFamiliarity(list);
  }

  function resetFamiliarity(char) {
    // 彻底删除记录，让字回到全新状态
    var list = getFamiliarity();
    var newList = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].char !== char) newList.push(list[i]);
    }
    setFamiliarity(newList);
    // 清除该字的 log 记录，让它从复习页消失
    var log = getLog();
    var newLog = [];
    for (var i = 0; i < log.length; i++) {
      if (log[i].char !== char) newLog.push(log[i]);
    }
    setStorage(STORAGE_KEYS.log, newLog);
  }

  function migrateFamiliarity() {
    var list = getFamiliarity();
    if (list.length > 0) return;
    var mastered = getStorage(STORAGE_KEYS.mastered);
    var difficult = getStorage(STORAGE_KEYS.difficult);
    var result = [];
    for (var i = 0; i < mastered.length; i++) {
      result.push({ char: mastered[i], score: 100, lastReview: new Date().toISOString() });
    }
    for (var i = 0; i < difficult.length; i++) {
      var ch = difficult[i];
      var existing = null;
      for (var j = 0; j < result.length; j++) {
        if (result[j].char === ch) {
          existing = result[j];
          break;
        }
      }
      if (existing) {
        existing.score = 20;
      } else {
        result.push({ char: ch, score: 20, lastReview: new Date().toISOString() });
      }
    }
    setFamiliarity(result);
  }

  // ---- 间隔复习 ----
  var REVIEW_INTERVALS = [
    { max: 20, days: 0 },
    { max: 40, days: 1 },
    { max: 60, days: 3 },
    { max: 80, days: 7 },
    { max: 101, days: 15 },
  ];

  function getReviewMode() {
    try {
      var mode = localStorage.getItem(STORAGE_KEYS.reviewMode);
      return mode === "mixed" ? "mixed" : "reviewFirst";
    } catch (e) {
      return "reviewFirst";
    }
  }

  function setReviewMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEYS.reviewMode, mode);
    } catch (e) {}
  }

  function getDueChars() {
    var fam = getFamiliarity();
    var now = Date.now();
    var due = [];
    for (var i = 0; i < fam.length; i++) {
      var f = fam[i];
      var intervalDays = 0;
      for (var j = 0; j < REVIEW_INTERVALS.length; j++) {
        if (f.score < REVIEW_INTERVALS[j].max) {
          intervalDays = REVIEW_INTERVALS[j].days;
          break;
        }
      }
      var lastTime = new Date(f.lastReview).getTime();
      var dueTime = lastTime + intervalDays * 86400000;
      if (now >= dueTime) {
        due.push(f.char);
      }
    }
    return due;
  }

  function loadDictionary() {
    if (window.__DICTIONARY__ && Array.isArray(window.__DICTIONARY__)) {
      fullDictionary = window.__DICTIONARY__;
    }
    if (fullDictionary.length === 0) {
      alert("字库加载失败，请检查 data/dictionary-common.js 是否存在。");
    }
    // 异步加载全量字典（dictionary-common.js 只含 freq 0-2，精简首屏体积）
    _fullDictLoading = true;
    _loadFullDictionary();
  }

  function _loadFullDictionary() {
    // 检查 window.__DICTIONARY__ 是否已有全量数据（内联版全量字典脚本可能在 app.js 之后执行）
    function checkAndLoad() {
      if (window.__DICTIONARY__ && window.__DICTIONARY__.length > fullDictionary.length) {
        fullDictionary = window.__DICTIONARY__;
        _fullDictLoading = false;
        applyDifficulty(currentDifficulty);
        return true;
      }
      return false;
    }
    // 延迟一帧检查，等所有同步脚本（含全量字典内联脚本）执行完毕
    setTimeout(function () {
      if (checkAndLoad()) return;
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "./data/dictionary.json", true);
      xhr.responseType = "json";
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) {
          var full = xhr.response;
          if (full && full.length > fullDictionary.length) {
            fullDictionary = full;
            window.__DICTIONARY__ = full;
          }
        }
        _fullDictLoading = false;
        applyDifficulty(currentDifficulty);
      };
      xhr.onerror = function () {
        // XHR 失败（file:// 协议被拦截），先以常用字降级运行
        _fullDictLoading = false;
        _fullDictDegraded = true;
        applyDifficulty(currentDifficulty);
        // 同时尝试动态 script 标签加载全量 dictionary.js
        var script = document.createElement("script");
        script.src = "./data/dictionary.js";
        script.onload = function () {
          if (window.__DICTIONARY__ && window.__DICTIONARY__.length > fullDictionary.length) {
            fullDictionary = window.__DICTIONARY__;
            _fullDictDegraded = false;
            applyDifficulty(currentDifficulty);
          }
        };
        document.body.appendChild(script);
      };
      xhr.send();
    }, 0);
  }

  function getDifficultyLabelMask(value) {
    var labels = {
      all: "全部",
      "0,1,2": "常用",
      "3,4": "进阶",
      "5": "高级",
    };
    return labels[value] || "";
  }

  function applyDifficulty(diffValue) {
    currentDifficulty = diffValue;
    setStorage(STORAGE_KEYS.difficulty, diffValue);

    if (diffValue === "all") {
      filteredPool = fullDictionary.slice();
    } else {
      var allowed = diffValue.split(",").map(Number);
      filteredPool = fullDictionary.filter(function (d) {
        return allowed.indexOf(d.frequency) !== -1;
      });
    }

    // 全量字库未加载（或 file:// 降级）时，如果池为空，退而使用已有字库
    if (filteredPool.length === 0 && fullDictionary.length > 0) {
      filteredPool = fullDictionary.slice();
    }

    updateDiffUI();
    pickChar(true);
  }

  function updateDiffUI() {
    var opts = document.querySelectorAll("#difficultyOptions .diff-opt");
    opts.forEach(function (opt) {
      var input = opt.querySelector("input");
      opt.classList.toggle("active", input.value === currentDifficulty);
    });
    var diffCount = document.getElementById("diffCount");
    if (diffCount) {
      var loadingSuffix = "";
      if (_fullDictDegraded) {
        loadingSuffix = " · 常用字子集（本地文件限制）";
      } else if (_fullDictLoading) {
        loadingSuffix = " · 加载中…";
      }
      diffCount.textContent =
        filteredPool.length + " 字 · " + getDifficultyLabelMask(currentDifficulty) + loadingSuffix;
    }
  }

  function pickChar(resetHistory) {
    if (filteredPool.length === 0) {
      document.getElementById("pinyin").textContent = "无字";
      document.getElementById("words").textContent = "当前难度无可用字";
      return;
    }

    var mode = getReviewMode();
    var dueChars = getDueChars();
    var dueSet = {};
    for (var i = 0; i < dueChars.length; i++) dueSet[dueChars[i]] = true;

    // 构建待复习池和新字池
    var duePool = [];
    var newPool = [];
    for (var i = 0; i < filteredPool.length; i++) {
      if (dueSet[filteredPool[i].char]) {
        duePool.push(filteredPool[i]);
      } else {
        newPool.push(filteredPool[i]);
      }
    }

    var pool;
    if (mode === "reviewFirst") {
      // 优先待复习，清空才抽新字
      pool = duePool.length > 0 ? duePool : newPool;
    } else {
      // 混合模式：待复习多时偏重现复习，少时偏重现新字
      var dueRatio = MIXED_DUE_RATIO;
      if (duePool.length > 0 && duePool.length <= 5) dueRatio = 0.4;
      if (duePool.length > 0 && Math.random() < dueRatio) {
        pool = duePool;
      } else if (newPool.length > 0) {
        pool = newPool;
      } else {
        pool = duePool;
      }
    }

    if (pool.length === 0) pool = filteredPool;

    // 池内加权随机（低熟悉度权重高）
    var famMap = getFamiliarityMap();
    var weights = [];
    var totalWeight = 0;
    for (var i = 0; i < pool.length; i++) {
      var d = pool[i];
      var score = famMap[d.char] ? famMap[d.char].score : 0;
      var weight;
      if (score < 20) weight = 50;
      else if (score < 40) weight = 30;
      else if (score < 60) weight = 15;
      else if (score < 80) weight = 5;
      else weight = 1;
      weights.push(weight);
      totalWeight += weight;
    }

    var rand = Math.random() * totalWeight;
    var cumulative = 0;
    currentChar = pool[0];
    for (var i = 0; i < pool.length; i++) {
      cumulative += weights[i];
      if (rand <= cumulative) {
        currentChar = pool[i];
        break;
      }
    }

    isReviewMode = false;
    renderPrompt();
  }

  function renderPrompt() {
    var pinyinEl = document.getElementById("pinyin");
    var wordsEl = document.getElementById("words");
    var answerEl = document.getElementById("answer");
    var revealBtn = document.getElementById("revealBtn");
    var actions = document.getElementById("actions");

    if (!currentChar) return;

    pinyinEl.textContent = currentChar.pinyin;
    wordsEl.innerHTML = currentChar.words
      .map(function (w) {
        var wordText = typeof w === "string" ? w : (w.word || "");
        var explain = typeof w === "string" ? "" : (w.text || "");
        var display = wordText.replace(currentChar.char, "＿");
        if (explain) {
          var maskedExplain = explain.replace(new RegExp(currentChar.char, "g"), "＿");
          return '<span class="word-line">' + display + '<span class="word-explain">（' + maskedExplain + '）</span></span>';
        }
        return '<span class="word-line">' + display + '</span>';
      })
      .join("");

    // 复习模式 UI 区分
    var modeBadge = document.getElementById("modeBadge");
    if (modeBadge) {
      if (isReviewMode) {
        modeBadge.style.display = "inline-block";
        modeBadge.textContent = "复习中";
      } else {
        modeBadge.style.display = "none";
      }
    }
    var tabPractice = document.getElementById("tabPractice");
    if (tabPractice) tabPractice.textContent = isReviewMode ? "复习" : "练习";
    var masteredBtn = document.getElementById("masteredBtn");
    var difficultBtn = document.getElementById("difficultBtn");
    if (masteredBtn) masteredBtn.textContent = isReviewMode ? "记住了" : "会写";
    if (difficultBtn) difficultBtn.textContent = isReviewMode ? "没记住" : "不会写";
    var exitBtn = document.getElementById("exitReviewBtn");
    if (exitBtn) exitBtn.style.display = isReviewMode ? "inline-block" : "none";

    answerEl.textContent = currentChar.char;
    var answerOverlay = document.getElementById("answerOverlay");
    if (answerOverlay) answerOverlay.style.display = "none";

    revealBtn.style.display = "inline-block";
    actions.classList.remove("is-visible");

    updateStats();
  }

  function revealAnswer() {
    var answerOverlay = document.getElementById("answerOverlay");
    if (answerOverlay) answerOverlay.style.display = "flex";
    document.getElementById("revealBtn").style.display = "none";
    document.getElementById("actions").classList.add("is-visible");
  }

  function markMastered() {
    var freq = currentChar ? currentChar.frequency : 5;
    // 常见字写对说明真会了，涨多；生僻字写对可能蒙的，涨少
    var delta = freq <= 2 ? 14 : (freq <= 4 ? 8 : 4);
    // 首次掌握奖励：如果当前熟悉度为 0，额外 +15 让用户看到明显变化
    var famMap = getFamiliarityMap();
    var cur = famMap[currentChar.char];
    if (!cur || cur.score === 0) delta += FAM_MASTERED_FIRST_BONUS;
    updateFamiliarity(currentChar.char, delta);
    appendLog(currentChar.char, "mastered");
    goNext();
  }

  function markKnown() {
    // "已认识"：直接设熟悉度为 80，跳过手写环节
    var list = getFamiliarity();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].char === currentChar.char) {
        list[i].score = FAM_KNOWN_SCORE;
        list[i].lastReview = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) {
      list.push({ char: currentChar.char, score: FAM_KNOWN_SCORE, lastReview: new Date().toISOString() });
    }
    setFamiliarity(list);
    appendLog(currentChar.char, "known");
    goNext();
  }

  function showKnownConfirm() {
    var overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    var box = document.createElement("div");
    box.className = "confirm-box";
    var msg = document.createElement("p");
    msg.textContent = "确认已认识？熟悉度将直接设为 80。";
    var btnRow = document.createElement("div");
    btnRow.className = "confirm-btns";
    var btnConfirm = document.createElement("button");
    btnConfirm.textContent = "确认";
    btnConfirm.className = "confirm-btn confirm-yes";
    var btnCancel = document.createElement("button");
    btnCancel.textContent = "取消";
    btnCancel.className = "confirm-btn confirm-no";
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnConfirm);
    box.appendChild(msg);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnConfirm.addEventListener("click", function () {
      document.body.removeChild(overlay);
      markKnown();
    });
    btnCancel.addEventListener("click", function () {
      document.body.removeChild(overlay);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
  }

  function markDifficult() {
    updateFamiliarity(currentChar.char, DIFF_PENALTY);
    appendLog(currentChar.char, "difficult");
    goNext();
  }

  // ---- 退出复习模式 ----
  function exitReviewMode() {
    reviewQueue = [];
    inBatchReview = false;
    isReviewMode = false;
    var modeBadge = document.getElementById("modeBadge");
    if (modeBadge) modeBadge.style.display = "none";
    var tabPractice = document.getElementById("tabPractice");
    if (tabPractice) tabPractice.textContent = "练习";
    var masteredBtn = document.getElementById("masteredBtn");
    var difficultBtn = document.getElementById("difficultBtn");
    if (masteredBtn) masteredBtn.textContent = "会写";
    if (difficultBtn) difficultBtn.textContent = "不会写";
    var exitBtn = document.getElementById("exitReviewBtn");
    if (exitBtn) exitBtn.style.display = "none";
    if (typeof window.renderReview === "function") window.renderReview();
    switchView("review");
  }

  function goNext() {
    if (typeof clearCanvas === "function") clearCanvas();
    if (inBatchReview) {
      nextInQueue();
    } else {
      pickChar(false);
    }
  }

  function updateStats() {
    var fam = getFamiliarity();
    var mastered = 0, reviewing = 0, learning = 0;
    var totalScore = 0;
    for (var i = 0; i < fam.length; i++) {
      var s = fam[i].score;
      totalScore += s;
      if (s >= 80) mastered++;
      else if (s >= 20) reviewing++;
      else learning++;
    }
    var avg = fam.length > 0 ? Math.round(totalScore / fam.length) : 0;
    var dueCount = getDueChars().length;
    var mode = getReviewMode();
    var modeLabel = mode === "reviewFirst" ? "先复习" : "混合";
    var statsEl = document.getElementById("stats");
    var dueHtml = dueCount > 0
      ? '<span class="stats-due">今日待复习 <strong>' + dueCount + '</strong> 字</span>'
      : '<span class="stats-due stats-done">今日待复习完成 🎉</span>';
    statsEl.innerHTML = dueHtml +
      '<span class="stats-mode" id="statsMode">' + modeLabel + '</span>' +
      '<span class="stats-detail">已掌握 ' + mastered + ' · 需复习 ' + reviewing + ' · 在学 ' + learning + ' · 平均 ' + avg + '</span>';
  }

  // ---- 视图切换 ----
  function switchView(view) {
    var practiceSection = document.getElementById("practiceSection");
    var reviewSection = document.getElementById("reviewSection");
    var practiceTab = document.getElementById("tabPractice");
    var reviewTab = document.getElementById("tabReview");

    if (view === "review") {
      practiceSection.style.display = "none";
      reviewSection.style.display = "";
      practiceTab.classList.remove("active");
      reviewTab.classList.add("active");
      if (typeof renderReview === "function") renderReview();
    } else {
      practiceSection.style.display = "";
      reviewSection.style.display = "none";
      practiceTab.classList.add("active");
      reviewTab.classList.remove("active");
      if (!inBatchReview && !isReviewMode) {
        isReviewMode = false;
        if (practiceTab) practiceTab.textContent = "练习";
        updateStats();
        pickChar(false);
      } else {
        updateStats();
        renderPrompt();
      }
    }
  }

  // ---- 批量复习队列 ----
  function startBatchReview(chars) {
    reviewQueue = chars.slice();
    inBatchReview = true;
    nextInQueue();
  }

  function nextInQueue() {
    if (reviewQueue.length === 0) {
      inBatchReview = false;
      isReviewMode = false;
      if (typeof window.renderReview === "function") window.renderReview();
      switchView("review");
      return;
    }
    var ch = reviewQueue.shift();
    isReviewMode = true;
    practiceSpecificChar(ch);
  }

  // ---- 从复习页跳转到练习指定字 ----
  function practiceSpecificChar(char) {
    var found = filteredPool.find(function (d) { return d.char === char; });
    if (!found) {
      // 如果当前难度不包含该字，切换到全部
      var radioAll = document.querySelector('input[name="difficulty"][value="all"]');
      if (radioAll) radioAll.checked = true;
      applyDifficulty("all");
      found = fullDictionary.find(function (d) { return d.char === char; });
    }
    if (found) {
      currentChar = found;
      isReviewMode = true;
      switchView("practice");
      renderPrompt();
    }
  }

  function init() {
    loadDictionary();
    migrateFamiliarity();

    var savedDiff = getStorage(STORAGE_KEYS.difficulty);
    if (Array.isArray(savedDiff)) savedDiff = "" + savedDiff;
    if (savedDiff) currentDifficulty = savedDiff;

    var radio = document.querySelector(
      'input[name="difficulty"][value="' + currentDifficulty + '"]'
    );
    if (radio) radio.checked = true;

    applyDifficulty(currentDifficulty);

    var radios = document.querySelectorAll('input[name="difficulty"]');
    radios.forEach(function (r) {
      r.addEventListener("change", function () {
        applyDifficulty(this.value);
      });
    });

    document.getElementById("revealBtn").addEventListener("click", revealAnswer);
    document.getElementById("difficultBtn").addEventListener("click", markDifficult);

    // 长按"会写"→ 确认弹窗 → "已认识"（熟悉度直接设80）
    // 短按（< 500ms）→ 正常"会写"行为
    // 不用单独的 click 监听，避免与长按冲突（click 会先于 mouseup 的 preventDefault 触发）
    (function () {
      var btn = document.getElementById("masteredBtn");
      var timer = null;
      var longPressed = false;
      function start(e) {
        longPressed = false;
        timer = setTimeout(function () {
          longPressed = true;
          btn.classList.add("long-pressing");
        }, LONG_PRESS_MS);
      }
      function cancel() {
        clearTimeout(timer);
        btn.classList.remove("long-pressing");
      }
      function end(e) {
        clearTimeout(timer);
        btn.classList.remove("long-pressing");
        if (longPressed) {
          e.preventDefault();
          showKnownConfirm();
        } else {
          markMastered();
        }
      }
      btn.addEventListener("mousedown", start);
      btn.addEventListener("mouseup", end);
      btn.addEventListener("mouseleave", cancel);
      btn.addEventListener("touchstart", start, { passive: true });
      btn.addEventListener("touchend", end);
      btn.addEventListener("touchcancel", cancel);
    })();
    document.getElementById("exitReviewBtn").addEventListener("click", exitReviewMode);

    // 统计栏模式切换
    document.getElementById("stats").addEventListener("click", function (e) {
      if (e.target.id === "statsMode" || e.target.classList.contains("stats-mode")) {
        var mode = getReviewMode();
        var newMode = mode === "reviewFirst" ? "mixed" : "reviewFirst";
        setReviewMode(newMode);
        updateStats();
      }
    });

    // 标签切换
    document.getElementById("tabPractice").addEventListener("click", function () {
      switchView("practice");
    });
    document.getElementById("tabReview").addEventListener("click", function () {
      switchView("review");
    });

    // 数据导出/导入
    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", function () {
      document.getElementById("importFile").click();
    });
    document.getElementById("importFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      importData(file, function (err) {
        if (err) {
          alert("导入失败：" + err);
        } else {
          alert("导入成功，页面即将刷新");
          location.reload();
        }
        e.target.value = "";
      });
    });

    // 键盘快捷键
    document.addEventListener("keydown", function (e) {
      // 忽略输入框内的按键
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      // 仅在练习面板可见时生效
      var practiceSection = document.getElementById("practiceSection");
      if (!practiceSection || practiceSection.style.display === "none") return;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        var revealBtn = document.getElementById("revealBtn");
        if (revealBtn && revealBtn.style.display !== "none") {
          revealAnswer();
        }
      } else if (e.key === "1") {
        var actions = document.getElementById("actions");
        if (actions && actions.classList.contains("is-visible")) {
          markMastered();
        }
      } else if (e.key === "2") {
        var actions = document.getElementById("actions");
        if (actions && actions.classList.contains("is-visible")) {
          markDifficult();
        }
      }
    });

    // 启动时检查一次存储容量
    checkStorageWarning();
  }

  // ---- 数据导出/导入 ----
  function exportData() {
    var data = {
      version: 2,
      exportTime: new Date().toISOString(),
      familiarity: getFamiliarity(),
      log: getLog(),
      difficulty: getStorage(STORAGE_KEYS.difficulty),
      reviewMode: getReviewMode(),
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "提笔忘字_备份_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file, onDone) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || typeof data !== "object") throw new Error("格式错误");
        if (data.familiarity) setFamiliarity(data.familiarity);
        if (data.log) setStorage(STORAGE_KEYS.log, data.log);
        if (data.difficulty) setStorage(STORAGE_KEYS.difficulty, data.difficulty);
        if (data.reviewMode) setReviewMode(data.reviewMode);
        onDone && onDone(null);
      } catch (err) {
        onDone && onDone(err.message || "导入失败");
      }
    };
    reader.readAsText(file);
  }

  // 暴露给外部
  window.__switchView = switchView;
  window.__practiceSpecificChar = practiceSpecificChar;
  window.__getLog = getLog;
  window.__getStorage = getStorage;
  window.__STORAGE_KEYS = STORAGE_KEYS;
  window.__getFamiliarityMap = getFamiliarityMap;
  window.__getFamiliarity = getFamiliarity;
  window.__resetFamiliarity = resetFamiliarity;
  window.__startBatchReview = startBatchReview;
  window.__exitReviewMode = exitReviewMode;
  window.__getDueChars = getDueChars;
  window.__REVIEW_INTERVALS = REVIEW_INTERVALS;

  init();
})();

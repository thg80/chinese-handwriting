/**
 * 文件input: 依赖外部 js/app.js 暴露的 window.__getLog、window.__getStorage、window.__STORAGE_KEYS、window.__practiceSpecificChar、window.__getFamiliarityMap。
 * 文件output: 对外渲染复习面板（日期筛选、状态筛选、排序、字符卡片网格含熟悉度进度条与下次复习间隔、选择模式与批量操作），支持点击跳转练习。
 * 文件pos: 在系统局部的地位是复习视图层，负责将学习日志与熟悉度转化为可视化的复习界面。
 * 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。
 */

(function () {
  var currentDateFilter = "all";
  var currentStatusFilter = "all";
  var currentSort = "recent";
  var selectMode = false;
  var selectedSet = {};
  var PAGE_SIZE = 200; // 每页渲染卡片数，超出时分页加载
  var _allFiltered = []; // 缓存筛选排序后的完整列表
  var _renderedCount = 0; // 当前已渲染数量

  // 通过 app.js 暴露的接口获取，避免重复定义
  var REVIEW_INTERVALS = (typeof window.__REVIEW_INTERVALS !== "undefined") ? window.__REVIEW_INTERVALS : [
    { max: 20, days: 0 },
    { max: 40, days: 1 },
    { max: 60, days: 3 },
    { max: 80, days: 7 },
    { max: 101, days: 15 },
  ];

  function getLog() {
    if (typeof window.__getLog === "function") return window.__getLog();
    return [];
  }

  function getStorage(key) {
    if (typeof window.__getStorage === "function") return window.__getStorage(key);
    return [];
  }

  function getDictionary() {
    if (window.__DICTIONARY__) return window.__DICTIONARY__;
    return [];
  }

  function getFamiliarityMap() {
    if (typeof window.__getFamiliarityMap === "function") return window.__getFamiliarityMap();
    return {};
  }

  function getDueChars() {
    if (typeof window.__getDueChars === "function") return window.__getDueChars();
    return [];
  }

  /** 从 log 构建每个字的最新状态 + 首次/末次时间 + 复习次数 */
  function buildCharSummary(log) {
    var map = {};
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      var ch = entry.char;
      if (!map[ch]) {
        map[ch] = {
          char: ch,
          firstSeen: entry.time,
          lastReview: entry.time,
          reviewCount: 0,
          status: entry.status,
        };
      }
      map[ch].lastReview = entry.time;
      map[ch].reviewCount++;
      map[ch].status = entry.status; // 以最后一次为准
    }
    return Object.values(map);
  }

  /** 从 dictionary 补充拼音信息，注入熟悉度与下次复习间隔 */
  function enrich(summary) {
    var dict = getDictionary();
    var dictMap = {};
    dict.forEach(function (d) {
      dictMap[d.char] = d;
    });
    var famMap = getFamiliarityMap();
    var now = Date.now();
    return summary.map(function (s) {
      var d = dictMap[s.char];
      if (d) {
        s.pinyin = d.pinyin;
        s.frequency = d.frequency;
        s.strokes = d.strokes;
      } else {
        s.pinyin = "";
        s.frequency = 5;
        s.strokes = 1;
      }
      s.familiarity = famMap[s.char] ? famMap[s.char].score : 0;
      s.lastFamReview = famMap[s.char] ? famMap[s.char].lastReview : s.lastReview;
      // 计算下次复习间隔
      var intervalDays = 0;
      for (var j = 0; j < REVIEW_INTERVALS.length; j++) {
        if (s.familiarity < REVIEW_INTERVALS[j].max) {
          intervalDays = REVIEW_INTERVALS[j].days;
          break;
        }
      }
      var lastTime = new Date(s.lastFamReview).getTime();
      var dueTime = lastTime + intervalDays * 86400000;
      var diffDays = Math.floor((dueTime - now) / 86400000);
      if (diffDays < 0) {
        s.nextReviewLabel = "逾期" + (-diffDays) + "天";
        s.overdue = true;
      } else if (diffDays === 0) {
        s.nextReviewLabel = "今天";
        s.overdue = false;
      } else if (diffDays === 1) {
        s.nextReviewLabel = "明天";
        s.overdue = false;
      } else {
        s.nextReviewLabel = diffDays + "天后";
        s.overdue = false;
      }
      return s;
    });
  }

  function getAvailableDates(log) {
    var dateSet = {};
    for (var i = log.length - 1; i >= 0; i--) {
      var d = log[i].time.slice(0, 10);
      dateSet[d] = true;
    }
    return Object.keys(dateSet).sort().reverse();
  }

  function formatDateLabel(dateStr) {
    var today = new Date().toISOString().slice(0, 10);
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return "今天";
    if (dateStr === yesterday) return "昨天";
    return dateStr.slice(5); // MM-DD
  }

  // ---- 选择模式 ----
  function toggleSelectMode() {
    selectMode = !selectMode;
    selectedSet = {};
    updateBatchUI();
    renderReview();
  }

  function exitSelectMode() {
    selectMode = false;
    selectedSet = {};
    updateBatchUI();
    renderReview();
  }

  function toggleSelectChar(char) {
    if (selectedSet[char]) {
      delete selectedSet[char];
    } else {
      selectedSet[char] = true;
    }
    updateBatchUI();
    // 只更新卡片样式，不重新渲染整个网格
    var card = document.querySelector('.review-card[data-char="' + char + '"]');
    if (card) card.classList.toggle("selected");
  }

  function selectAll() {
    var cards = document.querySelectorAll(".review-card");
    cards.forEach(function (c) { selectedSet[c.getAttribute("data-char")] = true; c.classList.add("selected"); });
    updateBatchUI();
  }

  function selectN(n) {
    // 按当前排列顺序，从前往后选中 n 个未选中的字
    var cards = document.querySelectorAll(".review-card");
    var count = 0;
    cards.forEach(function (c) {
      if (count >= n) return;
      var ch = c.getAttribute("data-char");
      if (!selectedSet[ch]) {
        selectedSet[ch] = true;
        c.classList.add("selected");
        count++;
      }
    });
    updateBatchUI();
  }

  function deselectAll() {
    var cards = document.querySelectorAll(".review-card");
    cards.forEach(function (c) { delete selectedSet[c.getAttribute("data-char")]; c.classList.remove("selected"); });
    updateBatchUI();
  }

  function updateBatchUI() {
    var toggleBtn = document.getElementById("reviewSelectToggle");
    var batchBar = document.getElementById("reviewBatchBar");
    var countEl = document.getElementById("reviewSelectCount");
    if (!toggleBtn || !batchBar || !countEl) return;
    toggleBtn.textContent = selectMode ? "退出选择" : "选择";
    batchBar.style.display = selectMode ? "flex" : "none";
    var count = Object.keys(selectedSet).length;
    countEl.textContent = "已选 " + count + " 字";
  }

  function batchPractice() {
    var chars = Object.keys(selectedSet);
    if (chars.length === 0) return;
    selectMode = false;
    selectedSet = {};
    updateBatchUI();
    renderReview();
    if (typeof window.__startBatchReview === "function") {
      window.__startBatchReview(chars);
    }
  }

  function batchReset() {
    var chars = Object.keys(selectedSet);
    if (chars.length === 0) return;
    for (var i = 0; i < chars.length; i++) {
      if (typeof window.__resetFamiliarity === "function") {
        window.__resetFamiliarity(chars[i]);
      }
    }
    selectMode = false;
    selectedSet = {};
    updateBatchUI();
    renderReview();
  }

  function filterAndSort(summary, log) {
    // 日期筛选
    var filtered = summary;
    if (currentDateFilter !== "all") {
      var targetDate = currentDateFilter;
      filtered = summary.filter(function (s) {
        for (var i = 0; i < log.length; i++) {
          if (log[i].char === s.char && log[i].time.slice(0, 10) === targetDate) {
            return true;
          }
        }
        return false;
      });
    }

    // 状态筛选（基于熟悉度 + 待复习）
    if (currentStatusFilter !== "all") {
      var dueList = getDueChars();
      var dueSet = {};
      for (var k = 0; k < dueList.length; k++) dueSet[dueList[k]] = true;
      filtered = filtered.filter(function (s) {
        if (currentStatusFilter === "due") return dueSet[s.char] === true;
        if (currentStatusFilter === "difficult") return s.familiarity >= 20 && s.familiarity < 80;
        if (currentStatusFilter === "mastered") return s.familiarity >= 80;
        return true;
      });
    }

    // 排序
    if (currentSort === "recent") {
      filtered.sort(function (a, b) {
        return (b.lastFamReview || b.lastReview).localeCompare(a.lastFamReview || a.lastReview);
      });
    } else if (currentSort === "oldest") {
      filtered.sort(function (a, b) {
        return (a.lastFamReview || a.lastReview).localeCompare(b.lastFamReview || b.lastReview);
      });
    } else if (currentSort === "difficultFirst") {
      filtered.sort(function (a, b) {
        var diff = a.familiarity - b.familiarity;
        if (diff !== 0) return diff;
        return (b.lastFamReview || b.lastReview).localeCompare(a.lastFamReview || a.lastReview);
      });
    } else if (currentSort === "familiarity") {
      filtered.sort(function (a, b) { return a.familiarity - b.familiarity; });
    }

    return filtered;
  }

  function renderDateChips(dates) {
    var container = document.getElementById("reviewDateChips");
    if (!container) return;
    var html = '<button class="date-chip' + (currentDateFilter === "all" ? " active" : "") + '" data-date="all" type="button">全部</button>';
    for (var i = 0; i < Math.min(dates.length, 14); i++) {
      var d = dates[i];
      html +=
        '<button class="date-chip' + (currentDateFilter === d ? " active" : "") + '" data-date="' +
        d +
        '" type="button">' +
        formatDateLabel(d) +
        "</button>";
    }
    container.innerHTML = html;

    container.querySelectorAll(".date-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        container.querySelectorAll(".date-chip").forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        currentDateFilter = chip.getAttribute("data-date");
        renderReview();
      });
    });
  }

  function renderCardHTML(s) {
    var statusBadge = s.familiarity >= 80 ? "✓" : "✗";
    var statusClass = s.familiarity >= 80 ? "card-mastered" : "card-difficult";
    var isSelected = selectedSet[s.char] ? " selected" : "";
    var dateLabel = s.nextReviewLabel;
    var overdueClass = s.overdue ? " card-overdue" : "";
    var famColor = s.familiarity < 30 ? "#c9372c" : (s.familiarity < 60 ? "#d4a017" : "#5e8b6e");
    return '<div class="review-card ' +
      statusClass +
      (selectMode ? " select-mode" : "") +
      isSelected +
      '" data-char="' +
      s.char +
      '">' +
      (selectMode ? '<span class="card-check">' + (isSelected ? "✓" : "") + "</span>" : "") +
      '<span class="card-char">' + s.char + "</span>" +
      '<span class="card-pinyin">' + s.pinyin + "</span>" +
      '<span class="card-badge ' + statusClass + '">' + statusBadge + "</span>" +
      '<span class="card-date' + overdueClass + '">' + dateLabel +
      ' <span class="card-fam-val">' + s.familiarity + '</span></span>' +
      '<span class="card-familiarity"><span class="familiarity-bar" style="width:' +
      s.familiarity + '%;background:' + famColor + '"></span></span></div>';
  }

  function renderReview() {
    var log = getLog();
    var summary = buildCharSummary(log);
    var enriched = enrich(summary);
    var dates = getAvailableDates(log);
    _allFiltered = filterAndSort(enriched, log);
    _renderedCount = 0;

    renderDateChips(dates);

    var grid = document.getElementById("reviewGrid");
    var empty = document.getElementById("reviewEmpty");
    if (!grid || !empty) return;

    if (_allFiltered.length === 0) {
      grid.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      _renderedCount = Math.min(_allFiltered.length, PAGE_SIZE);
      var html = "";
      for (var i = 0; i < _renderedCount; i++) {
        html += renderCardHTML(_allFiltered[i]);
      }
      if (_renderedCount < _allFiltered.length) {
        html += '<div class="review-load-more" id="reviewLoadMore" style="grid-column:1/-1;text-align:center;padding:12px;color:var(--muted);font-size:0.85rem;cursor:pointer;">点击加载更多（' + (_allFiltered.length - _renderedCount) + ' 字未显示）</div>';
      }
      grid.innerHTML = html;

      bindCardClicks(grid);

      var loadMore = document.getElementById("reviewLoadMore");
      if (loadMore) {
        loadMore.addEventListener("click", function () {
          loadMore.remove();
          var moreCount = Math.min(_allFiltered.length - _renderedCount, PAGE_SIZE);
          var moreHTML = "";
          for (var i = _renderedCount; i < _renderedCount + moreCount; i++) {
            moreHTML += renderCardHTML(_allFiltered[i]);
          }
          _renderedCount += moreCount;
          if (_renderedCount < _allFiltered.length) {
            moreHTML += '<div class="review-load-more" id="reviewLoadMore" style="grid-column:1/-1;text-align:center;padding:12px;color:var(--muted);font-size:0.85rem;cursor:pointer;">点击加载更多（' + (_allFiltered.length - _renderedCount) + ' 字未显示）</div>';
          }
          grid.insertAdjacentHTML("beforeend", moreHTML);
          bindCardClicks(grid);
          var newLoadMore = document.getElementById("reviewLoadMore");
          if (newLoadMore) {
            newLoadMore.addEventListener("click", arguments.callee);
          }
        });
      }
    }
  }

  function bindCardClicks(grid) {
    grid.querySelectorAll(".review-card").forEach(function (card) {
      if (card._clickBound) return;
      card._clickBound = true;
      card.addEventListener("click", function () {
        var char = card.getAttribute("data-char");
        if (selectMode) {
          toggleSelectChar(char);
        } else {
          if (typeof window.__practiceSpecificChar === "function") {
            window.__practiceSpecificChar(char);
          }
        }
      });
    });
  }

  // ---- 统计面板 ----
  function buildStats() {
    var log = getLog();
    var fam = (typeof window.__getFamiliarity === "function") ? window.__getFamiliarity() : [];
    var today = new Date().toISOString().slice(0, 10);

    // 总学习字数（去重）
    var learnedSet = {};
    log.forEach(function (e) { learnedSet[e.char] = true; });
    var totalLearned = Object.keys(learnedSet).length;

    // 已掌握率
    var mastered = 0;
    fam.forEach(function (f) { if (f.score >= 80) mastered++; });
    var masteryRate = totalLearned > 0 ? Math.round(mastered / totalLearned * 100) : 0;

    // 今日练习字数
    var todayCount = 0;
    log.forEach(function (e) { if (e.time.slice(0, 10) === today) todayCount++; });

    // 连续打卡天数
    var dateSet = {};
    log.forEach(function (e) { dateSet[e.time.slice(0, 10)] = true; });
    var dates = Object.keys(dateSet).sort();
    var streak = 0;
    var checkDate = new Date();
    for (var i = 0; i < 365; i++) {
      var dStr = checkDate.toISOString().slice(0, 10);
      if (dateSet[dStr]) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (i === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    // 最近7天每日练习数
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dStr = d.toISOString().slice(0, 10);
      var count = 0;
      log.forEach(function (e) { if (e.time.slice(0, 10) === dStr) count++; });
      last7.push({ date: dStr.slice(5), count: count });
    }

    // 熟悉度分布
    var dist = { learning: 0, reviewing: 0, mastered: 0 };
    fam.forEach(function (f) {
      if (f.score >= 80) dist.mastered++;
      else if (f.score >= 20) dist.reviewing++;
      else dist.learning++;
    });

    return {
      totalLearned: totalLearned,
      masteryRate: masteryRate,
      todayCount: todayCount,
      streak: streak,
      last7: last7,
      dist: dist,
    };
  }

  function renderStats() {
    var s = buildStats();
    var body = document.getElementById("statsPanelBody");
    if (!body) return;

    // 最近7天柱状图（用字符拼）
    var maxCount = 1;
    s.last7.forEach(function (d) { if (d.count > maxCount) maxCount = d.count; });
    var bars = s.last7.map(function (d) {
      var h = Math.round((d.count / maxCount) * 10);
      var bar = "█".repeat(h) + "░".repeat(10 - h);
      return '<div class="stats-bar-row"><span class="stats-bar-label">' + d.date + '</span><span class="stats-bar">' + bar + '</span><span class="stats-bar-num">' + d.count + '</span></div>';
    }).join("");

    body.innerHTML =
      '<div class="stats-grid">' +
      '<div class="stats-card"><div class="stats-num">' + s.totalLearned + '</div><div class="stats-label">总学习字数</div></div>' +
      '<div class="stats-card"><div class="stats-num">' + s.masteryRate + '%</div><div class="stats-label">已掌握率</div></div>' +
      '<div class="stats-card"><div class="stats-num">' + s.todayCount + '</div><div class="stats-label">今日练习</div></div>' +
      '<div class="stats-card"><div class="stats-num">' + s.streak + '</div><div class="stats-label">连续打卡</div></div>' +
      '</div>' +
      '<div class="stats-section-title">最近7天</div>' +
      '<div class="stats-bars">' + bars + '</div>' +
      '<div class="stats-section-title">熟悉度分布</div>' +
      '<div class="stats-dist">' +
      '<span class="dist-item dist-learning">在学 ' + s.dist.learning + '</span>' +
      '<span class="dist-item dist-reviewing">需复习 ' + s.dist.reviewing + '</span>' +
      '<span class="dist-item dist-mastered">已掌握 ' + s.dist.mastered + '</span>' +
      '</div>';
  }

  function toggleStatsPanel() {
    var panel = document.getElementById("statsPanel");
    if (!panel) return;
    panel.classList.toggle("is-open");
    if (panel.classList.contains("is-open")) {
      renderStats();
    }
  }

  function init() {
    // 绑定选择/批量操作按钮
    document.getElementById("reviewSelectToggle").addEventListener("click", toggleSelectMode);
    document.getElementById("reviewSelectAll").addEventListener("click", selectAll);
    document.getElementById("reviewSelect20").addEventListener("click", function () { selectN(20); });
    document.getElementById("reviewSelect50").addEventListener("click", function () { selectN(50); });
    document.getElementById("reviewDeselectAll").addEventListener("click", deselectAll);
    document.getElementById("reviewBatchPractice").addEventListener("click", batchPractice);
    document.getElementById("reviewBatchReset").addEventListener("click", batchReset);

    // 统计面板
    document.getElementById("statsToggleBtn").addEventListener("click", toggleStatsPanel);
    document.getElementById("statsCloseBtn").addEventListener("click", toggleStatsPanel);
    document.getElementById("statsPanel").addEventListener("click", function (e) {
      if (e.target === this) toggleStatsPanel();
    });

    // 绑定状态筛选按钮（筛选变化时退出选择模式）
    var statusBtns = document.querySelectorAll(".review-status-btn");
    statusBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        statusBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        currentStatusFilter = btn.getAttribute("data-status");
        if (selectMode) exitSelectMode();
        renderReview();
      });
    });

    // 绑定排序（排序变化时退出选择模式）
    var sortSelect = document.getElementById("reviewSort");
    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        currentSort = sortSelect.value;
        if (selectMode) exitSelectMode();
        renderReview();
      });
    }
  }

  // 暴露给 app.js 在切换视图时调用
  window.renderReview = renderReview;

  init();
})();

/**
 * 文件input: 依赖外部 DOM 中的 <canvas id="writeCanvas"> 与 <button id="clearBtn">。纯 ES5 语法，兼容旧版浏览器。
 * 文件output: 对外暴露 initCanvas() 与 clearCanvas()，封装手写输入交互。
 * 文件pos: 在系统局部的地位是输入设备驱动层，负责把鼠标/触摸事件转译为画布笔迹。
 * 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。
 */

var CANVAS_LINE_WIDTH = 3;
var GRID_COLOR = "rgba(26,26,26,0.08)";
var GRID_LINE_WIDTH = 1;
var CANVAS_STROKE_COLOR = "#1a1a1a";
var RESIZE_DEBOUNCE_MS = 150;

var _gridCache = null; // 离屏 canvas 缓存田字格

function initCanvas() {
  var canvas = document.getElementById("writeCanvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = CANVAS_LINE_WIDTH;
  ctx.strokeStyle = CANVAS_STROKE_COLOR;

  _buildGridCache(rect.width, rect.height, dpr);
  _drawGridFromCache(ctx, rect.width, rect.height);

  var drawing = false;
  var lastX = 0,
    lastY = 0;

  function getPos(e) {
    var r = canvas.getBoundingClientRect();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function start(e) {
    drawing = true;
    var p = getPos(e);
    lastX = p.x;
    lastY = p.y;
    if (e.cancelable) e.preventDefault();
  }

  function move(e) {
    if (!drawing) return;
    var p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
    if (e.cancelable) e.preventDefault();
  }

  function end(e) {
    drawing = false;
    if (e.cancelable) e.preventDefault();
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", end);
  canvas.addEventListener("mouseleave", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  // resize 防抖
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      _gridCache = null;
      initCanvas();
    }, RESIZE_DEBOUNCE_MS);
  });
}

function _buildGridCache(w, h, dpr) {
  var offscreen = document.createElement("canvas");
  offscreen.width = w * dpr;
  offscreen.height = h * dpr;
  var ctx = offscreen.getContext("2d");
  ctx.scale(dpr, dpr);
  drawGrid(ctx, w, h);
  _gridCache = offscreen;
}

function _drawGridFromCache(ctx, w, h) {
  if (!_gridCache) return;
  ctx.drawImage(_gridCache, 0, 0, w, h);
}

function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = GRID_LINE_WIDTH;

  ctx.strokeRect(0, 0, w, h);

  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();

  ctx.restore();
}

function clearCanvas() {
  var canvas = document.getElementById("writeCanvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.clientWidth;
  var h = canvas.clientHeight;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  if (!_gridCache) _buildGridCache(w, h, dpr);
  _drawGridFromCache(ctx, w, h);
}

document.addEventListener("DOMContentLoaded", function () {
  initCanvas();
  var clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.addEventListener("click", clearCanvas);
});

/**
 * 文件input: 依赖 ../index.html、../css/style.css、../data/dictionary.js、../js/canvas.js、../js/app.js、../js/review.js。
 * 文件output: 生成 ../index-inline.html，将所有外部资源内联为单文件。
 * 文件pos: 在系统局部的地位是构建脚本，负责生成移动设备离线可用的单文件版。
 * 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "index-inline.html");

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf-8");
}

function inline() {
  let html = read("index.html");

  // 1. 内联 CSS
  const css = read("css/style.css");
  html = html.replace(
    /<link rel="stylesheet" href="\.\/css\/style\.css">/,
    "<style>\n" + css + "\n</style>"
  );

  // 2. 内联 JS 文件（保持顺序）
  // 注：index.html 只加载 dictionary-common.js，但内联版额外内置全量 dictionary.js
  // 这样离线版直接拥有全量字库，无需 XHR 请求（file:// 下 XHR 会被拦截）
  const jsFiles = [
    { src: "data/dictionary-common.js", tag: '<script src="./data/dictionary-common.js"></script>' },
    { src: "js/canvas.js", tag: '<script src="./js/canvas.js"></script>' },
    { src: "js/app.js", tag: '<script src="./js/app.js"></script>' },
    { src: "js/review.js", tag: '<script src="./js/review.js"></script>' },
  ];

  for (const item of jsFiles) {
    const js = read(item.src);
    html = html.replace(item.tag, "<script>\n" + js + "\n</script>");
  }

  // 内联版额外注入全量字典（覆盖 window.__DICTIONARY__），离线时无需 XHR
  const fullDictJs = read("data/dictionary.js");
  html = html.replace("</body>", "<script>\n" + fullDictJs + "\n</script>\n</body>");

  fs.writeFileSync(OUT, html, "utf-8");
  console.log(`Generated ${OUT} (${(Buffer.byteLength(html, "utf-8") / 1024).toFixed(1)} KB)`);
}

inline();

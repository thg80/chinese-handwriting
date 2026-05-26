/**
 * 文件input: 依赖同级目录下的 char_base.json、char_detail.json、word.json（来自 chinese-dictionary-main）。
 * 文件output: 生成 ../data/dictionary.json 与 ../data/dictionary.js，每条含 {char, pinyin, frequency, strokes, words[]}。
 * 文件pos: 在系统局部的地位是数据构建脚本，负责将外部原始字库转换为本项目带难度分级的字库格式。
 * 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。
 */

const fs = require("fs");
const path = require("path");

const CHAR_BASE = path.join(__dirname, "..", "chinese-dictionary-main", "character", "char_base.json");
const CHAR_DETAIL = path.join(__dirname, "..", "chinese-dictionary-main", "character", "char_detail.json");
const WORD_FILE = path.join(__dirname, "..", "chinese-dictionary-main", "word", "word.json");
const OUT_JSON = path.join(__dirname, "..", "data", "dictionary.json");
const OUT_JS = path.join(__dirname, "..", "data", "dictionary.js");
const OUT_COMMON_JS = path.join(__dirname, "..", "data", "dictionary-common.js");

function isPureChinese(str) {
  return /^[一-龥]+$/.test(str);
}

/** 读取 NDJSON（每行一个 JSON，行尾可能有逗号） */
function readNdjson(filePath) {
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      result.push(JSON.parse(trimmed.replace(/,$/, "")));
    } catch (e) {
      // ignore malformed lines
    }
  }
  return result;
}

function main() {
  // 1. 解析 char_base.json
  console.log("Reading char_base.json...");
  const baseRecords = readNdjson(CHAR_BASE);
  const charMap = new Map();
  for (const obj of baseRecords) {
    if (obj.char && Array.isArray(obj.pinyin) && obj.pinyin.length > 0) {
      charMap.set(obj.char, {
        char: obj.char,
        pinyin: obj.pinyin[0],
        frequency: typeof obj.frequency === "number" ? obj.frequency : 5,
        strokes: typeof obj.strokes === "number" ? obj.strokes : 1,
        words: [],
      });
    }
  }
  console.log(`  char_base: ${charMap.size} chars`);

  // 2. 解析 char_detail.json，提取每个字的专属例词（保留释义 text）
  console.log("Reading char_detail.json...");
  const detailRecords = readNdjson(CHAR_DETAIL);
  let detailWordsFound = 0;
  for (const obj of detailRecords) {
    const record = charMap.get(obj.char);
    if (!record) continue;
    const seenWords = new Set();
    const explanationsWithWords = [];
    const pronunciations = obj.pronunciations || [];
    for (const pron of pronunciations) {
      for (const exp of pron.explanations || []) {
        const words = [];
        for (const w of exp.words || []) {
          const wordStr = w.word || w;
          const textStr = w.text || "";
          if (typeof wordStr === "string" && isPureChinese(wordStr) && wordStr.length >= 2) {
            words.push({ word: wordStr, text: textStr });
          }
        }
        if (words.length > 0) {
          explanationsWithWords.push({ words, count: words.length });
        }
      }
    }
    // 优先从 words 数量多的 explanation 中取词（义项覆盖面通常更广、更常用）
    explanationsWithWords.sort((a, b) => b.count - a.count);
    const picked = [];
    for (const exp of explanationsWithWords) {
      for (const w of exp.words) {
        if (!seenWords.has(w.word)) {
          seenWords.add(w.word);
          picked.push(w);
          if (picked.length >= 3) break;
        }
      }
      if (picked.length >= 3) break;
    }
    record.words = picked;
    if (record.words.length > 0) detailWordsFound++;
  }
  console.log(`  char_detail provided words for ${detailWordsFound} chars`);

  // 3. 从 word.json 补充例词
  console.log("Reading word.json...");
  const wordData = JSON.parse(fs.readFileSync(WORD_FILE, "utf-8"));
  console.log(`  word.json: ${wordData.length} entries`);
  let wordSupplements = 0;
  for (const entry of wordData) {
    const w = entry.word;
    if (!w || !isPureChinese(w) || w.length < 2) continue;

    for (const ch of w) {
      const record = charMap.get(ch);
      if (record && record.words.length < 3 && !record.words.some(x => x.word === w)) {
        record.words.push({ word: w, text: "" });
        wordSupplements++;
      }
    }
  }
  console.log(`  word.json supplements: ${wordSupplements}`);

  // 4. 按 frequency 分组统计 & 输出
  const result = [];
  const freqCount = {};
  for (const [, record] of charMap) {
    if (record.words.length === 0) continue;
    result.push({
      char: record.char,
      pinyin: record.pinyin,
      frequency: record.frequency,
      strokes: record.strokes,
      words: record.words,
    });
    freqCount[record.frequency] = (freqCount[record.frequency] || 0) + 1;
  }

  console.log(`\nFrequency distribution:`);
  console.log(`  0 (最常用): ${freqCount[0] || 0}`);
  console.log(`  1 (较常用): ${freqCount[1] || 0}`);
  console.log(`  2 (次常用): ${freqCount[2] || 0}`);
  console.log(`  3 (二级字): ${freqCount[3] || 0}`);
  console.log(`  4 (三级字): ${freqCount[4] || 0}`);
  console.log(`  5 (生僻字): ${freqCount[5] || 0}`);
  console.log(`  Total output: ${result.length} chars`);

  // 5. 写入 JSON
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf-8");
  console.log(`\nSaved ${OUT_JSON}`);

  // 6. 写入 JS（内联数据，解决 file:// 下 fetch 被拦截的问题）
  var jsContent = "window.__DICTIONARY__ = " + JSON.stringify(result) + ";\n";
  fs.writeFileSync(OUT_JS, jsContent, "utf-8");
  console.log("Saved " + OUT_JS);

  // 7. 写入常用字子集 JS（freq 0-2，首屏内联加载，~0.5MB 替代 ~1.9MB）
  var commonResult = result.filter(function (r) { return r.frequency <= 2; });
  var commonJsContent = "window.__DICTIONARY__ = " + JSON.stringify(commonResult) + ";\n";
  fs.writeFileSync(OUT_COMMON_JS, commonJsContent, "utf-8");
  console.log("Saved " + OUT_COMMON_JS + " (" + commonResult.length + " chars)");
}

main();

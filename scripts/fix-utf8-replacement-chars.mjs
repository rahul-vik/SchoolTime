import fs from "node:fs";
import path from "node:path";

const DOT = " \u00b7 ";
const EM = " \u2014 ";
const EN = "\u2013";
const TIMES = "\u00d7";
const ARROW = " \u2192 ";
const APOS = "\u2019";

const replacements = [
  // Curly-quote style phrases (opening/closing)
  [/remove the \uFFFDonly these classes\uFFFD limit/g, 'remove the "only these classes" limit'],
  [/reduce fixed \uFFFDonly this period\uFFFD rules/g, 'reduce fixed "only this period" rules'],
  [/soften \uFFFDdo not teach on this day\uFFFD for/g, 'soften "do not teach on this day" for'],
  [/remove \uFFFDdo not use first\/last period\uFFFD/g, 'remove "do not use first/last period"'],
  [/raise \uFFFDmax per day\uFFFD/g, 'raise "max per day"'],
  [/lower \uFFFDfree morning periods\uFFFD/g, 'lower "free morning periods"'],
  [/lower \uFFFDfree evening periods\uFFFD/g, 'lower "free evening periods"'],
  [/relax \uFFFDmax continuous periods\uFFFD/g, 'relax "max continuous periods"'],
  [/each subject\uFFFDs class selection/g, `each subject${APOS}s class selection`],
  [/Teacher\uFFFDsubject assignment/g, `Teacher${EN}subject assignment`],
  [/class\uFFFDsubject/g, `class${EN}subject`],
  [/class\uFFFDsubject rows still/g, `class${EN}subject rows still`],
  [/(\d+) class\uFFFDsubject row/g, `$1 class${EN}subject row`],

  // Specific phrases
  [/\.env \uFFFD otherwise/g, `.env${EM}otherwise`],
  [/best fit \uFFFD still/g, `best fit${EM}still`],
  [/roles \uFFFD extra/g, `roles${EM}extra`],
  [/teacher \uFFFD extra/g, `teacher${EM}extra`],
  [/classes \uFFFD overall/g, `classes${EM}overall`],
  [/cards \uFFFD follow/g, `cards${EM}follow`],
  [/Selected \uFFFD tap/g, `Selected${EM}tap`],
  [/more \uFFFD open Reports \uFFFD Division/g, `more${EM}open Reports${ARROW}Division`],
  [/Ctrl\+Z \(\uFFFDZ\)/g, "Ctrl+Z"],
  [/Quick Add \uFFFD Standards/g, `Quick Add${EM}Standards`],
  [/CT \uFFFD\{/g, `CT ${TIMES}{`],
  [/CT \uFFFD(\d)/g, `CT ${TIMES}$1`],
  [/\uFFFD bar =/g, `${EM}bar =`],
  [/\{" \uFFFD "\}/g, `{"${DOT.trim()}"}`],
  [/<span style=\{\{ color: T\.textSoft \}\}>\uFFFD<\/span>/g, `<span style={{ color: T.textSoft }}>${EM.trim()}</span>`],
  [/teacherFullName\(ctTeacher\)\} \uFFFD class teacher/g, `teacherFullName(ctTeacher)} ${EM.trim()} class teacher`],
  [/\{job\.type\} \uFFFD \{job\.scope/g, `{job.type}${DOT}{job.scope`],

  // Std / Div separators
  [/Std \$\{std\?\.name\} \uFFFD Div/g, `Std \${std?.name}${DOT}Div`],
  [/Std \$\{currentStd\?\.name\} \uFFFD Div/g, `Std \${currentStd?.name}${DOT}Div`],

  // Strict / Optimal / Best fit modes
  [/Strict \uFFFD never/g, `Strict${EM}never`],
  [/Optimal \uFFFD more/g, `Optimal${EM}more`],
  [/Best fit \uFFFD may/g, `Best fit${EM}may`],

  // join with middle dot
  [/"\)\.join\(" \uFFFD "\)/g, `").join("${DOT.trim()}")`],

  // Generic: space-replacement-space -> middle dot
  [/ \uFFFD /g, DOT],
];

function fixFile(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  const before = (s.match(/\uFFFD/g) || []).length;
  if (before === 0) return { filePath, before: 0, after: 0 };

  for (const [re, rep] of replacements) {
    s = s.replace(re, rep);
  }

  const after = (s.match(/\uFFFD/g) || []).length;
  if (after > 0) {
    // Last resort: log remaining lines
    s.split("\n").forEach((line, i) => {
      if (line.includes("\uFFFD")) console.warn(`${filePath}:${i + 1}: ${line.slice(0, 120)}`);
    });
  }

  fs.writeFileSync(filePath, s);
  return { filePath, before, after };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !["node_modules", "dist", ".git"].includes(e.name)) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...walk("src"), ...walk("shared")];
const results = files.map(fixFile).filter((r) => r.before > 0);
console.log(JSON.stringify(results, null, 2));

// The page's pure functions (parse, the ask, a decision, the markdown) under node, without a browser:
//   node todo-site/_test.js              the checks below; exit 1 on a failure
//   node todo-site/_test.js --dump FILE  each open entry's ask as JSON lines (tests/test_todo_asks.py holds
//                                        them to lib/todo_queue.py's answer on the same file)
// The section between "---- markdown" and "---- render" in index.html is evaluated as it ships.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));   // an ES module here (the toolbelt's package.json)
const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const a = page.indexOf('  // ---- markdown'), b = page.indexOf('  // ---- render');
if (a < 0 || b < 0) { console.error('index.html: the markdown section markers are missing'); process.exit(1); }
const api = new Function(page.slice(a, b) + '\nreturn { parse, askOf, deriveAsk, cleanAnswer, numberAnswer, decidedLine, applyDecision, applyCancel, bodyHtml, renderMd, inline, resKind };')();

if (process.argv[2] === '--dump') {
  const text = fs.readFileSync(process.argv[3], 'utf8');
  for (const s of api.parse(text)) for (const it of s.items) {
    if (it.done) continue;
    const k = api.askOf(it);
    console.log(JSON.stringify({ title: it.title, kind: k.kind, options: k.options, recommended: k.recommended, word: k.word, default: k.default, custom: k.custom }));
  }
  process.exit(0);
}

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL ' + msg); } };
const eq = (x, y, msg) => ok(JSON.stringify(x) === JSON.stringify(y), `${msg}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);

const md = [
  '## 1. Q1 — Do immediately', '',
  '- [ ] **P2: what Hosting includes (one word, this week).** One page is false today.',
  '  - **1.** Say "hosting: all" (the recommendation) or "hosting: gate".',
  '  _(Flint, 2026-10-16; repeat_key: decide-hosting-capabilities)_',
  '  <!-- todo: repeat_key=decide-hosting-capabilities; human_reason=entitlement; estimated_minutes=1 -->', '',
  '- [ ] **Refund window: confirm it (1 min).** Five is the draft.',
  '  - **1.** Say "refund window: 5" to keep it, or "refund window: N" for another count.',
  '  <!-- todo: repeat_key=refund-window; ask=number; word=refund window: N; default=5 -->', '',
  '- [ ] **Delete the old token (two minutes).** In the console.',
  '  - **1.** cloud.example.com → Tokens → `old_token_name` → Delete.',
  '  - **Resources:** [shot.png](todo-resources/old-token/shot.png) · [brief.md](todo-resources/old-token/brief.md)',
  '  _(Flint, 2026-10-14)_',
  '  <!-- todo: repeat_key=old-token; ask=do -->', '',
  '- [ ] **Say "commit it" for the loose edits.** _(Flint, 2026-10-21)_',
  '  <!-- todo: repeat_key=commit-loose-edits -->', '',
  '## 2. Q2', '',
];
const text = md.join('\n');
const items = api.parse(text).flatMap((s) => s.items);
eq(items.length, 4, 'four entries');
const [p2, refund, tok, commit] = items;

// the ask: derived, and from the hidden line
let k = api.askOf(p2);
eq([k.kind, k.options, k.recommended, k.custom, k.derived], ['choice', ['hosting: all', 'hosting: gate'], 1, true, true], 'P2 derives a choice, "all" recommended');
k = api.askOf(refund);
eq([k.kind, k.word, k.default], ['number', 'refund window: N', '5'], 'refund is a number with its default');
eq(api.numberAnswer(k, '7'), 'refund window: 7', 'the number goes where N is');
eq(api.askOf(tok).kind, 'do', 'a console task stays a checkbox');
k = api.askOf(commit);
eq([k.kind, k.word], ['word', 'commit it'], 'a title that says Say "…" is one word');

// the body never shows the hidden line, the Decided line or the Resources line as text
const html = api.bodyHtml(tok);
ok(!html.includes('todo:') && !html.includes('&lt;!--'), 'the hidden line is not shown');
ok(!html.includes('Resources:'), 'the resources line is not shown as text');
eq(tok.resources.map((r) => r.path), ['todo-resources/old-token/shot.png', 'todo-resources/old-token/brief.md'], 'resources parsed');
ok(html.includes('class="meta">Flint, 2026-10-14'), 'the who line is the meta');
eq(api.resKind('a/b.PNG'), 'image', 'an image'); eq(api.resKind('a/b.pdf'), 'pdf', 'a pdf'); eq(api.resKind('a/b.md'), 'text', 'a text');

// a decision: above the hidden line, cleaned, never twice
const when = new Date(2026, 9, 21, 15, 4);
const after = api.applyDecision(text, p2.raw, 'hosting: all', when);
const lines = after.split('\n');
const at = lines.indexOf('  - **Decided:** hosting: all _(Taylor, 2026-10-21 15:04, web)_');
ok(at > 0, 'the Decided line is written');
ok(/^\s*<!-- todo:/.test(lines[at + 1]), 'the hidden line stays last');
const again = api.parse(after).flatMap((s) => s.items)[0];
eq([again.decided.answer, again.decided.by, again.decided.acted], ['hosting: all', 'Taylor, 2026-10-21 15:04, web', ''], 'the decision parses back');
let threw = false; try { api.applyDecision(after, p2.raw, 'hosting: gate', when); } catch { threw = true; }
ok(threw, 'an entry is decided once');
eq(api.cleanAnswer('a; b > c -- d\nnext'), 'a b c d next', 'the answer is cleaned like the hidden line');
eq(api.cleanAnswer('x'.repeat(1200)).length, 1200, 'no length cap');
// an entry with no hidden line: the Decided line goes last in the block
const bare = '## 1. Now\n\n- [ ] **Say "go" when ready.**\n  - **1.** Read it.\n\n- [ ] **Next.**\n';
const b2 = api.applyDecision(bare, '- [ ] **Say "go" when ready.**', 'go', when).split('\n');
eq(b2[4], '  - **Decided:** go _(Taylor, 2026-10-21 15:04, web)_', 'no hidden line: after the last continuation line');
const acted = after.replace('estimated_minutes=1 -->', 'estimated_minutes=1; acted=decide-x-1021-1504 -->');
eq(api.parse(acted).flatMap((s) => s.items)[0].decided.acted, 'decide-x-1021-1504', 'acted read from the hidden line');

// a cancellation: ticked, the reason above the hidden line, read back, once
const can = api.applyCancel(text, refund.raw, 'not needed; the window stays five', when);
const cl = can.split('\n');
const ci = cl.indexOf('  - **Cancelled:** not needed the window stays five _(Taylor, 2026-10-21 15:04, web)_');
ok(ci > 0 && /^\s*<!-- todo:/.test(cl[ci + 1]), 'the Cancelled line sits above the hidden line, cleaned');
const rc = api.parse(can).flatMap((s) => s.items)[1];
ok(rc.done && rc.raw.startsWith('- [x] **Refund'), 'a cancelled entry is ticked');
eq([rc.cancelled.reason, rc.cancelled.acted], ['not needed the window stays five', ''], 'the reason parses back');
ok(!api.bodyHtml(rc).includes('Cancelled:'), 'the Cancelled line is not shown as body text');
threw = false; try { api.applyCancel(can, rc.raw, 'again', when); } catch { threw = true; }
ok(threw, 'an entry is cancelled once');
threw = false; try { api.applyCancel(text, refund.raw, '  ', when); } catch { threw = true; }
ok(threw, 'a cancellation needs a reason');
const decidedThenActed = can.replace('default=5 -->', 'default=5; acted=decide-refund-window-1021-1000 -->');
eq(api.parse(decidedThenActed).flatMap((s) => s.items)[1].cancelled.acted, '', "a decision's acted= doesn't file a cancellation");

// the resource renderer: escaped, headings, quotes, tables, lists
const r = api.renderMd('# Title\n\n> Text Patch.\n\n| a | b |\n|---|---|\n| 1 | <b> |\n\n- one\n- two\n\nplain `code` <script>');
ok(r.includes('<h3>Title</h3>') && r.includes('<blockquote>Text Patch.</blockquote>'), 'headings and quotes');
ok(r.includes('<th>a</th>') && r.includes('<td>&lt;b&gt;</td>'), 'tables, escaped');
ok(r.includes('<ul><li>one</li><li>two</li></ul>') && r.includes('<code>code</code>') && !r.includes('<script>'), 'lists, code, nothing raw');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('ok: the page\'s parser, ask, decision and markdown');

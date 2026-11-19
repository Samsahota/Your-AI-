// Renders a Markdown document to a clean A4 PDF: node tools/render-doc.cjs "<file>.md" ["Header text"]
const { execFileSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const src = process.argv[2]; const header = process.argv[3] || '';
const meta = fs.readFileSync(src, 'utf8').match(/^---\n([\s\S]*?)\n---/);
const get = k => (meta && (meta[1].match(new RegExp(`^${k}:\\s*"(.*)"`, 'm')) || [])[1]) || '';
const body = execFileSync('pandoc', [src, '-f', 'markdown', '-t', 'html5'], { encoding: 'utf8' });
const css = `
@page { size: A4; margin: 22mm 20mm 20mm 20mm; }
* { box-sizing: border-box; }
body { font-family: 'Inter', 'Liberation Sans', sans-serif; font-size: 10pt; line-height: 1.5; color: #1f2733; margin: 0; }
.title { font-size: 21pt; font-weight: 700; color: #0f2a4a; letter-spacing: -0.01em; margin: 0 0 4px; }
.subtitle { font-size: 9.5pt; color: #5b6878; margin: 0 0 18px; padding-bottom: 14px; border-bottom: 2px solid #0f2a4a; }
h1, h2 { font-size: 11.5pt; font-weight: 700; color: #0f2a4a; margin: 18px 0 6px; break-after: avoid; }
p { margin: 0 0 7px; }
ul, ol { margin: 0 0 8px; padding-left: 20px; } li { margin: 0 0 3px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9pt; break-inside: avoid; }
th, td { border: 1px solid #c9d1db; padding: 6px 8px; text-align: left; vertical-align: top; }
thead th { background: #0f2a4a; color: #fff; font-weight: 600; }
tbody tr:nth-child(even) td { background: #f5f7fa; }
td:first-child { font-weight: 600; width: 17%; }
.sign { break-inside: avoid; } .newpage { break-before: page; }
.sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; margin-top: 10px; }
.sig { border: 1px solid #c9d1db; border-radius: 4px; padding: 10px 12px; break-inside: avoid; }
.sig-party { font-weight: 700; color: #0f2a4a; margin-bottom: 6px; }
.sig-line { border-bottom: 1px solid #8a95a3; height: 30px; display: flex; align-items: flex-end; font-size: 8pt; color: #8a95a3; padding-bottom: 2px; margin-bottom: 6px; }
.sig-meta { font-size: 9pt; margin-top: 6px; }
.sign table { table-layout: fixed; } .sign td { height: 34px; word-wrap: break-word; font-size: 8.5pt; }
.sign tbody tr:nth-child(even) td { background: none; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<p class="title">${get('title')}</p>${get('subtitle') ? `<p class="subtitle">${get('subtitle')}</p>` : ''}${body}</body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  const out = src.replace(/\.md$/, '.pdf');
  await p.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: `<div style="font-family:Inter,sans-serif;font-size:7.5pt;color:#8a95a3;width:100%;padding:0 20mm;">${header}</div>`,
    footerTemplate: `<div style="font-family:Inter,sans-serif;font-size:7.5pt;color:#8a95a3;width:100%;padding:0 20mm;text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' } });
  await b.close(); console.log(out);
})();

/* Layout containment audit (Playwright): flags any element that spills outside its card, dialog or panel.
   Run: node tools/qa_layout.js */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const CHECK = () => {
  const boxes = '.modal,.card,.kp,.m-card,.ticket,.uncovered,.callout,.dash-story,.acct,.stat-row,.filters,.lane,.sr-item,.email,.radio-card';
  const out = [];
  document.querySelectorAll(boxes).forEach(box => {
    const b = box.getBoundingClientRect(); if (!b.width) return;
    box.querySelectorAll('*').forEach(el => {
      if (el.closest('.table-wrap,.tabs,svg') && !el.matches('.table-wrap,.tabs')) return;
      const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed') return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      if (r.right > b.right + 1.5 || r.left < b.left - 1.5) out.push(`${box.className.split(' ')[0]} > ${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : '').toString().split(' ')[0]} "${(el.innerText || el.value || '').slice(0, 40).replace(/\n/g, ' ')}" overflows by ${Math.round(Math.max(r.right - b.right, b.left - r.left))}px`);
    });
  });
  const d = document.documentElement; if (d.scrollWidth > d.clientWidth + 1) out.push(`page scrolls sideways by ${d.scrollWidth - d.clientWidth}px`);
  return [...new Set(out)].slice(0, 6);
};
const PAGES = ['#/dashboard','#/jobs','#/jobs/model','#/job/TH-001','#/job/TH-001?tab=cost','#/job/TH-001?tab=delivery','#/job/TH-001?tab=sharing','#/job/TH-001?tab=history','#/job/TODAY-01','#/job/TODAY-02','#/ops/today','#/ops/pods','#/ops/actions','#/cash/debtors','#/cash/customers','#/cash/invoices','#/customer/C01','#/customer/C01?tab=contacts','#/customer/C01?tab=payments','#/invoice/INV-264101','#/fleet/vehicles','#/fleet/drivers','#/fleet/compliance','#/fleet/documents','#/document/DOC-01','#/vehicle/V014','#/vehicle/V014?tab=jobs','#/driver/D22','#/driver/D09','#/admin/team','#/admin/connections','#/admin/costmodel','#/admin/activity'];
const MODALS = [`modalDraftRecharge('TH-001')`, `modalProposeCover('TODAY-01')`, `modalRaiseAction()`, `modalRaiseAction('job','TODAY-02','escalate')`, `modalAction('ACT-001')`, `modalFollowUp('CMP-01')`, `modalFollowUp('CMP-02')`, `modalResolveDefect('DEF-001')`, `modalUploadPod('TH-001')`, `modalInvite()`, `modalPlanned('xero-invoice')`, `modalPlanned('conn-vigo')`, `modalEmail('EM-001')`, `modalRigids('TODAY-02')`, `ACT.resetDemo()`];
(async () => {
  const b = await chromium.launch(); let issues = 0, checks = 0; const errs = [];
  const p = await b.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  for (const [uid, label] of [['U01','Director'],['U02','Operations'],['U03','Transport']]) {
    await p.evaluate(() => { Modal.close(); Store.setSession(null); location.hash = '#/signin'; });
    await p.waitForTimeout(100); await p.click(`button.acct[data-id="${uid}"]`); await p.waitForTimeout(150);
    for (const w of [1440, 1024, 768, 390]) {
      await p.setViewportSize({ width: w, height: w > 800 ? 900 : 844 });
      for (const h of PAGES) {
        await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(60); checks++;
        const r = await p.evaluate(CHECK); if (r.length) { issues++; console.log(`[${label} ${w}px] ${h}\n   ` + r.join('\n   ')); }
      }
      if (uid !== 'U01') continue;
      for (const m of MODALS) {
        await p.evaluate(h => location.hash = h, '#/job/TH-001'); await p.waitForTimeout(60);
        await p.evaluate(m => eval(m), m); await p.waitForTimeout(80); checks++;
        const r = await p.evaluate(CHECK); if (r.length) { issues++; console.log(`[Modal ${w}px] ${m}\n   ` + r.join('\n   ')); }
        await p.evaluate(() => Modal.close());
      }
    }
  }
  // phone apps
  for (const [kind, id, pages] of [['staff','U04',['#/driver-app','#/driver-app/job/TODAY-05','#/driver-app/walkaround/TODAY-05','#/driver-app/pod/TODAY-05']],['customer','CT01',['#/portal','#/portal/job/TODAY-05','#/portal/settings']]]) {
    for (const w of [390, 768, 1440]) {
      await p.setViewportSize({ width: w, height: 844 });
      await p.evaluate(([k, i]) => { Store.setSession(k === 'customer' ? { kind:'customer', contactId:i } : { kind:'staff', userId:i }); }, [kind, id]);
      for (const h of pages) { await p.evaluate(h => location.hash = h, h); await p.evaluate(() => render()); await p.waitForTimeout(60); checks++; const r = await p.evaluate(CHECK); if (r.length) { issues++; console.log(`[${kind} ${w}px] ${h}\n   ` + r.join('\n   ')); } }
    }
  }
  await p.evaluate(() => { Store.setSession(null); location.hash = '#/mailbox'; render(); });
  for (const w of [390, 1440]) { await p.setViewportSize({ width: w, height: 844 }); for (const h of ['#/signin', '#/mailbox']) { await p.evaluate(h => { location.hash = h; }, h); await p.waitForTimeout(80); checks++; const r = await p.evaluate(CHECK); if (r.length) { issues++; console.log(`[public ${w}px] ${h}\n   ` + r.join('\n   ')); } } }
  console.log(`\n${checks} screens checked · ${issues} with layout issues · ${errs.length} script errors ${errs.join(' | ')}`);
  await b.close();
})();

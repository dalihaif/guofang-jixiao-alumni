/* 后台管理功能自检：登录管理员 → 逐页签渲染 → 增/改/查/批量 全流程
   用法：先起服务（本地静态或 Flask 后端），再 node tools/check-admin.js [端口|完整地址]
   例：node tools/check-admin.js 8099
       node tools/check-admin.js 5051（Flask 后端）
       node tools/check-admin.js https://dalihaif.github.io/guofang-jixiao-alumni（线上） */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const ARG = process.argv[2] || '8099';
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/+$/, '') : 'http://127.0.0.1:' + ARG;
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

let bad = 0;
const ok = (t, v) => { console.log((v ? '  ✅ ' : '  ❌ ') + t); if (!v) bad++; };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => {
    // 静态托管时 /api/ping 必然 404，属正常探测
    if (m.type() === 'error' && !/api\/ping|404|Failed to load resource/.test(m.text())) errs.push(m.text());
  });
  page.on('dialog', async d => { await d.accept(); });

  const ready = () => page.waitForSelector('body.ready', { timeout: 10000 }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- 登录管理员 ----------
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle2' });
  await ready();
  console.log('模式：' + await page.evaluate(() => window.Store.API.on ? '服务器' : '本地'));
  await page.evaluate(async () => { await window.Store.Auth.login('admin', 'admin888'); });
  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle2' });
  await ready();
  ok('管理员登录后可进入后台', await page.evaluate(() => !!document.getElementById('adminTabs')));

  // ---------- 七个页签逐个渲染 ----------
  const tabs = ['msgs', 'photos', 'users', 'claim', 'logs', 'data', 'sys'];
  for (const t of tabs) {
    await page.evaluate(k => document.querySelector('[data-tab="' + k + '"]').click(), t);
    await wait(250);
    const info = await page.evaluate(() => {
      const p = document.querySelector('[data-slot=panel]');
      return { len: p.innerText.trim().length, rows: p.querySelectorAll('tbody tr').length };
    });
    ok('页签[' + t + '] 渲染正常（文字' + info.len + '字 / 表格' + info.rows + '行）', info.len > 20);
    await page.screenshot({ path: path.join(OUT, 'admin-' + t + '.png') });
  }

  // ---------- 用户管理：新增账号 ----------
  await page.evaluate(() => document.querySelector('[data-tab="users"]').click());
  await wait(200);
  const before = await page.evaluate(() => window.Store.Users.all().length);

  await page.evaluate(() => document.querySelector('[data-a="newuser"]').click());
  await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
  await page.type('.modal-body [name=name]', '后台测试甲');
  await page.type('.modal-body [name=user]', 'admintest1');
  await page.type('.modal-body [name=pass]', 'test123456');
  await page.evaluate(() => document.querySelector('.modal-ok').click());
  await wait(900);
  const after = await page.evaluate(() => window.Store.Users.all().length);
  ok('后台代注册新增账号（' + before + ' → ' + after + '）', after === before + 1);

  // ---------- 用户管理：编辑资料 ----------
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const r = rows.find(x => x.innerText.indexOf('后台测试甲') >= 0);
    r.querySelector('[data-a="editu"]').click();
  });
  await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
  await page.evaluate(() => {
    const el = document.querySelector('.modal-body [name=name]');
    el.value = '后台测试甲改';
    const intro = document.querySelector('.modal-body [name=intro]');
    intro.value = '由自检脚本写入的简介';
  });
  await page.evaluate(() => document.querySelector('.modal-ok').click());
  await wait(900);
  ok('编辑账号资料生效', await page.evaluate(
    () => window.Store.Users.all().some(u => u.name === '后台测试甲改' && u.intro === '由自检脚本写入的简介')));

  // ---------- 用户管理：重置密码 ----------
  const uid = await page.evaluate(() => {
    const u = window.Store.Users.all().find(x => x.user === 'admintest1');
    return u ? u.id : '';
  });
  await page.evaluate(id => {
    document.querySelector('[data-a="passu"][data-id="' + id + '"]').click();
  }, uid);
  await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
  await page.type('.modal-body [name=p1]', 'newpass888');
  await page.type('.modal-body [name=p2]', 'newpass888');
  await page.evaluate(() => document.querySelector('.modal-ok').click());
  await wait(900);
  ok('重置密码后可用新密码登录', await page.evaluate(async () => {
    await window.Store.Auth.logout();
    const r = await window.Store.Auth.login('admintest1', 'newpass888');
    await window.Store.Auth.logout();
    await window.Store.Auth.login('admin', 'admin888');
    return !!r.ok;
  }));

  // ---------- 搜索 + 筛选 ----------
  await page.evaluate(() => document.querySelector('[data-tab="users"]').click());
  await wait(200);
  await page.type('[data-f="users-q"]', '后台测试甲改');
  await wait(700);
  const filtered = await page.evaluate(
    () => document.querySelectorAll('tbody tr').length);
  ok('用户搜索能过滤（命中 ' + filtered + ' 行）', filtered === 1);
  await page.evaluate(() => {
    const el = document.querySelector('[data-f="users-q"]');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(700);

  // ---------- 批量：勾选 → 停用 ----------
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const r = rows.find(x => x.innerText.indexOf('后台测试甲改') >= 0);
    r.querySelector('input[data-a="pick"]').click();
  });
  await wait(200);
  const bulkShown = await page.evaluate(() => {
    const b = document.querySelector('[data-bulk="users"]');
    return b && !b.classList.contains('hide') ? b.querySelector('.n').textContent : '0';
  });
  ok('勾选后批量条出现（已选 ' + bulkShown + '）', bulkShown === '1');
  await page.evaluate(() => document.querySelector('[data-a="bulk"][data-act="banned"]').click());
  await wait(900);
  ok('批量停用生效', await page.evaluate(
    () => window.Store.Users.all().some(u => u.user === 'admintest1' && u.status === 'banned')));

  // ---------- 留言：查看 / 修改 ----------
  await page.evaluate(() => document.querySelector('[data-tab="msgs"]').click());
  await wait(250);
  const msgId = await page.evaluate(() => {
    const m = window.Store.Msgs.all()[0];
    return m ? m.id : '';
  });
  if (msgId) {
    await page.evaluate(id => document.querySelector('[data-a="edit"][data-id="' + id + '"]').click(), msgId);
    await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
    await page.evaluate(() => { document.querySelector('.modal-body [name=text]').value = '【自检改写】这条留言被后台改过。'; });
    await page.evaluate(() => document.querySelector('.modal-ok').click());
    await wait(900);
    ok('后台修改留言正文生效', await page.evaluate(id => {
      const m = window.Store.Msgs.all().find(x => x.id === id);
      return m && m.text.indexOf('【自检改写】') === 0;
    }, msgId));

    await page.evaluate(id => document.querySelector('[data-a="view"][data-id="' + id + '"]').click(), msgId);
    await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
    const viewTxt = await page.evaluate(() => document.querySelector('.modal-body .msg-full').innerText);
    ok('查看留言能看到完整内容', viewTxt.indexOf('【自检改写】') >= 0);
    await page.evaluate(() => document.querySelector('.modal-ok').click());
    await wait(300);
  }

  // ---------- 照片：修改信息 ----------
  await page.evaluate(() => document.querySelector('[data-tab="photos"]').click());
  await wait(250);
  const pid = await page.evaluate(() => {
    const p = window.Store.Photos.all()[0];
    return p ? p.id : '';
  });
  if (pid) {
    await page.evaluate(id => document.querySelector('[data-a="editp"][data-id="' + id + '"]').click(), pid);
    await page.waitForSelector('.modal-mask.on', { timeout: 5000 });
    await page.evaluate(() => {
      document.querySelector('.modal-body [name=title]').value = '【自检改名】照片';
      document.querySelector('.modal-body [name=year]').value = '1993';
    });
    await page.evaluate(() => document.querySelector('.modal-ok').click());
    await wait(900);
    ok('修改照片信息生效', await page.evaluate(id => {
      const p = window.Store.Photos.all().find(x => x.id === id);
      return p && p.title === '【自检改名】照片' && p.year === '1993';
    }, pid));
  }

  // ---------- 系统设置：注册开关 ----------
  await page.evaluate(() => document.querySelector('[data-tab="sys"]').click());
  await wait(250);
  await page.evaluate(() => document.querySelector('[data-a="togreg"]').click());
  await wait(800);
  const closed = await page.evaluate(() => window.Store.Settings.all().openRegister === false);
  ok('关闭自助注册生效', closed);
  if (closed) {
    const reg = await page.evaluate(async () => {
      await window.Store.Auth.logout();
      const r = await window.Store.Auth.register({
        name: '自助注册测试', user: 'zzz1', pass: 'abc123456', cls: '钳工七班', enroll: '1992'
      });
      await window.Store.Auth.login('admin', 'admin888');
      return r;
    });
    ok('关闭后自助注册被拦下', reg.ok === false);
    await page.evaluate(() => document.querySelector('[data-a="togreg"]').click());
    await wait(800);
  }

  // ---------- 清理测试数据 ----------
  await page.evaluate(() => {
    const u = window.Store.Users.all().find(x => x.user === 'admintest1');
    if (u) window.Store.Users.remove(u.id);
  });
  await wait(600);

  console.log('\n  JS 报错：' + (errs.length ? errs.join(' | ') : '无'));
  if (errs.length) bad++;
  console.log('  有问题的检查项：' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();

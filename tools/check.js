/* 站点自检脚本：用无头浏览器逐页打开，收集控制台错误 / 页面异常 / 关键元素数量，并截图 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['index',    'index.html'],
  ['roster',   'roster.html'],
  ['album',    'album.html'],
  ['messages', 'messages.html'],
  ['stories',  'stories.html'],
  ['article',  'article.html?id=a04'],
  ['about',    'about.html'],
  ['login',    'login.html'],
  ['register', 'register.html'],
  ['profile',  'profile.html'],
  ['admin',    'admin.html']
];
const MOBILE = ['index.html', 'roster.html', 'album.html', 'messages.html', 'stories.html'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,1000']
  });
  let bad = 0;

  for (const [name, url] of PAGES) {
    const page = await browser.newPage();
    const errs = [], warns = [];
    page.on('console', m => {
      if (m.type() === 'error') errs.push('[console] ' + m.text());
      if (m.type() === 'warning') warns.push(m.text());
    });
    page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
    page.on('requestfailed', r => {
      const u = r.url();
      if (/\.(css|js|jpg|png|svg|mp3|mp4)/.test(u)) errs.push('[404?] ' + u.split('/').slice(-2).join('/'));
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(BASE + '/' + url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 700));

    const info = await page.evaluate(() => ({
      title: document.title,
      nav: document.querySelectorAll('.nav > a').length,
      header: !!document.querySelector('.site-header'),
      footer: !!document.querySelector('.site-footer'),
      members: document.querySelectorAll('.member').length,
      photos: document.querySelectorAll('.photo').length,
      posts: document.querySelectorAll('.post').length,
      arts: document.querySelectorAll('.art-list-item').length,
      tl: document.querySelectorAll('.tl-item').length,
      roll: document.querySelectorAll('.roll-item').length,
      carousel: document.querySelectorAll('.carousel-stage img').length,
      stats: document.querySelectorAll('.hero-stat .it').length,
      bodyLen: document.body.innerText.trim().length
    }));

    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
    const flag = errs.length ? 'ERR' : ' ok';
    if (errs.length) bad++;
    console.log(`[${flag}] ${name.padEnd(9)} nav=${info.nav} hdr=${info.header ? 1 : 0} ftr=${info.footer ? 1 : 0}` +
      ` member=${info.members} photo=${info.photos} post=${info.posts} art=${info.arts} tl=${info.tl}` +
      ` roll=${info.roll} carousel=${info.carousel} stat=${info.stats} txt=${info.bodyLen}`);
    if (errs.length) errs.slice(0, 6).forEach(e => console.log('        ! ' + e));
    await page.close();
  }

  /* 移动端截图 */
  for (const url of MOBILE) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    await page.goto(BASE + '/' + url, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(OUT, 'm-' + url.replace('.html', '') + '.png') });
    await page.close();
  }

  /* ---------- 功能流程测试：注册 → 认领 → 留言 → 审核 ---------- */
  console.log('\n---- 功能流程测试 ----');
  const p = await browser.newPage();
  p.on('pageerror', e => console.log('  流程报错: ' + e.message));
  await p.goto(BASE + '/register.html', { waitUntil: 'networkidle2' });
  await p.type('[name=name]', '测试同学');
  await p.type('[name=enroll]', '1992');
  await p.type('[name=cls]', '钳工七班');
  await p.type('[name=user]', 'testuser1');
  await p.type('[name=pass]', 'abc123456');
  await p.type('[name=pass2]', 'abc123456');
  await p.click('[name=agree]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('#regForm button[type=submit]')]);
  console.log('  注册后跳转: ' + p.url().split('/').pop() +
    '  (登录态: ' + await p.evaluate(() => !!window.Store.Auth.cur()) + ')');

  await p.goto(BASE + '/messages.html', { waitUntil: 'networkidle2' });
  await p.type('[name=text]', '测试留言：这是自动化测试提交的内容。');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), p.click('#msgForm button[type=submit]')]);
  await new Promise(r => setTimeout(r, 500));
  console.log('  提交留言后页面待审核数: ' + await p.evaluate(() => window.Store.Msgs.count().pending));
  console.log('  表单是否已清空: ' + await p.evaluate(() => document.querySelector('[name=text]').value === ''));

  await p.goto(BASE + '/messages.html?mine=1', { waitUntil: 'networkidle2' });
  console.log('  我的留言条数: ' + await p.evaluate(() => document.querySelectorAll('.post').length));

  // 认领
  await p.goto(BASE + '/roster.html', { waitUntil: 'networkidle2' });
  p.on('dialog', async d => { await d.accept(); });
  const claimed = await p.evaluate(() => {
    const b = document.querySelector('[data-claim]');
    if (!b) return 'no-button';
    b.click(); return 'clicked';
  });
  await new Promise(r => setTimeout(r, 500));
  console.log('  认领操作: ' + claimed + ' → 已认领数 ' +
    await p.evaluate(() => window.Store.Members.all().filter(m => m.ownerId).length));

  // 管理后台审核
  await p.evaluate(() => window.Store.Auth.logout());
  await p.goto(BASE + '/login.html', { waitUntil: 'networkidle2' });
  if (await p.$('#loginForm')) {
    await p.type('[name=user]', 'admin');
    await p.type('[name=pass]', 'admin888');
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('#loginForm button[type=submit]')]);
  }
  console.log('  管理员登录: ' + p.url().split('/').pop() +
    '  isAdmin=' + await p.evaluate(() => window.Store.Auth.isAdmin()));
  const adm = await p.evaluate(() => ({
    stat: document.querySelectorAll('.stat-box').length,
    tabs: document.querySelectorAll('#adminTabs button').length,
    rows: document.querySelectorAll('.table tbody tr').length,
    pendingOkBtn: document.querySelectorAll('[data-a=ok]').length
  }));
  console.log('  后台：统计块=' + adm.stat + ' 选项卡=' + adm.tabs + ' 待处理行=' + adm.rows + ' 通过按钮=' + adm.pendingOkBtn);
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(OUT, 'admin-tab.png') });

  // 点通过
  if (adm.pendingOkBtn) {
    await p.evaluate(() => document.querySelector('[data-a=ok]').click());
    await new Promise(r => setTimeout(r, 400));
    console.log('  点"通过"后待审核留言: ' + await p.evaluate(() => window.Store.Msgs.count().pending));
  }
  // 切到照片审核
  await p.evaluate(() => document.querySelector('[data-tab=photos]').click());
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(OUT, 'admin-photos.png') });
  await p.evaluate(() => document.querySelector('[data-tab=data]').click());
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(OUT, 'admin-data.png') });

  await p.close();
  await browser.close();
  console.log('\n截图目录: ' + OUT + '   有错误的页面数: ' + bad);
})();

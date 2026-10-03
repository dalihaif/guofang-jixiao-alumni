/* 线上站点验证：直接跑 GitHub Pages 的公开地址 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE = 'https://dalihaif.github.io/guofang-jixiao-alumni';

const PAGES = ['index.html','roster.html','album.html','messages.html','stories.html',
  'article.html?id=a04','about.html','login.html','register.html','profile.html','admin.html'];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage'] });
  let bad = 0;
  for (const p of PAGES) {
    const pg = await b.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.goto(`${BASE}/${p}`, { waitUntil: 'networkidle2', timeout: 40000 });
    await new Promise(r => setTimeout(r, 500));
    const i = await pg.evaluate(() => ({
      nav: document.querySelectorAll('.nav > a').length,
      member: document.querySelectorAll('.member').length,
      photo: document.querySelectorAll('.photo').length,
      post: document.querySelectorAll('.post').length,
      art: document.querySelectorAll('.art-list-item').length,
      tl: document.querySelectorAll('.tl-item').length,
      carousel: document.querySelectorAll('.carousel-stage img').length
    }));
    if (errs.length) bad++;
    console.log(`[${errs.length ? 'ERR' : ' ok'}] ${p.padEnd(22)} nav=${i.nav} member=${i.member} photo=${i.photo} post=${i.post} art=${i.art} tl=${i.tl} carousel=${i.carousel}`);
    errs.slice(0, 3).forEach(e => console.log('      ! ' + e));
    await pg.close();
  }
  // 线上全流程
  const p = await b.newPage();
  p.on('dialog', async d => d.accept());
  await p.goto(`${BASE}/register.html`, { waitUntil: 'networkidle2' });
  await p.type('[name=name]','线上测试'); await p.type('[name=enroll]','1992');
  await p.type('[name=cls]','钳工七班'); await p.type('[name=user]','livetest9');
  await p.type('[name=pass]','abc123456'); await p.type('[name=pass2]','abc123456');
  await p.click('[name=agree]');
  await Promise.all([p.waitForNavigation({ waitUntil:'networkidle2' }), p.click('#regForm button[type=submit]')]);
  console.log('  注册→' + p.url().split('/').pop() + '  登录态=' + await p.evaluate(() => !!window.Store.Auth.cur()));
  await p.goto(`${BASE}/messages.html`, { waitUntil:'networkidle2' });
  await p.type('[name=text]','线上功能验证留言');
  await p.click('#msgForm button[type=submit]');
  await new Promise(r => setTimeout(r, 600));
  console.log('  留言待审核数=' + await p.evaluate(() => window.Store.Msgs.count().pending));
  await p.evaluate(() => window.Store.Auth.logout());
  await p.goto(`${BASE}/login.html`, { waitUntil:'networkidle2' });
  await p.type('[name=user]','admin'); await p.type('[name=pass]','admin888');
  await Promise.all([p.waitForNavigation({ waitUntil:'networkidle2' }), p.click('#loginForm button[type=submit]')]);
  console.log('  管理员登录→' + p.url().split('/').pop() + '  isAdmin=' + await p.evaluate(() => window.Store.Auth.isAdmin()));
  await p.screenshot({ path: __dirname + '/live.png' });
  await p.close(); await b.close();
  console.log('\n有 JS 报错的页面数: ' + bad);
})();

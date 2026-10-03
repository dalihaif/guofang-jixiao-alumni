/* 后端模式端到端测试：
   用两个完全独立的浏览器上下文（模拟两位同学）验证数据是否真的共享。
   用法：先启动 python server/app.py，再 node tools/check-server.js            */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:5000';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newUser(browser, name, account) {
  const ctx = await browser.createBrowserContext();   // 独立 cookie / localStorage
  const p = await ctx.newPage();
  p.on('dialog', async d => d.accept());
  p.on('pageerror', e => console.log('   [pageerror]', e.message));
  await p.goto(BASE + '/register.html', { waitUntil: 'networkidle2' });
  await p.type('[name=name]', name);
  await p.type('[name=enroll]', '1992');
  await p.type('[name=cls]', '钳工七班');
  await p.type('[name=user]', account);
  await p.type('[name=pass]', 'abc123456');
  await p.type('[name=pass2]', 'abc123456');
  await p.click('[name=agree]');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle2' }), p.click('#regForm button[type=submit]')]);
  return { ctx, p, name, account };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  /* ---- 0. 模式识别 ---- */
  const p0 = await browser.newPage();
  await p0.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });
  await sleep(800);
  console.log('[0] 运行模式：' + await p0.evaluate(() => (window.Store.API.on ? '服务器模式 ✅' : '本地模式 ❌')) +
    '　名录条数=' + await p0.evaluate(() => window.Store.Members.all().length) +
    '　照片=' + await p0.evaluate(() => window.Store.Photos.all().length));
  await p0.close();

  /* ---- 1. 同学A 注册并留言 ---- */
  const A = await newUser(browser, '甲同学', 'user_a_' + Date.now());
  console.log('[1] A 注册后：' + A.p.url().split('/').pop() +
    '　登录=' + await A.p.evaluate(() => !!window.Store.Auth.cur()));

  await A.p.goto(BASE + '/messages.html', { waitUntil: 'networkidle2' });
  await A.p.type('[name=text]', '甲同学的测试留言：好久不见，大家都好吗？');
  await A.p.click('#msgForm button[type=submit]');
  await sleep(1200);
  console.log('[2] A 留言后，全站待审核数=' + await A.p.evaluate(() => window.Store.Msgs.count().pending));

  /* ---- 2. 同学B 此时应该看不到（待审核） ---- */
  const B = await newUser(browser, '乙同学', 'user_b_' + Date.now());
  await B.p.goto(BASE + '/messages.html', { waitUntil: 'networkidle2' });
  await sleep(600);
  const bSeesBefore = await B.p.evaluate(() => document.querySelectorAll('.post').length);
  console.log('[3] B 看到的公开留言数（应不含A的待审核）=' + bSeesBefore);

  /* ---- 3. 管理员审核通过 ---- */
  const adm = await browser.createBrowserContext();
  const pa = await adm.newPage();
  pa.on('dialog', async d => d.accept());
  await pa.goto(BASE + '/login.html', { waitUntil: 'networkidle2' });
  await pa.type('[name=user]', 'admin');
  await pa.type('[name=pass]', 'admin888');
  await Promise.all([pa.waitForNavigation({ waitUntil: 'networkidle2' }), pa.click('#loginForm button[type=submit]')]);
  console.log('[4] 管理员登录：' + pa.url().split('/').pop() +
    '　isAdmin=' + await pa.evaluate(() => window.Store.Auth.isAdmin()));
  const okBtn = await pa.evaluate(() => {
    const b = document.querySelector('[data-a=ok]');
    if (!b) return 0; b.click(); return 1;
  });
  await sleep(1500);
  console.log('[5] 管理员点了' + okBtn + '个"通过"，剩余待审核=' + await pa.evaluate(() => window.Store.Msgs.count().pending));
  await pa.screenshot({ path: __dirname + '/srv-admin.png' });

  /* ---- 4. 同学B 刷新后应能看到 ---- */
  await B.p.goto(BASE + '/messages.html', { waitUntil: 'networkidle2' });
  await sleep(800);
  const bSeesAfter = await B.p.evaluate(() => document.querySelectorAll('.post').length);
  const hasA = await B.p.evaluate(() =>
    Array.from(document.querySelectorAll('.post-body')).some(e => e.innerText.includes('甲同学的测试留言')));
  console.log('[6] B 刷新后公开留言数=' + bSeesAfter + '　能看到A的留言=' + (hasA ? '是 ✅' : '否 ❌'));

  /* ---- 5. 认领 + 隐私开关 ---- */
  await A.p.goto(BASE + '/roster.html', { waitUntil: 'networkidle2' });
  await A.p.evaluate(() => { const b = document.querySelector('[data-claim]'); if (b) b.click(); });
  await sleep(1200);
  await A.p.goto(BASE + '/profile.html', { waitUntil: 'networkidle2' });
  await sleep(600);
  await A.p.type('[name=phone]', '13800001111');
  await A.p.type('[name=addr]', '云南省昆明市');
  await A.p.click('#profileForm button[type=submit]');
  await sleep(1500);
  const phoneHidden = await A.p.evaluate(() => {
    const m = window.Store.Members.byOwner(window.Store.Auth.cur().id);
    return m ? { phone: m.phone, show: m.showPhone } : null;
  });
  console.log('[7] A 填写手机号后：已保存=' + (phoneHidden && phoneHidden.phone) +
    '　是否公开展示=' + (phoneHidden && phoneHidden.show) + '（应为 false，默认不公开）');

  // 打开开关
  await A.p.click('[name=showPhone]');
  await A.p.click('#profileForm button[type=submit]');
  await sleep(1500);
  await A.p.goto(BASE + '/roster.html', { waitUntil: 'networkidle2' });
  await sleep(600);
  console.log('[8] 打开开关后，B 侧能否看到手机号：' + await (async () => {
    const bp = B.p;
    await bp.goto(BASE + '/roster.html', { waitUntil: 'networkidle2' });
    await sleep(700);
    return await bp.evaluate(() => document.body.innerText.includes('13800001111') ? '能看到 ✅' : '看不到 ❌');
  })());

  /* ---- 6. 照片上传（走后端落盘） ---- */
  await A.p.goto(BASE + '/album.html', { waitUntil: 'networkidle2' });
  const uploaded = await A.p.evaluate(async () => {
    // 生成一张 1x1 的测试图片 dataURL
    const c = document.createElement('canvas'); c.width = 60; c.height = 40;
    const g = c.getContext('2d'); g.fillStyle = '#4B6043'; g.fillRect(0, 0, 60, 40);
    const r = await window.Store.Photos.add({
      cat: 'recent', src: c.toDataURL('image/jpeg', 0.8), title: '后端上传测试图',
      year: '2026 年', desc: '自动化脚本生成', uploader: '甲同学', userId: window.Store.Auth.cur().id
    });
    return r.ok ? 'OK' : 'FAIL';
  });
  await sleep(1200);
  const photoInfo = await A.p.evaluate(() => {
    const p = window.Store.Photos.all().filter(x => x.title === '后端上传测试图')[0];
    return p ? { src: p.src, status: p.status } : null;
  });
  console.log('[9] 照片上传=' + uploaded + '　存储位置=' + (photoInfo ? photoInfo.src : '-') +
    '　状态=' + (photoInfo ? photoInfo.status : '-') +
    (photoInfo && photoInfo.src.indexOf('/uploads/') === 0 ? ' ✅ 已落盘' : ' ❌ 未落盘'));

  await A.p.close(); await B.p.close(); await pa.close();
  await browser.close();
  console.log('\n---- 测试结束 ----');
})();

/* ==========================================================================
   ui.js —— 公共界面组件（页头导航 / 页脚 / 提示 / 弹窗 / 灯箱）
   每个页面只需 <body data-page="xxx">，本文件会自动注入导航和页脚。
   修改导航菜单：直接改下面 NAV 数组即可（全站同步生效）。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ 导航菜单 ------------------------------ */
  var NAV = [
    { k: 'home',     t: '首页',     h: 'index.html' },
    { k: 'roster',   t: '同窗名录', h: 'roster.html' },
    { k: 'album',    t: '岁月相册', h: 'album.html' },
    { k: 'messages', t: '留言板',   h: 'messages.html' },
    { k: 'stories',  t: '校园往事', h: 'stories.html' },
    { k: 'about',    t: '关于本站', h: 'about.html' }
  ];

  var S = window.SITE || {};

  /* ------------------------------ 工具函数 ------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 把 **重点** 语法渲染成 <strong>（先转义再替换，避免 XSS） */
  function rich(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  /* 头像文字：取姓氏（中文习惯），去掉"（外号）"之类的后缀 */
  function initial(name) {
    if (!name) return '同';
    return String(name).replace(/[（(].*$/, '').trim().slice(0, 1) || '同';
  }
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.innerHTML = esc(msg);
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2400);
  }
  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function statusTag(st) {
    if (st === 'approved') return '<span class="tag tag-ok">已通过审核</span>';
    if (st === 'pending')  return '<span class="tag tag-warn">待管理员审核</span>';
    if (st === 'rejected') return '<span class="tag tag-danger">未通过</span>';
    return '';
  }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 220);
    };
  }
  /* 图片压缩：把用户选择的图片缩到最长边 max，转 dataURL（避免本地存储爆掉） */
  function compressImage(file, max, quality) {
    max = max || 1280; quality = quality || 0.76;
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('不是图片文件'));
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height, r = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.round(w * r); c.height = Math.round(h * r);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { reject(new Error('图片读取失败')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsDataURL(file);
    });
  }

  /* ------------------------------ 注入页头 ------------------------------ */
  function buildHeader(active) {
    var u = window.Store.Auth.cur();
    var links = NAV.map(function (n) {
      return '<a href="' + n.h + '"' + (n.k === active ? ' class="active"' : '') + '>' + n.t + '</a>';
    }).join('');

    var right = u
      ? '<div class="nav-user">' +
          '<span class="who">' + esc(u.name) + (u.role === 'admin' ? ' · 管理员' : '') + '</span>' +
          '<a href="profile.html">我的资料</a>' +
          (u.role === 'admin' ? '<a href="admin.html">管理后台</a>' : '') +
          '<a href="#" data-act="logout">退出</a>' +
        '</div>'
      : '<div class="nav-user"><a href="login.html">登录</a><a href="register.html">注册</a></div>';

    return '' +
      '<header class="site-header">' +
        '<div class="header-inner">' +
          '<a class="brand" href="index.html">' +
            '<span class="brand-mark">国防</span>' +
            '<span class="brand-text">' +
              '<span class="brand-title">' + esc(S.name || '同学录') + '</span><br>' +
              '<span class="brand-sub">' + esc(S.school || '') + ' · ' + esc(S.years || '') + '</span>' +
            '</span>' +
          '</a>' +
          '<button class="nav-toggle" type="button" aria-label="展开菜单">☰ 菜单</button>' +
          '<nav class="nav" id="mainNav">' + links + right + '</nav>' +
        '</div>' +
      '</header>';
  }

  /* ------------------------------ 注入页脚 ------------------------------ */
  function buildFooter() {
    var y = new Date().getFullYear();
    return '' +
      '<footer class="site-footer">' +
        '<div class="wrap">' +
          '<div class="footer-top">' +
            '<div class="footer-brand">' +
              '<div class="bt">' + esc(S.name || '同学录') + '</div>' +
              '<div class="bs">' + esc(S.school || '') + ' · ' + esc(S.className || '') +
                '（' + esc(S.years || '') + '）</div>' +
              '<div class="bs">' + esc(S.motto || '') + '</div>' +
            '</div>' +
            '<div class="footer-links">' +
              '<div class="footer-col"><h4>栏目</h4>' +
                NAV.map(function (n) { return '<a href="' + n.h + '">' + n.t + '</a>'; }).join('') +
              '</div>' +
              '<div class="footer-col"><h4>同学服务</h4>' +
                '<a href="login.html">登录</a>' +
                '<a href="register.html">注册（需填写届别班级）</a>' +
                '<a href="profile.html">我的资料 · 隐私设置</a>' +
                '<a href="messages.html?mine=1">我的留言</a>' +
              '</div>' +
              '<div class="footer-col"><h4>站点说明</h4>' +
                '<a href="about.html">关于本站</a>' +
                '<a href="about.html#privacy">隐私约定</a>' +
                '<a href="about.html#disclaimer">免责声明</a>' +
                '<a href="about.html#help">使用帮助</a>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<span>© ' + (S.years || '') + '—' + y + ' ' + esc(S.name || '') + '　·　本网站为校友民间自建，非学校官方网站</span>' +
            '<span class="warn">个人信息自愿填写 · 联系方式默认不公开 · 所有内容经管理员审核后展示</span>' +
          '</div>' +
        '</div>' +
      '</footer>';
  }

  /* ------------------------------ 灯箱（相册用） ------------------------ */
  var LB = {
    list: [], idx: 0,
    open: function (list, i) {
      LB.list = list; LB.idx = i;
      var el = document.getElementById('lightbox');
      if (!el) {
        el = document.createElement('div');
        el.id = 'lightbox'; el.className = 'lightbox';
        el.innerHTML =
          '<button class="lb-close" type="button" aria-label="关闭">✕</button>' +
          '<button class="lb-nav prev" type="button" aria-label="上一张">‹</button>' +
          '<img alt="">' +
          '<button class="lb-nav next" type="button" aria-label="下一张">›</button>' +
          '<div class="lb-cap"><div class="t"></div><div class="m"></div></div>';
        document.body.appendChild(el);
        el.querySelector('.lb-close').onclick = LB.close;
        el.querySelector('.lb-nav.prev').onclick = function (e) { e.stopPropagation(); LB.go(-1); };
        el.querySelector('.lb-nav.next').onclick = function (e) { e.stopPropagation(); LB.go(1); };
        el.addEventListener('click', function (e) { if (e.target === el) LB.close(); });
        document.addEventListener('keydown', function (e) {
          if (!el.classList.contains('on')) return;
          if (e.key === 'Escape') LB.close();
          if (e.key === 'ArrowLeft') LB.go(-1);
          if (e.key === 'ArrowRight') LB.go(1);
        });
      }
      el.classList.add('on');
      LB.render();
      document.body.style.overflow = 'hidden';
    },
    render: function () {
      var p = LB.list[LB.idx]; if (!p) return;
      var el = document.getElementById('lightbox');
      el.querySelector('img').src = p.src;
      el.querySelector('.lb-cap .t').textContent = p.title || '';
      el.querySelector('.lb-cap .m').textContent =
        [p.year, Photos_catName(p.cat), p.uploader ? '由 ' + p.uploader + ' 提供' : '']
          .filter(Boolean).join('　·　') + '　（' + (LB.idx + 1) + ' / ' + LB.list.length + '）';
    },
    go: function (d) {
      LB.idx = (LB.idx + d + LB.list.length) % LB.list.length;
      LB.render();
    },
    close: function () {
      var el = document.getElementById('lightbox');
      if (el) el.classList.remove('on');
      document.body.style.overflow = '';
    }
  };
  function Photos_catName(k) {
    var c = window.Store.Photos.cats.filter(function (x) { return x.k === k; })[0];
    return c ? c.t : '';
  }

  /* ------------------------------ 启动 -------------------------------- */
  function boot() {
    var page = document.body.getAttribute('data-page') || '';

    // 页头 / 页脚占位
    var h = document.getElementById('siteHeader');
    if (h) h.outerHTML = buildHeader(page);
    var f = document.getElementById('siteFooter');
    if (f) f.outerHTML = buildFooter();

    // 移动端菜单
    var tg = document.querySelector('.nav-toggle');
    if (tg) tg.onclick = function () {
      document.getElementById('mainNav').classList.toggle('open');
    };

    // 退出登录
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('[data-act="logout"]') : null;
      if (a) {
        e.preventDefault();
        window.Store.Auth.logout();
        toast('已退出登录');
        setTimeout(function () { location.href = 'index.html'; }, 400);
      }
    });

    // 交给各页面自己的初始化
    if (window.PAGES && PAGES[page]) {
      try { PAGES[page](); } catch (err) { console.error(err); }
    }
  }

  window.UI = {
    esc: esc, rich: rich, initial: initial, toast: toast, qs: qs,
    statusTag: statusTag, debounce: debounce, compressImage: compressImage,
    lightbox: LB, catName: Photos_catName, NAV: NAV
  };

  /* Store 需先初始化，再渲染界面 */
  if (window.Store && !window.Store.read(window.Store.KEY.inited, false)) {
    window.Store.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();

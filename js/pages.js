/* ==========================================================================
   pages.js —— 各页面的具体逻辑
   页面通过 <body data-page="home"> 之类的方式指定，本文件按名分发。
   包含：home 首页 / roster 同窗名录 / album 岁月相册 / messages 留言板
        stories 校园往事 / article 文章详情 / about 关于本站
        login 登录 / register 注册 / profile 我的资料 / admin 管理后台
   ========================================================================== */
(function () {
  'use strict';

  var S = window.SITE, St = window.Store, U = window.UI;
  var PAGES = {};

  /* ======================================================================
     首页
     ====================================================================== */
  PAGES.home = function () {
    /* ---- 顶部数据 ---- */
    var box = document.querySelector('[data-home="stats"]');
    if (box) {
      var stu = St.Members.students().length;
      var ph = St.Photos.count().approved;
      var mg = St.Msgs.count().approved;
      var days = Math.max(1, Math.round((Date.now() - new Date(1992, 8, 1)) / 86400000));
      box.innerHTML =
        '<div class="it"><div class="n">' + stu + '<small>人</small></div><div class="t">在册同学</div></div>' +
        '<div class="it"><div class="n">' + St.Members.teachers().length + '<small>位</small></div><div class="t">尊师留名</div></div>' +
        '<div class="it"><div class="n">' + ph + '<small>张</small></div><div class="t">留存影像</div></div>' +
        '<div class="it"><div class="n">' + mg + '<small>条</small></div><div class="t">同窗寄语</div></div>' +
        '<div class="it"><div class="n">' + Math.floor(days / 365) + '<small>年</small></div><div class="t">相识至今</div></div>';
    }

    /* ---- 老照片轮播（取"校园老照片 + 班级相册 + 集体合影"） ---- */
    var stage = document.getElementById('carouselStage');
    if (stage) {
      var list = St.Photos.public().filter(function (p) {
        return p.cat === 'campus' || p.cat === 'class' || p.cat === 'group';
      }).slice(0, 8);
      if (!list.length) { document.getElementById('carousel').classList.add('hide'); }
      else { buildCarousel(stage, list); }
    }

    /* ---- 最新留言滚动 ---- */
    var roll = document.getElementById('msgRoll');
    if (roll) {
      var msgs = St.Msgs.public().slice(0, 12);
      if (!msgs.length) {
        roll.innerHTML = '<div class="empty"><div class="ic">✉</div>还没有留言，欢迎你留下第一句。</div>';
      } else {
        var html = msgs.map(function (m) {
          return '<div class="roll-item">' +
            '<div class="who">' + U.esc(m.author) +
              (m.cls ? '<span class="tag">' + U.esc(m.cls) + '</span>' : '') + '</div>' +
            '<div class="txt">' + U.esc(m.text).replace(/\n/g, ' ') + '</div>' +
            '<div class="time">' + U.esc(m.time) + '</div>' +
          '</div>';
        }).join('');
        // 复制一份用于无缝滚动
        roll.innerHTML = '<div class="msg-roll-inner scrolling">' + html + html + '</div>';
      }
    }
  };

  function buildCarousel(stage, list) {
    var car = document.getElementById('carousel');
    var i = 0, timer = null;

    stage.innerHTML = list.map(function (p, k) {
      return '<img src="' + U.esc(p.src) + '" alt="' + U.esc(p.title) + '"' + (k === 0 ? ' class="on"' : '') + '>';
    }).join('');

    var cap = document.createElement('div');
    cap.className = 'carousel-cap';
    cap.innerHTML = '<div><span data-c="t"></span></div><div class="idx" data-c="i"></div>';
    stage.parentNode.appendChild(cap);

    var dots = document.createElement('div');
    dots.className = 'carousel-dots';
    dots.innerHTML = list.map(function (_, k) {
      return '<button type="button" data-d="' + k + '" aria-label="第' + (k + 1) + '张"></button>';
    }).join('');
    car.appendChild(dots);

    var imgs = stage.querySelectorAll('img');
    var dotBtns = dots.querySelectorAll('button');

    function show(n) {
      i = (n + list.length) % list.length;
      for (var k = 0; k < imgs.length; k++) imgs[k].classList.toggle('on', k === i);
      for (var j = 0; j < dotBtns.length; j++) dotBtns[j].classList.toggle('on', j === i);
      cap.querySelector('[data-c=t]').textContent = list[i].title + (list[i].year ? '　' + list[i].year : '');
      cap.querySelector('[data-c=i]').textContent = (i + 1) + ' / ' + list.length;
    }
    function play() { stop(); timer = setInterval(function () { show(i + 1); }, 4200); }
    function stop() { if (timer) clearInterval(timer); timer = null; }

    var prev = document.createElement('button');
    prev.className = 'carousel-btn prev'; prev.type = 'button'; prev.innerHTML = '‹';
    var next = document.createElement('button');
    next.className = 'carousel-btn next'; next.type = 'button'; next.innerHTML = '›';
    prev.onclick = function () { show(i - 1); play(); };
    next.onclick = function () { show(i + 1); play(); };
    car.insertBefore(prev, car.firstChild);
    car.appendChild(next);

    dots.addEventListener('click', function (e) {
      var b = e.target.closest('[data-d]'); if (!b) return;
      show(parseInt(b.getAttribute('data-d'), 10)); play();
    });
    stage.addEventListener('click', function () { U.lightbox.open(list, i); });
    car.addEventListener('mouseenter', stop);
    car.addEventListener('mouseleave', play);

    show(0); play();
  }

  /* ======================================================================
     同窗名录
     ====================================================================== */
  PAGES.roster = function () {
    var state = { enroll: '', cls: '', role: '', kw: '', page: 1, size: 12 };
    var boxL = document.getElementById('rosterList');
    var boxT = document.getElementById('teacherList');
    var enrollBox = document.getElementById('fEnroll');
    var clsBox = document.getElementById('fClass');
    var roleBox = document.getElementById('fRole');
    var kwBox = document.getElementById('fKw');
    var cntBox = document.getElementById('rosterCount');
    var pager = document.getElementById('rosterPager');

    // 届别 / 班级筛选按钮
    function renderFilters() {
      var es = St.Members.enrolls();
      enrollBox.innerHTML = '<span class="lbl">届别：</span>' +
        '<button class="chip' + (state.enroll === '' ? ' on' : '') + '" data-enroll="">全部</button>' +
        es.map(function (e) {
          return '<button class="chip' + (state.enroll === e ? ' on' : '') + '" data-enroll="' + e + '">' + e + ' 级</button>';
        }).join('');

      var cs = St.Members.classes(state.enroll);
      clsBox.innerHTML = '<span class="lbl">班级：</span>' +
        '<button class="chip' + (state.cls === '' ? ' on' : '') + '" data-cls="">全部</button>' +
        cs.map(function (c) {
          return '<button class="chip' + (state.cls === c ? ' on' : '') + '" data-cls="' + c + '">' + c + '</button>';
        }).join('');

      roleBox.innerHTML = '<span class="lbl">身份：</span>' +
        [['', '全部'], ['student', '同学'], ['teacher', '师长']].map(function (r) {
          return '<button class="chip' + (state.role === r[0] ? ' on' : '') + '" data-role="' + r[0] + '">' + r[1] + '</button>';
        }).join('');
    }

    function card(m) {
      var u = St.Auth.cur();
      var mine = !!(u && m.ownerId === u.id);
      var canPhone = m.showPhone && m.phone;
      var canAddr = m.showAddr && m.addr;
      var meta = [];
      meta.push('<span><i>届别</i> ' + U.esc(m.enroll) + ' 级</span>');
      meta.push('<span><i>班级</i> ' + U.esc(m.cls) + '</span>');
      if (m.origin) meta.push('<span><i>来自</i> ' + U.esc(m.origin) + '</span>');
      if (m.title) meta.push('<span><i>职务</i> ' + U.esc(m.title) + '</span>');

      // 隐私区：默认只显示"未公开"，本人可在"我的资料"中开启
      var priv = '';
      if (canPhone) priv += '<span class="tag tag-army">📞 ' + U.esc(m.phone) + '</span> ';
      if (canAddr) priv += '<span class="tag tag-army">🏠 ' + U.esc(m.addr) + '</span> ';
      if (!priv) priv = '<span class="privacy-lock">🔒 联系方式未公开（本人未授权展示）</span>';

      return '<div class="member">' +
        '<div class="avatar' + (m.role === 'teacher' ? ' army' : '') + '">' + U.esc(U.initial(m.name)) + '</div>' +
        '<div class="member-main">' +
          '<div class="member-name">' + U.esc(m.name) +
            (m.nick ? '<span class="nick">当年绰号「' + U.esc(m.nick) + '」</span>' : '') +
            (m.memorial ? '<span class="tag tag-gold">永远的同学</span>' : '') +
            (m.role === 'teacher' ? '<span class="tag tag-navy">尊师</span>' : '') +
            (mine ? '<span class="tag tag-ok">这是你</span>' : '') +
          '</div>' +
          '<div class="member-meta">' + meta.join('') + '</div>' +
          (m.note ? '<div class="member-note">' + U.esc(m.note) + '</div>' : '') +
          '<div class="member-foot">' +
            '<div>' + priv + '</div>' +
            '<div>' +
              (mine
                ? '<a class="btn btn-ghost btn-sm" href="profile.html">编辑我的资料</a> '
                : (u ? '<button class="btn btn-ghost btn-sm" data-claim="' + m.id + '">这是我，认领</button> ' : '')) +
              '<a class="btn btn-ghost btn-sm" href="messages.html?to=' + encodeURIComponent(m.name) + '">给他留言</a>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function render() {
      var all = St.Members.query({
        enroll: state.enroll, cls: state.cls, role: state.role, kw: state.kw
      });
      // 全体（未筛选身份时把师长单独成块）
      var teachers = all.filter(function (m) { return m.role === 'teacher'; });
      var students = all.filter(function (m) { return m.role !== 'teacher'; });

      var showTeacher = (state.role === '' || state.role === 'teacher');
      boxT.classList.toggle('hide', !showTeacher || !teachers.length);
      boxT.innerHTML = teachers.map(card).join('');

      var list = (state.role === 'teacher') ? teachers : students;
      cntBox.innerHTML = '共找到 <strong>' + list.length + '</strong> 位' +
        (state.role === 'teacher' ? '师长' : '同学') +
        (state.enroll ? '（' + state.enroll + ' 级' : '') +
        (state.cls ? (state.enroll ? ' ' : '（') + state.cls + '）' : (state.enroll ? '）' : ''));

      // 分页
      var total = Math.max(1, Math.ceil(list.length / state.size));
      if (state.page > total) state.page = total;
      var cur = list.slice((state.page - 1) * state.size, state.page * state.size);

      boxL.innerHTML = cur.length ? cur.map(card).join('')
        : '<div class="empty" style="grid-column:1/-1"><div class="ic">🔍</div>没有找到符合条件的人，换个条件再试试。</div>';

      if (total > 1) {
        var h = '<button data-p="1"' + (state.page === 1 ? ' disabled' : '') + '>首页</button>' +
          '<button data-p="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>上一页</button>';
        var from = Math.max(1, state.page - 2), to = Math.min(total, from + 4);
        from = Math.max(1, to - 4);
        for (var k = from; k <= to; k++) {
          h += '<button data-p="' + k + '"' + (k === state.page ? ' class="on"' : '') + '>' + k + '</button>';
        }
        h += '<button data-p="' + (state.page + 1) + '"' + (state.page === total ? ' disabled' : '') + '>下一页</button>' +
          '<button data-p="' + total + '"' + (state.page === total ? ' disabled' : '') + '>末页</button>' +
          '<span style="font-size:13px;color:var(--ink-3);margin-left:8px">第 ' + state.page + ' / ' + total + ' 页</span>';
        pager.innerHTML = h; pager.classList.remove('hide');
      } else { pager.innerHTML = ''; pager.classList.add('hide'); }
    }

    renderFilters(); render();

    enrollBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-enroll]'); if (!b) return;
      state.enroll = b.getAttribute('data-enroll'); state.cls = ''; state.page = 1;
      renderFilters(); render();
    });
    clsBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cls]'); if (!b) return;
      state.cls = b.getAttribute('data-cls'); state.page = 1;
      renderFilters(); render();
    });
    roleBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-role]'); if (!b) return;
      state.role = b.getAttribute('data-role'); state.page = 1;
      renderFilters(); render();
    });
    kwBox.addEventListener('input', U.debounce(function () {
      state.kw = kwBox.value; state.page = 1; render();
    }, 200));
    pager.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b || b.disabled) return;
      state.page = parseInt(b.getAttribute('data-p'), 10); render();
      document.querySelector('.roster-tools').scrollIntoView({ block: 'start' });
    });

    // 认领名字
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-claim]') : null;
      if (!b) return;
      var u = St.Auth.cur();
      if (!u) { U.toast('请先登录后再认领'); setTimeout(function () { location.href = 'login.html'; }, 700); return; }
      if (!confirm('确认认领这条名录？\n认领后你可以在"我的资料"里填写联系方式，并自行决定是否公开展示。\n（一个账号只能认领一位同学，你的手机号、地址默认不公开）')) return;
      St.Members.claim(b.getAttribute('data-claim'), u.id);
      U.toast('认领成功，请到"我的资料"完善信息');
      render();
    });
  };

  /* ======================================================================
     岁月相册
     ====================================================================== */
  PAGES.album = function () {
    var cats = St.Photos.cats;
    var state = { cat: 'all' };
    var grid = document.getElementById('gallery');
    var tabs = document.getElementById('albumTabs');
    var form = document.getElementById('uploadForm');
    var input = document.getElementById('upFile');
    var strip = document.getElementById('upPreview');
    var chosen = [];   // {dataUrl, file}

    function renderTabs() {
      var all = St.Photos.public();
      tabs.innerHTML =
        '<button class="chip' + (state.cat === 'all' ? ' on' : '') + '" data-cat="all">全部（' + all.length + '）</button>' +
        cats.map(function (c) {
          var n = all.filter(function (p) { return p.cat === c.k; }).length;
          return '<button class="chip' + (state.cat === c.k ? ' on' : '') + '" data-cat="' + c.k + '">' + c.t + '（' + n + '）</button>';
        }).join('');
    }
    function render() {
      var list = St.Photos.public(state.cat === 'all' ? '' : state.cat);
      if (!list.length) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="ic">🖼</div>这个分类下还没有照片。</div>';
        return;
      }
      grid.innerHTML = list.map(function (p, i) {
        return '<figure class="photo" data-i="' + i + '" style="margin:0">' +
          '<div class="thumb"><img loading="lazy" src="' + U.esc(thumb(p.src)) + '" alt="' + U.esc(p.title) + '"></div>' +
          '<figcaption class="info">' +
            '<div class="t">' + U.esc(p.title) + '</div>' +
            '<div class="m"><span>' + U.esc(p.year || '') + '</span><span>' + U.esc(St.Photos.catName(p.cat)) + '</span></div>' +
          '</figcaption>' +
        '</figure>';
      }).join('');
      grid.querySelectorAll('.photo').forEach(function (el) {
        el.onclick = function () { U.lightbox.open(list, parseInt(el.getAttribute('data-i'), 10)); };
      });
    }
    /* 自动使用缩略图（若存在），不存在则回退到原图 */
    function thumb(src) {
      return src.replace('/photos/', '/photos/thumb/').replace('/photos/thumb/thumb/', '/photos/thumb/');
    }

    renderTabs(); render();
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      state.cat = b.getAttribute('data-cat'); renderTabs(); render();
    });

    /* ---- 上传区 ---- */
    if (!form) return;
    var u = St.Auth.cur();
    var needLogin = document.getElementById('upNeedLogin');
    if (!u) { form.classList.add('hide'); if (needLogin) needLogin.classList.remove('hide'); return; }

    function paintStrip() {
      strip.innerHTML = chosen.map(function (c, i) {
        return '<div class="pv"><img src="' + c.dataUrl + '" alt=""><button type="button" data-rm="' + i + '" ' +
          'style="position:absolute;top:2px;right:2px;border:0;background:rgba(19,32,56,.7);color:#fff;' +
          'width:20px;height:20px;border-radius:50%;line-height:1;font-size:12px;padding:0">✕</button></div>';
      }).join('');
    }
    strip.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      chosen.splice(parseInt(b.getAttribute('data-rm'), 10), 1); paintStrip();
    });

    function take(file) {
      if (chosen.length >= 6) { U.toast('一次最多上传 6 张'); return; }
      U.compressImage(file, 1280, 0.76).then(function (d) {
        chosen.push({ dataUrl: d, file: file }); paintStrip();
      }).catch(function (err) { U.toast('「' + file.name + '」处理失败：' + err.message); });
    }

    input.addEventListener('change', function () {
      Array.prototype.slice.call(input.files).forEach(take);
      input.value = '';
    });
    var dz = document.getElementById('dropZone');
    ['dragenter', 'dragover'].forEach(function (t) {
      dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      Array.prototype.slice.call(e.dataTransfer.files).forEach(take);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!chosen.length) { U.toast('请先选择照片'); return; }
      var cat = form.querySelector('[name=cat]').value;
      var title = form.querySelector('[name=title]').value.trim();
      var year = form.querySelector('[name=year]').value.trim();
      var desc = form.querySelector('[name=desc]').value.trim();
      var bad = St.checkWords(title + desc);
      if (bad) { U.toast('说明文字含不适宜词语「' + bad + '」，请修改'); return; }

      chosen.forEach(function (c, i) {
        St.Photos.add({
          cat: cat, src: c.dataUrl,
          title: chosen.length > 1 ? (title || '未命名照片') + '（' + (i + 1) + '）' : (title || '未命名照片'),
          year: year, desc: desc, uploader: u.name, userId: u.id
        });
      });
      var n = chosen.length;
      chosen = []; paintStrip(); form.reset();
      U.toast('已提交 ' + n + ' 张照片，等待管理员审核后对外展示', 3200);
      var my = document.getElementById('myUploads');
      if (my) { my.classList.remove('hide'); renderMine(); }
      renderTabs(); render();
    });

    /* 我上传的（含待审核） */
    function renderMine() {
      var my = document.getElementById('myUploads');
      if (!my) return;
      var list = St.Photos.all().filter(function (p) {
        return !p.builtin && (p.userId === u.id || p.uploader === u.name);
      });
      if (!list.length) { my.innerHTML = ''; return; }
      my.innerHTML = '<h3 style="font-size:16px;margin:26px 0 12px">我上传的照片</h3>' +
        '<table class="table"><thead><tr><th>照片</th><th>标题</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
        list.map(function (p) {
          return '<tr><td style="width:76px"><img src="' + p.src + '" style="width:64px;height:48px;object-fit:cover;border-radius:3px"></td>' +
            '<td>' + U.esc(p.title) + '</td><td>' + U.esc(p.time) + '</td><td>' + U.statusTag(p.status) + '</td>' +
            '<td><button class="btn btn-ghost btn-sm" data-del="' + p.id + '">删除</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
    renderMine();
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-del]') : null;
      if (!b) return;
      if (!confirm('确定删除这张照片吗？')) return;
      St.Photos.remove(b.getAttribute('data-del'));
      U.toast('已删除'); renderMine(); renderTabs(); render();
    });
  };

  /* ======================================================================
     留言板
     ====================================================================== */
  PAGES.messages = function () {
    var listBox = document.getElementById('msgList');
    var form = document.getElementById('msgForm');
    var needLogin = document.getElementById('msgNeedLogin');
    var onlyMine = U.qs('mine') === '1';
    var toName = U.qs('to');
    var u = St.Auth.cur();

    /* 发布表单 */
    if (!u) {
      if (form) form.classList.add('hide');
      if (needLogin) needLogin.classList.remove('hide');
    } else if (form) {
      if (needLogin) needLogin.classList.add('hide');
      form.querySelector('[name=author]').value = u.name;
      var tip = document.getElementById('toTip');
      if (toName && tip) {
        tip.classList.remove('hide');
        tip.innerHTML = '正在给 <strong>' + U.esc(toName) + '</strong> 留言。' +
          '<button type="button" class="btn btn-ghost btn-sm" id="toClear" style="margin-left:8px">取消</button>';
        form.querySelector('[name=text]').placeholder = '@' + toName + '：写下你想说的话……';
        document.getElementById('toClear').onclick = function () {
          tip.classList.add('hide');
          form.querySelector('[name=text]').placeholder = '写下你的回忆、近况或想对老同学说的话……（提交后需管理员审核）';
        };
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = form.querySelector('[name=text]').value;
        if (toName && text.indexOf('@' + toName) < 0) text = '@' + toName + '：' + text;
        var r = St.Msgs.add({ author: u.name, cls: u.cls, userId: u.id, text: text });
        if (!r.ok) { U.toast(r.msg); return; }
        form.reset(); form.querySelector('[name=author]').value = u.name;
        U.toast('留言已提交，管理员审核通过后即会展示');
        render();
      });
    }

    function item(m, isMine) {
      var canMod = St.Auth.isAdmin() || isMine;
      var uu = St.Auth.cur();
      return '<div class="post" data-id="' + m.id + '">' +
        '<div class="post-head">' +
          '<div class="avatar">' + U.esc(U.initial(m.author)) + '</div>' +
          '<div>' +
            '<div class="who">' + U.esc(m.author) + (m.cls ? ' <span class="tag">' + U.esc(m.cls) + '</span>' : '') +
              (isMine ? ' <span class="tag tag-navy">我的留言</span>' : '') + '</div>' +
            '<div class="meta">' + U.esc(m.time) + '</div>' +
          '</div>' +
          '<div class="right">' + U.statusTag(m.status) +
            (canMod ? '<button class="btn btn-ghost btn-sm" data-mdel="' + m.id + '">删除</button>' : '') +
            (St.Auth.isAdmin() && m.status === 'pending'
              ? '<button class="btn btn-army btn-sm" data-mok="' + m.id + '">通过</button>' +
                '<button class="btn btn-ghost btn-sm" data-mno="' + m.id + '">驳回</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="post-body">' + U.rich(m.text) + '</div>' +
        (m.replies && m.replies.length
          ? '<div class="replies">' + m.replies.map(function (r) {
              return '<div class="reply"><span class="who">' + U.esc(r.author) + '</span>' +
                '<span style="color:var(--ink-3);font-size:12px">' + U.esc(r.time) + '</span>' +
                (canMod ? ' <button data-rdel="' + r.id + '" style="border:0;background:none;color:var(--ink-3);font-size:12px">删除</button>' : '') +
                '<div>' + U.rich(r.text) + '</div></div>';
            }).join('') + '</div>' : '') +
        '<div class="post-acts">' +
          '<button data-reply="' + m.id + '">💬 回复（' + ((m.replies || []).length) + '）</button>' +
        '</div>' +
        '<form class="reply-form hide" data-rform="' + m.id + '">' +
          '<input class="input" name="rtext" maxlength="400" placeholder="写下你的回复…">' +
          '<button class="btn btn-sm" type="submit">回复</button>' +
        '</form>' +
      '</div>';
    }

    function render() {
      var uu = St.Auth.cur();
      var list = onlyMine
        ? (uu ? St.Msgs.mine(uu.id, uu.name) : [])
        : St.Msgs.public();
      var title = document.getElementById('listTitle');
      if (title) title.innerHTML = onlyMine ? '我的留言（含待审核）' : '全部留言';

      if (!list.length) {
        listBox.innerHTML = '<div class="empty"><div class="ic">✉</div>' +
          (onlyMine ? '你还没有发过留言。' : '还没有公开的留言，欢迎你留下第一句。') + '</div>';
        return;
      }
      listBox.innerHTML = list.map(function (m) {
        return item(m, !!(uu && (m.userId === uu.id || (!m.userId && m.author === uu.name))));
      }).join('');
    }
    render();

    /* 交互事件 */
    listBox.addEventListener('click', function (e) {
      var t = e.target;
      var rp = t.closest('[data-reply]');
      if (rp) {
        var f = listBox.querySelector('[data-rform="' + rp.getAttribute('data-reply') + '"]');
        f.classList.toggle('hide');
        if (!f.classList.contains('hide')) f.querySelector('input').focus();
        return;
      }
      var ok = t.closest('[data-mok]'), no = t.closest('[data-mno]'), del = t.closest('[data-mdel]');
      if (ok) { St.Msgs.setStatus(ok.getAttribute('data-mok'), 'approved'); U.toast('已通过'); render(); return; }
      if (no) { St.Msgs.setStatus(no.getAttribute('data-mno'), 'rejected'); U.toast('已驳回'); render(); return; }
      if (del) {
        if (!confirm('确定删除这条留言？删除后不可恢复。')) return;
        St.Msgs.remove(del.getAttribute('data-mdel')); U.toast('已删除'); render(); return;
      }
      var rd = t.closest('[data-rdel]');
      if (rd) {
        var post = t.closest('.post');
        if (!confirm('删除这条回复？')) return;
        St.Msgs.removeReply(post.getAttribute('data-id'), rd.getAttribute('data-rdel'));
        U.toast('已删除'); render();
      }
    });
    listBox.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-rform]'); if (!f) return;
      e.preventDefault();
      var uu = St.Auth.cur();
      if (!uu) { U.toast('请先登录后再回复'); setTimeout(function () { location.href = 'login.html'; }, 700); return; }
      var r = St.Msgs.reply(f.getAttribute('data-rform'), { author: uu.name, text: f.querySelector('input').value });
      if (!r.ok) { U.toast(r.msg); return; }
      U.toast('回复已发布'); render();
    });
  };

  /* ======================================================================
     校园往事（列表 + 大事记）
     ====================================================================== */
  PAGES.stories = function () {
    var box = document.getElementById('artList');
    var tabs = document.getElementById('artTabs');
    var state = { cat: 'all' };
    var CATS = [['all', '全部'], ['story', '校园故事'], ['essay', '毕业回忆']];

    function renderTabs() {
      tabs.innerHTML = CATS.map(function (c) {
        var n = c[0] === 'all' ? window.SEED_ARTICLES.length
          : window.SEED_ARTICLES.filter(function (a) { return a.cat === c[0]; }).length;
        return '<button class="chip' + (state.cat === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '（' + n + '）</button>';
      }).join('');
    }
    function render() {
      var list = window.SEED_ARTICLES.filter(function (a) {
        return state.cat === 'all' || a.cat === state.cat;
      });
      box.innerHTML = list.map(function (a) {
        return '<article class="art-list-item">' +
          '<a class="art-thumb" href="article.html?id=' + a.id + '">' +
            '<img loading="lazy" src="' + a.cover + '" alt="' + U.esc(a.title) + '"></a>' +
          '<div class="art-list-main">' +
            '<h3><a href="article.html?id=' + a.id + '">' + U.esc(a.title) + '</a></h3>' +
            '<div class="ex">' + U.esc(a.excerpt) + '</div>' +
            '<div class="mt">' + U.esc(a.date) + '　·　' + U.esc(a.author) + '　·　' + U.esc(a.read || '') +
              '<span class="tag ' + (a.cat === 'essay' ? 'tag-army' : 'tag-navy') + '" style="margin-left:10px">' +
              (a.cat === 'essay' ? '毕业回忆' : '校园故事') + '</span></div>' +
          '</div>' +
        '</article>';
      }).join('');
    }
    renderTabs(); render();
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      state.cat = b.getAttribute('data-cat'); renderTabs(); render();
    });

    /* 大事记时间轴 */
    var tl = document.getElementById('timeline');
    if (tl) {
      tl.innerHTML = (window.SEED_TIMELINE || []).map(function (t) {
        return '<div class="tl-item' + (t.key ? ' key' : '') + '">' +
          '<div class="tl-date">' + U.esc(t.date) + '</div>' +
          '<div class="tl-t">' + U.esc(t.title) + '</div>' +
          '<div class="tl-d">' + U.esc(t.desc) + '</div>' +
        '</div>';
      }).join('');
    }
  };

  /* ======================================================================
     文章详情
     ====================================================================== */
  PAGES.article = function () {
    var id = U.qs('id');
    var a = window.SEED_ARTICLES.filter(function (x) { return x.id === id; })[0] ||
            window.SEED_ARTICLES[0];
    document.title = a.title + ' · ' + (S.name || '');
    var crumb = document.getElementById('artCrumb');
    if (crumb) crumb.textContent = a.title;

    document.getElementById('artBox').innerHTML =
      '<h1>' + U.esc(a.title) + '</h1>' +
      '<div class="art-meta">' + U.esc(a.date) + '　·　' + U.esc(a.author) +
        '　·　' + U.esc(a.read || '') + '</div>' +
      '<div class="article-body">' +
        a.body.map(function (p) { return '<p>' + U.esc(p) + '</p>'; }).join('') +
        (a.memorial ? '<div class="memorial">' + a.memorial + '</div>' : '') +
      '</div>';

    /* 上一篇 / 下一篇 */
    var i = window.SEED_ARTICLES.indexOf(a);
    var prev = window.SEED_ARTICLES[i - 1], next = window.SEED_ARTICLES[i + 1];
    var nav = document.getElementById('artNav');
    if (nav) {
      nav.innerHTML =
        (prev ? '<a href="article.html?id=' + prev.id + '">‹ ' + U.esc(prev.title) + '</a>' : '<span></span>') +
        '<a href="stories.html">返回文章列表</a>' +
        (next ? '<a href="article.html?id=' + next.id + '">' + U.esc(next.title) + ' ›</a>' : '<span></span>');
    }
  };

  /* ======================================================================
     登录
     ====================================================================== */
  PAGES.login = function () {
    var f = document.getElementById('loginForm');
    if (St.Auth.isLogin()) {
      var u = St.Auth.cur();
      document.getElementById('loginBox').innerHTML =
        '<h2>你已登录</h2>' +
        '<div class="auth-sub">' + U.esc(u.name) + '　·　' + U.esc(u.enroll) + ' 级 ' + U.esc(u.cls) + '</div>' +
        '<a class="btn btn-block" href="' + (u.role === 'admin' ? 'admin.html' : 'roster.html') + '">' +
          (u.role === 'admin' ? '进入管理后台' : '去同窗名录看看') + '</a>' +
        '<div style="height:10px"></div>' +
        '<a class="btn btn-ghost btn-block" href="profile.html">我的资料 · 隐私设置</a>' +
        '<div class="auth-foot"><a href="#" data-act="logout">退出登录</a></div>';
      return;
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = St.Auth.login(
        f.querySelector('[name=user]').value.trim(),
        f.querySelector('[name=pass]').value
      );
      if (!r.ok) { U.toast(r.msg); return; }
      U.toast('登录成功，欢迎回来');
      setTimeout(function () { location.href = r.user.role === 'admin' ? 'admin.html' : 'index.html'; }, 600);
    });
  };

  /* ======================================================================
     注册
     ====================================================================== */
  PAGES.register = function () {
    var f = document.getElementById('regForm');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var o = {
        name: f.querySelector('[name=name]').value.trim(),
        user: f.querySelector('[name=user]').value.trim(),
        pass: f.querySelector('[name=pass]').value,
        pass2: f.querySelector('[name=pass2]').value,
        enroll: f.querySelector('[name=enroll]').value.trim(),
        cls: f.querySelector('[name=cls]').value.trim(),
        origin: f.querySelector('[name=origin]').value.trim()
      };
      if (o.pass !== o.pass2) { U.toast('两次输入的密码不一致'); return; }
      if (!f.querySelector('[name=agree]').checked) { U.toast('请先阅读并同意隐私约定与免责声明'); return; }
      var r = St.Auth.register(o);
      if (!r.ok) { U.toast(r.msg); return; }
      St.Auth.login(o.user, o.pass);
      U.toast('注册成功，正在进入…');
      setTimeout(function () { location.href = 'roster.html'; }, 700);
    });
  };

  /* ======================================================================
     我的资料（隐私设置 / 认领名录 / 改密码）
     ====================================================================== */
  PAGES.profile = function () {
    var u = St.Auth.cur();
    var box = document.getElementById('profileBox');
    if (!u) {
      box.innerHTML = '<div class="empty"><div class="ic">🔒</div>请先登录。<br><br>' +
        '<a class="btn" href="login.html">去登录</a></div>';
      return;
    }
    var m = St.Members.byOwner(u.id);

    var memberPart;
    if (m) {
      memberPart =
        '<div class="notice">你已认领名录中的「<strong>' + U.esc(m.name) + '</strong>」（' +
        U.esc(m.enroll) + ' 级 ' + U.esc(m.cls) + '）。以下信息填好并保存后，会显示在同窗名录的你的卡片上。</div>' +
        '<div style="height:18px"></div>' +
        '<div class="form-row"><label>手机号（选填，可随时关闭展示）</label>' +
          '<input class="input" name="phone" maxlength="20" placeholder="例如 138xxxxxxxx" value="' + U.esc(m.phone) + '"></div>' +
        '<div class="form-row"><label>常住地址 / 现居城市（选填）</label>' +
          '<input class="input" name="addr" maxlength="60" placeholder="例如 云南省昆明市" value="' + U.esc(m.addr) + '"></div>' +
        '<div class="form-row"><label>一句话近况（选填）</label>' +
          '<input class="input" name="note" maxlength="80" placeholder="例如 现在昆明做机械加工，一切都好" value="' + U.esc(m.note) + '"></div>' +
        '<div class="form-row" style="margin-top:20px;padding-top:16px;border-top:1px dashed var(--line)">' +
          '<label style="margin-bottom:10px">隐私开关（默认全部关闭）</label>' +
          '<label class="check"><input type="checkbox" name="showPhone"' + (m.showPhone ? ' checked' : '') + '>' +
            '<span>同意在名录中展示我的<strong>手机号</strong></span></label>' +
          '<label class="check" style="margin-top:8px"><input type="checkbox" name="showAddr"' + (m.showAddr ? ' checked' : '') + '>' +
            '<span>同意在名录中展示我的<strong>常住地址</strong></span></label>' +
          '<div class="form-hint">不勾选时，其他同学看到的只是"联系方式未公开"，任何人都无法查看，管理员也看不到。</div>' +
        '</div>' +
        '<button class="btn" type="submit">保存资料</button> ' +
        '<button class="btn btn-ghost" type="button" data-unclaim="1">取消认领</button>';
    } else {
      memberPart =
        '<div class="notice notice-warn">你还没有认领名录中的名字。' +
          '认领后，你填写的联系方式才会显示在名录里（是否公开由你决定）。</div>' +
        '<div style="height:16px"></div>' +
        '<a class="btn" href="roster.html">去同窗名录认领我的名字</a>';
    }

    box.innerHTML =
      '<div class="card card-pad" style="margin-bottom:20px">' +
        '<h3 style="font-size:17px;margin-bottom:14px">账号信息</h3>' +
        '<div class="member-meta" style="font-size:14px">' +
          '<span><i>姓名</i> ' + U.esc(u.name) + '</span>' +
          '<span><i>账号</i> ' + U.esc(u.user) + '</span>' +
          '<span><i>届别班级</i> ' + U.esc(u.enroll) + ' 级 ' + U.esc(u.cls) + '</span>' +
          '<span><i>身份</i> ' + (u.role === 'admin' ? '管理员' : '普通用户') + '</span>' +
          '<span><i>注册时间</i> ' + U.esc(u.createdAt) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<h3 style="font-size:17px;margin-bottom:14px">同窗信息与隐私设置</h3>' +
        '<form id="profileForm">' + memberPart + '</form>' +
      '</div>' +
      '<div class="card card-pad" style="margin-top:20px">' +
        '<h3 style="font-size:17px;margin-bottom:14px">修改密码</h3>' +
        '<form id="passForm">' +
          '<div class="form-row"><label>原密码</label><input class="input" type="password" name="oldP"></div>' +
          '<div class="form-row"><label>新密码（至少 6 位）</label><input class="input" type="password" name="newP"></div>' +
          '<button class="btn btn-ghost" type="submit">确认修改</button>' +
        '</form>' +
      '</div>';

    var pf = document.getElementById('profileForm');
    if (pf) pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var patch = {
        phone: pf.querySelector('[name=phone]').value.trim(),
        addr: pf.querySelector('[name=addr]').value.trim(),
        note: pf.querySelector('[name=note]').value.trim(),
        showPhone: pf.querySelector('[name=showPhone]').checked,
        showAddr: pf.querySelector('[name=showAddr]').checked
      };
      St.Members.saveProfile(u.id, patch);
      U.toast('已保存' + (patch.showPhone || patch.showAddr ? '（已按你的选择公开相应信息）' : '（联系方式仍为不公开）'));
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-unclaim]') : null;
      if (!b) return;
      if (!confirm('取消认领后，名录中你的联系方式与近况将一并清除，确定吗？')) return;
      St.Members.saveProfile(u.id, { phone: '', addr: '', showPhone: false, showAddr: false });
      var all = St.Members.all();
      all.forEach(function (x) { if (x.ownerId === u.id) x.ownerId = ''; });
      St.write(St.KEY.members, all);
      U.toast('已取消认领');
      setTimeout(function () { location.reload(); }, 600);
    });

    var pp = document.getElementById('passForm');
    if (pp) pp.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = St.Users.setPass(u.id, pp.querySelector('[name=oldP]').value, pp.querySelector('[name=newP]').value);
      U.toast(r.ok ? '密码已修改，请重新登录' : r.msg);
      if (r.ok) setTimeout(function () { St.Auth.logout(); location.href = 'login.html'; }, 1200);
    });
  };

  /* ======================================================================
     管理后台
     ====================================================================== */
  PAGES.admin = function () {
    var box = document.getElementById('adminBox');
    if (!St.Auth.isAdmin()) {
      box.innerHTML = '<div class="empty"><div class="ic">🔐</div>' +
        '本页仅管理员可访问。<br><br><a class="btn" href="login.html">管理员登录</a></div>';
      return;
    }

    function stat() {
      var mc = St.Msgs.count(), pc = St.Photos.count();
      return '<div class="stat-row">' +
        '<div class="stat-box"><div class="n">' + mc.pending + '</div><div class="t">待审核留言</div></div>' +
        '<div class="stat-box"><div class="n">' + pc.pending + '</div><div class="t">待审核照片</div></div>' +
        '<div class="stat-box"><div class="n">' + mc.approved + '</div><div class="t">已公开留言</div></div>' +
        '<div class="stat-box"><div class="n">' + St.Users.all().length + '</div><div class="t">注册账号</div></div>' +
      '</div>';
    }

    var TABS = [
      ['msgs', '留言审核'], ['photos', '照片审核'], ['users', '用户管理'],
      ['claim', '名录认领'], ['logs', '操作日志'], ['data', '数据备份'], ['sys', '系统设置']
    ];
    var cur = 'msgs';

    box.innerHTML =
      '<div data-slot="stat"></div>' +
      '<div class="admin-tabs" id="adminTabs">' +
        TABS.map(function (t) {
          return '<button data-tab="' + t[0] + '"' + (t[0] === cur ? ' class="on"' : '') + '>' + t[1] + '</button>';
        }).join('') +
      '</div><div data-slot="panel"></div>';

    function paint() {
      box.querySelector('[data-slot=stat]').innerHTML = stat();
      box.querySelector('[data-slot=panel]').innerHTML = panes[cur]();
      if (paintAfter[cur]) paintAfter[cur]();
    }

    var panes = {
      msgs: function () {
        var list = St.Msgs.all().sort(function (a, b) {
          var o = { pending: 0, approved: 1, rejected: 2 };
          return (o[a.status] - o[b.status]) || (a.time < b.time ? 1 : -1);
        });
        if (!list.length) return '<div class="empty">暂无留言</div>';
        return '<table class="table"><thead><tr><th style="width:78px">状态</th><th>内容</th>' +
          '<th style="width:110px">留言人</th><th style="width:130px">时间</th><th style="width:190px">操作</th></tr></thead><tbody>' +
          list.map(function (m) {
            return '<tr><td>' + U.statusTag(m.status) + '</td>' +
              '<td><div style="max-width:520px;white-space:pre-wrap">' + U.esc(m.text).slice(0, 200) + '</div>' +
                (m.replies && m.replies.length ? '<div style="font-size:12px;color:var(--ink-3);margin-top:4px">' +
                  m.replies.length + ' 条回复</div>' : '') + '</td>' +
              '<td>' + U.esc(m.author) + '<div style="font-size:12px;color:var(--ink-3)">' + U.esc(m.cls || '') + '</div></td>' +
              '<td style="font-size:12.5px;color:var(--ink-3)">' + U.esc(m.time) + '</td>' +
              '<td>' +
                (m.status !== 'approved' ? '<button class="btn btn-army btn-sm" data-a="ok" data-id="' + m.id + '">通过</button> ' : '') +
                (m.status !== 'rejected' ? '<button class="btn btn-ghost btn-sm" data-a="no" data-id="' + m.id + '">驳回</button> ' : '') +
                '<button class="btn btn-danger btn-sm" data-a="del" data-id="' + m.id + '">删除</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table>';
      },
      photos: function () {
        var list = St.Photos.all().sort(function (a, b) {
          var o = { pending: 0, approved: 1, rejected: 2 };
          return (o[a.status] - o[b.status]) || (a.time < b.time ? 1 : -1);
        });
        if (!list.length) return '<div class="empty">暂无照片</div>';
        return '<table class="table"><thead><tr><th style="width:110px">图片</th><th>标题 / 说明</th>' +
          '<th style="width:100px">上传者</th><th style="width:78px">状态</th><th style="width:190px">操作</th></tr></thead><tbody>' +
          list.map(function (p) {
            return '<tr><td><img src="' + p.src + '" style="width:96px;height:72px;object-fit:cover;border-radius:3px"></td>' +
              '<td><div style="font-weight:600">' + U.esc(p.title) + '</div>' +
                '<div style="font-size:12.5px;color:var(--ink-3)">' + U.esc(St.Photos.catName(p.cat)) +
                (p.year ? '　' + U.esc(p.year) : '') + '</div>' +
                (p.desc ? '<div style="font-size:12.5px;color:var(--ink-2);margin-top:3px">' + U.esc(p.desc).slice(0, 90) + '</div>' : '') + '</td>' +
              '<td>' + U.esc(p.uploader) + '<div style="font-size:12px;color:var(--ink-3)">' + U.esc(p.time) + '</div></td>' +
              '<td>' + U.statusTag(p.status) + '</td>' +
              '<td>' +
                (p.status !== 'approved' ? '<button class="btn btn-army btn-sm" data-a="ok" data-id="' + p.id + '">通过</button> ' : '') +
                (p.status !== 'rejected' ? '<button class="btn btn-ghost btn-sm" data-a="no" data-id="' + p.id + '">驳回</button> ' : '') +
                '<button class="btn btn-danger btn-sm" data-a="del" data-id="' + p.id + '">删除</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table>';
      },
      users: function () {
        var list = St.Users.all();
        return '<table class="table"><thead><tr><th>姓名</th><th>账号</th><th>届别/班级</th>' +
          '<th>身份</th><th>状态</th><th>注册时间</th><th style="width:170px">操作</th></tr></thead><tbody>' +
          list.map(function (u) {
            return '<tr><td>' + U.esc(u.name) + '</td><td>' + U.esc(u.user) + '</td>' +
              '<td>' + U.esc(u.enroll) + ' 级 ' + U.esc(u.cls) + '</td>' +
              '<td>' + (u.role === 'admin' ? '<span class="tag tag-navy">管理员</span>' : '普通用户') + '</td>' +
              '<td>' + (u.status === 'banned' ? '<span class="tag tag-danger">已停用</span>' : '<span class="tag tag-ok">正常</span>') + '</td>' +
              '<td style="font-size:12.5px;color:var(--ink-3)">' + U.esc(u.createdAt) + '</td>' +
              '<td>' + (u.role === 'admin' ? '<span style="font-size:12.5px;color:var(--ink-3)">—</span>' :
                '<button class="btn btn-ghost btn-sm" data-a="ban" data-id="' + u.id + '">' +
                  (u.status === 'banned' ? '启用' : '停用') + '</button> ' +
                '<button class="btn btn-danger btn-sm" data-a="udel" data-id="' + u.id + '">删除</button>') + '</td></tr>';
          }).join('') + '</tbody></table>';
      },
      claim: function () {
        var ms = St.Members.all();
        var owned = ms.filter(function (m) { return m.ownerId; });
        return '<div class="notice">名录共 <strong>' + ms.length + '</strong> 条，已被认领 <strong>' + owned.length + '</strong> 条。' +
          '认领信息由同学本人在名录页操作，联系方式是否公开也由本人决定，管理员无法代为查看未公开的内容。</div>' +
          '<div style="height:16px"></div>' +
          '<table class="table"><thead><tr><th>姓名</th><th>届别/班级</th><th>认领账号</th>' +
          '<th>手机号公开</th><th>地址公开</th><th style="width:110px">操作</th></tr></thead><tbody>' +
          ms.map(function (m) {
            var ow = m.ownerId ? St.Users.get(m.ownerId) : null;
            return '<tr><td>' + U.esc(m.name) + '</td><td>' + U.esc(m.enroll) + ' 级 ' + U.esc(m.cls) + '</td>' +
              '<td>' + (ow ? U.esc(ow.name) + '（' + U.esc(ow.user) + '）' : '<span style="color:var(--ink-3)">未认领</span>') + '</td>' +
              '<td>' + (m.showPhone ? '<span class="tag tag-ok">已公开</span>' : '<span class="tag">不公开</span>') + '</td>' +
              '<td>' + (m.showAddr ? '<span class="tag tag-ok">已公开</span>' : '<span class="tag">不公开</span>') + '</td>' +
              '<td>' + (m.ownerId ? '<button class="btn btn-ghost btn-sm" data-a="unclaim" data-id="' + m.id + '">解除认领</button>' : '—') + '</td></tr>';
          }).join('') + '</tbody></table>';
      },
      logs: function () {
        var ls = St.logs();
        if (!ls.length) return '<div class="empty">暂无记录</div>';
        return '<table class="table"><thead><tr><th style="width:150px">时间</th><th style="width:110px">操作人</th>' +
          '<th style="width:130px">动作</th><th>详情</th></tr></thead><tbody>' +
          ls.map(function (l) {
            return '<tr><td style="font-size:12.5px;color:var(--ink-3)">' + U.esc(l.time) + '</td>' +
              '<td>' + U.esc(l.who) + '</td><td>' + U.esc(l.action) + '</td>' +
              '<td style="font-size:13px;color:var(--ink-2)">' + U.esc(l.detail) + '</td></tr>';
          }).join('') + '</tbody></table>';
      },
      data: function () {
        var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        var fn = '同学录数据备份_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
        return '<div class="notice notice-navy">所有数据都保存在<strong>本机浏览器</strong>里，不经过任何服务器。' +
          '建议每月导出一次备份，换电脑或清理浏览器缓存后可导入恢复。</div>' +
          '<div style="height:16px"></div>' +
          '<button class="btn" data-a="export">导 出 备 份（.json）</button> ' +
          '<button class="btn btn-ghost" data-a="import">导入备份…</button> ' +
          '<input type="file" id="impFile" accept=".json,application/json" style="display:none">' +
          '<div style="height:24px"></div>' +
          '<div class="notice notice-warn">如需彻底重来：恢复初始内容（会清空所有留言、照片和注册用户，' +
          '请务必先导出备份）。</div>' +
          '<div style="height:12px"></div>' +
          '<button class="btn btn-danger" data-a="reset">恢复初始数据（危险）</button>' +
          '<div class="form-hint" style="margin-top:16px">备份文件名建议：' + U.esc(fn) + '</div>';
      },
      sys: function () {
        var pc = St.Photos.count();
        return '<div class="prose-block">' +
          '<h3>站点信息</h3>' +
          '<p class="noind">站点名称、开篇寄语、导航菜单等，请编辑 <code>js/seed.js</code> 顶部的 <code>window.SITE</code>；' +
          '名录、文章、相册初始内容也在同一个文件里。</p>' +
          '<h3>内容概况</h3>' +
          '<ul><li>名录：' + St.Members.all().length + ' 条（其中同学 ' + St.Members.students().length + ' 人、师长 ' + St.Members.teachers().length + ' 位）</li>' +
          '<li>相册：' + pc.total + ' 张（已公开 ' + pc.approved + '，待审核 ' + pc.pending + '）</li>' +
          '<li>留言：' + St.Msgs.count().total + ' 条</li>' +
          '<li>账号：' + St.Users.all().length + ' 个</li></ul>' +
          '<h3>审核说明</h3>' +
          '<p class="noind">同学提交的留言与照片一律进入"待审核"，只有管理员点"通过"后才会对外展示。' +
          '管理员可随时删除违规内容。建议每周固定查看一次待审核列表。</p>' +
          '<h3>上线方式（任选其一）</h3>' +
          '<ul>' +
            '<li><strong>局域网共享</strong>：把整个文件夹放到内网共享目录，同学直接打开 <code>index.html</code>。</li>' +
            '<li><strong>内网小服务器</strong>：在本目录执行 <code>python -m http.server 8080</code>，' +
              '同学访问 <code>http://你的IP:8080</code>（数据仍各自存在各自浏览器）。</li>' +
            '<li><strong>GitHub Pages</strong>：把文件夹推到仓库并开启 Pages，即可获得公网地址。</li>' +
          '</ul>' +
          '<p class="noind" style="color:var(--ink-3);font-size:13.5px">『数据轻量化说明』本方案不依赖数据库，' +
          '每个访问者的数据存在自己的浏览器里。如果需要"所有人看到同一份数据"，' +
          '请把 <code>js/store.js</code> 的数据层改成调用后端接口（文件内已有注释标出改造位置）。</p>' +
        '</div>';
      }
    };
    var paintAfter = {};

    paint();

    document.getElementById('adminTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      cur = b.getAttribute('data-tab');
      box.querySelectorAll('#adminTabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      paint();
    });

    /* 行内操作 */
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
      if (a === 'ok' || a === 'no') {
        var st = a === 'ok' ? 'approved' : 'rejected';
        St.Msgs.all().some(function (m) { return m.id === id; }) ? St.Msgs.setStatus(id, st) : St.Photos.setStatus(id, st);
        U.toast(st === 'approved' ? '已通过，已对外展示' : '已驳回，不对外展示');
        paint();
      } else if (a === 'del') {
        if (!confirm('确定删除？删除后不可恢复。')) return;
        St.Msgs.all().some(function (m) { return m.id === id; }) ? St.Msgs.remove(id) : St.Photos.remove(id);
        U.toast('已删除'); paint();
      } else if (a === 'ban') {
        St.Users.toggleBan(id); U.toast('已更新账号状态'); paint();
      } else if (a === 'udel') {
        if (!confirm('删除该账号？其留言不会一并删除。')) return;
        St.Users.remove(id); U.toast('已删除账号'); paint();
      } else if (a === 'unclaim') {
        if (!confirm('解除该名录的认领关系？对方的联系方式将不再展示。')) return;
        var all = St.Members.all();
        all.forEach(function (m) { if (m.id === id) { m.ownerId = ''; m.phone = ''; m.addr = ''; m.showPhone = false; m.showAddr = false; } });
        St.write(St.KEY.members, all); U.toast('已解除认领'); paint();
      } else if (a === 'export') {
        var blob = new Blob([JSON.stringify(St.backup(), null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        var el = document.createElement('a');
        el.href = url;
        el.download = '同学录数据备份_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
        el.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        U.toast('备份已导出');
      } else if (a === 'import') {
        document.getElementById('impFile').click();
      } else if (a === 'reset') {
        if (!confirm('【危险】将清空所有留言、照片、注册用户，恢复为初始内容。\n确定要继续吗？')) return;
        if (!confirm('请再次确认：此操作不可撤销，建议先导出备份。')) return;
        St.init(true);
        U.toast('已恢复初始数据');
        setTimeout(function () { location.reload(); }, 900);
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.id !== 'impFile') return;
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { St.restore(fr.result); U.toast('数据已导入'); setTimeout(function () { location.reload(); }, 900); }
        catch (err) { alert('导入失败：' + err.message); }
      };
      fr.readAsText(f);
    });
  };

  window.PAGES = PAGES;
})();

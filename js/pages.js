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
      St.Members.claim(b.getAttribute('data-claim'), u.id).then(function (r) {
        if (!r.ok) { U.toast(r.msg || '认领失败'); return; }
        U.toast('认领成功，请到"我的资料"完善信息');
        render();
      });
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

      var btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '上传中…';
      var n = chosen.length;
      var jobs = chosen.map(function (c, i) {
        return St.Photos.add({
          cat: cat, src: c.dataUrl,
          title: n > 1 ? (title || '未命名照片') + '（' + (i + 1) + '）' : (title || '未命名照片'),
          year: year, desc: desc, uploader: u.name, userId: u.id
        });
      });
      Promise.all(jobs).then(function (rs) {
        btn.disabled = false; btn.textContent = '提交照片（待审核）';
        var fail = rs.filter(function (r) { return !r.ok; }).length;
        if (fail) { U.toast('有 ' + fail + ' 张上传失败，请重试'); }
        else { U.toast('已提交 ' + n + ' 张照片，等待管理员审核后对外展示', 3200); }
        chosen = []; paintStrip(); form.reset();
        var my = document.getElementById('myUploads');
        if (my) { my.classList.remove('hide'); renderMine(); }
        renderTabs(); render();
      });
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
      St.Photos.remove(b.getAttribute('data-del')).then(function () {
        U.toast('已删除'); renderMine(); renderTabs(); render();
      });
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
        var btn = form.querySelector('button[type=submit]');
        var text = form.querySelector('[name=text]').value;
        if (toName && text.indexOf('@' + toName) < 0) text = '@' + toName + '：' + text;
        btn.disabled = true; btn.textContent = '提交中…';
        St.Msgs.add({ author: u.name, cls: u.cls, userId: u.id, text: text }).then(function (r) {
          btn.disabled = false; btn.textContent = '提交留言（待审核）';
          if (!r.ok) { U.toast(r.msg); return; }
          form.reset(); form.querySelector('[name=author]').value = u.name;
          U.toast('留言已提交，管理员审核通过后即会展示');
          render();
        });
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
      if (ok) { St.Msgs.setStatus(ok.getAttribute('data-mok'), 'approved').then(function () { U.toast('已通过'); render(); }); return; }
      if (no) { St.Msgs.setStatus(no.getAttribute('data-mno'), 'rejected').then(function () { U.toast('已驳回'); render(); }); return; }
      if (del) {
        if (!confirm('确定删除这条留言？删除后不可恢复。')) return;
        St.Msgs.remove(del.getAttribute('data-mdel')).then(function () { U.toast('已删除'); render(); });
        return;
      }
      var rd = t.closest('[data-rdel]');
      if (rd) {
        var post = t.closest('.post');
        if (!confirm('删除这条回复？')) return;
        St.Msgs.removeReply(post.getAttribute('data-id'), rd.getAttribute('data-rdel'))
          .then(function () { U.toast('已删除'); render(); });
      }
    });
    listBox.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-rform]'); if (!f) return;
      e.preventDefault();
      var uu = St.Auth.cur();
      if (!uu) { U.toast('请先登录后再回复'); setTimeout(function () { location.href = 'login.html'; }, 700); return; }
      var inp = f.querySelector('input');
      St.Msgs.reply(f.getAttribute('data-rform'), { author: uu.name, text: inp.value })
        .then(function (r) {
          if (!r.ok) { U.toast(r.msg); return; }
          inp.value = '';
          U.toast('回复已发布'); render();
        });
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
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '登录中…';
      St.Auth.login(
        f.querySelector('[name=user]').value.trim(),
        f.querySelector('[name=pass]').value
      ).then(function (r) {
        btn.disabled = false; btn.textContent = '登 录';
        if (!r.ok) { U.toast(r.msg); return; }
        U.toast('登录成功，欢迎回来');
        setTimeout(function () { location.href = r.user.role === 'admin' ? 'admin.html' : 'index.html'; }, 600);
      });
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
      var btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '注册中…';
      // register 在服务器模式下会直接完成登录，无需再调一次 login
      St.Auth.register(o).then(function (r) {
        if (!r.ok) { btn.disabled = false; btn.textContent = '注 册'; U.toast(r.msg); return; }
        U.toast('注册成功，正在进入…');
        setTimeout(function () { location.href = 'roster.html'; }, 700);
      });
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
      St.Members.saveProfile(u.id, patch).then(function (r) {
        U.toast(r.ok
          ? '已保存' + (patch.showPhone || patch.showAddr ? '（已按你的选择公开相应信息）' : '（联系方式仍为不公开）')
          : (r.msg || '保存失败'));
      });
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-unclaim]') : null;
      if (!b) return;
      if (!confirm('取消认领后，名录中你的联系方式与近况将一并清除，确定吗？')) return;
      var m = St.Members.byOwner(u.id);
      (m ? St.Members.unclaim(m.id) : Promise.resolve({ ok: true })).then(function () {
        U.toast('已取消认领');
        setTimeout(function () { location.reload(); }, 600);
      });
    });

    var pp = document.getElementById('passForm');
    if (pp) pp.addEventListener('submit', function (e) {
      e.preventDefault();
      St.Users.setPass(u.id, pp.querySelector('[name=oldP]').value, pp.querySelector('[name=newP]').value)
        .then(function (r) {
          U.toast(r.ok ? '密码已修改，请重新登录' : r.msg);
          if (r.ok) setTimeout(function () { St.Auth.logout(); location.href = 'login.html'; }, 1200);
        });
    });
  };

  /* ======================================================================
     管理后台
     ====================================================================== */
  /* ======================================================================
     管理后台
     ----------------------------------------------------------------------
     七个页签：留言审核 / 照片审核 / 用户管理 / 名录认领 / 操作日志 /
              数据备份 / 系统设置

     每个列表都带「搜索 + 状态筛选 + 勾选批量」，并支持：
       查看（完整内容）/ 修改（正文、资料、照片信息）/ 注册（后台代注册）
     数据层在 store.js 里，服务器模式走接口、本地模式走浏览器存储，
     本文件不用区分。
     ====================================================================== */
  PAGES.admin = function () {
    var box = document.getElementById('adminBox');
    if (!St.Auth.isAdmin()) {
      box.innerHTML = '<div class="empty"><div class="ic">🔐</div>' +
        '本页仅管理员可访问。<br><br><a class="btn" href="login.html">管理员登录</a></div>';
      return;
    }

    var ME = St.Auth.cur();

    /* ---------------------- 小工具 ---------------------- */
    var ORD = { pending: 0, approved: 1, rejected: 2 };
    function byStatusTime(a, b) {
      return (ORD[a.status] - ORD[b.status]) || (a.time < b.time ? 1 : -1);
    }
    function opts(list, sel) {
      return list.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('');
    }
    /* 状态下拉：全站统一的三态 */
    var ST_OPTS = [['', '全部状态'], ['pending', '待审核'], ['approved', '已通过'], ['rejected', '未通过']];

    /* 搜索 + 筛选条件（切换页签时保留） */
    var F = {
      msgs:   { q: '', st: '' },
      photos: { q: '', st: '' },
      users:  { q: '', st: '' },
      claim:  { q: '', st: '' },
      logs:   { q: '', st: '' }
    };
    /* 勾选状态（重绘后要还原，所以存 id 集合） */
    var SEL = { msgs: {}, photos: {}, users: {} };
    function selIds(k) { return Object.keys(SEL[k]); }
    function selN(k) { return selIds(k).length; }
    function clearSel(k) { SEL[k] = {}; }

    /* 筛选条 HTML：搜索框 + 状态下拉 + 右侧按钮 */
    function bar(kind, extra) {
      var f = F[kind];
      var ph = { msgs: '搜留言内容或留言人', photos: '搜标题、说明或上传者',
                 users: '搜姓名、账号或班级', claim: '搜姓名或班级', logs: '搜操作人或动作' }[kind] || '搜索';
      var stSel = (kind === 'users')   ? [['', '全部状态'], ['active', '正常'], ['banned', '已停用']]
                : (kind === 'claim')   ? [['', '全部'], ['owned', '已认领'], ['free', '未认领']]
                : (kind === 'logs')    ? null
                : ST_OPTS;
      return '<div class="admin-bar">' +
        '<input class="input grow" data-f="' + kind + '-q" placeholder="' + ph + '" value="' + U.esc(f.q) + '">' +
        (stSel ? '<select class="input" data-f="' + kind + '-st" style="width:130px">' + opts(stSel, f.st) + '</select>' : '') +
        '<div class="right">' + (extra || '') + '</div>' +
      '</div>';
    }
    /* 批量操作条：有勾选才显示 */
    function bulkbar(kind, label) {
      var n = selN(kind);
      var forUser = kind === 'users';
      return '<div class="bulkbar' + (n ? '' : ' hide') + '" data-bulk="' + kind + '">' +
        '已选 <span class="n">' + n + '</span> ' + (label || '条') +
        '<div class="right">' +
          (forUser
            ? '<button class="btn btn-army btn-sm" data-a="bulk" data-k="' + kind + '" data-act="active">批量启用</button> ' +
              '<button class="btn btn-ghost btn-sm" data-a="bulk" data-k="' + kind + '" data-act="banned">批量停用</button> '
            : '<button class="btn btn-army btn-sm" data-a="bulk" data-k="' + kind + '" data-act="approved">批量通过</button> ' +
              '<button class="btn btn-ghost btn-sm" data-a="bulk" data-k="' + kind + '" data-act="rejected">批量驳回</button> ') +
          '<button class="btn btn-danger btn-sm" data-a="bulk" data-k="' + kind + '" data-act="delete">批量删除</button> ' +
          '<button class="btn btn-ghost btn-sm" data-a="bulkclear" data-k="' + kind + '">清空选择</button>' +
        '</div></div>';
    }
    function chk(kind, id) {
      return '<input type="checkbox" data-a="pick" data-k="' + kind + '" data-id="' + id + '"' +
        (SEL[kind][id] ? ' checked' : '') + ' aria-label="选择">';
    }
    function match(kind, hay) {
      var q = F[kind].q.trim();
      return !q || String(hay || '').indexOf(q) >= 0;
    }
    /* 顶部统计：点一下跳到对应页签 */
    function stat() {
      var mc = St.Msgs.count(), pc = St.Photos.count();
      var us = St.Users.all();
      var banned = us.filter(function (u) { return u.status === 'banned'; }).length;
      return '<div class="stat-row">' +
        '<div class="stat-box" data-goto="msgs" style="cursor:pointer"><div class="n">' + mc.pending + '</div><div class="t">待审核留言</div></div>' +
        '<div class="stat-box" data-goto="photos" style="cursor:pointer"><div class="n">' + pc.pending + '</div><div class="t">待审核照片</div></div>' +
        '<div class="stat-box"><div class="n">' + mc.approved + '</div><div class="t">已公开留言</div></div>' +
        '<div class="stat-box" data-goto="users" style="cursor:pointer"><div class="n">' + us.length + '</div>' +
        '<div class="t">注册账号' + (banned ? '（停用 ' + banned + '）' : '') + '</div></div>' +
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

    /* 重绘：会重建搜索框，所以要把焦点和光标位置还回去，否则输入时会跳 */
    function paint() {
      var ae = document.activeElement;
      var fk = ae && ae.getAttribute ? ae.getAttribute('data-f') : null;
      var pos = ae && ae.selectionStart != null ? ae.selectionStart : null;
      box.querySelector('[data-slot=stat]').innerHTML = stat();
      box.querySelector('[data-slot=panel]').innerHTML = panes[cur]();
      if (after[cur]) after[cur]();
      if (fk) {
        var el = box.querySelector('[data-f="' + fk + '"]');
        if (el) {
          el.focus();
          if (pos != null && el.setSelectionRange) { try { el.setSelectionRange(pos, pos); } catch (e) {} }
        }
      }
    }

    /* ---------------------- 各页签 ---------------------- */
    var panes = {
      msgs: function () {
        var list = St.Msgs.all().filter(function (m) {
          if (F.msgs.st && m.status !== F.msgs.st) return false;
          return match('msgs', m.text + ' ' + m.author + ' ' + (m.cls || ''));
        }).sort(byStatusTime);
        var html = bar('msgs') + bulkbar('msgs', '条留言');
        if (!list.length) return html + '<div class="empty">没有符合条件的留言</div>';
        return html + '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th class="td-chk">' + chk('msgs', '__all') + '</th>' +
          '<th style="width:96px">状态</th><th>内容</th>' +
          '<th style="width:120px">留言人</th><th style="width:132px">时间</th>' +
          '<th class="act" style="width:230px">操作</th></tr></thead><tbody>' +
          list.map(function (m) {
            return '<tr><td class="td-chk">' + chk('msgs', m.id) + '</td>' +
              '<td>' + U.statusTag(m.status) + '</td>' +
              '<td><div style="max-width:480px">' + U.esc(m.text).slice(0, 120) +
                (m.text.length > 120 ? '…' : '') + '</div>' +
                (m.replies && m.replies.length ? '<div class="row-detail">' + m.replies.length + ' 条回复</div>' : '') + '</td>' +
              '<td>' + U.esc(m.author) + '<div class="row-detail">' + U.esc(m.cls || '') + '</div></td>' +
              '<td class="row-detail">' + U.esc(m.time) + '</td>' +
              '<td class="act">' +
                '<button class="btn btn-sm" data-a="view" data-id="' + m.id + '">查看</button> ' +
                '<button class="btn btn-ghost btn-sm" data-a="edit" data-id="' + m.id + '">修改</button> ' +
                (m.status !== 'approved' ? '<button class="btn btn-army btn-sm" data-a="ok" data-id="' + m.id + '">通过</button> ' : '') +
                (m.status !== 'rejected' ? '<button class="btn btn-ghost btn-sm" data-a="no" data-id="' + m.id + '">驳回</button> ' : '') +
                '<button class="btn btn-danger btn-sm" data-a="del" data-id="' + m.id + '">删除</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
      },

      photos: function () {
        var list = St.Photos.all().filter(function (p) {
          if (F.photos.st && p.status !== F.photos.st) return false;
          return match('photos', p.title + ' ' + (p.desc || '') + ' ' + p.uploader + ' ' + (p.year || ''));
        }).sort(byStatusTime);
        var html = bar('photos') + bulkbar('photos', '张照片');
        if (!list.length) return html + '<div class="empty">没有符合条件的照片</div>';
        return html + '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th class="td-chk">' + chk('photos', '__all') + '</th>' +
          '<th style="width:104px">图片</th><th>标题 / 说明</th>' +
          '<th style="width:110px">上传者</th><th style="width:96px">状态</th>' +
          '<th class="act" style="width:230px">操作</th></tr></thead><tbody>' +
          list.map(function (p) {
            return '<tr><td class="td-chk">' + chk('photos', p.id) + '</td>' +
              '<td><img src="' + p.src + '" alt="" style="width:88px;height:66px;object-fit:cover;' +
                'object-position:center 36%;border-radius:3px;cursor:zoom-in" data-a="zoom" data-id="' + p.id + '"></td>' +
              '<td><div style="font-weight:600">' + U.esc(p.title) + '</div>' +
                '<div class="row-detail">' + U.esc(St.Photos.catName(p.cat)) +
                (p.year ? '　·　' + U.esc(p.year) : '') + (p.builtin ? '　·　初始照片' : '') + '</div>' +
                (p.desc ? '<div class="row-detail">' + U.esc(p.desc).slice(0, 80) + '</div>' : '') + '</td>' +
              '<td>' + U.esc(p.uploader) + '<div class="row-detail">' + U.esc(p.time) + '</div></td>' +
              '<td>' + U.statusTag(p.status) + '</td>' +
              '<td class="act">' +
                '<button class="btn btn-sm" data-a="viewp" data-id="' + p.id + '">看大图</button> ' +
                '<button class="btn btn-ghost btn-sm" data-a="editp" data-id="' + p.id + '">修改</button> ' +
                (p.status !== 'approved' ? '<button class="btn btn-army btn-sm" data-a="ok" data-id="' + p.id + '">通过</button> ' : '') +
                (p.status !== 'rejected' ? '<button class="btn btn-ghost btn-sm" data-a="no" data-id="' + p.id + '">驳回</button> ' : '') +
                '<button class="btn btn-danger btn-sm" data-a="del" data-id="' + p.id + '">删除</button>' +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
      },

      users: function () {
        var list = St.Users.all().filter(function (u) {
          if (F.users.st && u.status !== F.users.st) return false;
          return match('users', u.name + ' ' + u.user + ' ' + (u.cls || '') + ' ' + (u.enroll || ''));
        });
        var html = bar('users',
          '<button class="btn btn-sm" data-a="newuser">＋ 新增账号</button>') +
          bulkbar('users', '个账号');
        if (!list.length) return html + '<div class="empty">没有符合条件的账号</div>';
        return html + '<div class="table-wrap"><table class="table"><thead><tr>' +
          '<th class="td-chk">' + chk('users', '__all') + '</th>' +
          '<th>姓名</th><th>登录账号</th><th>届别 / 班级</th>' +
          '<th style="width:90px">身份</th><th style="width:86px">状态</th>' +
          '<th style="width:130px">注册时间</th><th class="act" style="width:250px">操作</th>' +
          '</tr></thead><tbody>' +
          list.map(function (u) {
            var isMe = u.id === ME.id;
            return '<tr><td class="td-chk">' + (isMe ? '' : chk('users', u.id)) + '</td>' +
              '<td>' + U.esc(u.name) + (isMe ? ' <span class="row-detail">（我）</span>' : '') + '</td>' +
              '<td>' + U.esc(u.user) + '</td>' +
              '<td>' + U.esc(u.enroll) + ' 级 ' + U.esc(u.cls) + '</td>' +
              '<td>' + (u.role === 'admin' ? '<span class="tag tag-navy">管理员</span>' : '普通用户') + '</td>' +
              '<td>' + (u.status === 'banned' ? '<span class="tag tag-danger">已停用</span>' : '<span class="tag tag-ok">正常</span>') + '</td>' +
              '<td class="row-detail">' + U.esc(u.createdAt) + '</td>' +
              '<td class="act">' +
                '<button class="btn btn-sm" data-a="editu" data-id="' + u.id + '">编辑</button> ' +
                '<button class="btn btn-ghost btn-sm" data-a="passu" data-id="' + u.id + '">重置密码</button> ' +
                (isMe ? '' : (u.role === 'admin' ? '' :
                  '<button class="btn btn-ghost btn-sm" data-a="ban" data-id="' + u.id + '">' +
                    (u.status === 'banned' ? '启用' : '停用') + '</button> ') +
                  '<button class="btn btn-danger btn-sm" data-a="udel" data-id="' + u.id + '">删除</button>') +
                (isMe ? '<span class="row-detail">自己的账号只能改资料和改密码</span>' : '') +
              '</td></tr>';
          }).join('') + '</tbody></table></div>';
      },

      claim: function () {
        var ms = St.Members.all();
        var owned = ms.filter(function (m) { return m.ownerId; });
        var list = ms.filter(function (m) {
          if (F.claim.st === 'owned' && !m.ownerId) return false;
          if (F.claim.st === 'free' && m.ownerId) return false;
          return match('claim', m.name + ' ' + (m.nick || '') + ' ' + (m.cls || '') + ' ' + (m.origin || ''));
        });
        return '<div class="notice">名录共 <strong>' + ms.length + '</strong> 条，已被认领 <strong>' + owned.length + '</strong> 条。' +
            '认领由同学本人在名录页操作；联系方式是否公开也由本人决定，管理员<strong>看不到</strong>未公开的内容，' +
            '只能解除认领关系。</div>' +
          '<div style="height:14px"></div>' +
          bar('claim') +
          (list.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>姓名</th><th>届别 / 班级</th>' +
            '<th>认领账号</th><th style="width:100px">手机号</th><th style="width:100px">住址</th>' +
            '<th style="width:110px">操作</th></tr></thead><tbody>' +
            list.map(function (m) {
              var ow = m.ownerId ? St.Users.get(m.ownerId) : null;
              return '<tr><td>' + U.esc(m.name) + (m.nick ? '<div class="row-detail">' + U.esc(m.nick) + '</div>' : '') + '</td>' +
                '<td>' + U.esc(m.enroll) + ' 级 ' + U.esc(m.cls) + '</td>' +
                '<td>' + (ow ? U.esc(ow.name) + '（' + U.esc(ow.user) + '）' : '<span style="color:var(--ink-3)">未认领</span>') + '</td>' +
                '<td>' + (m.showPhone ? '<span class="tag tag-ok">已公开</span>' : '<span class="tag">不公开</span>') + '</td>' +
                '<td>' + (m.showAddr ? '<span class="tag tag-ok">已公开</span>' : '<span class="tag">不公开</span>') + '</td>' +
                '<td>' + (m.ownerId ? '<button class="btn btn-ghost btn-sm" data-a="unclaim" data-id="' + m.id + '">解除认领</button>' : '—') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
            : '<div class="empty">没有符合条件的名录</div>');
      },

      /* 日志在服务器模式下要从后端现取，所以这里先占位，
         paint() 之后由 after.logs 拉到数据再填进去 */
      logs: function () {
        return bar('logs') +
          '<div data-logbox><div class="empty">正在读取操作日志…</div></div>';
      },

      data: function () {
        var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
        var fn = '同学录数据备份_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
        var storeTip = St.API.on
          ? '<div class="notice notice-navy">当前为<strong>服务器模式</strong>，数据统一保存在后端数据库。' +
            '建议每月导出一次备份；更简单的做法是<strong>直接复制 <code>server/data/alumni.db</code> 这个文件</strong>，' +
            '它就是全部数据。</div>'
          : '<div class="notice notice-navy">当前为<strong>本地模式</strong>，所有数据都保存在各自浏览器里。' +
            '建议每月导出一次备份，换电脑或清理浏览器缓存后可导入恢复。</div>';
        return storeTip +
          '<div style="height:16px"></div>' +
          '<button class="btn" data-a="export">导 出 备 份（.json）</button> ' +
          (St.API.on ? '' :
          '<button class="btn btn-ghost" data-a="import">导入备份…</button> ') +
          '<input type="file" id="impFile" accept=".json,application/json" style="display:none">' +
          '<div style="height:24px"></div>' +
          '<div class="notice notice-warn">如需彻底重来：恢复初始内容（会清空所有留言、照片和注册用户，' +
          '请务必先导出备份）。</div>' +
          '<div style="height:12px"></div>' +
          '<button class="btn btn-danger" data-a="reset">恢复初始数据（危险）</button>' +
          '<div class="form-hint" style="margin-top:16px">备份文件名建议：' + U.esc(fn) + '</div>';
      },

      sys: function () {
        var pc = St.Photos.count(), mc = St.Msgs.count();
        var mode = St.API.on
          ? '<span class="tag tag-ok">服务器模式</span>　数据保存在 Flask + SQLite 后端，' +
            '所有同学共享同一份留言与照片。数据库文件：<code>server/data/alumni.db</code>'
          : '<span class="tag tag-warn">本地模式</span>　未检测到后端，数据保存在' +
            '<strong>各自浏览器</strong>的本地存储里，同学之间看不到彼此的新留言与新照片。' +
            '想共享数据请运行 <code>python server/app.py</code>。';
        var open = St.Settings.all().openRegister;
        return '<div class="prose-block">' +
          '<h3 style="margin-top:0">账号与注册</h3>' +
          '<div class="admin-bar" style="margin-bottom:14px">' +
            '<span style="font-size:14px">开放同学自助注册</span>' +
            '<span class="hint">' + (open ? '任何人都能注册账号，注册后即可留言、上传照片（内容仍需审核）'
                                         : '已关闭：新账号只能由管理员在「用户管理 → 新增账号」里开通') + '</span>' +
            '<div class="right">' +
              '<button class="btn btn-sm ' + (open ? 'btn-ghost' : 'btn-army') + '" data-a="togreg">' +
                (open ? '改为关闭' : '改为开放') + '</button>' +
            '</div>' +
          '</div>' +
          '<p class="noind"><button class="btn btn-ghost btn-sm" data-a="mypass">修改我的登录密码</button>' +
            '　<span class="row-detail">当前登录：' + U.esc(ME.name) + '（' + U.esc(ME.user) + '）</span></p>' +

          '<h3>运行模式</h3>' +
          '<p class="noind">' + mode + '</p>' +
          '<h3>内容概况</h3>' +
          '<ul><li>名录：' + St.Members.all().length + ' 条（同学 ' + St.Members.students().length +
            ' 人、师长 ' + St.Members.teachers().length + ' 位）</li>' +
          '<li>相册：' + pc.total + ' 张（已公开 ' + pc.approved + '，待审核 ' + pc.pending + '）</li>' +
          '<li>留言：' + mc.total + ' 条（待审核 ' + mc.pending + '）</li>' +
          '<li>账号：' + St.Users.all().length + ' 个</li></ul>' +
          '<h3>站点信息</h3>' +
          '<p class="noind">站点名称、开篇寄语、导航菜单等，请编辑 <code>js/seed.js</code> 顶部的 <code>window.SITE</code>；' +
          '名录、文章、相册初始内容也在同一个文件里。</p>' +
          '<h3>审核说明</h3>' +
          '<p class="noind">同学提交的留言与照片一律进入"待审核"，只有管理员点"通过"后才会对外展示。' +
          '发现错别字或需要脱敏的内容，可以直接点"修改"就地改，不必退回重发。</p>' +
          '<h3>上线方式（任选其一）</h3>' +
          '<ul>' +
            '<li><strong>局域网共享</strong>：把整个文件夹放到内网共享目录，同学直接打开 <code>index.html</code>。</li>' +
            '<li><strong>内网小服务器</strong>：在本目录执行 <code>python -m http.server 8080</code>，' +
              '同学访问 <code>http://你的IP:8080</code>（数据仍各自存在各自浏览器）。</li>' +
            '<li><strong>后端共享</strong>：运行 <code>python server/app.py</code>，所有人共用同一份数据。</li>' +
            '<li><strong>GitHub Pages</strong>：把文件夹推到仓库并开启 Pages，即可获得公网地址。</li>' +
          '</ul>' +
        '</div>';
      }
    };

    /* ---------------------- 弹窗：查看 / 修改 / 新增 ---------------------- */
    function viewMsg(m) {
      var reps = (m.replies || []).map(function (r) {
        return '<div style="border-top:1px dashed var(--line);padding-top:10px;margin-top:10px">' +
          '<div class="row-detail">' + U.esc(r.author) + '　' + U.esc(r.time) + '</div>' +
          '<div style="margin-top:4px">' + U.esc(r.text) + '</div>' +
          '<div style="margin-top:6px"><button class="btn btn-danger btn-sm" data-a="delrep" ' +
            'data-id="' + m.id + '" data-rid="' + r.id + '">删除这条回复</button></div>' +
        '</div>';
      }).join('');
      U.modal({
        title: '留言详情',
        width: 640,
        noFocus: true,
        body: '<div class="row-detail" style="margin-bottom:8px">' + U.esc(m.author) +
            (m.cls ? '　·　' + U.esc(m.cls) : '') + '　·　' + U.esc(m.time) + '　' + U.statusTag(m.status) + '</div>' +
          '<div class="msg-full">' + U.esc(m.text) + '</div>' +
          (reps ? '<div style="margin-top:16px"><strong style="font-size:13.5px">回复（' +
            (m.replies || []).length + '）</strong>' + reps + '</div>' : ''),
        okText: '关闭',
        onOk: function () {},
        /* 弹窗里的"删除回复"由这里接住 */
        onAction: function (act, btn) {
          if (act !== 'delrep') return;
          var rid = btn.getAttribute('data-rid');
          if (!confirm('删除这条回复？')) return;
          St.Msgs.removeReply(m.id, rid).then(function () {
            U.toast('回复已删除');
            U.modal.close();
            paint();
          });
        }
      });
    }

    function editMsg(m) {
      U.modal({
        title: '修改留言内容',
        width: 640,
        body: '<div class="form-row"><label>留言人</label>' +
            '<input class="input" value="' + U.esc(m.author) + '（' + U.esc(m.cls || '') + '）" disabled></div>' +
          '<div class="form-row"><label>留言内容 <span class="req">*</span></label>' +
            '<textarea class="textarea" name="text" style="min-height:170px">' + U.esc(m.text) + '</textarea>' +
            '<div class="form-hint">最多 1200 字。改完立即生效，不需要重新审核；' +
            '如果内容需要脱敏（比如写了手机号），直接在这里删掉即可。</div></div>',
        okText: '保存修改',
        onOk: function (root) {
          var t = root.querySelector('[name=text]').value.trim();
          if (!t) { U.toast('内容不能为空'); return false; }
          return St.Msgs.update(m.id, t).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '保存失败'); return; }
            U.toast('留言已修改'); paint();
          });
        }
      });
    }

    function editPhoto(p) {
      U.modal({
        title: '修改照片信息',
        width: 600,
        body: '<div class="form-grid">' +
          '<div class="form-row full"><label>标题 <span class="req">*</span></label>' +
            '<input class="input" name="title" value="' + U.esc(p.title) + '"></div>' +
          '<div class="form-row"><label>分类</label><select class="input" name="cat">' +
            opts(St.Photos.cats.map(function (c) { return [c.k, c.t]; }), p.cat) + '</select></div>' +
          '<div class="form-row"><label>年份</label>' +
            '<input class="input" name="year" value="' + U.esc(p.year || '') + '" placeholder="如 1993"></div>' +
          '<div class="form-row full"><label>说明</label>' +
            '<textarea class="textarea" name="desc" style="min-height:90px">' + U.esc(p.desc || '') + '</textarea></div>' +
          '</div>' +
          '<div style="margin-top:6px"><img src="' + p.src + '" alt="" ' +
            'style="width:100%;max-height:180px;object-fit:contain;background:var(--bg-2);border-radius:4px"></div>',
        okText: '保存修改',
        onOk: function (root) {
          var title = root.querySelector('[name=title]').value.trim();
          if (!title) { U.toast('标题不能为空'); return false; }
          return St.Photos.update(p.id, {
            title: title,
            cat: root.querySelector('[name=cat]').value,
            year: root.querySelector('[name=year]').value.trim(),
            desc: root.querySelector('[name=desc]').value.trim()
          }).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '保存失败'); return; }
            U.toast('照片信息已修改'); paint();
          });
        }
      });
    }

    /* 新增账号（后台代注册）：关掉自助注册时，就靠这里开通 */
    function newUser() {
      U.modal({
        title: '新增账号（管理员代注册）',
        width: 620,
        body: '<div class="form-grid">' +
          '<div class="form-row"><label>姓名 <span class="req">*</span></label>' +
            '<input class="input" name="name" placeholder="真实姓名"></div>' +
          '<div class="form-row"><label>登录账号 <span class="req">*</span></label>' +
            '<input class="input" name="user" placeholder="字母/数字，登录用"></div>' +
          '<div class="form-row"><label>初始密码 <span class="req">*</span></label>' +
            '<input class="input" name="pass" type="text" placeholder="至少 6 位"></div>' +
          '<div class="form-row"><label>身份</label><select class="input" name="role">' +
            opts([['user', '普通用户'], ['admin', '管理员']], 'user') + '</select></div>' +
          '<div class="form-row"><label>届别</label>' +
            '<input class="input" name="enroll" value="1992"></div>' +
          '<div class="form-row"><label>班级</label>' +
            '<input class="input" name="cls" value="钳工七班"></div>' +
          '<div class="form-row"><label>初始状态</label><select class="input" name="status">' +
            opts([['active', '正常（可登录）'], ['banned', '停用（先占坑）']], 'active') + '</select></div>' +
          '<div class="form-row full"><label>简介（可不填）</label>' +
            '<textarea class="textarea" name="intro" style="min-height:70px"></textarea></div>' +
          '</div>' +
          '<div class="form-hint">建好之后把账号和初始密码告诉本人，让他登录后自己改密码。' +
          '管理员可以帮不会操作的同学代建账号。</div>',
        okText: '创建账号',
        onOk: function (root) {
          var v = function (n) { return root.querySelector('[name=' + n + ']').value.trim(); };
          if (!v('name') || !v('user') || !v('pass')) { U.toast('姓名、账号、密码都要填'); return false; }
          if (v('pass').length < 6) { U.toast('密码至少 6 位'); return false; }
          return St.Users.create({
            name: v('name'), user: v('user'), pass: v('pass'),
            role: v('role'), enroll: v('enroll'), cls: v('cls'),
            status: v('status'), intro: v('intro')
          }).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '创建失败'); return; }
            U.toast('账号已创建'); paint();
          });
        }
      });
    }

    function editUser(u) {
      U.modal({
        title: '编辑账号资料',
        width: 600,
        body: '<div class="form-grid">' +
          '<div class="form-row"><label>姓名 <span class="req">*</span></label>' +
            '<input class="input" name="name" value="' + U.esc(u.name) + '"></div>' +
          '<div class="form-row"><label>登录账号</label>' +
            '<input class="input" value="' + U.esc(u.user) + '" disabled></div>' +
          '<div class="form-row"><label>届别</label>' +
            '<input class="input" name="enroll" value="' + U.esc(u.enroll || '') + '"></div>' +
          '<div class="form-row"><label>班级</label>' +
            '<input class="input" name="cls" value="' + U.esc(u.cls || '') + '"></div>' +
          '<div class="form-row"><label>身份</label><select class="input" name="role">' +
            opts([['user', '普通用户'], ['admin', '管理员']], u.role) + '</select></div>' +
          '<div class="form-row"><label>状态</label><select class="input" name="status">' +
            opts([['active', '正常'], ['banned', '停用']], u.status) + '</select></div>' +
          '<div class="form-row full"><label>简介</label>' +
            '<textarea class="textarea" name="intro" style="min-height:80px">' + U.esc(u.intro || '') + '</textarea></div>' +
          '</div>' +
          '<div class="form-hint">登录账号不能改（改了会让认领关系、留言归属对不上）。' +
          '要改密码请用列表里的"重置密码"。</div>',
        okText: '保存修改',
        onOk: function (root) {
          var v = function (n) { return root.querySelector('[name=' + n + ']').value.trim(); };
          if (!v('name')) { U.toast('姓名不能为空'); return false; }
          return St.Users.update(u.id, {
            name: v('name'), enroll: v('enroll'), cls: v('cls'),
            role: v('role'), status: v('status'), intro: v('intro')
          }).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '保存失败'); return; }
            U.toast('资料已保存');
            if (u.id === ME.id && v('role') !== 'admin') { location.href = 'index.html'; return; }
            paint();
          });
        }
      });
    }

    function resetPass(u) {
      U.modal({
        title: '重置密码 · ' + U.esc(u.name),
        width: 480,
        body: '<div class="notice">重设后对方<strong>立即下线</strong>，需要用新密码重新登录。' +
            '把新密码告诉本人，并提醒他到"我的资料"里改掉。</div>' +
          '<div style="height:14px"></div>' +
          '<div class="form-row"><label>新密码 <span class="req">*</span></label>' +
            '<input class="input" name="p1" type="text" placeholder="至少 6 位"></div>' +
          '<div class="form-row"><label>再输一次 <span class="req">*</span></label>' +
            '<input class="input" name="p2" type="text" placeholder="确认新密码"></div>',
        okText: '重置密码',
        onOk: function (root) {
          var p1 = root.querySelector('[name=p1]').value.trim();
          var p2 = root.querySelector('[name=p2]').value.trim();
          if (p1.length < 6) { U.toast('密码至少 6 位'); return false; }
          if (p1 !== p2) { U.toast('两次输入的密码不一致'); return false; }
          return St.Users.adminSetPass(u.id, p1).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '重置失败'); return; }
            U.toast('密码已重置');
          });
        }
      });
    }

    function myPass() {
      U.modal({
        title: '修改我的登录密码',
        width: 480,
        body: '<div class="form-row"><label>原密码 <span class="req">*</span></label>' +
            '<input class="input" name="old" type="password"></div>' +
          '<div class="form-row"><label>新密码 <span class="req">*</span></label>' +
            '<input class="input" name="p1" type="password" placeholder="至少 6 位"></div>' +
          '<div class="form-row"><label>再输一次 <span class="req">*</span></label>' +
            '<input class="input" name="p2" type="password"></div>' +
          '<div class="form-hint">初始密码是 admin888，正式使用前务必改掉。</div>',
        okText: '修改密码',
        onOk: function (root) {
          var g = function (n) { return root.querySelector('[name=' + n + ']').value; };
          if (g('p1').length < 6) { U.toast('新密码至少 6 位'); return false; }
          if (g('p1') !== g('p2')) { U.toast('两次输入的新密码不一致'); return false; }
          return St.Users.setPass(ME.id, g('old'), g('p1')).then(function (r) {
            if (!r.ok) { U.toast(r.msg || '修改失败'); return; }
            U.toast('密码已修改，下次登录请用新密码');
          });
        }
      });
    }

    /* ---------------------- 重绘后要补做的事 ---------------------- */
    function renderLogs(ls) {
      var list = ls.filter(function (l) {
        return match('logs', l.who + ' ' + l.action + ' ' + l.detail);
      });
      if (!list.length) return '<div class="empty">' +
        (F.logs.q ? '没有符合条件的记录' : '暂无操作记录') + '</div>';
      return '<div class="table-wrap"><table class="table"><thead><tr>' +
        '<th style="width:150px">时间</th><th style="width:110px">操作人</th>' +
        '<th style="width:130px">动作</th><th>详情</th></tr></thead><tbody>' +
        list.map(function (l) {
          return '<tr><td class="row-detail">' + U.esc(l.time) + '</td>' +
            '<td>' + U.esc(l.who) + '</td><td>' + U.esc(l.action) + '</td>' +
            '<td style="font-size:13px;color:var(--ink-2)">' + U.esc(l.detail) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    var after = {
      logs: function () {
        var slot = box.querySelector('[data-logbox]');
        if (!slot) return;
        St.fetchLogs().then(function (ls) {
          // 期间可能已经切走 / 重绘过了，检查一下还在不在
          var cur2 = box.querySelector('[data-logbox]');
          if (cur2) cur2.innerHTML = renderLogs(ls);
        });
      }
    };

    /* ---------------------- 事件 ---------------------- */
    function gotoTab(k) {
      cur = k;
      box.querySelectorAll('#adminTabs button').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-tab') === k);
      });
      paint();
    }

    box.addEventListener('click', function (e) {
      /* 点统计块跳页签 */
      var g = e.target.closest('[data-goto]');
      if (g) { gotoTab(g.getAttribute('data-goto')); return; }

      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
      var m = St.Msgs.all().filter(function (x) { return x.id === id; })[0];
      var p = St.Photos.all().filter(function (x) { return x.id === id; })[0];
      var u = St.Users.get(id);

      /* ---- 勾选（含表头全选） ---- */
      if (a === 'pick') {
        var k = b.getAttribute('data-k');
        if (id === '__all') {
          var on = b.checked;
          // 全选只针对"当前筛选出来的行"
          box.querySelectorAll('tbody input[data-k="' + k + '"]').forEach(function (x) {
            x.checked = on;
            var xid = x.getAttribute('data-id');
            if (on) SEL[k][xid] = true; else delete SEL[k][xid];
          });
        } else {
          if (b.checked) SEL[k][id] = true; else delete SEL[k][id];
        }
        refreshBulk(k);
        return;
      }
      /* ---- 批量 ---- */
      if (a === 'bulk' || a === 'bulkclear') {
        var kk = b.getAttribute('data-k');
        if (a === 'bulkclear') { clearSel(kk); paint(); return; }
        var ids = selIds(kk);
        if (!ids.length) { U.toast('请先勾选内容'); return; }
        var act = b.getAttribute('data-act');
        var what = kk === 'msgs' ? '留言' : (kk === 'photos' ? '照片' : '账号');
        if (act === 'delete' && !confirm('确定删除勾选的 ' + ids.length + ' 条' + what + '？删除后不可恢复。')) return;
        if (kk === 'users') {
          if (act === 'delete') {
            if (!confirm('删除账号后，他们发过的留言仍会保留。继续？')) return;
            ids.reduce(function (chain, x) {
              return chain.then(function () { return St.Users.remove(x); });
            }, Promise.resolve()).then(function () { U.toast('已删除 ' + ids.length + ' 个账号'); clearSel(kk); paint(); });
          } else {
            var st = act === 'banned' ? 'banned' : 'active';
            ids.reduce(function (chain, x) {
              return chain.then(function () { return St.Users.update(x, { status: st }); });
            }, Promise.resolve()).then(function () {
              U.toast(st === 'banned' ? '已停用' : '已启用'); clearSel(kk); paint();
            });
          }
          return;
        }
        St.Moderate.batch(kk, ids, act).then(function (r) {
          if (!r.ok) { U.toast(r.msg || '操作失败'); return; }
          U.toast('已处理 ' + ids.length + ' 条' + what);
          clearSel(kk); paint();
        });
        return;
      }

      /* ---- 单条 ---- */
      if (a === 'ok' || a === 'no') {
        var stt = a === 'ok' ? 'approved' : 'rejected';
        (m ? St.Msgs.setStatus(id, stt) : St.Photos.setStatus(id, stt)).then(function () {
          U.toast(stt === 'approved' ? '已通过，已对外展示' : '已驳回，不对外展示');
          paint();
        });
      } else if (a === 'del') {
        if (!confirm('确定删除？删除后不可恢复。')) return;
        (m ? St.Msgs.remove(id) : St.Photos.remove(id)).then(function () {
          U.toast('已删除'); paint();
        });
      } else if (a === 'view') {
        if (m) viewMsg(m);
      } else if (a === 'edit') {
        if (m) editMsg(m);
      } else if (a === 'viewp' || a === 'zoom') {
        if (p) U.lightbox.open([p], 0);
      } else if (a === 'editp') {
        if (p) editPhoto(p);
      } else if (a === 'newuser') {
        newUser();
      } else if (a === 'editu') {
        if (u) editUser(u);
      } else if (a === 'passu') {
        if (u) resetPass(u);
      } else if (a === 'mypass') {
        myPass();
      } else if (a === 'togreg') {
        var open = !St.Settings.all().openRegister;
        St.Settings.set({ openRegister: open }).then(function (r) {
          if (!r.ok) { U.toast(r.msg || '设置失败'); return; }
          U.toast(open ? '已开放自助注册' : '已关闭自助注册，新账号只能由你开通');
          paint();
        });
      } else if (a === 'delrep') {
        var rid = b.getAttribute('data-rid');
        if (!confirm('删除这条回复？')) return;
        St.Msgs.removeReply(id, rid).then(function () {
          U.toast('回复已删除'); U.modal.close(); paint();
        });
      } else if (a === 'ban') {
        St.Users.toggleBan(id).then(function () { U.toast('已更新账号状态'); paint(); });
      } else if (a === 'udel') {
        if (!confirm('删除该账号？其留言不会一并删除。')) return;
        St.Users.remove(id).then(function () { U.toast('已删除账号'); paint(); });
      } else if (a === 'unclaim') {
        if (!confirm('解除该名录的认领关系？对方的联系方式将不再展示。')) return;
        St.Members.unclaim(id).then(function () { U.toast('已解除认领'); paint(); });
      } else if (a === 'export') {
        var d = new Date(), pp = function (n) { return (n < 10 ? '0' : '') + n; };
        var fname = '同学录数据备份_' + d.getFullYear() + pp(d.getMonth() + 1) + pp(d.getDate()) + '.json';
        St.backup().then(function (data) {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var el = document.createElement('a');
          el.href = url; el.download = fname; el.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
          U.toast('备份已导出');
        });
      } else if (a === 'import') {
        document.getElementById('impFile').click();
      } else if (a === 'reset') {
        if (!confirm('【危险】将清空所有留言、照片、注册用户，恢复为初始内容。\n确定要继续吗？')) return;
        if (!confirm('请再次确认：此操作不可撤销，建议先导出备份。')) return;
        St.resetAll().then(function (r) {
          U.toast(r && r.ok === false ? ('恢复失败：' + r.msg) : '已恢复初始数据');
          setTimeout(function () { location.reload(); }, 900);
        });
      }
    });

    /* 只刷新批量条（勾选时不用整表重绘，避免输入框跳焦） */
    function refreshBulk(k) {
      var el = box.querySelector('[data-bulk="' + k + '"]');
      if (!el) return;
      var n = selN(k);
      el.classList.toggle('hide', !n);
      el.querySelector('.n').textContent = n;
    }

    /* 页签切换 */
    document.getElementById('adminTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      gotoTab(b.getAttribute('data-tab'));
    });

    /* 搜索框：输入停顿 350ms 后重绘；状态下拉：立即重绘 */
    var onQ = U.debounce(function () { paint(); }, 350);
    box.addEventListener('input', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f');
      if (!f) return;
      var parts = f.split('-');
      if (parts[1] !== 'q') return;
      F[parts[0]].q = e.target.value;
      onQ();
    });
    box.addEventListener('change', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f');
      if (f) {
        var parts = f.split('-');
        F[parts[0]][parts[1]] = e.target.value;
        paint();
        return;
      }
      if (e.target.id !== 'impFile') return;
      var file = e.target.files[0]; if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { St.restore(fr.result); U.toast('数据已导入'); setTimeout(function () { location.reload(); }, 900); }
        catch (err) { alert('导入失败：' + err.message); }
      };
      fr.readAsText(file);
    });

    paint();
  };

  window.PAGES = PAGES;
})();

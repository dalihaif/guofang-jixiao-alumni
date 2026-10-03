/* ==========================================================================
   store.js —— 数据层
   ---------------------------------------------------------------
   两种运行模式，前端自动识别，页面代码完全不用改：

   ① 本地模式（无后端）：数据存在浏览器 localStorage，各存各的。
      适用于：GitHub Pages、直接双击 index.html、内网共享文件夹。

   ② 服务器模式（有后端）：检测到 /api/ping 可用即切换到 Flask + SQLite，
      所有同学共享同一份数据，留言和照片大家都能看到。
      适用于：python server/app.py 启动的服务。

   切换方式：什么都不用改，打开页面时自动探测。
   想强制只用本地模式：在 js/seed.js 里加一行 window.FORCE_LOCAL = true;

   对外接口保持不变，见文件末尾 window.Store = {...}。
   ========================================================================== */

(function () {
  'use strict';

  var KEY = {
    inited:  'gdq7_inited',
    users:   'gdq7_users',
    members: 'gdq7_members',
    msgs:    'gdq7_messages',
    photos:  'gdq7_photos',
    session: 'gdq7_session',
    token:   'gdq7_token',
    posts:   'gdq7_posts',
    logs:    'gdq7_logs'
  };

  /* ================= 基础读写 ================= */
  function read(k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      alert('本地存储空间已满，数据未能保存。\n建议：到"管理后台 → 数据备份"导出备份后，删除部分较早的图片。');
      return false;
    }
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function hash(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
    return 'h' + h.toString(36) + '_' + s.length;
  }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function ok(r) { return r && r.ok !== false; }

  /* ================= 服务器通道 ================= */
  var API = { on: false, base: 'api', token: localStorage.getItem(KEY.token) || '' };

  function hdr(json) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (API.token) h['X-Auth-Token'] = API.token;
    return h;
  }
  function req(method, path, body) {
    return fetch(API.base + path, {
      method: method, headers: hdr(!!body), credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  /* 把服务器上的数据拉回来，写进本地缓存（页面渲染逻辑不用动） */
  function pull() {
    if (!API.on) return Promise.resolve(false);
    return req('GET', '/state').then(function (d) {
      write(KEY.members, d.members || []);
      write(KEY.msgs, d.messages || []);
      write(KEY.photos, d.photos || []);
      write(KEY.users, d.users || []);
      write(KEY.inited, true);
      return true;
    });
  }
  /* 写操作：先请求服务器，成功后重新拉一次数据保持一致 */
  function mutate(path, body, method) {
    if (!API.on) return Promise.resolve({ ok: true });
    return req(method || 'POST', path, body).then(function (r) {
      return pull().then(function () { return r || { ok: true }; });
    }).catch(function (e) {
      if (window.UI) UI.toast('操作失败：' + e.message);
      return { ok: false, msg: e.message };
    });
  }

  /* ================= 启动（自动识别模式） ================= */
  function start() {
    if (window.FORCE_LOCAL) { if (!read(KEY.inited, false)) init(); return Promise.resolve(false); }
    return req('GET', '/ping').then(function (d) {
      API.on = true;
      return pull().then(function () {
        // 服务器还是空的 → 用 seed.js 的初始内容灌一次
        if (!read(KEY.members, []).length && window.SEED_MEMBERS) {
          return req('POST', '/seed', {
            members: window.SEED_MEMBERS,
            messages: window.SEED_MESSAGES,
            photos: window.SEED_PHOTOS
          }).then(pull);
        }
      });
    }).catch(function () {
      API.on = false;
    }).then(function () {
      if (!read(KEY.inited, false)) init();
      return API.on;
    });
  }

  /* ================= 本地初始化（本地模式用） ================= */
  function init(force) {
    var users = force ? [] : read(KEY.users, []);
    if (!users.length) {
      users = [{
        id: 'u_admin', name: '管理员', user: 'admin', pass: hash('admin888'),
        role: 'admin', cls: '钳工七班', enroll: '1992', origin: '',
        phone: '', addr: '', showPhone: false, showAddr: false,
        intro: '本站管理员。负责审核留言与照片、处理违规内容。', avatar: '管',
        createdAt: now(), status: 'active'
      }];
      write(KEY.users, users);
    }
    var members = (window.SEED_MEMBERS || []).map(function (m, i) {
      return {
        id: 'm' + (1000 + i), name: m.name, nick: m.nick || '', role: m.role || 'student',
        title: m.title || '', cls: m.cls || '钳工七班', enroll: m.enroll || '1992',
        origin: m.origin || '', note: m.note || '', memorial: !!m.memorial,
        phone: '', addr: '', showPhone: false, showAddr: false, ownerId: ''
      };
    });
    write(KEY.members, members);
    var msgs = (window.SEED_MESSAGES || []).map(function (m) {
      return {
        id: uid('msg'), author: m.author, cls: m.cls || '', userId: '',
        time: m.time, status: m.status || 'approved', text: m.text,
        replies: (m.replies || []).map(function (r) {
          return { id: uid('rep'), author: r.author, time: r.time, text: r.text };
        })
      };
    });
    write(KEY.msgs, msgs);
    var photos = (window.SEED_PHOTOS || []).map(function (p, i) {
      return {
        id: 'p' + (2000 + i), cat: p.cat, src: p.src, title: p.title,
        year: p.year || '', desc: p.desc || '', uploader: '老墨', userId: '',
        time: now(), status: 'approved', builtin: true
      };
    });
    write(KEY.photos, photos);
    write(KEY.inited, true);
  }

  /* ================= 账号 ================= */
  var Auth = {
    cur: function () {
      var id = read(KEY.session, '');
      if (!id) return null;
      return read(KEY.users, []).filter(function (x) { return x.id === id; })[0] || null;
    },
    isAdmin: function () { var u = Auth.cur(); return !!(u && u.role === 'admin'); },
    isLogin: function () { return !!Auth.cur(); },

    register: function (o) {
      if (API.on) {
        return req('POST', '/register', o).then(function (r) {
          if (!r.ok) return r;
          API.token = r.token; localStorage.setItem(KEY.token, r.token);
          write(KEY.session, r.user.id);
          return pull().then(function () { return { ok: true, user: r.user }; });
        }).catch(function (e) { return { ok: false, msg: e.message }; });
      }
      // —— 本地模式 ——
      var users = read(KEY.users, []);
      o.user = (o.user || '').trim();
      if (!o.name || !o.user || !o.pass) return Promise.resolve({ ok: false, msg: '姓名、账号、密码都不能为空' });
      if (o.pass.length < 6) return Promise.resolve({ ok: false, msg: '密码至少 6 位' });
      if (!o.cls || !o.enroll) return Promise.resolve({ ok: false, msg: '请填写届别与班级' });
      if (users.some(function (x) { return x.user === o.user; })) return Promise.resolve({ ok: false, msg: '该账号已被注册，请换一个' });
      var u = {
        id: uid('u'), name: o.name, user: o.user, pass: hash(o.pass), role: 'user',
        cls: o.cls, enroll: o.enroll, origin: o.origin || '', phone: '', addr: '',
        showPhone: false, showAddr: false, intro: '', avatar: o.name.slice(-1),
        createdAt: now(), status: 'active'
      };
      users.push(u); write(KEY.users, users); write(KEY.session, u.id);
      addLog('注册', o.name + '（' + o.enroll + '级 ' + o.cls + '）');
      return Promise.resolve({ ok: true, user: u });
    },

    login: function (user, pass) {
      if (API.on) {
        return req('POST', '/login', { user: user, pass: pass }).then(function (r) {
          if (!r.ok) return r;
          API.token = r.token; localStorage.setItem(KEY.token, r.token);
          write(KEY.session, r.user.id);
          return pull().then(function () { return { ok: true, user: r.user }; });
        }).catch(function (e) { return { ok: false, msg: e.message }; });
      }
      var u = read(KEY.users, []).filter(function (x) { return x.user === user; })[0];
      if (!u) return Promise.resolve({ ok: false, msg: '账号不存在' });
      if (u.pass !== hash(pass)) return Promise.resolve({ ok: false, msg: '密码不正确' });
      if (u.status === 'banned') return Promise.resolve({ ok: false, msg: '该账号已被停用，请联系管理员' });
      write(KEY.session, u.id); addLog('登录', u.name);
      return Promise.resolve({ ok: true, user: u });
    },

    logout: function () {
      if (API.on) { req('POST', '/logout').catch(function () {}); }
      localStorage.removeItem(KEY.session);
      localStorage.removeItem(KEY.token);
      API.token = '';
    }
  };

  /* ================= 用户管理 ================= */
  var Users = {
    all: function () { return read(KEY.users, []); },
    get: function (id) { return Users.all().filter(function (u) { return u.id === id; })[0] || null; },
    update: function (id, patch) {
      if (API.on) return mutate('/users/' + id, patch, 'PUT');
      var users = Users.all(), hit = false;
      users.forEach(function (u) { if (u.id === id) { Object.assign(u, patch); hit = true; } });
      if (hit) write(KEY.users, users);
      return Promise.resolve({ ok: hit });
    },
    setPass: function (id, oldP, newP) {
      if (API.on) return req('POST', '/password', { oldP: oldP, newP: newP }).catch(function (e) { return { ok: false, msg: e.message }; });
      var u = Users.get(id);
      if (!u) return Promise.resolve({ ok: false, msg: '用户不存在' });
      if (u.pass !== hash(oldP)) return Promise.resolve({ ok: false, msg: '原密码不正确' });
      if (newP.length < 6) return Promise.resolve({ ok: false, msg: '新密码至少 6 位' });
      Users.update(id, { pass: hash(newP) });
      return Promise.resolve({ ok: true });
    },
    toggleBan: function (id) {
      if (API.on) return mutate('/users/' + id + '/ban', {});
      var u = Users.get(id);
      if (!u || u.role === 'admin') return Promise.resolve({ ok: false });
      Users.update(id, { status: u.status === 'banned' ? 'active' : 'banned' });
      return Promise.resolve({ ok: true });
    },
    remove: function (id) {
      if (API.on) return mutate('/users/' + id, {}, 'DELETE');
      var u = Users.get(id);
      if (!u || u.role === 'admin') return Promise.resolve({ ok: false });
      write(KEY.users, Users.all().filter(function (x) { return x.id !== id; }));
      return Promise.resolve({ ok: true });
    }
  };

  /* ================= 同窗名录 ================= */
  var Members = {
    all: function () { return read(KEY.members, []); },
    students: function () { return Members.all().filter(function (m) { return m.role !== 'teacher'; }); },
    teachers: function () { return Members.all().filter(function (m) { return m.role === 'teacher'; }); },
    enrolls: function () {
      var s = {}; Members.all().forEach(function (m) { if (m.enroll) s[m.enroll] = 1; });
      return Object.keys(s).sort().reverse();
    },
    classes: function (enroll) {
      var s = {};
      Members.all().forEach(function (m) { if (!enroll || m.enroll === enroll) { if (m.cls) s[m.cls] = 1; } });
      return Object.keys(s);
    },
    query: function (opt) {
      opt = opt || {};
      var kw = (opt.kw || '').trim();
      return Members.all().filter(function (m) {
        if (opt.enroll && m.enroll !== opt.enroll) return false;
        if (opt.cls && m.cls !== opt.cls) return false;
        if (opt.role && (m.role || 'student') !== opt.role) return false;
        if (kw) {
          var hay = m.name + ' ' + m.nick + ' ' + m.origin + ' ' + m.cls + ' ' + m.note;
          if (hay.indexOf(kw) < 0) return false;
        }
        return true;
      });
    },
    get: function (id) { return Members.all().filter(function (m) { return m.id === id; })[0] || null; },
    byOwner: function (userId) { return Members.all().filter(function (m) { return m.ownerId === userId; })[0] || null; },
    area: function () {
      var s = {}; Members.all().forEach(function (m) { if (m.origin) s[m.origin] = 1; });
      return Object.keys(s);
    },

    /* 认领：一个账号只能认领一位 */
    claim: function (memberId, userId) {
      if (API.on) return mutate('/members/' + memberId + '/claim', {});
      var all = Members.all();
      all.forEach(function (m) { if (m.ownerId === userId) m.ownerId = ''; });
      all.forEach(function (m) { if (m.id === memberId) m.ownerId = userId; });
      write(KEY.members, all);
      return Promise.resolve({ ok: true });
    },
    unclaim: function (memberId) {
      if (API.on) return mutate('/members/' + memberId + '/unclaim', {});
      var all = Members.all();
      all.forEach(function (m) {
        if (m.id === memberId) { m.ownerId = ''; m.phone = ''; m.addr = ''; m.showPhone = false; m.showAddr = false; }
      });
      write(KEY.members, all);
      return Promise.resolve({ ok: true });
    },
    saveProfile: function (userId, patch) {
      var m = Members.byOwner(userId);
      if (API.on) {
        if (!m) return Promise.resolve({ ok: false, msg: '还没有认领名录' });
        return mutate('/members/' + m.id + '/profile', patch, 'PUT');
      }
      var all = Members.all(), hit = null;
      all.forEach(function (x) { if (x.ownerId === userId) { Object.assign(x, patch); hit = x; } });
      if (hit) write(KEY.members, all);
      return Promise.resolve({ ok: !!hit });
    }
  };

  /* ================= 留言板 ================= */
  var Msgs = {
    all: function () { return read(KEY.msgs, []); },
    public: function () {
      return Msgs.all().filter(function (m) { return m.status === 'approved'; })
        .sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    },
    mine: function (userId, name) {
      return Msgs.all().filter(function (m) { return m.userId === userId || (!m.userId && m.author === name); })
        .sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    },
    pending: function () { return Msgs.all().filter(function (m) { return m.status === 'pending'; }); },

    add: function (o) {
      var txt = (o.text || '').trim();
      if (!txt) return Promise.resolve({ ok: false, msg: '留言内容不能为空' });
      if (txt.length > 1200) return Promise.resolve({ ok: false, msg: '留言最多 1200 字' });
      var w = checkWords(txt);
      if (w) return Promise.resolve({ ok: false, msg: '留言包含不适宜词语（' + w + '），请修改后重新提交' });

      if (API.on) return mutate('/messages', { text: txt });
      var m = {
        id: uid('msg'), author: o.author, cls: o.cls || '', userId: o.userId || '',
        time: now(), status: 'pending', text: txt, replies: []
      };
      var all = Msgs.all(); all.push(m); write(KEY.msgs, all);
      return Promise.resolve({ ok: true, msg: m });
    },

    reply: function (msgId, o) {
      var txt = (o.text || '').trim();
      if (!txt) return Promise.resolve({ ok: false, msg: '回复内容不能为空' });
      if (txt.length > 400) return Promise.resolve({ ok: false, msg: '回复最多 400 字' });
      var w = checkWords(txt);
      if (w) return Promise.resolve({ ok: false, msg: '回复包含不适宜词语（' + w + '），请修改后重新提交' });

      if (API.on) return mutate('/messages/' + msgId + '/reply', { text: txt });
      var all = Msgs.all(), hit = false;
      all.forEach(function (m) {
        if (m.id === msgId) {
          m.replies = m.replies || [];
          m.replies.push({ id: uid('rep'), author: o.author, time: now(), text: txt });
          hit = true;
        }
      });
      if (hit) write(KEY.msgs, all);
      return Promise.resolve({ ok: hit, msg: hit ? '' : '留言不存在' });
    },

    setStatus: function (id, status) {
      if (API.on) return mutate('/messages/' + id + '/status', { status: status });
      var all = Msgs.all();
      all.forEach(function (m) { if (m.id === id) m.status = status; });
      write(KEY.msgs, all); addLog('留言审核', id + ' → ' + status);
      return Promise.resolve({ ok: true });
    },
    remove: function (id) {
      if (API.on) return mutate('/messages/' + id, {}, 'DELETE');
      write(KEY.msgs, Msgs.all().filter(function (m) { return m.id !== id; }));
      addLog('删除留言', id);
      return Promise.resolve({ ok: true });
    },
    removeReply: function (msgId, repId) {
      if (API.on) return mutate('/messages/' + msgId + '/replies/' + repId, {}, 'DELETE');
      var all = Msgs.all();
      all.forEach(function (m) {
        if (m.id === msgId) m.replies = (m.replies || []).filter(function (r) { return r.id !== repId; });
      });
      write(KEY.msgs, all);
      return Promise.resolve({ ok: true });
    },
    count: function () {
      var a = Msgs.all();
      return {
        total: a.length,
        approved: a.filter(function (m) { return m.status === 'approved'; }).length,
        pending: a.filter(function (m) { return m.status === 'pending'; }).length
      };
    }
  };

  /* ================= 相册 ================= */
  var Photos = {
    all: function () { return read(KEY.photos, []); },
    public: function (cat) {
      return Photos.all().filter(function (p) {
        if (p.status !== 'approved') return false;
        if (cat && cat !== 'all' && p.cat !== cat) return false;
        return true;
      });
    },
    pending: function () { return Photos.all().filter(function (p) { return p.status === 'pending'; }); },
    mine: function (userId, name) {
      return Photos.all().filter(function (p) {
        return !p.builtin && (p.userId === userId || p.uploader === name);
      });
    },
    add: function (o) {
      if (API.on) return mutate('/photos', o);
      var p = {
        id: uid('p'), cat: o.cat || 'class', src: o.src,
        title: (o.title || '').trim() || '未命名照片',
        year: (o.year || '').trim(), desc: (o.desc || '').trim(),
        uploader: o.uploader || '匿名同学', userId: o.userId || '',
        time: now(), status: 'pending', builtin: false
      };
      var all = Photos.all(); all.unshift(p); write(KEY.photos, all);
      return Promise.resolve({ ok: true, photo: p });
    },
    setStatus: function (id, status) {
      if (API.on) return mutate('/photos/' + id + '/status', { status: status });
      var all = Photos.all();
      all.forEach(function (p) { if (p.id === id) p.status = status; });
      write(KEY.photos, all); addLog('照片审核', id + ' → ' + status);
      return Promise.resolve({ ok: true });
    },
    remove: function (id) {
      if (API.on) return mutate('/photos/' + id, {}, 'DELETE');
      write(KEY.photos, Photos.all().filter(function (p) { return p.id !== id; }));
      addLog('删除照片', id);
      return Promise.resolve({ ok: true });
    },
    count: function () {
      var a = Photos.all();
      return {
        total: a.length,
        approved: a.filter(function (p) { return p.status === 'approved'; }).length,
        pending: a.filter(function (p) { return p.status === 'pending'; }).length
      };
    },
    cats: [
      { k: 'class', t: '班级相册' }, { k: 'campus', t: '校园老照片' },
      { k: 'group', t: '集体合影' }, { k: 'recent', t: '近年重聚' }
    ],
    catName: function (k) {
      var f = Photos.cats.filter(function (c) { return c.k === k; })[0];
      return f ? f.t : '其他';
    }
  };

  /* ================= 内容安全检查 ================= */
  var BAD_WORDS = [
    '涉密', '机密文件', '部队番号', '军火', '枪支弹药',
    '傻逼', '妈的', '草泥马', '滚蛋', '畜生',
    '代开发票', '办证', '加微信刷单', '博彩', '赌博网址', '开票'
  ];
  function checkWords(t) {
    for (var i = 0; i < BAD_WORDS.length; i++) if (t.indexOf(BAD_WORDS[i]) >= 0) return BAD_WORDS[i];
    return '';
  }

  /* ================= 日志 ================= */
  function addLog(action, detail) {
    if (API.on) return;                       // 服务器模式下由后端记录
    var u = Auth.cur();
    var logs = read(KEY.logs, []);
    logs.unshift({ time: now(), who: u ? u.name : '游客', action: action, detail: detail || '' });
    write(KEY.logs, logs.slice(0, 300));
  }
  function logs() {
    return read(KEY.logs, []);
  }

  /* ================= 备份 / 恢复 ================= */
  function backup() {
    if (API.on) {
      // 服务器模式：直接把后端导出的 JSON 下载下来
      return req('GET', '/backup').then(function (d) { return d; });
    }
    return Promise.resolve({
      v: 1, exportedAt: now(),
      users: read(KEY.users, []), members: read(KEY.members, []),
      messages: read(KEY.msgs, []), photos: read(KEY.photos, []), logs: read(KEY.logs, [])
    });
  }
  function restore(json) {
    var d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || !d.users) throw new Error('备份文件格式不正确');
    write(KEY.users, d.users); write(KEY.members, d.members || []);
    write(KEY.msgs, d.messages || []); write(KEY.photos, d.photos || []);
    write(KEY.logs, d.logs || []); write(KEY.inited, true);
    addLog('恢复数据', '来自备份文件');
  }
  function resetAll() {
    if (API.on) {
      return req('POST', '/reset', {}).then(function () {
        return req('POST', '/seed', {
          members: window.SEED_MEMBERS || [], messages: window.SEED_MESSAGES || [],
          photos: window.SEED_PHOTOS || []
        });
      }).then(pull).catch(function (e) { return { ok: false, msg: e.message }; });
    }
    init(true);
    return Promise.resolve({ ok: true });
  }

  /* ================= 导出 ================= */
  window.Store = {
    KEY: KEY, API: API,
    start: start, init: init, resetAll: resetAll, pull: pull,
    read: read, write: write, uid: uid, now: now, hash: hash,
    checkWords: checkWords, addLog: addLog, logs: logs,
    Auth: Auth, Users: Users, Members: Members, Msgs: Msgs, Photos: Photos,
    backup: backup, restore: restore
  };
})();

/* ==========================================================================
   store.js —— 数据层（浏览器本地存储版，无需服务器 / 数据库）
   ---------------------------------------------------------------
   数据全部保存在访问者自己的浏览器里（localStorage），适合小规模同学录使用。
   · 首次打开：把 js/seed.js 的初始内容写入本地
   · 之后所有留言 / 照片 / 注册用户都存本地
   · 换电脑 → 用"管理后台 · 数据备份"导出 JSON 再导入即可迁移
   注意：这是"轻量单机版"方案，密码仅为本地校验，不构成真正的安全防护，
        请勿在此填写银行卡、身份证等敏感信息。
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
    posts:   'gdq7_posts',      // 首页寄语 / 公告（可选）
    logs:    'gdq7_logs'
  };

  /* ------------------------------ 基础读写 ------------------------------ */
  function read(k, def) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function write(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      // 多为 localStorage 容量不足（常见于上传照片过多）
      alert('本地存储空间已满，数据未能保存。\n建议：到"管理后台 → 数据备份"导出备份后，删除部分较早的图片。');
      return false;
    }
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* 简易口令散列（仅用于避免明文存储，非安全加密） */
  function hash(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
    return 'h' + h.toString(36) + '_' + s.length;
  }

  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------ 初始化 ------------------------------- */
  function init(force) {
    if (!force && read(KEY.inited, false)) return false;

    // 默认管理员账号：admin / admin888（请登录后立即在"我的资料"改密码）
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

    // 名录：把种子名单转成带 id / 认领归属的成员对象
    var members = (window.SEED_MEMBERS || []).map(function (m, i) {
      return {
        id: 'm' + (1000 + i),
        name: m.name,
        nick: m.nick || '',
        role: m.role || 'student',
        title: m.title || '',
        cls: m.cls || '钳工七班',
        enroll: m.enroll || '1992',
        origin: m.origin || '',
        note: m.note || '',
        memorial: !!m.memorial,
        /* 以下为隐私字段：默认空白、默认不公开 */
        phone: '', addr: '', showPhone: false, showAddr: false,
        ownerId: ''    // 被某位注册用户"认领"后写入其 id
      };
    });
    write(KEY.members, members);

    // 留言
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

    // 相册
    var photos = (window.SEED_PHOTOS || []).map(function (p, i) {
      return {
        id: 'p' + (2000 + i), cat: p.cat, src: p.src, title: p.title,
        year: p.year || '', desc: p.desc || '',
        uploader: '老墨', userId: '', time: now(), status: 'approved', builtin: true
      };
    });
    write(KEY.photos, photos);

    write(KEY.inited, true);
    return true;
  }

  /* ------------------------------ 账号系统 ----------------------------- */
  var Auth = {
    cur: function () {
      var id = read(KEY.session, '');
      if (!id) return null;
      var u = read(KEY.users, []).filter(function (x) { return x.id === id; })[0];
      return u || null;
    },
    isAdmin: function () { var u = Auth.cur(); return !!(u && u.role === 'admin'); },
    isLogin: function () { return !!Auth.cur(); },

    register: function (o) {
      var users = read(KEY.users, []);
      o.user = (o.user || '').trim();
      if (!o.name || !o.user || !o.pass) return { ok: false, msg: '姓名、账号、密码都不能为空' };
      if (o.pass.length < 6) return { ok: false, msg: '密码至少 6 位' };
      if (!o.cls || !o.enroll) return { ok: false, msg: '请填写届别与班级' };
      if (users.some(function (x) { return x.user === o.user; })) return { ok: false, msg: '该账号已被注册，请换一个' };

      var u = {
        id: uid('u'), name: o.name, user: o.user, pass: hash(o.pass),
        role: 'user', cls: o.cls, enroll: o.enroll, origin: o.origin || '',
        phone: '', addr: '', showPhone: false, showAddr: false,
        intro: '', avatar: o.name.slice(-1), createdAt: now(), status: 'active'
      };
      users.push(u);
      write(KEY.users, users);
      addLog('注册', o.name + '（' + o.enroll + '级 ' + o.cls + '）');
      return { ok: true, user: u };
    },

    login: function (user, pass) {
      var u = read(KEY.users, []).filter(function (x) { return x.user === user; })[0];
      if (!u) return { ok: false, msg: '账号不存在' };
      if (u.pass !== hash(pass)) return { ok: false, msg: '密码不正确' };
      if (u.status === 'banned') return { ok: false, msg: '该账号已被停用，请联系管理员' };
      write(KEY.session, u.id);
      addLog('登录', u.name);
      return { ok: true, user: u };
    },
    logout: function () { localStorage.removeItem(KEY.session); }
  };

  /* ------------------------------ 用户管理 ----------------------------- */
  var Users = {
    all: function () { return read(KEY.users, []); },
    get: function (id) { return Users.all().filter(function (u) { return u.id === id; })[0] || null; },
    update: function (id, patch) {
      var users = Users.all(), hit = false;
      users.forEach(function (u) { if (u.id === id) { Object.assign(u, patch); hit = true; } });
      if (hit) write(KEY.users, users);
      return hit;
    },
    setPass: function (id, oldP, newP) {
      var u = Users.get(id);
      if (!u) return { ok: false, msg: '用户不存在' };
      if (u.pass !== hash(oldP)) return { ok: false, msg: '原密码不正确' };
      if (newP.length < 6) return { ok: false, msg: '新密码至少 6 位' };
      Users.update(id, { pass: hash(newP) });
      return { ok: true };
    },
    toggleBan: function (id) {
      var u = Users.get(id);
      if (!u || u.role === 'admin') return false;
      Users.update(id, { status: u.status === 'banned' ? 'active' : 'banned' });
      return true;
    },
    remove: function (id) {
      var u = Users.get(id);
      if (!u || u.role === 'admin') return false;
      write(KEY.users, Users.all().filter(function (x) { return x.id !== id; }));
      return true;
    }
  };

  /* ------------------------------ 同窗名录 ----------------------------- */
  var Members = {
    all: function () { return read(KEY.members, []); },
    students: function () { return Members.all().filter(function (m) { return m.role !== 'teacher'; }); },
    teachers: function () { return Members.all().filter(function (m) { return m.role === 'teacher'; }); },

    /* 筛选项：返回去重后的届别 / 班级列表 */
    enrolls: function () {
      var s = {}; Members.all().forEach(function (m) { if (m.enroll) s[m.enroll] = 1; });
      return Object.keys(s).sort().reverse();
    },
    classes: function (enroll) {
      var s = {};
      Members.all().forEach(function (m) {
        if (!enroll || m.enroll === enroll) { if (m.cls) s[m.cls] = 1; }
      });
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

    /* 从名录中认领自己的名字（把联系方式等信息挂到该名录行） */
    claim: function (memberId, userId) {
      var all = Members.all();
      all.forEach(function (m) { if (m.ownerId === userId) m.ownerId = ''; });   // 一个账号只认领一位
      all.forEach(function (m) { if (m.id === memberId) m.ownerId = userId; });
      write(KEY.members, all);
    },
    /* 保存本人资料（含是否公开联系方式） */
    saveProfile: function (userId, patch) {
      var all = Members.all(), hit = null;
      all.forEach(function (m) { if (m.ownerId === userId) { Object.assign(m, patch); hit = m; } });
      if (hit) write(KEY.members, all);
      return hit;
    },
    byOwner: function (userId) { return Members.all().filter(function (m) { return m.ownerId === userId; })[0] || null; },
    area: function () {
      var s = {}; Members.all().forEach(function (m) { if (m.origin) s[m.origin] = 1; });
      return Object.keys(s);
    }
  };

  /* ------------------------------ 留言板 ------------------------------- */
  var Msgs = {
    all: function () { return read(KEY.msgs, []); },
    /* 公开可见：已审核通过 */
    public: function () {
      return Msgs.all().filter(function (m) { return m.status === 'approved'; })
        .sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    },
    /* 我的留言（含待审核） */
    mine: function (userId, name) {
      return Msgs.all().filter(function (m) { return m.userId === userId || (!m.userId && m.author === name); })
        .sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    },
    pending: function () { return Msgs.all().filter(function (m) { return m.status === 'pending'; }); },

    add: function (o) {
      var txt = (o.text || '').trim();
      if (!txt) return { ok: false, msg: '留言内容不能为空' };
      if (txt.length > 1200) return { ok: false, msg: '留言最多 1200 字' };
      var lv = checkWords(txt);
      if (lv) return { ok: false, msg: '留言包含不适宜词语（' + lv + '），请修改后重新提交' };

      var m = {
        id: uid('msg'), author: o.author, cls: o.cls || '', userId: o.userId || '',
        time: now(), status: 'pending', text: txt, replies: []
      };
      var all = Msgs.all(); all.push(m); write(KEY.msgs, all);
      return { ok: true, msg: m };
    },
    reply: function (msgId, o) {
      var txt = (o.text || '').trim();
      if (!txt) return { ok: false, msg: '回复内容不能为空' };
      if (txt.length > 400) return { ok: false, msg: '回复最多 400 字' };
      var lv = checkWords(txt);
      if (lv) return { ok: false, msg: '回复包含不适宜词语（' + lv + '），请修改后重新提交' };

      var all = Msgs.all(), hit = false;
      all.forEach(function (m) {
        if (m.id === msgId) {
          m.replies = m.replies || [];
          m.replies.push({ id: uid('rep'), author: o.author, time: now(), text: txt });
          hit = true;
        }
      });
      if (hit) write(KEY.msgs, all);
      return hit ? { ok: true } : { ok: false, msg: '留言不存在' };
    },
    setStatus: function (id, status) {
      var all = Msgs.all();
      all.forEach(function (m) { if (m.id === id) m.status = status; });
      write(KEY.msgs, all);
      addLog('留言审核', id + ' → ' + status);
    },
    remove: function (id) {
      write(KEY.msgs, Msgs.all().filter(function (m) { return m.id !== id; }));
      addLog('删除留言', id);
    },
    removeReply: function (msgId, repId) {
      var all = Msgs.all();
      all.forEach(function (m) {
        if (m.id === msgId) m.replies = (m.replies || []).filter(function (r) { return r.id !== repId; });
      });
      write(KEY.msgs, all);
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

  /* ------------------------------ 相册 --------------------------------- */
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
    mine: function (userId) { return Photos.all().filter(function (p) { return p.userId === userId; }); },

    add: function (o) {
      var p = {
        id: uid('p'), cat: o.cat || 'class', src: o.src, title: (o.title || '').trim() || '未命名照片',
        year: (o.year || '').trim(), desc: (o.desc || '').trim(),
        uploader: o.uploader || '匿名同学', userId: o.userId || '',
        time: now(), status: 'pending', builtin: false
      };
      var all = Photos.all(); all.unshift(p); write(KEY.photos, all);
      return { ok: true, photo: p };
    },
    setStatus: function (id, status) {
      var all = Photos.all();
      all.forEach(function (p) { if (p.id === id) p.status = status; });
      write(KEY.photos, all);
      addLog('照片审核', id + ' → ' + status);
    },
    remove: function (id) {
      write(KEY.photos, Photos.all().filter(function (p) { return p.id !== id; }));
      addLog('删除照片', id);
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
      { k: 'class',  t: '班级相册' },
      { k: 'campus', t: '校园老照片' },
      { k: 'group',  t: '集体合影' },
      { k: 'recent', t: '近年重聚' }
    ],
    catName: function (k) {
      var f = Photos.cats.filter(function (c) { return c.k === k; })[0];
      return f ? f.t : '其他';
    }
  };

  /* ------------------------------ 内容安全检查 -------------------------- */
  /* 轻量敏感词拦截：仅作提示，真正把关仍靠管理员人工审核。
     如需增删词条，直接改下面的数组即可。                              */
  var BAD_WORDS = [
    '涉密', '机密文件', '部队番号', '军火', '枪支弹药',
    '傻逼', '妈的', '草泥马', '滚蛋', '畜生',
    '代开发票', '办证', '加微信刷单', '博彩', '赌博网址', '开票'
  ];
  function checkWords(t) {
    for (var i = 0; i < BAD_WORDS.length; i++) {
      if (t.indexOf(BAD_WORDS[i]) >= 0) return BAD_WORDS[i];
    }
    return '';
  }

  /* ------------------------------ 操作日志 ----------------------------- */
  function addLog(action, detail) {
    var u = Auth.cur();
    var logs = read(KEY.logs, []);
    logs.unshift({ time: now(), who: u ? u.name : '游客', action: action, detail: detail || '' });
    write(KEY.logs, logs.slice(0, 300));
  }

  /* ------------------------------ 备份 / 恢复 -------------------------- */
  function backup() {
    return {
      v: 1, exportedAt: now(),
      users: read(KEY.users, []),
      members: read(KEY.members, []),
      messages: read(KEY.msgs, []),
      photos: read(KEY.photos, []),
      logs: read(KEY.logs, [])
    };
  }
  function restore(json) {
    var d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!d || !d.users) throw new Error('备份文件格式不正确');
    write(KEY.users, d.users); write(KEY.members, d.members || []);
    write(KEY.msgs, d.messages || []); write(KEY.photos, d.photos || []);
    write(KEY.logs, d.logs || []); write(KEY.inited, true);
    addLog('恢复数据', '来自备份文件');
  }

  /* ------------------------------ 导出 ------------------------------- */
  window.Store = {
    KEY: KEY, init: init, read: read, write: write, uid: uid, now: now,
    hash: hash, checkWords: checkWords, addLog: addLog,
    Auth: Auth, Users: Users, Members: Members, Msgs: Msgs, Photos: Photos,
    logs: function () { return read(KEY.logs, []); },
    backup: backup, restore: restore
  };
})();

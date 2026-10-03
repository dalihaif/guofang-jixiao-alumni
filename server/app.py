# -*- coding: utf-8 -*-
"""
==============================================================================
 国防技校同学录 · 后端服务（Flask + SQLite）
------------------------------------------------------------------------------
 作用：让所有访问者共享同一份留言 / 照片 / 注册用户数据。

 启动：
     pip install flask
     python server/app.py                # 本机访问 http://127.0.0.1:5000
     python server/app.py --host 0.0.0.0 # 局域网同学一起访问

 数据文件：
     server/data/alumni.db      数据库（SQLite 单文件，可直接拷贝备份）
     server/uploads/            同学上传的照片

 安全说明（请务必阅读）：
     这是面向小范围校友的内网/小站方案，口令用 werkzeug 做加盐哈希存储，
     登录令牌为随机串。它**不具备公网级安全防护**，请勿在此存放身份证号、
     银行卡等敏感信息；部署到公网前请至少加上 HTTPS 与登录失败次数限制。
==============================================================================
"""
import os
import re
import io
import json
import time
import uuid
import base64
import sqlite3
import argparse
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, send_file
from werkzeug.security import generate_password_hash, check_password_hash

# ---------------------------------------------------------------- 路径配置
HERE = os.path.dirname(os.path.abspath(__file__))
SITE_ROOT = os.path.normpath(os.path.join(HERE, '..'))          # 站点根目录
DATA_DIR = os.path.join(HERE, 'data')
UPLOAD_DIR = os.path.join(HERE, 'uploads')
DB_PATH = os.path.join(DATA_DIR, 'alumni.db')
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Flask 直接托管整个静态站点（首页、css、js、assets 都在站点根目录）
app = Flask(__name__, static_folder=SITE_ROOT, static_url_path='')

# 轻量敏感词（与前端一致，仅作提示，最终把关靠人工审核）
BAD_WORDS = ['涉密', '机密文件', '部队番号', '军火', '枪支弹药',
             '傻逼', '妈的', '草泥马', '滚蛋', '畜生',
             '代开发票', '办证', '加微信刷单', '博彩', '赌博网址', '开票']


# ---------------------------------------------------------------- 数据库
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, user TEXT UNIQUE, pass TEXT, role TEXT,
  cls TEXT, enroll TEXT, origin TEXT, phone TEXT, addr TEXT,
  show_phone INTEGER DEFAULT 0, show_addr INTEGER DEFAULT 0,
  intro TEXT, avatar TEXT, created_at TEXT, status TEXT DEFAULT 'active',
  token TEXT, memorial INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, name TEXT, nick TEXT, role TEXT, title TEXT,
  cls TEXT, enroll TEXT, origin TEXT, note TEXT, memorial INTEGER DEFAULT 0,
  phone TEXT, addr TEXT, show_phone INTEGER DEFAULT 0, show_addr INTEGER DEFAULT 0,
  owner_id TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, author TEXT, cls TEXT, user_id TEXT,
  time TEXT, status TEXT DEFAULT 'pending', text TEXT
);
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY, msg_id TEXT, author TEXT, time TEXT, text TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, cat TEXT, src TEXT, title TEXT, year TEXT,
  descr TEXT, uploader TEXT, user_id TEXT, time TEXT,
  status TEXT DEFAULT 'pending', builtin INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, who TEXT, action TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_photo_status ON photos(status);
CREATE INDEX IF NOT EXISTS idx_reply_msg ON replies(msg_id);
"""


def db():
    """每次请求一个连接（小规模站点足够用，也避免多线程问题）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as c:
        c.executescript(SCHEMA)
        n = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
        if n == 0:
            c.execute(
                'INSERT INTO users (id,name,user,pass,role,cls,enroll,origin,'
                'phone,addr,show_phone,show_addr,intro,avatar,created_at,status) '
                'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                ('u_admin', '管理员', 'admin', generate_password_hash('admin888'),
                 'admin', '钳工七班', '1992', '', '', '', 0, 0,
                 '本站管理员。负责审核留言与照片、处理违规内容。', '管', now(), 'active'))
        m = c.execute('SELECT COUNT(*) AS n FROM members').fetchone()['n']
        if m == 0:
            c.execute("INSERT INTO logs (time,who,action,detail) VALUES (?,?,?,?)",
                      (now(), '系统', '初始化', '数据库已创建，等待前端写入初始内容'))


def now():
    return datetime.now().strftime('%Y-%m-%d %H:%M')


def uid(p='id'):
    return '%s_%s%s' % (p, int(time.time() * 1000) % 10 ** 8, uuid.uuid4().hex[:6])


def log(who, action, detail=''):
    with db() as c:
        c.execute('INSERT INTO logs (time,who,action,detail) VALUES (?,?,?,?)',
                  (now(), who, action, detail))


def check_words(t):
    for w in BAD_WORDS:
        if w in t:
            return w
    return ''


def tok():
    return uuid.uuid4().hex + uuid.uuid4().hex


def current_user():
    """从 X-Auth-Token 解析当前登录用户"""
    t = request.headers.get('X-Auth-Token', '')
    if not t:
        return None
    with db() as c:
        r = c.execute('SELECT * FROM users WHERE token=?', (t,)).fetchone()
    return r


def require_admin():
    u = current_user()
    if not u or u['role'] != 'admin' or u['status'] != 'active':
        return None
    return u


def row2user(r):
    return {
        'id': r['id'], 'name': r['name'], 'user': r['user'], 'role': r['role'],
        'cls': r['cls'], 'enroll': r['enroll'], 'origin': r['origin'],
        'phone': r['phone'] or '', 'addr': r['addr'] or '',
        'showPhone': bool(r['show_phone']), 'showAddr': bool(r['show_addr']),
        'intro': r['intro'] or '', 'avatar': r['avatar'] or '',
        'createdAt': r['created_at'], 'status': r['status']
    }


def row2member(r):
    return {
        'id': r['id'], 'name': r['name'], 'nick': r['nick'] or '',
        'role': r['role'] or 'student', 'title': r['title'] or '',
        'cls': r['cls'], 'enroll': r['enroll'], 'origin': r['origin'] or '',
        'note': r['note'] or '', 'memorial': bool(r['memorial']),
        'phone': r['phone'] or '', 'addr': r['addr'] or '',
        'showPhone': bool(r['show_phone']), 'showAddr': bool(r['show_addr']),
        'ownerId': r['owner_id'] or ''
    }


def row2photo(r):
    return {
        'id': r['id'], 'cat': r['cat'], 'src': r['src'], 'title': r['title'],
        'year': r['year'] or '', 'desc': r['descr'] or '',
        'uploader': r['uploader'], 'userId': r['user_id'] or '',
        'time': r['time'], 'status': r['status'], 'builtin': bool(r['builtin'])
    }


# ---------------------------------------------------------------- 站点托管
@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/uploads/<path:filename>')
def uploads(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('assets/img/favicon.ico')


# ---------------------------------------------------------------- 状态接口
@app.route('/api/ping')
def api_ping():
    """前端用它判断"有没有后端"。静态托管时这里会 404，前端自动退回本地存储模式。"""
    with db() as c:
        n = c.execute('SELECT COUNT(*) AS n FROM members').fetchone()['n']
    return jsonify({'ok': True, 'mode': 'server', 'version': 1, 'members': n})


@app.route('/api/state')
def api_state():
    """一次性拿到全部数据（不含口令哈希），前端写入本地缓存后照常渲染。
    未审核的内容只给管理员和作者本人，其余人只拿到已通过的。"""
    me = current_user()
    is_admin = bool(me and me['role'] == 'admin')
    my_id = me['id'] if me else ''

    def visible(status, owner):
        return is_admin or status == 'approved' or owner == my_id

    with db() as c:
        members = [row2member(r) for r in c.execute('SELECT * FROM members ORDER BY id')]
        photos = [row2photo(r) for r in c.execute('SELECT * FROM photos ORDER BY id DESC')
                  if visible(r['status'], r['user_id'] or '')]
        users = [row2user(r) for r in c.execute('SELECT * FROM users ORDER BY created_at')]
        msgs = []
        for r in c.execute('SELECT * FROM messages ORDER BY time DESC'):
            if not visible(r['status'], r['user_id'] or ''):
                continue
            reps = [{'id': x['id'], 'author': x['author'], 'time': x['time'], 'text': x['text']}
                    for x in c.execute('SELECT * FROM replies WHERE msg_id=? ORDER BY id',
                                       (r['id'],))]
            msgs.append({'id': r['id'], 'author': r['author'], 'cls': r['cls'] or '',
                         'userId': r['user_id'] or '', 'time': r['time'],
                         'status': r['status'], 'text': r['text'], 'replies': reps})
    return jsonify({'members': members, 'messages': msgs, 'photos': photos, 'users': users})


@app.route('/api/seed', methods=['POST'])
def api_seed():
    """首次启动时，把 js/seed.js 里的初始内容写进数据库（只在表为空时执行）。"""
    d = request.json or {}
    with db() as c:
        if c.execute('SELECT COUNT(*) AS n FROM members').fetchone()['n'] == 0:
            for i, m in enumerate(d.get('members', [])):
                c.execute('INSERT OR REPLACE INTO members VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                          ('m%d' % (1000 + i), m.get('name'), m.get('nick', ''),
                           m.get('role', 'student'), m.get('title', ''),
                           m.get('cls', '钳工七班'), m.get('enroll', '1992'),
                           m.get('origin', ''), m.get('note', ''),
                           1 if m.get('memorial') else 0, '', '', 0, 0, ''))
        if c.execute('SELECT COUNT(*) AS n FROM messages').fetchone()['n'] == 0:
            for m in d.get('messages', []):
                mid = uid('msg')
                c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?)',
                          (mid, m.get('author'), m.get('cls', ''), '',
                           m.get('time', now()), m.get('status', 'approved'), m.get('text', '')))
                for r in m.get('replies', []):
                    c.execute('INSERT INTO replies VALUES (?,?,?,?,?)',
                              (uid('rep'), mid, r.get('author'), r.get('time', now()), r.get('text')))
        if c.execute('SELECT COUNT(*) AS n FROM photos').fetchone()['n'] == 0:
            for i, p in enumerate(d.get('photos', [])):
                c.execute('INSERT OR REPLACE INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                          ('p%d' % (2000 + i), p.get('cat', 'class'), p.get('src'),
                           p.get('title'), p.get('year', ''), p.get('desc', ''),
                           p.get('uploader', '老墨'), '', now(), 'approved', 1))
    log('系统', '初始化数据', '由前端 seed.js 写入')
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 账号
@app.route('/api/register', methods=['POST'])
def api_register():
    d = request.json or {}
    name = (d.get('name') or '').strip()
    user = (d.get('user') or '').strip()
    pwd = d.get('pass') or ''
    if not name or not user or not pwd:
        return jsonify({'ok': False, 'msg': '姓名、账号、密码都不能为空'})
    if len(pwd) < 6:
        return jsonify({'ok': False, 'msg': '密码至少 6 位'})
    if not d.get('cls') or not d.get('enroll'):
        return jsonify({'ok': False, 'msg': '请填写届别与班级'})
    with db() as c:
        if c.execute('SELECT id FROM users WHERE user=?', (user,)).fetchone():
            return jsonify({'ok': False, 'msg': '该账号已被注册，请换一个'})
        u = {'id': uid('u'), 'name': name, 'user': user,
             'pass': generate_password_hash(pwd),          # 注意：pass 是关键字，只能用字典字面量
             'role': 'user', 'cls': d.get('cls'), 'enroll': d.get('enroll'),
             'origin': d.get('origin', ''), 'phone': '', 'addr': '',
             'show_phone': 0, 'show_addr': 0,
             'intro': '', 'avatar': name[-1:], 'created_at': now(),
             'status': 'active', 'token': tok()}
        c.execute('INSERT INTO users VALUES ('
                  ':id,:name,:user,:pass,:role,:cls,:enroll,:origin,:phone,:addr,'
                  ':show_phone,:show_addr,:intro,:avatar,:created_at,:status,:token,0)', u)
    log(name, '注册', '%s 级 %s' % (d.get('enroll'), d.get('cls')))
    return jsonify({'ok': True, 'user': row2user(_load_user(u['id'])), 'token': u['token']})


def _load_user(uid_):
    with db() as c:
        return c.execute('SELECT * FROM users WHERE id=?', (uid_,)).fetchone()


@app.route('/api/login', methods=['POST'])
def api_login():
    d = request.json or {}
    with db() as c:
        r = c.execute('SELECT * FROM users WHERE user=?',
                      ((d.get('user') or '').strip(),)).fetchone()   # 注意逗号：单元素元组
    if not r or not check_password_hash(r['pass'], d.get('pass') or ''):
        return jsonify({'ok': False, 'msg': '账号或密码不正确'})
    if r['status'] == 'banned':
        return jsonify({'ok': False, 'msg': '该账号已被停用，请联系管理员'})
    t = tok()
    with db() as c:
        c.execute('UPDATE users SET token=? WHERE id=?', (t, r['id']))
    log(r['name'], '登录', '')
    return jsonify({'ok': True, 'token': t, 'user': row2user(r)})


@app.route('/api/me')
def api_me():
    u = current_user()
    return jsonify({'user': row2user(u) if u else None})


@app.route('/api/password', methods=['POST'])
def api_password():
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '未登录'})
    d = request.json or {}
    if not check_password_hash(u['pass'], d.get('oldP') or ''):
        return jsonify({'ok': False, 'msg': '原密码不正确'})
    np = d.get('newP') or ''
    if len(np) < 6:
        return jsonify({'ok': False, 'msg': '新密码至少 6 位'})
    with db() as c:
        c.execute('UPDATE users SET pass=? WHERE id=?', (generate_password_hash(np), u['id']))
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 用户管理（管理员）
@app.route('/api/users')
def api_users():
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        return jsonify({'users': [row2user(r) for r in c.execute('SELECT * FROM users')]})


@app.route('/api/users/<uid_>/ban', methods=['POST'])
def api_ban(uid_):
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        r = c.execute('SELECT * FROM users WHERE id=?', (uid_,)).fetchone()
        if not r or r['role'] == 'admin':
            return jsonify({'ok': False, 'msg': '不能操作该账号'})
        c.execute('UPDATE users SET status=? WHERE id=?',
                  ('active' if r['status'] == 'banned' else 'banned', uid_))
    return jsonify({'ok': True})


@app.route('/api/users/<uid_>', methods=['DELETE'])
def api_del_user(uid_):
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        r = c.execute('SELECT * FROM users WHERE id=?', (uid_,)).fetchone()
        if not r or r['role'] == 'admin':
            return jsonify({'ok': False, 'msg': '不能删除该账号'})
        c.execute('DELETE FROM users WHERE id=?', (uid_,))
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 名录
@app.route('/api/members/<mid>/claim', methods=['POST'])
def api_claim(mid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    with db() as c:
        c.execute('UPDATE members SET owner_id="", phone="", addr="", '
                  'show_phone=0, show_addr=0 WHERE owner_id=?', (u['id'],))
        c.execute('UPDATE members SET owner_id=? WHERE id=?', (u['id'], mid))
    log(u['name'], '认领名录', mid)
    return jsonify({'ok': True})


@app.route('/api/members/<mid>/profile', methods=['PUT'])
def api_profile(mid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    d = request.json or {}
    with db() as c:
        r = c.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
        if not r:
            return jsonify({'ok': False, 'msg': '名录条目不存在'})
        if r['owner_id'] != u['id'] and u['role'] != 'admin':
            return jsonify({'ok': False, 'msg': '只能修改自己认领的条目'}), 403
        c.execute('UPDATE members SET phone=?, addr=?, note=?, show_phone=?, show_addr=? '
                  'WHERE id=?',
                  ((d.get('phone') or '')[:40], (d.get('addr') or '')[:80],
                   (d.get('note') or '')[:120],
                   1 if d.get('showPhone') else 0, 1 if d.get('showAddr') else 0, mid))
    return jsonify({'ok': True})


@app.route('/api/members/<mid>/unclaim', methods=['POST'])
def api_unclaim(mid):
    """管理员可解除任何人的认领；本人也可以解除自己的认领。"""
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    with db() as c:
        r = c.execute('SELECT * FROM members WHERE id=?', (mid,)).fetchone()
        if not r:
            return jsonify({'ok': False, 'msg': '名录条目不存在'})
        if u['role'] != 'admin' and r['owner_id'] != u['id']:
            return jsonify({'ok': False, 'msg': '只能解除自己的认领'}), 403
        c.execute('UPDATE members SET owner_id="", phone="", addr="", '
                  'show_phone=0, show_addr=0 WHERE id=?', (mid,))
    log(u['name'], '解除认领', mid)
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 留言
@app.route('/api/messages', methods=['POST'])
def api_add_msg():
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    text = (request.json or {}).get('text', '').strip()
    if not text:
        return jsonify({'ok': False, 'msg': '留言内容不能为空'})
    if len(text) > 1200:
        return jsonify({'ok': False, 'msg': '留言最多 1200 字'})
    w = check_words(text)
    if w:
        return jsonify({'ok': False, 'msg': '留言包含不适宜词语（%s），请修改后重新提交' % w})
    with db() as c:
        c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?)',
                  (uid('msg'), u['name'], u['cls'] or '', u['id'], now(), 'pending', text))
    return jsonify({'ok': True})


@app.route('/api/messages/<mid>/reply', methods=['POST'])
def api_reply(mid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    text = (request.json or {}).get('text', '').strip()
    if not text:
        return jsonify({'ok': False, 'msg': '回复内容不能为空'})
    if len(text) > 400:
        return jsonify({'ok': False, 'msg': '回复最多 400 字'})
    w = check_words(text)
    if w:
        return jsonify({'ok': False, 'msg': '回复包含不适宜词语（%s），请修改后重新提交' % w})
    with db() as c:
        c.execute('INSERT INTO replies VALUES (?,?,?,?,?)',
                  (uid('rep'), mid, u['name'], now(), text))
    return jsonify({'ok': True})


@app.route('/api/messages/<mid>/status', methods=['POST'])
def api_msg_status(mid):
    a = require_admin()
    if not a:
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    st = (request.json or {}).get('status')
    if st not in ('approved', 'rejected', 'pending'):
        return jsonify({'ok': False, 'msg': '状态不合法'})
    with db() as c:
        c.execute('UPDATE messages SET status=? WHERE id=?', (st, mid))
    log(a['name'], '留言审核', '%s → %s' % (mid, st))
    return jsonify({'ok': True})


@app.route('/api/messages/<mid>', methods=['DELETE'])
def api_del_msg(mid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    with db() as c:
        r = c.execute('SELECT * FROM messages WHERE id=?', (mid,)).fetchone()
        if not r:
            return jsonify({'ok': False, 'msg': '留言不存在'})
        if r['user_id'] != u['id'] and u['role'] != 'admin':
            return jsonify({'ok': False, 'msg': '只能删除自己的留言'}), 403
        c.execute('DELETE FROM replies WHERE msg_id=?', (mid,))
        c.execute('DELETE FROM messages WHERE id=?', (mid,))
    log(u['name'], '删除留言', mid)
    return jsonify({'ok': True})


@app.route('/api/messages/<mid>/replies/<rid>', methods=['DELETE'])
def api_del_reply(mid, rid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    with db() as c:
        r = c.execute('SELECT * FROM replies WHERE id=? AND msg_id=?', (rid, mid)).fetchone()
        if not r:
            return jsonify({'ok': False, 'msg': '回复不存在'})
        if r['author'] != u['name'] and u['role'] != 'admin':
            return jsonify({'ok': False, 'msg': '只能删除自己的回复'}), 403
        c.execute('DELETE FROM replies WHERE id=?', (rid,))
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 照片
@app.route('/api/photos', methods=['POST'])
def api_add_photo():
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    d = request.json or {}
    title = (d.get('title') or '').strip() or '未命名照片'
    desc = (d.get('desc') or '').strip()
    w = check_words(title + desc)
    if w:
        return jsonify({'ok': False, 'msg': '说明文字含不适宜词语（%s），请修改' % w})

    src = d.get('src') or ''
    if src.startswith('data:'):
        # base64 图片落盘，避免把大段数据塞进数据库
        try:
            head, b64 = src.split(',', 1)
            ext = 'jpg' if 'jpeg' in head or 'jpg' in head else 'png'
            fn = '%s.%s' % (uid('up'), ext)
            with open(os.path.join(UPLOAD_DIR, fn), 'wb') as f:
                f.write(base64.b64decode(b64))
            src = '/uploads/' + fn
        except Exception as e:
            return jsonify({'ok': False, 'msg': '图片保存失败：%s' % e})

    with db() as c:
        c.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                  (uid('p'), d.get('cat', 'class'), src, title,
                   (d.get('year') or '')[:20], desc[:300], u['name'], u['id'],
                   now(), 'pending', 0))
    log(u['name'], '上传照片', title)
    return jsonify({'ok': True})


@app.route('/api/photos/<pid>/status', methods=['POST'])
def api_photo_status(pid):
    a = require_admin()
    if not a:
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    st = (request.json or {}).get('status')
    if st not in ('approved', 'rejected', 'pending'):
        return jsonify({'ok': False, 'msg': '状态不合法'})
    with db() as c:
        c.execute('UPDATE photos SET status=? WHERE id=?', (st, pid))
    log(a['name'], '照片审核', '%s → %s' % (pid, st))
    return jsonify({'ok': True})


@app.route('/api/photos/<pid>', methods=['DELETE'])
def api_del_photo(pid):
    u = current_user()
    if not u:
        return jsonify({'ok': False, 'msg': '请先登录'}), 401
    with db() as c:
        r = c.execute('SELECT * FROM photos WHERE id=?', (pid,)).fetchone()
        if not r:
            return jsonify({'ok': False, 'msg': '照片不存在'})
        if r['user_id'] != u['id'] and u['role'] != 'admin':
            return jsonify({'ok': False, 'msg': '只能删除自己上传的照片'}), 403
        c.execute('DELETE FROM photos WHERE id=?', (pid,))
        # 顺手清理磁盘文件（只清理 /uploads/ 下的）
        try:
            if r['src'].startswith('/uploads/'):
                os.remove(os.path.join(UPLOAD_DIR, os.path.basename(r['src'])))
        except OSError:
            pass
    log(u['name'], '删除照片', pid)
    return jsonify({'ok': True})


# ---------------------------------------------------------------- 后台杂项
@app.route('/api/logs')
def api_logs():
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        rows = [{'time': r['time'], 'who': r['who'], 'action': r['action'],
                 'detail': r['detail']}
                for r in c.execute('SELECT * FROM logs ORDER BY id DESC LIMIT 300')]
    return jsonify({'logs': rows})


@app.route('/api/backup')
def api_backup():
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        data = {
            'v': 1, 'exportedAt': now(),
            'members': [row2member(r) for r in c.execute('SELECT * FROM members')],
            'messages': [], 'photos': [row2photo(r) for r in c.execute('SELECT * FROM photos')],
            'users': [row2user(r) for r in c.execute('SELECT * FROM users')],
            'logs': [{'time': r['time'], 'who': r['who'], 'action': r['action'],
                      'detail': r['detail']}
                     for r in c.execute('SELECT * FROM logs ORDER BY id DESC LIMIT 300')]
        }
        for r in c.execute('SELECT * FROM messages'):
            reps = [{'id': x['id'], 'author': x['author'], 'time': x['time'], 'text': x['text']}
                    for x in c.execute('SELECT * FROM replies WHERE msg_id=?', (r['id'],))]
            data['messages'].append({'id': r['id'], 'author': r['author'],
                                     'cls': r['cls'] or '', 'userId': r['user_id'] or '',
                                     'time': r['time'], 'status': r['status'],
                                     'text': r['text'], 'replies': reps})
    return jsonify(data)


@app.route('/api/reset', methods=['POST'])
def api_reset():
    """危险操作：清空业务数据，保留管理员账号。前端会随后重新写入 seed。"""
    if not require_admin():
        return jsonify({'ok': False, 'msg': '需要管理员权限'}), 403
    with db() as c:
        c.execute('DELETE FROM messages')
        c.execute('DELETE FROM replies')
        c.execute('DELETE FROM photos')
        c.execute('DELETE FROM members')
        c.execute("DELETE FROM users WHERE role<>'admin'")
        c.execute('DELETE FROM logs')
    log('管理员', '恢复初始数据', '已清空业务数据')
    return jsonify({'ok': True})


@app.errorhandler(404)
def not_found(e):
    # /api/* 的 404 返回 JSON，页面 404 交给 Flask 默认处理
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'msg': '接口不存在'}), 404
    return e


# ---------------------------------------------------------------- 启动
def main():
    ap = argparse.ArgumentParser(description='国防技校同学录 后端服务')
    ap.add_argument('--host', default='127.0.0.1', help='监听地址，局域网用 0.0.0.0')
    ap.add_argument('--port', type=int, default=5000, help='端口，默认 5000')
    ap.add_argument('--debug', action='store_true', help='调试模式（改动自动重启）')
    a = ap.parse_args()

    init_db()
    print('=' * 62)
    print('  国防技校同学录 · 后端已启动')
    print('=' * 62)
    print('  本机访问： http://127.0.0.1:%d' % a.port)
    if a.host == '0.0.0.0':
        print('  局域网访问： http://<本机IP>:%d   （同学用这个）' % a.port)
    print('  数据库：   %s' % DB_PATH)
    print('  上传目录： %s' % UPLOAD_DIR)
    print('  管理员：   admin / admin888   ← 上线前请务必修改')
    print('  停止服务： 按 Ctrl + C')
    print('=' * 62)
    app.run(host=a.host, port=a.port, debug=a.debug, threaded=True)


if __name__ == '__main__':
    main()

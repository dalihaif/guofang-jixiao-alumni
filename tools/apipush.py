# -*- coding: utf-8 -*-
"""git push 走不通时的备用方案：直接用 GitHub Contents API 提交改动文件。
用法：python tools/apipush.py [commit message]
"""
import base64, os, subprocess, sys

TOKEN_FILE = os.path.join(os.path.expanduser('~'), '.gh_tmp3')
TOKEN = open(TOKEN_FILE).read().strip()
REPO = 'dalihaif/guofang-jixiao-alumni'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MSG = sys.argv[1] if len(sys.argv) > 1 else 'chore: 通过 API 同步文件'


def gh(args, jq=None):
    cmd = ['gh', 'api'] + args + (['--jq', jq] if jq else [])
    env = dict(os.environ, GH_TOKEN=TOKEN)
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=ROOT)
    return r.stdout.strip(), r.returncode


changed = subprocess.run(['git', 'diff', '--name-only', 'HEAD~1', 'HEAD'],
                         capture_output=True, text=True, cwd=ROOT).stdout.split()
print('待同步文件：', changed)

ok = 0
for rel in changed:
    rel = rel.strip().strip('"')
    if not rel:
        continue
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        print('  [跳过·文件已删除]', rel)
        continue
    b64 = base64.b64encode(open(p, 'rb').read()).decode()
    api_path = 'repos/%s/contents/%s' % (REPO, rel.replace(os.sep, '/'))
    sha, rc = gh([api_path], '.sha')
    payload = ['-X', 'PUT', api_path, '-f', 'message=' + MSG, '-f', 'content=' + b64]
    if rc == 0 and sha:
        payload += ['-f', 'sha=' + sha]
    out, rc2 = gh(payload, '.content.name')
    if rc2 == 0:
        ok += 1
        print('  [OK]  ', rel)
    else:
        print('  [FAIL]', rel, '->', out[:160])

print('\n完成：成功 %d 个' % ok)

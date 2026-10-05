#!/usr/bin/env bash
# ===================================================================
#  云南省国防技校校友网 · 启动后端服务（macOS / Linux）
#  用法： bash 启动服务.sh
# ===================================================================
set -e
cd "$(dirname "$0")"

echo
echo "  ============ 云南省国防技校校友网 · 后端服务 ============"
echo
read -p "  局域网同学也要访问？[y/N] " LAN
if [ "$LAN" = "y" ] || [ "$LAN" = "Y" ]; then HOST=0.0.0.0; else HOST=127.0.0.1; fi

echo "  [1/3] 检查 Python..."
command -v python3 >/dev/null || { echo "  请先安装 Python 3.8+"; exit 1; }

echo "  [2/3] 安装 / 检查 Flask..."
python3 -m pip install -q flask

echo "  [3/3] 启动服务...（Ctrl+C 停止）"
echo
if [ "$HOST" = "0.0.0.0" ]; then
  echo "  局域网同学请使用： http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I | awk '{print $1}'):5000"
  echo
fi
exec python3 server/app.py --host "$HOST" --port 5000

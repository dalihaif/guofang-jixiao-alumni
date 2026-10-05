#!/usr/bin/env bash
# ===================================================================
#  把上级目录里的两个大视频复制到本站 assets/media/ 下（macOS / Linux 用）
#  用法： bash 导入视频素材.sh
# ===================================================================
set -e
cd "$(dirname "$0")"
mkdir -p assets/media

copy_one () {
  local src="$1" dst="$2"
  if [ ! -f "$src" ]; then echo "  [跳过] 找不到源文件：$src"; return; fi
  if [ -f "$dst" ]; then echo "  [已存在] $dst"; return; fi
  echo "  正在复制 $src ...（文件较大，请稍等）"
  cp "$src" "$dst" && echo "  [完成] $dst"
}

echo
echo "  ============ 云南省国防技校校友网 · 影音素材导入 ============"
echo
copy_one "../国防钳七.mp4" "assets/media/guofang-qianqi.mp4"
copy_one "../同学.mp4"     "assets/media/tongxue.mp4"
echo
echo "  完成。打开 album.html 可查看“影音资料”栏目。"
echo

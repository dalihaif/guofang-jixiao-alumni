@echo off
chcp 65001 >nul
rem ===================================================================
rem  国防技校同学录 · 一键发布到 GitHub Pages
rem  用法：
rem    0. 先提交改动：git add -A  &&  git commit -m "说明"
rem    1. 双击运行（会提示输入令牌），或命令行：发布到GitHub.bat ghp_你的令牌
rem    2. 若 git push 被代理掐断，脚本会自动改用 GitHub API 提交（只需本地已 commit）
rem
rem  令牌获取： https://github.com/settings/tokens
rem            → Generate new token (classic) → 勾选 repo → 生成
rem ===================================================================
setlocal

set REPO_NAME=guofang-jixiao-alumni
set REPO_OWNER=dalihaif

cd /d "%~dp0"

set TK=%~1
if "%TK%"=="" (
  echo.
  echo   ============ 国防技校同学录 · GitHub 发布 ============
  echo.
  echo   请到 https://github.com/settings/tokens 生成令牌（勾选 repo 权限）
  echo.
  set /p TK=   粘贴你的 GitHub 令牌：
)

if "%TK%"=="" ( echo   未输入令牌，已取消。 & pause & exit /b )

echo.
echo   [1/5] 校验令牌...
set GH_TOKEN=%TK%
gh api user --jq ".login" > "%TEMP%\ghuser.txt" 2>nul
set /p GHUSER=<"%TEMP%\ghuser.txt"
if not "%GHUSER%"=="%REPO_OWNER%" (
  echo   令牌无效或不属于 %REPO_OWNER%（当前识别为：%GHUSER%）
  del "%TEMP%\ghuser.txt" 2>nul
  pause & exit /b
)
echo   已认证：%GHUSER%

echo.
echo   [2/5] 创建仓库 %REPO_OWNER%/%REPO_NAME% （公开）...
gh repo create "%REPO_OWNER%/%REPO_NAME%" --public --source=. --remote=origin --push 2>nul
if errorlevel 1 (
  echo   创建失败（可能仓库已存在）。尝试直接推送...
  git remote remove origin >nul 2>&1
  git remote add origin https://github.com/%REPO_OWNER%/%REPO_NAME%.git
  git push -u origin main
)

echo.
echo   [3/5] 推送代码...
git push -u origin main
if errorlevel 1 (
  echo.
  echo   git 推送被网络/代理掐断，改用 GitHub API 提交（tools\apipush_tree.py）...
  echo   注意：API 方式提交的是"已 commit 的改动"，请先 git add -A ^&^& git commit -m "说明"
  python tools\apipush_tree.py HEAD~1 "chore: 通过 API 同步站点改动"
)

echo.
echo   [4/5] 开启 GitHub Pages（分支 main / 根目录）...
gh api -X POST "repos/%REPO_OWNER%/%REPO_NAME%/pages" -f "source[branch]=main" -f "source[path]=/" >nul 2>&1
if errorlevel 1 (
  echo   Pages 可能已开启，尝试更新配置...
  gh api -X PUT "repos/%REPO_OWNER%/%REPO_NAME%/pages" -f "source[branch]=main" -f "source[path]=/" >nul 2>&1
)

echo.
echo   [5/5] 等待 Pages 部署（约 1-2 分钟）...
timeout /t 60 /nobreak >nul

echo.
echo   ============================================
echo     发布完成！
echo     仓库：  https://github.com/%REPO_OWNER%/%REPO_NAME%
echo     站点：  https://%REPO_OWNER%.github.io/%REPO_NAME%/
echo   ============================================
echo.
echo   提示：首次部署可能需要 1-2 分钟，之后刷新即可访问。
echo   如显示 404，请到仓库 Settings → Pages 确认 Source 为 main / root。
echo.
pause

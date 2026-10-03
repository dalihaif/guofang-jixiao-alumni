@echo off
chcp 65001 >nul
rem ===================================================================
rem  国防技校同学录 · 启动后端服务（Windows 双击运行）
rem  ================================================================
rem  启动后：
rem    本机访问   http://127.0.0.1:5000
rem    局域网同学 http://你的内网IP:5000   （选下面的选项 2）
rem ===================================================================
setlocal
cd /d "%~dp0"

echo.
echo   ============ 国防技校同学录 · 后端服务 ============
echo.
echo   请选择启动方式：
echo     1  只在本机访问（默认，直接回车即可）
echo     2  让局域网同学一起访问
echo.
set /p CH=   输入 1 或 2 后回车：

if "%CH%"=="2" (set HOST=0.0.0.0) else (set HOST=127.0.0.1)

echo.
echo   [1/3] 检查 Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo   没有找到 Python，请先安装 Python 3.8 以上版本（https://www.python.org/downloads/）
  pause & exit /b
)

echo   [2/3] 安装 / 检查 Flask...
python -m pip install -q flask
if errorlevel 1 (
  echo   Flask 安装失败，请手动执行： pip install flask
  pause & exit /b
)

echo   [3/3] 启动服务...（关闭本窗口即停止服务）
echo.
if "%HOST%"=="0.0.0.0" (
  echo   局域网同学请用下面的地址访问（把 127.0.0.1 换成你的内网 IP）：
  ipconfig | findstr /i "IPv4"
  echo.
)
python server\app.py --host %HOST% --port 5000

pause

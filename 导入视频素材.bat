@echo off
chcp 65001 >nul
rem ===================================================================
rem  把上级目录里的两个大视频复制到本站 assets\media\ 下
rem  视频共有 900 多 MB，不适合随网站一起打包，所以单独复制。
rem  双击运行本文件即可。若提示已存在，按 Y 覆盖 / N 跳过均可。
rem ===================================================================
setlocal
cd /d "%~dp0"
if not exist "assets\media" mkdir "assets\media"

echo.
echo   ============ 国防技校同学录 · 影音素材导入 ============
echo.

call :copyone "..\国防钳七.mp4"  "assets\media\guofang-qianqi.mp4"
call :copyone "..\同学.mp4"      "assets\media\tongxue.mp4"

echo.
echo   完成。若两个视频都复制成功，请打开 album.html 查看"影音资料"栏目。
echo.
pause
exit /b

:copyone
if not exist "%~1" (
  echo   [跳过] 找不到源文件：%~1
  exit /b
)
if exist "%~2" (
  echo   [已存在] %~2
  exit /b
)
echo   正在复制 %~1  ...  文件较大，请稍等
copy /Y "%~1" "%~2" >nul
if errorlevel 1 (
  echo   [失败] 复制出错，请手动把 %~1 复制为 %~2
) else (
  echo   [完成] %~2
)
exit /b

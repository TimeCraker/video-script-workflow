@echo off
cd /d "%~dp0"
echo ============================================
echo   视频剧本工作流 Reader - rebuild docs
echo ============================================
echo.
node build.mjs
echo.
if exist "阅读器.html" (echo [OK] 阅读器.html 已更新，正在打开...) else (echo [OK] 已生成阅读器.html)
start "" "阅读器.html"
echo.
pause

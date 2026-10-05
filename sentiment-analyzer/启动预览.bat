@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ==============================================
echo    心晴分析 - 中文情感分析器
echo.
echo    电脑访问:  http://localhost:8340
echo    关闭本窗口即停止服务
echo  ==============================================
echo.
start "" http://localhost:8340/
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8340
) else (
  py -m http.server 8340
)
pause

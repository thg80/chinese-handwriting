@echo off
chcp 65001 >nul
:: 文件input: 依赖系统已安装的 Python 或 Node.js 环境。
:: 文件output: 启动本地 HTTP 服务器（绑定 0.0.0.0 支持局域网访问），输出本机与局域网访问地址，并尝试自动打开浏览器。
:: 文件pos: 在系统局部的地位是开发辅助工具，一键启动本地预览环境。
:: 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。

set "PORT=8080"
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ==========================================
echo   提笔忘字 - 本地 HTTP 服务器启动工具
echo ==========================================
echo.

:: 尝试查找 Python
set "PYTHON_CMD="
where python >nul 2>&1 && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
    where python3 >nul 2>&1 && set "PYTHON_CMD=python3"
)

:: 获取局域网 IP（通过 Python，兼容多网卡）
set "LOCAL_IP="
if defined PYTHON_CMD (
    for /f "tokens=*" %%a in ('%PYTHON_CMD% -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()" 2^>nul') do set "LOCAL_IP=%%a"
)

if defined PYTHON_CMD (
    echo [INFO] 检测到 Python: %PYTHON_CMD%
    echo [INFO] 正在启动服务器，端口 %PORT% ...
    echo.
    echo 本机访问:   http://localhost:%PORT%
    if defined LOCAL_IP (
        echo 局域网访问: http://%LOCAL_IP%:%PORT%
    )
    echo.
    start http://localhost:%PORT%
    %PYTHON_CMD% -m http.server %PORT% --bind 0.0.0.0
    goto :end
)

:: 尝试查找 Node.js
where node >nul 2>&1 (
    echo [INFO] 检测到 Node.js
    echo [INFO] 正在启动服务器，端口 %PORT% ...
    echo.
    echo 本机访问:   http://localhost:%PORT%
    if defined LOCAL_IP (
        echo 局域网访问: http://%LOCAL_IP%:%PORT%
    )
    echo.
    start http://localhost:%PORT%
    npx serve -l %PORT%
    goto :end
)

echo [ERROR] 未检测到 Python 或 Node.js，请先安装其中之一。
echo.
echo 安装建议：
echo   - Python: https://www.python.org/downloads/
echo   - Node.js: https://nodejs.org/
pause

:end

#!/usr/bin/env bash
# 文件input: 依赖系统已安装的 Python 或 Node.js 环境。
# 文件output: 启动本地 HTTP 服务器（绑定 0.0.0.0 支持局域网访问），输出本机与局域网访问地址，并尝试自动打开浏览器。
# 文件pos: 在系统局部的地位是开发辅助工具，一键启动本地预览环境。
# 声明：一旦我被更新，务必更新我的开头注释，以及所属的文件夹的md。

set -e

PORT=8080
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  提笔忘字 - 本地 HTTP 服务器启动工具"
echo "=========================================="
echo ""

# 检测可用命令并启动
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
fi

# 获取局域网 IP（通过 Python，兼容多网卡）
LOCAL_IP=""
if [ -n "$PYTHON_CMD" ]; then
    LOCAL_IP=$($PYTHON_CMD -c "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); print(s.getsockname()[0]); s.close()" 2>/dev/null || echo "")
fi
LOCAL_IP=192.168.1.9
if [ -n "$PYTHON_CMD" ]; then
    echo "[INFO] 检测到 Python: $PYTHON_CMD"
    echo "[INFO] 正在启动服务器，端口 $PORT ..."
    echo ""
    echo "本机访问:   http://localhost:$PORT"
    if [ -n "$LOCAL_IP" ]; then
        echo "局域网访问: http://$LOCAL_IP:$PORT"
    fi
    echo ""

    # 尝试打开浏览器（跨平台）
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:$PORT" >/dev/null 2>&1 || true
    elif command -v start >/dev/null 2>&1; then
        start "http://localhost:$PORT" >/dev/null 2>&1 || true
    fi

    $PYTHON_CMD -m http.server "$PORT" --bind 0.0.0.0
    exit 0
fi

if command -v node >/dev/null 2>&1; then
    echo "[INFO] 检测到 Node.js"
    echo "[INFO] 正在启动服务器，端口 $PORT ..."
    echo ""
    echo "本机访问:   http://localhost:$PORT"
    if [ -n "$LOCAL_IP" ]; then
        echo "局域网访问: http://$LOCAL_IP:$PORT"
    fi
    echo ""

    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:$PORT" >/dev/null 2>&1 || true
    elif command -v start >/dev/null 2>&1; then
        start "http://localhost:$PORT" >/dev/null 2>&1 || true
    fi

    npx serve -l "$PORT"
    exit 0
fi

echo "[ERROR] 未检测到 Python 或 Node.js，请先安装其中之一。"
echo ""
echo "安装建议："
echo "  - Python: https://www.python.org/downloads/"
echo "  - Node.js: https://nodejs.org/"
read -n 1 -s -r -p "按任意键退出..."
echo ""
exit 1

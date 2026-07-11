#!/usr/bin/env python3
"""
本地静态文件服务器。

意图：
- 用 HTTP 方式打开项目，避免 file:// 下 Service Worker、Web Worker、Wasm 加载失败。
- 自动寻找空闲端口，默认避开常见的 8080 占用问题。
- 使用 ThreadingHTTPServer，让浏览器并发加载 HTML、JS、CSS、Wasm 文件时不会互相阻塞。

运行：
    python3 server.py

可选参数：
    python3 server.py --port 9000
    python3 server.py --host 127.0.0.1
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import mimetypes
import os
import random
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_HOST = "127.0.0.1"
PREFERRED_PORT_RANGE = range(8100, 9000)


class StaticHandler(SimpleHTTPRequestHandler):
    """为 Wasm 和 JS 模块补齐 MIME，并附加跨源隔离相关响应头。"""

    def end_headers(self) -> None:
        # 本地开发时也补 COOP/COEP，和 GitHub Pages + coi-serviceworker 的运行环境保持一致。
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def port_is_free(host: str, port: int) -> bool:
    """检查端口是否可绑定。"""

    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
        return True


def choose_port(host: str, requested_port: int | None) -> int:
    """选择端口：用户指定则严格使用；未指定则从 8100-8999 随机找空闲端口。"""

    if requested_port is not None:
        if not port_is_free(host, requested_port):
            raise SystemExit(f"端口 {requested_port} 已被占用，请换一个端口。")
        return requested_port

    candidates = list(PREFERRED_PORT_RANGE)
    random.shuffle(candidates)
    for port in candidates:
        if port_is_free(host, port):
            return port

    raise SystemExit("没有在 8100-8999 范围内找到空闲端口。")


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""

    parser = argparse.ArgumentParser(description="启动黑白棋 AI 本地开发服务器")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"监听地址，默认 {DEFAULT_HOST}")
    parser.add_argument("--port", type=int, default=None, help="指定端口；不指定时自动随机选择")
    return parser.parse_args()


def main() -> None:
    """启动线程版静态服务器。"""

    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("text/javascript", ".js")

    args = parse_args()
    port = choose_port(args.host, args.port)
    handler = functools.partial(StaticHandler, directory=os.fspath(PROJECT_ROOT))
    server = ThreadingHTTPServer((args.host, port), handler)

    url = f"http://{args.host}:{port}/"
    print(f"黑白棋 AI 本地服务已启动：{url}", flush=True)
    print("按 Ctrl+C 停止服务。", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务。", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

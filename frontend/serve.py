#!/usr/bin/env python3
"""评审材料协作室 —— 前端静态资源服务。

仅使用 Python 标准库，将 frontend/ 目录下的静态文件通过 HTTP 提供，
监听端口 18130。React / Babel 依赖已内置在 frontend/vendor/ 中，
即使离线也能正常运行。
"""

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "0.0.0.0"
PORT = 18130
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 开发环境禁用缓存，保证改动即时生效
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("[web] %s - %s" % (self.address_string(), fmt % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("评审材料协作室 前端已启动: http://127.0.0.1:%d" % PORT)
    print("静态目录: %s" % ROOT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n前端已停止")
        server.shutdown()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Static server for the design prototypes.

Plain `http.server` answers with 304, and a browser keeps ES modules in a cache
of its own on top of that, so an edit can sit on disk whilst the page still runs
the previous version. That failure looks like a code error rather than a stale
file, which costs far more than the caching saves on a local prototype.
"""

import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4317
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, keyword, value):
        # Suppress the validators the base class adds, so the browser has nothing
        # to revalidate against and always takes the fresh body.
        if keyword in ("Last-Modified", "ETag"):
            return
        super().send_header(keyword, value)

    def log_message(self, *args):
        pass


class ReusableServer(socketserver.ThreadingTCPServer):
    """Threaded, because a page asking for a stylesheet and seventeen images at
    once starves a single-threaded server and the browser reports the dropped
    connections as failed resources."""

    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with ReusableServer(("127.0.0.1", PORT), handler) as server:
        print(f"design proposals on http://localhost:{PORT}")
        server.serve_forever()

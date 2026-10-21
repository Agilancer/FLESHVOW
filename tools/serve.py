"""Dev server that tells the browser never to cache, so edited ES modules always reload.

  python tools/serve.py [port]      (default 8171; serves the repo root)
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(SimpleHTTPRequestHandler):
  def __init__(self, *a, **k):
    super().__init__(*a, directory=ROOT, **k)

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store')
    super().end_headers()


if __name__ == '__main__':
  port = int(sys.argv[1]) if len(sys.argv) > 1 else 8171
  print(f'FLESHVOW on http://localhost:{port}')
  ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()

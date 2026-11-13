"""Local-only preview server. No third-party Python packages required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, sys, webbrowser, threading
os.chdir(Path(__file__).resolve().parent)
class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
server = None
for port in range(8765, 8775):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
        break
    except OSError:
        continue
if server is None:
    raise SystemExit('Ports 8765-8774 are occupied. Close another preview and retry.')
url = f'http://127.0.0.1:{port}/'
print('Open ' + url + '  |  Ctrl+C to stop', flush=True)
if '--open' in sys.argv:
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()

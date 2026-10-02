#!/usr/bin/env bash
# Sirve el sitio en local. No requiere instalar nada (usa python3).
# Envía Cache-Control: no-store para que el navegador nunca sirva componentes
# (*.dc.html, js/*.js) viejos al iterar.
cd "$(dirname "$0")"
PORT="${PORT:-5173}"
echo "Tita Media — local: http://localhost:${PORT}/index.html"
exec python3 - "$PORT" <<'PY'
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

ThreadingHTTPServer(("", int(sys.argv[1])), NoCache).serve_forever()
PY

# Petit serveur statique de développement.
# Identique à `python3 -m http.server`, mais interdit toute mise en cache
# du navigateur, sinon on teste de vieux fichiers sans s'en rendre compte.
# Sert la racine du dépôt, peu importe d'où il est lancé.
import http.server
import os
import socketserver

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 4174), NoCacheHandler) as httpd:
    print("serving on http://localhost:4174")
    httpd.serve_forever()

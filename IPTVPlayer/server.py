import http.server
import socketserver
import socket
import json
import os
import urllib.parse
import urllib.request
import sys

PORT = 8089

def get_lan_ip():
    """Detects the real LAN IP address reachable by other devices on the same Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Does not actually transmit packets, just queries local routing table
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

class IPTVHandler(http.server.SimpleHTTPRequestHandler):
    pending_credentials = None

    def end_headers(self):
        # Enable CORS and disable aggressive caching for API endpoints
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Return local server info and pairing URL
        if path == '/api/info':
            lan_ip = get_lan_ip()
            data = {
                'ip': lan_ip,
                'port': PORT,
                'setupUrl': f'http://{lan_ip}:{PORT}/setup.html'
            }
            body = json.dumps(data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(body)
            return

        # API: TV App checks for pending credentials entered on mobile device
        if path == '/api/credentials':
            if IPTVHandler.pending_credentials is not None:
                creds = IPTVHandler.pending_credentials
                IPTVHandler.pending_credentials = None  # Consume once
                resp = {'status': 'available', 'credentials': creds}
            else:
                resp = {'status': 'waiting'}
            body = json.dumps(resp).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(body)
            return

        # API: Real-time streaming proxy (bypasses IPTV server CORS & browser User-Agent restrictions)
        if path == '/api/proxy':
            query = urllib.parse.parse_qs(parsed.query)
            target_url = query.get('url', [None])[0]
            if not target_url:
                self.send_error(400, 'Missing url parameter')
                return
            try:
                req = urllib.request.Request(target_url, headers={
                    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
                    'Accept': '*/*'
                })
                if 'Range' in self.headers:
                    req.add_header('Range', self.headers['Range'])

                with urllib.request.urlopen(req, timeout=12) as remote_resp:
                    self.send_response(remote_resp.getcode())
                    content_type = remote_resp.headers.get('Content-Type') or ('application/vnd.apple.mpegurl' if '.m3u8' in target_url else 'video/mp2t')
                    self.send_header('Content-Type', content_type)
                    if 'Content-Length' in remote_resp.headers:
                        self.send_header('Content-Length', remote_resp.headers['Content-Length'])
                    if 'Content-Range' in remote_resp.headers:
                        self.send_header('Content-Range', remote_resp.headers['Content-Range'])
                    if 'Accept-Ranges' in remote_resp.headers:
                        self.send_header('Accept-Ranges', remote_resp.headers['Accept-Ranges'])
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Headers', '*')
                    self.end_headers()

                    while True:
                        chunk = remote_resp.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except Exception as e:
                try:
                    self.send_error(502, f'Streaming proxy error: {str(e)}')
                except Exception:
                    pass
            return

        # Route alias /setup to /setup.html
        if path == '/setup' or path == '/setup/':
            self.path = '/setup.html'

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Mobile phone sends credentials to TV
        if path == '/api/credentials':
            content_len = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_len).decode('utf-8')
            try:
                data = json.loads(raw_body)
                IPTVHandler.pending_credentials = data
                resp = {
                    'status': 'ok',
                    'message': 'Credentials sent to TV successfully!'
                }
                code = 200
            except Exception as e:
                resp = {'status': 'error', 'message': str(e)}
                code = 400

            body = json.dumps(resp).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_error(404, "Endpoint not found")

def run():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    lan_ip = get_lan_ip()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), IPTVHandler) as httpd:
        print(f"============================================================")
        print(f" IPTV Local Server Running with Mobile QR Setup Support")
        print(f" TV App URL:     http://localhost:{PORT}/index.html")
        print(f" Mobile Pairing: http://{lan_ip}:{PORT}/setup.html")
        print(f"============================================================", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == '__main__':
    run()

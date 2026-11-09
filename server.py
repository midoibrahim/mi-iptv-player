#!/usr/bin/env python3
"""
MI IPTV Player - Lightweight Local Test Server
Serves IPTVPlayer/ over HTTP with CORS headers on port 8088.
"""
import http.server
import socketserver
import os
import sys

PORT = 8088
ROOT = os.path.dirname(os.path.abspath(__file__))
DIRECTORY = os.path.join(ROOT, 'IPTVPlayer')

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

def run_server(port=PORT):
    handler = CORSRequestHandler
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"MI IPTV Player local server running at:")
        print(f"  --> http://localhost:{port}/")
        print(f"Serving directory: {DIRECTORY}")
        print("Press Ctrl+C to stop the server.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == '__main__':
    p = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    run_server(p)


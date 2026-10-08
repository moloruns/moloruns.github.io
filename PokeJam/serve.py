"""Desktop static preview: choose a free port and print the actual URL."""
import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8003)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65515:
        parser.error("Port must be between 1024 and 65515")
    handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    else:
        parser.error("No free preview port found; choose a different --port")
    url = f"http://127.0.0.1:{server.server_port}/play.html"
    print(f"PokeJam: {url}\nKeep this terminal running. Stop with Ctrl+C.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

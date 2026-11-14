"""macOS integration regression: real loopback HTTP and native file clipboard.
Run with the companion app closed: python3 tests/web-copy-bridge.py
This test temporarily copies the bundled clap GIF to the system clipboard.
"""
import http.client
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://huddling-3team.vercel.app'
PORT = 47653


def request(method, path, body=None, origin=ORIGIN, token=None, extra=None):
    connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=5)
    headers = {'Origin': origin}
    if body is not None:
        headers['Content-Type'] = 'image/gif'
    if token is not None:
        headers['X-Jjalkkak-Session'] = token
    headers.update(extra or {})
    connection.request(method, path, body, headers)
    response = connection.getresponse()
    data = response.read()
    result = response.status, dict(response.getheaders()), json.loads(data) if data else {}
    connection.close()
    return result


with socket.socket() as probe:
    assert probe.connect_ex(('127.0.0.1', PORT)) != 0, 'Close the running companion first'

with tempfile.TemporaryDirectory(prefix='jjalkkak-bridge-test-') as stage:
    stage = Path(stage)
    (stage / 'main.swift').write_text('''import AppKit
import ImageIO
if CommandLine.arguments.count > 1 {
    let board = NSPasteboard.general
    guard let value = board.string(forType: .fileURL), let url = URL(string: value),
          let data = try? Data(contentsOf: url),
          let expected = try? Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])),
          let source = CGImageSourceCreateWithData(data as CFData, nil),
          data == expected, CGImageSourceGetCount(source) > 1,
          board.string(forType: .string) == nil else { exit(1) }
    print("Original bytes preserved; animated GIF file; no text/PNG fallback")
} else {
    let service = WebCopyBridge()
    service.start { exit(2) }
    withExtendedLifetime(service) { RunLoop.main.run() }
}
''')
    executable = stage / 'test-bridge'
    subprocess.run(['swiftc', '-O', '-module-cache-path', str(stage / 'cache'),
                    str(ROOT / 'desktop/web-copy-bridge.swift'), str(stage / 'main.swift'), '-o', str(executable)], check=True)
    server = subprocess.Popen([str(executable)])
    try:
        for _ in range(50):
            try:
                status, _, session = request('GET', '/session')
                break
            except ConnectionRefusedError:
                time.sleep(.1)
        assert status == 200 and session['service'] == 'jjalkkak'
        token = session['token']
        fixture = ROOT / 'public/fixtures/clap.gif'
        gif = fixture.read_bytes()
        status, headers, _ = request('OPTIONS', '/copy')
        assert status == 204 and headers['Access-Control-Allow-Origin'] == ORIGIN
        assert request('GET', '/session', origin='https://untrusted.example')[0] == 403
        assert request('POST', '/copy', b'GIF89a', token='wrong')[0] == 403
        status, _, result = request('POST', '/copy', gif, token=token)
        assert status == 200 and result['copied'] and result['frames'] > 1
        subprocess.run([str(executable), str(fixture)], check=True)
        assert request('POST', '/copy', b'not a gif', token=token)[0] == 422
        assert request('POST', '/copy', gif[:32], token=token)[0] == 422
        assert request('POST', '/copy', b'GIF89a', token=token, origin='https://untrusted.example')[0] == 403
        assert request('POST', '/copy', b'', token=token, extra={'Content-Length': str(25 * 1024 * 1024)})[0] == 413
        subprocess.run([str(executable), str(fixture)], check=True)
        print('PASS: preflight, session, original GIF, untrusted origins, token, corrupt/truncated/oversize input, clipboard preservation')
    finally:
        server.terminate()
        server.wait(timeout=5)

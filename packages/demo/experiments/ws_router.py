#!/usr/bin/env python3
"""
TLSN WebSocket router for local benchmark experiments.
Listens on 127.0.0.1:7047, routes by path:
  /session, /verifier  ->  TCP tunnel to VERIFIER_NS (through veth, tc-shaped)
  /proxy?token=<host>  ->  WebSocket-to-TCP bridge to <host>:443 (through eth3, tc-shaped)

No external dependencies — pure Python 3 standard library.
"""
import os
import socket
import threading
import hashlib
import base64
import struct
import urllib.parse

_VERIFIER_HOST = os.environ.get('VERIFIER_NS_HOST', '10.200.0.2')
VERIFIER_NS = (_VERIFIER_HOST, 7047)
LISTEN_ADDR = ('127.0.0.1', 7047)
MAX_HTTP_HEAD_BYTES = 262144
HTTP_HEAD_TIMEOUT_SECS = 15


def send_http_error(conn, status, reason, message=''):
    body = (message or f'{status} {reason}') + '\n'
    payload = body.encode('utf-8', errors='replace')
    conn.sendall((
        f'HTTP/1.1 {status} {reason}\r\n'
        'Content-Type: text/plain; charset=utf-8\r\n'
        f'Content-Length: {len(payload)}\r\n'
        'Connection: close\r\n'
        '\r\n'
    ).encode() + payload)


def parse_proxy_target(parsed):
    params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    token = (params.get('token') or params.get('host') or [''])[0].strip()
    if not token:
        raise ValueError('missing query parameter "token" or "host"')

    if '://' in token:
        target = urllib.parse.urlsplit(token)
        hostname = target.hostname or ''
        if not hostname:
            raise ValueError(f'invalid token URL "{token}"')
        if target.port is not None:
            port = target.port
        elif target.scheme in ('http', 'ws'):
            port = 80
        else:
            port = 443
        return token, hostname, port

    hostname = token
    port = 443
    if token.startswith('['):
        right = token.find(']')
        if right == -1:
            raise ValueError(f'invalid bracketed host "{token}"')
        hostname = token[1:right]
        remain = token[right + 1:]
        if remain:
            if not remain.startswith(':'):
                raise ValueError(f'invalid host/port suffix "{token}"')
            port = int(remain[1:])
    else:
        parts = token.rsplit(':', 1)
        if len(parts) > 1 and parts[1].isdigit():
            hostname = parts[0]
            port = int(parts[1])

    if not hostname:
        raise ValueError(f'invalid hostname from "{token}"')
    if not (1 <= port <= 65535):
        raise ValueError(f'invalid port "{port}"')
    return token, hostname, port


def pipe(src, dst, stop, label=''):
    try:
        while not stop.is_set():
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception as e:
        print(f'[PIPE]{f" {label}:" if label else ""} {type(e).__name__}: {e}', flush=True)
    finally:
        stop.set()


def bridge(a, b, label_ab='', label_ba=''):
    stop = threading.Event()
    t1 = threading.Thread(target=pipe, args=(a, b, stop, label_ab), daemon=True)
    t2 = threading.Thread(target=pipe, args=(b, a, stop, label_ba), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()


def read_http_head(conn):
    old_timeout = conn.gettimeout()
    conn.settimeout(HTTP_HEAD_TIMEOUT_SECS)
    buf = b''
    try:
        while b'\r\n\r\n' not in buf:
            chunk = conn.recv(4096)
            if not chunk:
                return None, b''
            buf += chunk
            if len(buf) > MAX_HTTP_HEAD_BYTES:
                raise ValueError('request header too large')
        end = buf.index(b'\r\n\r\n')
        return buf[:end].decode(errors='replace'), buf[end + 4:]
    except socket.timeout as e:
        raise TimeoutError('timed out while reading request header') from e
    finally:
        conn.settimeout(old_timeout)


def ws_accept(conn, head_str):
    headers = {}
    for line in head_str.split('\r\n')[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.lower().strip()] = v.strip()
    if headers.get('upgrade', '').lower() != 'websocket':
        raise ValueError('invalid websocket upgrade header')
    if 'upgrade' not in headers.get('connection', '').lower():
        raise ValueError('invalid websocket connection header')
    if headers.get('sec-websocket-version', '') != '13':
        raise ValueError('unsupported websocket version')
    key = headers.get('sec-websocket-key', '')
    if not key:
        raise ValueError('missing sec-websocket-key')
    accept = base64.b64encode(
        hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()
    ).decode()
    conn.sendall((
        'HTTP/1.1 101 Switching Protocols\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Accept: {accept}\r\n'
        '\r\n'
    ).encode())


def recv_ws_frame(conn, buf):
    def need(n):
        nonlocal buf
        while len(buf) < n:
            chunk = conn.recv(65536)
            if not chunk:
                raise EOFError('connection closed')
            buf += chunk
        result, buf = buf[:n], buf[n:]
        return result

    hdr = need(2)
    if hdr[0] & 0x70:
        raise ValueError('unsupported websocket extension flags')
    opcode = hdr[0] & 0x0f
    masked = bool(hdr[1] & 0x80)
    if not masked:
        raise ValueError('client frame is not masked')
    plen = hdr[1] & 0x7f
    if plen == 126:
        plen = struct.unpack('>H', need(2))[0]
    elif plen == 127:
        plen = struct.unpack('>Q', need(8))[0]
    mask = need(4) if masked else b''
    data = need(plen)
    if masked:
        data = bytes(data[i] ^ mask[i % 4] for i in range(len(data)))
    return opcode, data, buf


def send_ws_frame(conn, data):
    plen = len(data)
    hdr = bytearray([0x82])
    if plen < 126:
        hdr.append(plen)
    elif plen < 65536:
        hdr.append(126)
        hdr.extend(struct.pack('>H', plen))
    else:
        hdr.append(127)
        hdr.extend(struct.pack('>Q', plen))
    conn.sendall(bytes(hdr) + data)


def send_ws_control(conn, opcode, data=b''):
    if len(data) > 125:
        raise ValueError('control frame payload must be <= 125 bytes')
    conn.sendall(bytes([0x80 | (opcode & 0x0f), len(data)]) + data)


def handle_tunnel(conn, head_str, leftover):
    """Forward /session and /verifier traffic as raw TCP to verifier-ns through veth."""
    try:
        dst = socket.create_connection(VERIFIER_NS, timeout=10)
        dst.settimeout(None)  # switch to blocking after connect; MPC-TLS pauses can exceed 10s
        dst.sendall(head_str.encode() + b'\r\n\r\n' + leftover)
        bridge(conn, dst, 'client→verifier', 'verifier→client')
    except Exception as e:
        print(f'[TUNNEL] {e}', flush=True)
    finally:
        conn.close()


def handle_proxy(conn, head_str, leftover, parsed):
    """Bridge /proxy WebSocket to raw TCP target in main namespace (through eth3)."""
    try:
        token, hostname, port = parse_proxy_target(parsed)
    except Exception as e:
        print(f'[PROXY] bad target: {e}', flush=True)
        send_http_error(conn, 400, 'Bad Request', f'Invalid proxy token: {e}')
        conn.close()
        return

    tcp = None
    ws_upgraded = False
    try:
        tcp = socket.create_connection((hostname, port), timeout=30)
        tcp.settimeout(None)  # switch to blocking; MPC offline phase may exceed 30s before TLS starts
        ws_accept(conn, head_str)
        ws_upgraded = True
        print(f'[PROXY] target token="{token}" -> {hostname}:{port}', flush=True)
        stop = threading.Event()
        buf_ref = [leftover]

        def ws_to_tcp():
            try:
                while not stop.is_set():
                    op, data, buf_ref[0] = recv_ws_frame(conn, buf_ref[0])
                    if op == 0x9:  # ping
                        send_ws_control(conn, 0xA, data)  # pong
                        continue
                    if op == 0xA:  # pong
                        continue
                    if op == 8:
                        send_ws_control(conn, 0x8, b'')
                        break
                    if op in (0, 2) and data:
                        tcp.sendall(data)
            except Exception as e:
                print(f'[PROXY] ws→tcp {hostname}:{port}: {type(e).__name__}: {e}', flush=True)
            finally:
                stop.set()

        def tcp_to_ws():
            try:
                while not stop.is_set():
                    data = tcp.recv(65536)
                    if not data:
                        send_ws_control(conn, 0x8, b'')
                        break
                    send_ws_frame(conn, data)
            except Exception as e:
                print(f'[PROXY] tcp→ws {hostname}:{port}: {type(e).__name__}: {e}', flush=True)
            finally:
                stop.set()

        t1 = threading.Thread(target=ws_to_tcp, daemon=True)
        t2 = threading.Thread(target=tcp_to_ws, daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
    except ValueError as e:
        print(f'[PROXY] bad websocket request -> {e}', flush=True)
        if not ws_upgraded:
            send_http_error(conn, 400, 'Bad Request', str(e))
    except socket.gaierror as e:
        print(f'[PROXY] DNS failed {hostname}:{port} -> {e}', flush=True)
        if not ws_upgraded:
            send_http_error(conn, 502, 'Bad Gateway', f'Failed to resolve upstream host: {hostname}')
    except ConnectionRefusedError as e:
        print(f'[PROXY] upstream refused {hostname}:{port} -> {e}', flush=True)
        if not ws_upgraded:
            send_http_error(conn, 502, 'Bad Gateway', f'Upstream refused connection: {hostname}:{port}')
    except TimeoutError as e:
        print(f'[PROXY] upstream timeout {hostname}:{port} -> {e}', flush=True)
        if not ws_upgraded:
            send_http_error(conn, 504, 'Gateway Timeout', f'Upstream timeout: {hostname}:{port}')
    except Exception as e:
        print(f'[PROXY] {hostname}:{port} -> {e}', flush=True)
        if not ws_upgraded:
            send_http_error(conn, 502, 'Bad Gateway', f'Proxy error: {e}')
    finally:
        if tcp is not None:
            try:
                tcp.close()
            except Exception:
                pass
        conn.close()


def handle_client(conn):
    try:
        head_str, leftover = read_http_head(conn)
        if head_str is None:
            conn.close()
            return
        first_line = head_str.split('\r\n', 1)[0]
        parts = first_line.split(' ')
        if len(parts) < 2:
            send_http_error(conn, 400, 'Bad Request', 'Malformed request line')
            conn.close()
            return
        path = parts[1]
        parsed = urllib.parse.urlparse(path)

        if parsed.path.startswith('/proxy'):
            handle_proxy(conn, head_str, leftover, parsed)
        else:
            handle_tunnel(conn, head_str, leftover)
    except TimeoutError as e:
        print(f'[ROUTER] {e}', flush=True)
        send_http_error(conn, 408, 'Request Timeout', str(e))
        conn.close()
    except ValueError as e:
        print(f'[ROUTER] {e}', flush=True)
        send_http_error(conn, 400, 'Bad Request', str(e))
        conn.close()
    except Exception as e:
        print(f'[ROUTER] {e}', flush=True)
        conn.close()


if __name__ == '__main__':
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN_ADDR)
    srv.listen(64)
    print(f'[ROUTER] listening on {LISTEN_ADDR[0]}:{LISTEN_ADDR[1]}', flush=True)
    print(f'[ROUTER] /session|/verifier -> {VERIFIER_NS[0]}:{VERIFIER_NS[1]} (namespace, tc-shaped)', flush=True)
    print(f'[ROUTER] /proxy             -> direct TCP from host (DNS works)', flush=True)

    while True:
        try:
            conn, _ = srv.accept()
            threading.Thread(target=handle_client, args=(conn,), daemon=True).start()
        except KeyboardInterrupt:
            break

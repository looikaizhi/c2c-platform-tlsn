#!/bin/bash
echo "[TEARDOWN] Cleaning up iptables rules..."
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 7047 \
    -j DNAT --to-destination 10.200.0.2:7047 2>/dev/null || true
sudo iptables -t nat -D POSTROUTING -p tcp -d 10.200.0.2 --dport 7047 \
    -j MASQUERADE 2>/dev/null || true
sudo iptables -t nat -D POSTROUTING -s 10.200.0.0/24 ! -d 10.200.0.0/24 \
    -j MASQUERADE 2>/dev/null || true

echo "[TEARDOWN] Stopping verifier..."
sudo pkill -f "tlsn-verifier-server" 2>/dev/null || true
pkill -f "ws_router.py" 2>/dev/null || true

echo "[TEARDOWN] Removing veth pair and verifier-ns..."
sudo ip link del veth-main 2>/dev/null || true
sudo ip netns del verifier-ns 2>/dev/null || true

echo "[TEARDOWN] ✅ Done."

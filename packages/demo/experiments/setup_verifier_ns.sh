#!/bin/bash
# One-time setup — veth pair + DNAT (localhost:7047 → verifier-ns) +
# NAT masquerade so verifier-ns can reach the internet for /proxy connections.
set -e

VERIFIER_BIN="/mnt/d/c2c_platform/testing/tlsn-extension/packages/verifier/target/release/tlsn-verifier-server"

if [ ! -f "$VERIFIER_BIN" ]; then
  echo "[ERROR] Verifier binary not found: $VERIFIER_BIN"
  echo "        Run: cd packages/verifier && cargo build --release"
  exit 1
fi

echo "[SETUP] (Re)creating verifier-ns..."
sudo ip netns del verifier-ns 2>/dev/null || true
sudo ip netns add verifier-ns

echo "[SETUP] Creating veth pair..."
sudo ip link del veth-main 2>/dev/null || true
sudo ip link add veth-main type veth peer name veth-verifier
sudo ip link set veth-verifier netns verifier-ns

echo "[SETUP] Configuring addresses..."
sudo ip addr add 10.200.0.1/24 dev veth-main
sudo ip link set veth-main up
sudo ip netns exec verifier-ns ip addr add 10.200.0.2/24 dev veth-verifier
sudo ip netns exec verifier-ns ip link set veth-verifier up
sudo ip netns exec verifier-ns ip link set lo up

echo "[SETUP] Enabling IP forwarding and localnet routing..."
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward > /dev/null
echo 1 | sudo tee /proc/sys/net/ipv4/conf/all/route_localnet > /dev/null

echo "[SETUP] Giving verifier-ns internet access via NAT masquerade..."
sudo ip netns exec verifier-ns ip route add default via 10.200.0.1
sudo mkdir -p /etc/netns/verifier-ns
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" | sudo tee /etc/netns/verifier-ns/resolv.conf > /dev/null
sudo iptables -t nat -D POSTROUTING -s 10.200.0.0/24 ! -d 10.200.0.0/24 \
    -j MASQUERADE 2>/dev/null || true
sudo iptables -t nat -A POSTROUTING -s 10.200.0.0/24 ! -d 10.200.0.0/24 \
    -j MASQUERADE

# ── Remove DNAT rules — ws_router.py handles routing instead ─────────────────
# ws_router.py routes /proxy from host namespace (DNS works there),
# and /session+/verifier to verifier-ns via veth. DNAT would bypass ws_router.py.
echo "[SETUP] Removing DNAT rules (routing is now handled by ws_router.py)..."
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 7047 \
    -j DNAT --to-destination 10.200.0.2:7047 2>/dev/null || true
sudo iptables -t nat -D POSTROUTING -p tcp -d 10.200.0.2 --dport 7047 \
    -j MASQUERADE 2>/dev/null || true

echo ""
echo "[SETUP] ✅ Done."
echo "  Main ns  : veth-main     @ 10.200.0.1"
echo "  Verifier : veth-verifier @ 10.200.0.2 (verifier-ns)"
echo "  Routing  : ws_router.py (started by run scripts) on localhost:7047"
echo "             /session, /verifier → veth → 10.200.0.2:7047 (tc-shaped)"
echo "             /proxy              → host internet (DNS works)"
echo "  Internet : verifier-ns → veth → main-ns → eth3 (NAT masquerade, for verifier outbound)"
echo ""
echo "Run an experiment:"
echo "  bash run_ideal_local.sh"
echo "  bash run_broadband_local.sh"
echo "  bash run_crossregion_local.sh"

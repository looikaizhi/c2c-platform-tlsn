#!/bin/bash
# Broadband: RTT=50ms bandwidth=100Mbit/s
IFACE="${IFACE:-eth3}"
VETH_MAIN="veth-main"
VETH_VERIFIER="veth-verifier"
VERIFIER_BIN="${VERIFIER_BIN:-/mnt/d/c2c_platform/testing/tlsn-extension/packages/verifier/target/release/tlsn-verifier-server}"
RATE="100mbit"
BURST="2048kbit"
DELAY="25ms"

if [ ! -f "$VERIFIER_BIN" ]; then
  echo "[ERROR] Verifier binary not found: $VERIFIER_BIN"
  echo "        Run: cd packages/verifier && cargo build --release"
  exit 1
fi

cleanup() {
  echo ""
  echo "[CLEANUP] Restoring network..."
  sudo tc qdisc del dev "$IFACE" root 2>/dev/null || true
  sudo tc qdisc del dev "$IFACE" ingress 2>/dev/null || true
  sudo tc qdisc del dev ifb0 root 2>/dev/null || true
  sudo ip link del ifb0 2>/dev/null || true
  sudo tc qdisc del dev "$VETH_MAIN" root 2>/dev/null || true
  sudo ip netns exec verifier-ns tc qdisc del dev "$VETH_VERIFIER" root 2>/dev/null || true
  sudo pkill -f "tlsn-verifier-server" 2>/dev/null || true
  pkill -f "ws_router.py" 2>/dev/null || true
}
trap cleanup EXIT

# ── Phase B shaping: eth3 ─────────────────────────────────────────────────────
sudo tc qdisc del dev "$IFACE" root 2>/dev/null || true
sudo tc qdisc del dev "$IFACE" ingress 2>/dev/null || true
sudo ip link del ifb0 2>/dev/null || true
sudo modprobe ifb numifbs=1
sudo ip link add ifb0 type ifb
sudo ip link set ifb0 up

sudo tc qdisc add dev "$IFACE" root handle 1: tbf rate "$RATE" burst "$BURST" latency 60s
sudo tc qdisc add dev "$IFACE" parent 1:1 handle 10: netem delay "$DELAY"
sudo tc qdisc add dev "$IFACE" handle ffff: ingress
sudo tc filter add dev "$IFACE" parent ffff: protocol ip u32 match u32 0 0 action mirred egress redirect dev ifb0
sudo tc qdisc add dev ifb0 root handle 1: tbf rate "$RATE" burst "$BURST" latency 60s
sudo tc qdisc add dev ifb0 parent 1:1 handle 10: netem delay "$DELAY"

# ── Phase A shaping: veth pair ────────────────────────────────────────────────
sudo tc qdisc del dev "$VETH_MAIN" root 2>/dev/null || true
sudo tc qdisc add dev "$VETH_MAIN" root handle 1: htb default 20
sudo tc class add dev "$VETH_MAIN" parent 1: classid 1:10 htb rate "$RATE" burst "$BURST"
sudo tc qdisc add dev "$VETH_MAIN" parent 1:10 handle 10: netem delay "$DELAY"
sudo tc class add dev "$VETH_MAIN" parent 1: classid 1:20 htb rate 1000mbit burst 100mbit
sudo tc filter add dev "$VETH_MAIN" protocol ip parent 1:0 prio 1 u32 \
    match ip src 10.200.0.1/32 flowid 1:10

sudo ip netns exec verifier-ns tc qdisc del dev "$VETH_VERIFIER" root 2>/dev/null || true
sudo ip netns exec verifier-ns tc qdisc add dev "$VETH_VERIFIER" root handle 1: htb default 20
sudo ip netns exec verifier-ns tc class add dev "$VETH_VERIFIER" parent 1: classid 1:10 htb rate "$RATE" burst "$BURST"
sudo ip netns exec verifier-ns tc qdisc add dev "$VETH_VERIFIER" parent 1:10 handle 10: netem delay "$DELAY"
sudo ip netns exec verifier-ns tc class add dev "$VETH_VERIFIER" parent 1: classid 1:20 htb rate 1000mbit burst 100mbit
sudo ip netns exec verifier-ns tc filter add dev "$VETH_VERIFIER" protocol ip parent 1:0 prio 1 u32 \
    match ip dst 10.200.0.1/32 flowid 1:10

echo "[ENV] Broadband — RTT=50ms bandwidth=100Mbit/s (bidirectional)"

# ── Pre-flight: verify namespace exists ──────────────────────────────────────
if ! sudo ip netns list 2>/dev/null | grep -q "^verifier-ns"; then
  echo "[ERROR] Namespace verifier-ns not found — run setup_verifier_ns.sh first"
  exit 1
fi
echo "[CHECK] verifier-ns namespace OK"

# ── Pre-flight: remove DNAT rule if setup_verifier_ns.sh added it ────────────
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 7047 \
    -j DNAT --to-destination 10.200.0.2:7047 2>/dev/null || true
sudo iptables -t nat -D POSTROUTING -p tcp -d 10.200.0.2 --dport 7047 \
    -j MASQUERADE 2>/dev/null || true
echo "[CHECK] DNAT rules removed (ws_router.py will route instead)"

# ── Start Verifier inside verifier-ns using pre-built binary ─────────────────
echo "[NS] Starting verifier inside verifier-ns..."
sudo ip netns exec verifier-ns \
  env WS_RATE_LIMIT_PER_IP=500 \
  WS_CONNECTION_TIMEOUT_SECS=60 \
  WS_VERIFICATION_TIMEOUT_SECS=300 \
  VERIFIER_PRIVATE_KEY=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6 \
  CHAIN_ID=31337 \
  "$VERIFIER_BIN" &

# ── Wait for verifier to be ready (up to 30 seconds) ─────────────────────────
echo "[WAIT] Waiting for verifier to listen on port 7047..."
for i in $(seq 1 60); do
  if sudo ip netns exec verifier-ns ss -tlnp 2>/dev/null | grep -q 7047; then
    echo "[OK] Verifier ready (${i} × 0.5s)"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 60 ]; then
    echo "[ERROR] Verifier failed to start within 30 seconds"
    exit 1
  fi
done

# ── Start ws_router.py on host ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[HOST] Starting ws_router.py (localhost:7047 → MPC:10.200.0.2, /proxy:internet)..."
VERIFIER_NS_HOST="10.200.0.2" python3 "$SCRIPT_DIR/ws_router.py" &

echo "[WAIT] Waiting for ws_router.py to bind localhost:7047..."
for i in $(seq 1 20); do
  if ss -tlnp 2>/dev/null | grep -q 7047; then
    echo "[OK] ws_router.py ready (${i} × 0.5s)"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 20 ]; then
    echo "[ERROR] ws_router.py failed to bind within 10 seconds"
    exit 1
  fi
done

echo ""
echo "[INFO] Ready. Chromium → ws_router.py:7047 → /session+/verifier:veth → 10.200.0.2, /proxy → internet."
wait

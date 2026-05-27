#!/bin/bash
IFACE="${IFACE:-eth3}"
VETH_MAIN="veth-main"
VETH_VERIFIER="veth-verifier"

sudo tc qdisc del dev "$IFACE" root 2>/dev/null \
  && echo "[CLEAR] tc removed from $IFACE" \
  || echo "[CLEAR] No active conditions on $IFACE"

sudo tc qdisc del dev "$IFACE" ingress 2>/dev/null || true
sudo tc qdisc del dev ifb0 root 2>/dev/null || true
sudo ip link del ifb0 2>/dev/null || true

sudo tc qdisc del dev "$VETH_MAIN" root 2>/dev/null \
  && echo "[CLEAR] tc removed from $VETH_MAIN" \
  || true

sudo ip netns exec verifier-ns tc qdisc del dev "$VETH_VERIFIER" root 2>/dev/null \
  && echo "[CLEAR] tc removed from $VETH_VERIFIER (verifier-ns)" \
  || true

sudo pkill -f "tlsn-verifier-server" 2>/dev/null \
  && echo "[CLEAR] tlsn-verifier-server killed" \
  || echo "[CLEAR] tlsn-verifier-server not running"

pkill -f "ws_router.py" 2>/dev/null \
  && echo "[CLEAR] ws_router.py killed" \
  || echo "[CLEAR] ws_router.py not running"

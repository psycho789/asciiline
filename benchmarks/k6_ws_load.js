// k6 load test for Go WebSocket broadcaster (Phase 5 gate).
// Requires: k6 installed, Go broadcaster running on ASCIILINE_GO_LISTEN (default :8080).
//
// Usage:
//   k6 run benchmarks/k6_ws_load.js
//   ASCIILINE_GO_WS=ws://localhost:8080/ws k6 run benchmarks/k6_ws_load.js

import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    checks: ['rate>0.95'],
  },
};

const WS_URL = __ENV.ASCIILINE_GO_WS || 'ws://localhost:8080/ws';

export default function () {
  ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => {});
    socket.on('binaryMessage', (data) => {
      check(data, { 'frame bytes': (d) => d.byteLength >= 4 });
    });
    socket.on('close', () => {});
    socket.setTimeout(() => socket.close(), 5000);
  });
}

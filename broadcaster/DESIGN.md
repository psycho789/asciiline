# Go WebSocket Broadcaster — Design Blueprint

Part 1 Sprint 7 skeleton for Part 2 Phase 5 implementation.

## Architecture

```
FrameSource → Hub goroutine → per-Client send channel → writePump → WebSocket
```

## Patterns

- **Hub-and-Client CSP**: one Hub goroutine owns `map[*Client]bool` — no `sync.Map`, no mutex
- **Functional Options**: `NewHub(src, WithMaxClients(500), WithClientBufferSize(8))`
- **FrameSource interface**: `ZmqSource` in Part 2; tests use `ChannelSource`
- **Library**: `github.com/coder/websocket` (not gorilla)

## Worker pool threshold

Goroutine-per-connection is correct up to ~10k clients. Document only; do not implement pool in Part 1.

## ZMQ bridge (Part 2)

Python `BroadcastHub._fan_out` publishes `[stream_key_bytes, payload]` multipart.
Go subscribes and fans out identical bytes to all WebSocket clients.

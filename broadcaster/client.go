package broadcaster

import (
	"context"
	"io"

	"github.com/coder/websocket"
)

// Client represents one WebSocket viewer connection.
type Client struct {
	conn *websocket.Conn
	send chan []byte
}

func NewClient(conn *websocket.Conn, buffer int) *Client {
	return &Client{
		conn: conn,
		send: make(chan []byte, buffer),
	}
}

func (c *Client) readPump(ctx context.Context) {
	for {
		_, _, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
	}
}

func (c *Client) writePump(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case frame, ok := <-c.send:
			if !ok {
				return errClientClosed
			}
			if err := c.conn.Write(ctx, websocket.MessageBinary, frame); err != nil {
				return err
			}
		}
	}
}

// WriteBinary sends a raw binary frame (used by CDN static server).
func WriteBinary(ctx context.Context, conn *websocket.Conn, payload []byte) error {
	return conn.Write(ctx, websocket.MessageBinary, payload)
}

// Drain closes the read side of a connection.
func Drain(ctx context.Context, conn *websocket.Conn) {
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			if err == io.EOF {
				return
			}
			return
		}
	}
}

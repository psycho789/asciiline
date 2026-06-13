package broadcaster

import "context"

// Option configures Hub construction (Functional Options pattern).
type Option func(*Hub)

func WithClientBufferSize(n int) Option {
	return func(h *Hub) {
		h.clientBufferSize = n
	}
}

func WithMaxClients(n int) Option {
	return func(h *Hub) {
		h.maxClients = n
	}
}

// Hub owns the client map exclusively (CSP — single goroutine, no mutex).
type Hub struct {
	source           FrameSource
	register         chan *Client
	unregister       chan *Client
	broadcast        chan []byte
	clients          map[*Client]bool
	clientBufferSize int
	maxClients       int
}

func NewHub(src FrameSource, opts ...Option) *Hub {
	h := &Hub{
		source:           src,
		register:         make(chan *Client),
		unregister:       make(chan *Client),
		broadcast:        make(chan []byte, 64),
		clients:          make(map[*Client]bool),
		clientBufferSize: 8,
		maxClients:       500,
	}
	for _, opt := range opts {
		opt(h)
	}
	return h
}

// Run starts the hub event loop: fan-out encoded frames to all connected clients.
func (h *Hub) Run(ctx context.Context) error {
	frameCh := h.source.Frames()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case frame, ok := <-frameCh:
			if !ok {
				return nil
			}
			h.broadcastFrame(frame)
		case client := <-h.register:
			if len(h.clients) >= h.maxClients {
				close(client.send)
				continue
			}
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		}
	}
}

func (h *Hub) broadcastFrame(frame []byte) {
	for client := range h.clients {
		select {
		case client.send <- frame:
		default:
			// drop if client buffer full (backpressure)
		}
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// ServeClient runs read/write pumps for one WebSocket client.
func (h *Hub) ServeClient(ctx context.Context, client *Client) error {
	h.Register(client)
	defer h.Unregister(client)

	readDone := make(chan struct{})
	go func() {
		client.readPump(ctx)
		close(readDone)
	}()

	err := client.writePump(ctx)
	<-readDone
	return err
}

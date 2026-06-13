package broadcaster

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/coder/websocket"
)

func runBroadcasterWithSource(listenAddr string, src FrameSource) error {
	hub := NewHub(src, WithMaxClients(500), WithClientBufferSize(8))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		if err := hub.Run(ctx); err != nil && err != context.Canceled {
			fmt.Fprintf(os.Stderr, "hub stopped: %v\n", err)
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		client := NewClient(conn, hub.clientBufferSize)
		_ = hub.ServeClient(r.Context(), client)
	})

	srv := &http.Server{
		Addr:              listenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	fmt.Fprintf(os.Stderr, "Go broadcaster listening on %s\n", listenAddr)
	return srv.ListenAndServe()
}

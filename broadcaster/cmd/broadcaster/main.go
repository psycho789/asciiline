package main

import (
	"fmt"
	"net/http"
	"os"

	"asciiline/broadcaster"
)

func main() {
	listen := envOr("ASCIILINE_GO_LISTEN", ":8080")
	zmqEndpoint := envOr("ASCIILINE_ZMQ_ENDPOINT", "tcp://127.0.0.1:5555")
	if err := broadcaster.RunBroadcaster(listen, zmqEndpoint); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "broadcaster error: %v\n", err)
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

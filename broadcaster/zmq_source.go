package broadcaster

import (
	"context"
	"fmt"

	"github.com/go-zeromq/zmq4"
)

// ZmqSource subscribes to Python BroadcastHub PUB multipart frames.
type ZmqSource struct {
	socket zmq4.Socket
	ch     chan []byte
}

func NewZmqSource(endpoint string, buffer int) (*ZmqSource, error) {
	s := zmq4.NewSub(context.Background())
	if err := s.Dial(endpoint); err != nil {
		return nil, err
	}
	if err := s.SetOption(zmq4.OptionSubscribe, []byte("")); err != nil {
		return nil, err
	}
	src := &ZmqSource{
		socket: s,
		ch:     make(chan []byte, buffer),
	}
	go src.pump()
	return src, nil
}

func (s *ZmqSource) pump() {
	defer close(s.ch)
	for {
		msg, err := s.socket.Recv()
		if err != nil {
			return
		}
		if len(msg.Frames) < 2 {
			continue
		}
		frame := append([]byte(nil), msg.Frames[1]...)
		s.ch <- frame
	}
}

func (s *ZmqSource) Frames() <-chan []byte {
	return s.ch
}

func (s *ZmqSource) Close() error {
	return s.socket.Close()
}

// RunBroadcaster starts the Go WebSocket fan-out service.
func RunBroadcaster(listenAddr, zmqEndpoint string) error {
	src, err := NewZmqSource(zmqEndpoint, 64)
	if err != nil {
		return fmt.Errorf("zmq subscribe: %w", err)
	}
	defer src.Close()

	return runBroadcasterWithSource(listenAddr, src)
}

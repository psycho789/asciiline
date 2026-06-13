package broadcaster

// FrameSource supplies encoded frame bytes to the Hub.
type FrameSource interface {
	Frames() <-chan []byte
	Close() error
}

// ChannelSource is a test double wrapping a plain Go channel.
type ChannelSource struct {
	ch chan []byte
}

func NewChannelSource(buffer int) *ChannelSource {
	return &ChannelSource{ch: make(chan []byte, buffer)}
}

func (s *ChannelSource) Frames() <-chan []byte {
	return s.ch
}

func (s *ChannelSource) Close() error {
	close(s.ch)
	return nil
}

func (s *ChannelSource) Publish(frame []byte) {
	s.ch <- frame
}

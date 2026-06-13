package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
)

var asclbinMagic = []byte("ASCLBIN\x01")

func main() {
	filePath := flag.String("file", "", "Path to .asclbin file")
	listen := flag.String("listen", ":8090", "HTTP listen address")
	flag.Parse()
	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "usage: cdn_serve -file output.asclbin")
		os.Exit(1)
	}

	data, err := os.ReadFile(*filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read file: %v\n", err)
		os.Exit(1)
	}
	if len(data) < len(asclbinMagic)+20 {
		fmt.Fprintln(os.Stderr, "invalid ASCLBIN file")
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/frames/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(data)
	})
	mux.HandleFunc("/meta", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		off := len(asclbinMagic)
		fpsBits := binary.BigEndian.Uint32(data[off:])
		cols := binary.BigEndian.Uint32(data[off+4:])
		rows := binary.BigEndian.Uint32(data[off+8:])
		mode := binary.BigEndian.Uint32(data[off+12:])
		count := binary.BigEndian.Uint32(data[off+16:])
		fps := math.Float32frombits(fpsBits)
		fmt.Fprintf(w, `{"fps":%g,"cols":%d,"rows":%d,"mode":%d,"frames":%d}`,
			fps, cols, rows, mode, count)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "asciiline CDN — use /meta or /frames/{name}\n")
	})

	fmt.Fprintf(os.Stderr, "CDN serving %s on %s\n", filepath.Base(*filePath), *listen)
	if err := http.ListenAndServe(*listen, mux); err != nil {
		fmt.Fprintf(os.Stderr, "cdn error: %v\n", err)
		os.Exit(1)
	}
}

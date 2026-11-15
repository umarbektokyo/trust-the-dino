package sample

import (
	"net/http"
	"os"
	"strings"
)

type Config struct {
	Root     string
	RootPass string
	Verbose  bool
	HasToken bool
}

type Store struct{ cfg Config }

func Clean(s string) string { return strings.TrimSpace(s) }

func (s *Store) Load() ([]byte, error) {
	return os.ReadFile(s.cfg.Root + "/.store-secrets.json")
}

func (s *Store) Name() string { return Clean(s.cfg.Root) }

func List(names []string, match string) []string {
	var out []string
	for _, n := range names {
		if match != "" {
			if n != match {
				continue
			}
		} else if strings.HasPrefix(n, ".") {
			continue
		}
		out = append(out, n)
	}
	return out
}

func Handler(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		s.cfg.Verbose = true
		w.Write([]byte(s.Name()))
	}
}

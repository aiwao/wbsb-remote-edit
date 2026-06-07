package wsserver

import (
	"net"
	"net/http"
	"net/url"
)

func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if _, ok := s.allowedOrigins[origin]; ok {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}

	switch parsed.Scheme {
	case "chrome-extension", "moz-extension":
		return true
	case "http", "https":
		host := parsed.Hostname()
		return host == "localhost" || net.ParseIP(host).IsLoopback()
	default:
		return false
	}
}

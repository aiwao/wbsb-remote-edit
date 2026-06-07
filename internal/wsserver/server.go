package wsserver

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Config struct {
	Addr           string
	Path           string
	AllowedOrigins []string
	Logger         *log.Logger
}

type Server struct {
	addr           string
	path           string
	allowedOrigins map[string]struct{}
	logger         *log.Logger
	hub            *hub
	upgrader       websocket.Upgrader
	latestMu       sync.Mutex
	latestEdit     *Message
	deliveryMu     sync.Mutex
	nextDeliveryID uint64
	deliveries     map[string]*deliveryWaiter
	articleMu      sync.Mutex
	nextArticleID  uint64
	articleWaiters map[string]*articleWaiter
	clientMu       sync.Mutex
	clientWaiters  []chan struct{}
}

func New(config Config) *Server {
	if config.Addr == "" {
		config.Addr = "127.0.0.1:8787"
	}
	if config.Path == "" {
		config.Path = "/ws"
	}
	if !strings.HasPrefix(config.Path, "/") {
		config.Path = "/" + config.Path
	}
	if config.Logger == nil {
		config.Logger = log.New(os.Stdout, "", log.LstdFlags)
	}

	allowed := make(map[string]struct{}, len(config.AllowedOrigins))
	for _, origin := range config.AllowedOrigins {
		if origin = strings.TrimSpace(origin); origin != "" {
			allowed[origin] = struct{}{}
		}
	}

	server := &Server{
		addr:           config.Addr,
		path:           config.Path,
		allowedOrigins: allowed,
		logger:         config.Logger,
		hub:            newHub(),
		deliveries:     make(map[string]*deliveryWaiter),
		articleWaiters: make(map[string]*articleWaiter),
	}
	server.upgrader = websocket.Upgrader{
		CheckOrigin: server.checkOrigin,
	}

	return server
}

func (s *Server) Run(ctx context.Context) error {
	listener, err := net.Listen("tcp", s.addr)
	if err != nil {
		return err
	}

	return s.Serve(ctx, listener)
}

func (s *Server) Serve(ctx context.Context, listener net.Listener) error {
	httpServer := &http.Server{
		Handler:           s.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
		close(errs)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return nil
	case err := <-errs:
		return err
	}
}

func (s *Server) ClientCount() int {
	return s.hub.count()
}

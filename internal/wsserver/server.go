package wsserver

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aiwao/wbsb-remote-edit/internal/greet"
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
	}
	server.upgrader = websocket.Upgrader{
		CheckOrigin: server.checkOrigin,
	}

	return server
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc(s.path, s.handleWebSocket)
	return mux
}

func (s *Server) Run(ctx context.Context) error {
	httpServer := &http.Server{
		Addr:              s.addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errs := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
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

func (s *Server) BroadcastGreeting(name string) {
	name = strings.TrimSpace(name)
	s.hub.broadcast(Message{
		Type:     "greet",
		Name:     name,
		Greeting: greet.Greet(name),
		From:     "cli",
		At:       now(),
	})
}

func (s *Server) ClientCount() int {
	return s.hub.count()
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	fmt.Fprintf(w, "greet-ws is running. Connect to ws://%s%s\n", s.addr, s.path)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Printf("websocket upgrade failed: %v", err)
		return
	}

	client := &client{
		conn: conn,
		send: make(chan Message, 16),
	}
	s.hub.add(client)

	go client.writeLoop()

	client.send <- Message{
		Type:     "connected",
		Greeting: "Connected to greet-ws CLI.",
		From:     "cli",
		At:       now(),
	}

	s.readLoop(client)
	s.hub.remove(client)
}

func (s *Server) readLoop(client *client) {
	defer client.conn.Close()

	for {
		var message Message
		if err := client.conn.ReadJSON(&message); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				s.logger.Printf("websocket read failed: %v", err)
			}
			return
		}

		client.send <- s.reply(message)
	}
}

func (s *Server) reply(message Message) Message {
	switch strings.ToLower(strings.TrimSpace(message.Type)) {
	case "greet":
		name := strings.TrimSpace(message.Name)
		return Message{
			Type:     "greet",
			Name:     name,
			Greeting: greet.Greet(name),
			From:     "cli",
			At:       now(),
		}
	case "ping":
		return Message{
			Type: "pong",
			From: "cli",
			At:   now(),
		}
	default:
		return Message{
			Type:  "error",
			Error: "unknown message type",
			From:  "cli",
			At:    now(),
		}
	}
}

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

type client struct {
	conn *websocket.Conn
	send chan Message
}

func (c *client) writeLoop() {
	defer c.conn.Close()

	for message := range c.send {
		if err := c.conn.WriteJSON(message); err != nil {
			return
		}
	}
}

type hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
}

func newHub() *hub {
	return &hub{
		clients: make(map[*client]struct{}),
	}
}

func (h *hub) add(client *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = struct{}{}
}

func (h *hub) remove(client *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
	}
}

func (h *hub) broadcast(message Message) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		select {
		case client.send <- message:
		default:
			delete(h.clients, client)
			close(client.send)
		}
	}
}

func (h *hub) count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

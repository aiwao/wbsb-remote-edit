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
	"strconv"
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

type Article struct {
	Title string
	Body  string
}

type DeliveryResult struct {
	ID       string
	Acked    int
	Expected int
}

type deliveryOutcome struct {
	result DeliveryResult
	err    error
}

type deliveryWaiter struct {
	id        string
	targets   map[*client]struct{}
	acked     map[*client]struct{}
	done      chan deliveryOutcome
	completed bool
}

type articleOutcome struct {
	article Article
	err     error
}

type articleWaiter struct {
	id        string
	target    *client
	done      chan articleOutcome
	completed bool
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

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc(s.path, s.handleWebSocket)
	return mux
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

func (s *Server) BroadcastEdit(title, body string) Message {
	message := s.newEditMessage(title, body)
	s.rememberEdit(message)
	s.hub.broadcast(message)
	return message
}

func (s *Server) BroadcastEditAndWait(ctx context.Context, title, body string) (DeliveryResult, error) {
	message := s.newEditMessage(title, body)
	waiter := &deliveryWaiter{
		id:      message.ID,
		targets: make(map[*client]struct{}),
		acked:   make(map[*client]struct{}),
		done:    make(chan deliveryOutcome, 1),
	}

	s.deliveryMu.Lock()
	s.deliveries[message.ID] = waiter
	s.rememberEdit(message)
	targets := s.hub.broadcast(message)
	for _, target := range targets {
		waiter.targets[target] = struct{}{}
	}
	s.deliveryMu.Unlock()

	select {
	case outcome := <-waiter.done:
		return outcome.result, outcome.err
	case <-ctx.Done():
		s.removeDelivery(message.ID)
		return DeliveryResult{}, ctx.Err()
	}
}

func (s *Server) GetWBSBArticle(ctx context.Context) (Article, error) {
	return s.getWBSBArticle(ctx, s.newGetWBSBArticleMessage)
}

func (s *Server) GetWBSBArticleTitle(ctx context.Context) (Article, error) {
	return s.getWBSBArticle(ctx, s.newGetWBSBArticleTitleMessage)
}

func (s *Server) getWBSBArticle(ctx context.Context, newRequest func() Message) (Article, error) {
	for {
		client, err := s.waitForClient(ctx)
		if err != nil {
			return Article{}, err
		}

		message := newRequest()
		waiter := &articleWaiter{
			id:     message.ID,
			target: client,
			done:   make(chan articleOutcome, 1),
		}

		s.articleMu.Lock()
		s.articleWaiters[message.ID] = waiter
		s.articleMu.Unlock()

		if !s.hub.send(client, message) {
			s.removeArticleWaiter(message.ID)
			continue
		}

		select {
		case outcome := <-waiter.done:
			return outcome.article, outcome.err
		case <-ctx.Done():
			s.removeArticleWaiter(message.ID)
			return Article{}, ctx.Err()
		}
	}
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
	fmt.Fprintf(w, "remote edit websocket server is running. Connect to ws://%s%s\n", s.addr, s.path)
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
	s.notifyClientConnected()

	go client.writeLoop()

	client.send <- Message{
		Type: "connected",
		From: "cli",
		At:   now(),
	}
	if latest, ok := s.lastEdit(); ok {
		client.send <- latest
	}

	s.readLoop(client)
	s.hub.remove(client)
}

func (s *Server) readLoop(client *client) {
	defer client.conn.Close()
	defer s.clientDisconnected(client)

	for {
		var message Message
		if err := client.conn.ReadJSON(&message); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				s.logger.Printf("websocket read failed: %v", err)
			}
			return
		}

		if response, ok := s.reply(client, message); ok {
			client.send <- response
		}
	}
}

func (s *Server) reply(client *client, message Message) (Message, bool) {
	switch strings.ToLower(strings.TrimSpace(message.Type)) {
	case "edit":
		s.BroadcastEdit(message.Title, message.Body)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "ack":
		s.ackDelivery(client, message.ID)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "wbsb_article", "wbsb_article_title":
		s.completeArticleRequest(client, message)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "ping":
		return Message{
			Type: "pong",
			From: "cli",
			At:   now(),
		}, true
	default:
		return Message{
			Type:  "error",
			Error: "unknown message type",
			From:  "cli",
			At:    now(),
		}, true
	}
}

func (s *Server) newGetWBSBArticleMessage() Message {
	return Message{
		Type: "get_wbsb_article",
		ID:   s.nextArticleRequestID(),
		From: "cli",
		At:   now(),
	}
}

func (s *Server) newGetWBSBArticleTitleMessage() Message {
	return Message{
		Type: "get_wbsb_article_title",
		ID:   s.nextArticleRequestID(),
		From: "cli",
		At:   now(),
	}
}

func (s *Server) nextArticleRequestID() string {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	s.nextArticleID++
	return "article-" + strconv.FormatUint(s.nextArticleID, 10)
}

func (s *Server) newEditMessage(title, body string) Message {
	return Message{
		Type:  "edit",
		ID:    s.nextEditID(),
		Title: strings.TrimSpace(title),
		Body:  body,
		From:  "cli",
		At:    now(),
	}
}

func (s *Server) nextEditID() string {
	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	s.nextDeliveryID++
	return "edit-" + strconv.FormatUint(s.nextDeliveryID, 10)
}

func (s *Server) ackDelivery(client *client, id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}

	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	waiter, ok := s.deliveries[id]
	if !ok || waiter.completed {
		return
	}

	if len(waiter.targets) == 0 {
		waiter.acked[client] = struct{}{}
		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    1,
			Expected: 1,
		}, nil)
		return
	}

	if _, ok := waiter.targets[client]; !ok {
		return
	}
	waiter.acked[client] = struct{}{}
	if len(waiter.acked) == len(waiter.targets) {
		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    len(waiter.acked),
			Expected: len(waiter.targets),
		}, nil)
	}
}

func (s *Server) clientDisconnected(client *client) {
	s.failArticleRequestsForClient(client)

	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	for id, waiter := range s.deliveries {
		if waiter.completed {
			continue
		}
		if _, targeted := waiter.targets[client]; !targeted {
			continue
		}
		if _, acked := waiter.acked[client]; acked {
			continue
		}

		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    len(waiter.acked),
			Expected: len(waiter.targets),
		}, errors.New("client disconnected before acknowledging edit"))
	}
}

func (s *Server) completeArticleRequest(client *client, message Message) {
	id := strings.TrimSpace(message.ID)
	if id == "" {
		return
	}

	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	waiter, ok := s.articleWaiters[id]
	if !ok || waiter.completed || waiter.target != client {
		return
	}

	body := message.Body
	if strings.EqualFold(strings.TrimSpace(message.Type), "wbsb_article_title") {
		body = ""
	}

	s.completeArticleRequestLocked(waiter, Article{
		Title: message.Title,
		Body:  body,
	}, nil)
}

func (s *Server) failArticleRequestsForClient(client *client) {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	for _, waiter := range s.articleWaiters {
		if waiter.completed || waiter.target != client {
			continue
		}

		s.completeArticleRequestLocked(waiter, Article{}, errors.New("client disconnected before returning article"))
	}
}

func (s *Server) removeArticleWaiter(id string) {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	delete(s.articleWaiters, id)
}

func (s *Server) completeArticleRequestLocked(waiter *articleWaiter, article Article, err error) {
	if waiter.completed {
		return
	}

	waiter.completed = true
	delete(s.articleWaiters, waiter.id)
	waiter.done <- articleOutcome{article: article, err: err}
}

func (s *Server) removeDelivery(id string) {
	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	delete(s.deliveries, id)
}

func (s *Server) completeDeliveryLocked(waiter *deliveryWaiter, result DeliveryResult, err error) {
	if waiter.completed {
		return
	}

	waiter.completed = true
	delete(s.deliveries, waiter.id)
	waiter.done <- deliveryOutcome{result: result, err: err}
}

func (s *Server) rememberEdit(message Message) {
	s.latestMu.Lock()
	defer s.latestMu.Unlock()

	s.latestEdit = &message
}

func (s *Server) lastEdit() (Message, bool) {
	s.latestMu.Lock()
	defer s.latestMu.Unlock()

	if s.latestEdit == nil {
		return Message{}, false
	}
	return *s.latestEdit, true
}

func (s *Server) waitForClient(ctx context.Context) (*client, error) {
	for {
		s.clientMu.Lock()
		if client := s.hub.first(); client != nil {
			s.clientMu.Unlock()
			return client, nil
		}

		waiter := make(chan struct{})
		s.clientWaiters = append(s.clientWaiters, waiter)
		s.clientMu.Unlock()

		select {
		case <-waiter:
		case <-ctx.Done():
			s.removeClientWaiter(waiter)
			return nil, ctx.Err()
		}
	}
}

func (s *Server) notifyClientConnected() {
	s.clientMu.Lock()
	waiters := s.clientWaiters
	s.clientWaiters = nil
	s.clientMu.Unlock()

	for _, waiter := range waiters {
		close(waiter)
	}
}

func (s *Server) removeClientWaiter(waiter chan struct{}) {
	s.clientMu.Lock()
	defer s.clientMu.Unlock()

	for i, candidate := range s.clientWaiters {
		if candidate != waiter {
			continue
		}

		s.clientWaiters = append(s.clientWaiters[:i], s.clientWaiters[i+1:]...)
		return
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

func (h *hub) broadcast(message Message) []*client {
	h.mu.Lock()
	defer h.mu.Unlock()

	targets := make([]*client, 0, len(h.clients))
	for client := range h.clients {
		select {
		case client.send <- message:
			targets = append(targets, client)
		default:
			delete(h.clients, client)
			close(client.send)
		}
	}

	return targets
}

func (h *hub) send(client *client, message Message) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return false
	}

	select {
	case client.send <- message:
		return true
	default:
		delete(h.clients, client)
		close(client.send)
		return false
	}
}

func (h *hub) first() *client {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		return client
	}

	return nil
}

func (h *hub) count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

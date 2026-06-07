package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/aiwao/wbsb-remote-edit/internal/wsserver"
)

type serverSession struct {
	server    *wsserver.Server
	cancel    context.CancelFunc
	serverErr chan error
}

type editWorkflowOptions struct {
	addr           string
	path           string
	title          string
	allowedOrigins []string
	stdout         io.Writer
	loadArticle    func(context.Context, *wsserver.Server, string) (wsserver.Article, error)
	buildBody      func(context.Context, string, wsserver.Article) (string, error)
}

func runEditWorkflow(parentCtx context.Context, options editWorkflowOptions) error {
	title := strings.TrimSpace(options.title)
	path := normalizeEndpointPath(options.path)
	ctx, stopSignals := signal.NotifyContext(parentCtx, os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	session, err := startServerSession(ctx, options.stdout, wsserver.Config{
		Addr:           options.addr,
		Path:           path,
		AllowedOrigins: options.allowedOrigins,
	})
	if err != nil {
		return err
	}

	fmt.Fprintf(options.stdout, "wbsb-remote-edit listening on ws://%s%s\n", options.addr, path)
	fmt.Fprintln(options.stdout, "waiting for browser extension connection")

	article, err := options.loadArticle(ctx, session.server, title)
	if err != nil {
		return stopSessionWithError(session, err)
	}
	if title == "" {
		title = strings.TrimSpace(article.Title)
	}

	body, err := options.buildBody(ctx, title, article)
	if err != nil {
		return stopSessionWithError(session, err)
	}

	return sendEditAndStop(ctx, session, options.stdout, title, body)
}

func stopSessionWithError(session *serverSession, err error) error {
	_ = session.stop()
	return err
}

func startServerSession(ctx context.Context, stdout io.Writer, config wsserver.Config) (*serverSession, error) {
	listener, err := net.Listen("tcp", config.Addr)
	if err != nil {
		return nil, err
	}

	if config.Logger == nil {
		config.Logger = log.New(stdout, "", log.LstdFlags)
	}
	server := wsserver.New(config)
	serverCtx, cancel := context.WithCancel(ctx)
	session := &serverSession{
		server:    server,
		cancel:    cancel,
		serverErr: make(chan error, 1),
	}

	go func() {
		session.serverErr <- server.Serve(serverCtx, listener)
	}()

	return session, nil
}

func (s *serverSession) stop() error {
	s.cancel()
	return <-s.serverErr
}

func sendEditAndStop(ctx context.Context, session *serverSession, stdout io.Writer, title, body string) error {
	fmt.Fprintf(
		stdout,
		"sending edit %q (%d byte(s)); waiting for browser acknowledgement\n",
		title,
		len([]byte(body)),
	)
	result, err := session.server.BroadcastEditAndWait(ctx, title, body)
	serverRunErr := session.stop()

	if err != nil {
		if errors.Is(err, context.Canceled) {
			return serverRunErr
		}
		if serverRunErr != nil {
			return errors.Join(err, serverRunErr)
		}
		return err
	}
	fmt.Fprintf(
		stdout,
		"edit %q acknowledged by %d/%d client(s); shut down WebSocket server\n",
		title,
		result.Acked,
		result.Expected,
	)
	return serverRunErr
}

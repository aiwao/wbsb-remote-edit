package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/aiwao/wbsb-remote-edit/internal/wsserver"
	"github.com/spf13/cobra"
)

func main() {
	if err := newRootCmd(os.Stdin, os.Stdout, os.Stderr).Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRootCmd(stdin io.Reader, stdout, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "wbsb-remote-edit",
		Short: "Bridge editor content to a browser extension over WebSocket",
	}

	cmd.AddCommand(newEditCmd(stdin, stdout, stderr))
	cmd.AddCommand(newSendCmd(stdout))
	return cmd
}

func newEditCmd(stdin io.Reader, stdout, stderr io.Writer) *cobra.Command {
	var addr string
	var path string
	var editor string
	var title string
	var allowedOrigins []string

	cmd := &cobra.Command{
		Use:   "edit",
		Short: "Open an editor and publish the written content",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			return runEditWorkflow(
				ctx,
				stdout,
				editWorkflowOptions{
					Addr:               addr,
					Path:               path,
					Title:              title,
					AllowedOrigins:     allowedOrigins,
					MissingTitleSource: "get_wbsb_article",
				},
				func(ctx context.Context, server *wsserver.Server, _ string) (workflowArticle, error) {
					article, err := server.GetWBSBArticle(ctx)
					if err != nil {
						return workflowArticle{}, err
					}
					return workflowArticle{
						Title: article.Title,
						Body:  article.Body,
					}, nil
				},
				func(ctx context.Context, title, initialBody string) (string, error) {
					fmt.Fprintf(stdout, "received article %q (%d byte(s)); opening editor\n", title, len([]byte(initialBody)))
					return captureEditorBody(ctx, editor, title, initialBody, stdin, stdout, stderr)
				},
			)
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&editor, "editor", "", "editor command to run; defaults to $EDITOR")
	cmd.Flags().StringVar(&title, "title", "", "title to publish; defaults to get_wbsb_article response title")
	cmd.Flags().StringArrayVar(&allowedOrigins, "allow-origin", nil, "additional exact browser Origin values to accept")

	return cmd
}

func newSendCmd(stdout io.Writer) *cobra.Command {
	var addr string
	var path string
	var title string
	var allowedOrigins []string

	cmd := &cobra.Command{
		Use:   "send <markdown-path>",
		Short: "Send a Markdown file to the browser extension",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			body, err := readMarkdownFile(args[0])
			if err != nil {
				return err
			}

			return runEditWorkflow(
				ctx,
				stdout,
				editWorkflowOptions{
					Addr:               addr,
					Path:               path,
					Title:              title,
					AllowedOrigins:     allowedOrigins,
					MissingTitleSource: "get_wbsb_article_title",
				},
				func(ctx context.Context, server *wsserver.Server, title string) (workflowArticle, error) {
					if title != "" {
						return workflowArticle{Body: body}, nil
					}
					article, err := server.GetWBSBArticleTitle(ctx)
					if err != nil {
						return workflowArticle{}, err
					}
					return workflowArticle{
						Title: article.Title,
						Body:  body,
					}, nil
				},
				func(_ context.Context, _ string, initialBody string) (string, error) {
					return initialBody, nil
				},
			)
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&title, "title", "", "title to publish; defaults to get_wbsb_article_title response title")
	cmd.Flags().StringArrayVar(&allowedOrigins, "allow-origin", nil, "additional exact browser Origin values to accept")

	return cmd
}

func normalizeEndpointPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "/ws"
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

type editWorkflowOptions struct {
	Addr               string
	Path               string
	Title              string
	AllowedOrigins     []string
	MissingTitleSource string
}

type workflowArticle struct {
	Title string
	Body  string
}

type workflowArticleLoader func(context.Context, *wsserver.Server, string) (workflowArticle, error)
type workflowBodyPreparer func(context.Context, string, string) (string, error)

func runEditWorkflow(
	ctx context.Context,
	stdout io.Writer,
	options editWorkflowOptions,
	loadArticle workflowArticleLoader,
	prepareBody workflowBodyPreparer,
) error {
	title := strings.TrimSpace(options.Title)
	path := normalizeEndpointPath(options.Path)

	session, err := startServerSession(ctx, stdout, wsserver.Config{
		Addr:           options.Addr,
		Path:           path,
		AllowedOrigins: options.AllowedOrigins,
	})
	if err != nil {
		return err
	}

	fmt.Fprintf(stdout, "wbsb-remote-edit listening on ws://%s%s\n", options.Addr, path)
	fmt.Fprintln(stdout, "waiting for browser extension connection")

	article, err := loadArticle(ctx, session.server, title)
	if err != nil {
		session.stop()
		return err
	}

	title, err = resolveWorkflowTitle(title, article.Title, options.MissingTitleSource)
	if err != nil {
		session.stop()
		return err
	}

	body, err := prepareBody(ctx, title, article.Body)
	if err != nil {
		session.stop()
		return err
	}

	return sendEditAndStop(ctx, session, stdout, title, body)
}

func resolveWorkflowTitle(title, fallback, fallbackSource string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = strings.TrimSpace(fallback)
	}
	if title == "" {
		return "", fmt.Errorf("title is blank; pass --title or return a title from %s", fallbackSource)
	}
	return title, nil
}

type serverSession struct {
	server    *wsserver.Server
	cancel    context.CancelFunc
	serverErr chan error
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

func readMarkdownFile(path string) (string, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func captureEditorBody(
	ctx context.Context,
	editor string,
	title string,
	initialBody string,
	stdin io.Reader,
	stdout, stderr io.Writer,
) (string, error) {
	editor = strings.TrimSpace(editor)
	if editor == "" {
		editor = strings.TrimSpace(os.Getenv("EDITOR"))
	}
	if editor == "" {
		return "", errors.New("EDITOR is not set; pass --editor")
	}

	file, err := os.CreateTemp("", editorTempPattern(title))
	if err != nil {
		return "", err
	}
	defer os.Remove(file.Name())

	if _, err := file.WriteString(initialBody); err != nil {
		file.Close()
		return "", err
	}

	if err := file.Close(); err != nil {
		return "", err
	}

	if err := runEditor(ctx, editor, file.Name(), stdin, stdout, stderr); err != nil {
		return "", err
	}

	body, err := os.ReadFile(file.Name())
	if err != nil {
		return "", err
	}

	return string(body), nil
}

func editorTempPattern(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "untitled"
	}

	var builder strings.Builder
	lastWasDash := false
	for _, r := range title {
		if isTempFileNameUnsafe(r) {
			if !lastWasDash {
				builder.WriteByte('-')
				lastWasDash = true
			}
			continue
		}

		builder.WriteRune(r)
		lastWasDash = false
	}

	base := strings.Trim(builder.String(), "-")
	if base == "" {
		base = "untitled"
	}

	return base + "-*.md"
}

func isTempFileNameUnsafe(r rune) bool {
	switch r {
	case '/', '\\', ':', '*', '?', '"', '<', '>', '|':
		return true
	default:
		return r < 32 || r == 127
	}
}

func runEditor(
	ctx context.Context,
	editor string,
	filename string,
	stdin io.Reader,
	stdout, stderr io.Writer,
) error {
	shell := strings.TrimSpace(os.Getenv("SHELL"))
	if shell == "" {
		shell = "/bin/sh"
	}

	cmd := exec.CommandContext(ctx, shell, "-c", editor+` "$1"`, "editor", filename)
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	return cmd.Run()
}

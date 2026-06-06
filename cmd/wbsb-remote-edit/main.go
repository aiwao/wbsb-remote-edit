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
			title = strings.TrimSpace(title)
			path = normalizeEndpointPath(path)
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			listener, err := net.Listen("tcp", addr)
			if err != nil {
				return err
			}

			logger := log.New(stdout, "", log.LstdFlags)
			server := wsserver.New(wsserver.Config{
				Addr:           addr,
				Path:           path,
				AllowedOrigins: allowedOrigins,
				Logger:         logger,
			})

			serverErr := make(chan error, 1)
			go func() {
				serverErr <- server.Serve(ctx, listener)
			}()

			fmt.Fprintf(stdout, "wbsb-remote-edit listening on ws://%s%s\n", addr, path)
			fmt.Fprintln(stdout, "waiting for browser extension connection")

			article, err := server.GetWBSBArticle(ctx)
			if err != nil {
				stop()
				<-serverErr
				return err
			}
			if title == "" {
				title = strings.TrimSpace(article.Title)
			}
			if title == "" {
				stop()
				<-serverErr
				return errors.New("title is blank; pass --title or return a title from get_wbsb_article")
			}
			fmt.Fprintf(stdout, "received article %q (%d byte(s)); opening editor\n", title, len([]byte(article.Body)))

			body, err := captureEditorBody(ctx, editor, article.Body, stdin, stdout, stderr)
			if err != nil {
				stop()
				<-serverErr
				return err
			}

			fmt.Fprintf(
				stdout,
				"sending edit %q (%d byte(s)); waiting for browser acknowledgement\n",
				title,
				len([]byte(body)),
			)
			result, err := server.BroadcastEditAndWait(ctx, title, body)
			stop()
			serverRunErr := <-serverErr

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
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&editor, "editor", "", "editor command to run; defaults to $EDITOR")
	cmd.Flags().StringVar(&title, "title", "", "title to publish; defaults to get_wbsb_article response title")
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

func captureEditorBody(
	ctx context.Context,
	editor string,
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

	file, err := os.CreateTemp("", "wbsb-remote-edit-*.txt")
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

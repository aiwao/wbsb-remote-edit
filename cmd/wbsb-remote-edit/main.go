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
	var allowedOrigins []string

	cmd := &cobra.Command{
		Use:   "edit title",
		Short: "Open an editor and publish the written content",
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) != 1 {
				return fmt.Errorf("accepts 1 arg, received %d", len(args))
			}
			if strings.TrimSpace(args[0]) == "" {
				return errors.New("title cannot be blank")
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			title := strings.TrimSpace(args[0])
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

			content, err := captureEditorContent(ctx, editor, stdin, stdout, stderr)
			if err != nil {
				stop()
				<-serverErr
				return err
			}

			server.BroadcastEdit(title, content)
			fmt.Fprintf(
				stdout,
				"sent edit %q (%d byte(s)) to %d client(s)\n",
				title,
				len([]byte(content)),
				server.ClientCount(),
			)
			fmt.Fprintln(stdout, "Press Ctrl+C to stop the WebSocket server.")

			select {
			case <-ctx.Done():
				return <-serverErr
			case err := <-serverErr:
				return err
			}
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&editor, "editor", "", "editor command to run; defaults to $EDITOR")
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

func captureEditorContent(
	ctx context.Context,
	editor string,
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

	if err := file.Close(); err != nil {
		return "", err
	}

	if err := runEditor(ctx, editor, file.Name(), stdin, stdout, stderr); err != nil {
		return "", err
	}

	content, err := os.ReadFile(file.Name())
	if err != nil {
		return "", err
	}

	return string(content), nil
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

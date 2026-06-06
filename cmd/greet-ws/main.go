package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/aiwao/wbsb-remote-edit/internal/wsserver"
	"github.com/spf13/cobra"
)

func main() {
	if err := newRootCmd(os.Stdin, os.Stdout).Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRootCmd(stdin io.Reader, stdout io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "greet-ws",
		Short: "Bridge a browser extension and this CLI over WebSocket",
	}

	cmd.AddCommand(newServeCmd(stdin, stdout))
	return cmd
}

func newServeCmd(stdin io.Reader, stdout io.Writer) *cobra.Command {
	var addr string
	var path string
	var stdinBroadcast bool
	var allowedOrigins []string

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Run the local WebSocket greeting server",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			logger := log.New(stdout, "", log.LstdFlags)
			server := wsserver.New(wsserver.Config{
				Addr:           addr,
				Path:           path,
				AllowedOrigins: allowedOrigins,
				Logger:         logger,
			})

			if stdinBroadcast {
				go scanNames(ctx, stdin, stdout, server)
			}

			fmt.Fprintf(stdout, "greet-ws listening on ws://%s%s\n", addr, path)
			if stdinBroadcast {
				fmt.Fprintln(stdout, "Type a name here and press Enter to broadcast a greeting to connected extensions.")
			}

			return server.Run(ctx)
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().BoolVar(&stdinBroadcast, "stdin", true, "broadcast greetings from names typed into stdin")
	cmd.Flags().StringArrayVar(&allowedOrigins, "allow-origin", nil, "additional exact browser Origin values to accept")

	return cmd
}

func scanNames(ctx context.Context, stdin io.Reader, stdout io.Writer, server *wsserver.Server) {
	scanner := bufio.NewScanner(stdin)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}

		name := strings.TrimSpace(scanner.Text())
		if name == "" {
			continue
		}

		server.BroadcastGreeting(name)
		fmt.Fprintf(stdout, "broadcast greeting for %q to %d client(s)\n", name, server.ClientCount())
	}
}

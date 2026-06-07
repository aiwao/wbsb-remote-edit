package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

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
			return runEditWorkflow(cmd.Context(), editWorkflowOptions{
				addr:           addr,
				path:           path,
				title:          title,
				allowedOrigins: allowedOrigins,
				stdout:         stdout,
				loadArticle: func(ctx context.Context, server *wsserver.Server, _ string) (wsserver.Article, error) {
					return server.GetWBSBArticle(ctx)
				},
				buildBody: func(ctx context.Context, title string, article wsserver.Article) (string, error) {
					fmt.Fprintf(stdout, "received article %q (%d byte(s)); opening editor\n", title, len([]byte(article.Body)))
					return captureEditorBody(ctx, editor, title, article.Body, stdin, stdout, stderr)
				},
			})
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&editor, "editor", "", "editor command to run; defaults to $EDITOR")
	cmd.Flags().StringVar(&title, "title", "", fmt.Sprintf("title to publish; defaults to %s response title", wsserver.MessageTypeGetWBSBArticle))
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
			body, err := readMarkdownFile(args[0])
			if err != nil {
				return err
			}

			return runEditWorkflow(cmd.Context(), editWorkflowOptions{
				addr:           addr,
				path:           path,
				title:          title,
				allowedOrigins: allowedOrigins,
				stdout:         stdout,
				loadArticle: func(ctx context.Context, server *wsserver.Server, title string) (wsserver.Article, error) {
					if title != "" {
						return wsserver.Article{}, nil
					}
					return server.GetWBSBArticleTitle(ctx)
				},
				buildBody: func(context.Context, string, wsserver.Article) (string, error) {
					return body, nil
				},
			})
		},
	}

	cmd.Flags().StringVar(&addr, "addr", "127.0.0.1:8787", "host:port to listen on")
	cmd.Flags().StringVar(&path, "path", "/ws", "WebSocket endpoint path")
	cmd.Flags().StringVar(&title, "title", "", fmt.Sprintf("title to publish; defaults to %s response title", wsserver.MessageTypeGetWBSBArticleTitle))
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

package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aiwao/wbsb-remote-edit/internal/wsserver"
	"github.com/gorilla/websocket"
)

func TestRootCommandHasEditPushAndPull(t *testing.T) {
	cmd := newRootCmd(io.Reader(bytes.NewReader(nil)), io.Discard, io.Discard)

	var hasEdit bool
	var hasPush bool
	var hasPull bool
	for _, child := range cmd.Commands() {
		if child.Name() == "edit" {
			hasEdit = true
			continue
		}
		if child.Name() == "push" {
			hasPush = true
			continue
		}
		if child.Name() == "pull" {
			hasPull = true
			continue
		}
		if !child.Hidden {
			t.Fatalf("unexpected command %q", child.Name())
		}
	}

	if !hasEdit {
		t.Fatal("root command does not have edit")
	}
	if !hasPush {
		t.Fatal("root command does not have push")
	}
	if !hasPull {
		t.Fatal("root command does not have pull")
	}
}

func TestEditCommandUsesTitleFlagAndNoPositionals(t *testing.T) {
	cmd := newEditCmd(bytes.NewReader(nil), io.Discard, io.Discard)

	if cmd.Flags().Lookup("title") == nil {
		t.Fatal("edit command does not have title flag")
	}
	if cmd.Flags().Lookup("file") == nil {
		t.Fatal("edit command does not have file flag")
	}
	if cmd.Flags().Lookup("save-to") == nil {
		t.Fatal("edit command does not have save-to flag")
	}
	if err := cmd.Args(cmd, []string{}); err != nil {
		t.Fatalf("edit command rejects empty args: %v", err)
	}
	if err := cmd.Args(cmd, []string{"Draft"}); err == nil {
		t.Fatal("edit command accepts positional title")
	}
}

func TestPushCommandAcceptsMarkdownPathAndTitleFlag(t *testing.T) {
	cmd := newPushCmd(io.Discard)

	if cmd.Flags().Lookup("title") == nil {
		t.Fatal("push command does not have title flag")
	}
	if err := cmd.Args(cmd, []string{"draft.md"}); err != nil {
		t.Fatalf("push command rejects one markdown path: %v", err)
	}
	if err := cmd.Args(cmd, []string{}); err == nil {
		t.Fatal("push command accepts no markdown path")
	}
	if err := cmd.Args(cmd, []string{"one.md", "two.md"}); err == nil {
		t.Fatal("push command accepts multiple markdown paths")
	}
}

func TestPullCommandAcceptsOutputPath(t *testing.T) {
	cmd := newPullCmd(io.Discard)

	if cmd.Flags().Lookup("path") == nil {
		t.Fatal("pull command does not have path flag")
	}
	if err := cmd.Args(cmd, []string{"draft.md"}); err != nil {
		t.Fatalf("pull command rejects one output path: %v", err)
	}
	if err := cmd.Args(cmd, []string{}); err == nil {
		t.Fatal("pull command accepts no output path")
	}
	if err := cmd.Args(cmd, []string{"one.md", "two.md"}); err == nil {
		t.Fatal("pull command accepts multiple output paths")
	}
}

func TestNormalizeEndpointPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "default", path: "", want: "/ws"},
		{name: "adds slash", path: "socket", want: "/socket"},
		{name: "keeps slash", path: "/socket", want: "/socket"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeEndpointPath(tt.path); got != tt.want {
				t.Fatalf("normalizeEndpointPath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestReadMarkdownFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(path, []byte("# Draft\n\nbody\n"), 0o600); err != nil {
		t.Fatalf("write markdown file: %v", err)
	}

	got, err := readMarkdownFile(path)
	if err != nil {
		t.Fatalf("read markdown file: %v", err)
	}
	if got != "# Draft\n\nbody\n" {
		t.Fatalf("body = %q, want markdown file contents", got)
	}
}

func TestWriteLocalArticleUsesFilePath(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "pulled.md")

	gotPath, err := writeLocalArticle(outputPath, wsserver.Article{
		Title: "Ignored title",
		Body:  "pulled body",
	})
	if err != nil {
		t.Fatalf("write pulled article: %v", err)
	}
	if gotPath != outputPath {
		t.Fatalf("written path = %q, want %q", gotPath, outputPath)
	}

	got, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read pulled file: %v", err)
	}
	if string(got) != "pulled body" {
		t.Fatalf("body = %q, want pulled body", got)
	}
}

func TestWriteLocalArticleUsesDirectoryAndTitle(t *testing.T) {
	dir := t.TempDir()

	gotPath, err := writeLocalArticle(dir, wsserver.Article{
		Title: "a/b*c",
		Body:  "pulled body",
	})
	if err != nil {
		t.Fatalf("write pulled article: %v", err)
	}

	wantPath := filepath.Join(dir, "a-b-c.md")
	if gotPath != wantPath {
		t.Fatalf("written path = %q, want %q", gotPath, wantPath)
	}

	got, err := os.ReadFile(wantPath)
	if err != nil {
		t.Fatalf("read pulled file: %v", err)
	}
	if string(got) != "pulled body" {
		t.Fatalf("body = %q, want pulled body", got)
	}
}

func TestRunEditWorkflowAllowsBlankTitle(t *testing.T) {
	addr := reserveLocalAddr(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- runEditWorkflow(ctx, editWorkflowOptions{
			addr:   addr,
			path:   "/ws",
			stdout: io.Discard,
			loadArticle: func(ctx context.Context, server *wsserver.Server, _ string) (wsserver.Article, error) {
				return server.GetWBSBArticle(ctx)
			},
			buildBody: func(_ context.Context, title string, article wsserver.Article) (string, error) {
				if title != "" {
					return "", fmt.Errorf("title = %q, want blank", title)
				}
				if article.Body != "seed body" {
					return "", fmt.Errorf("body = %q, want seed body", article.Body)
				}
				return "edited body", nil
			},
		})
	}()

	conn := dialWorkflowWebSocket(t, addr)
	defer conn.Close()

	request := readWorkflowMessage(t, conn, wsserver.MessageTypeGetWBSBArticle)
	if request.ID == "" {
		t.Fatal("article request ID is blank")
	}

	if err := conn.WriteJSON(wsserver.Message{
		Type: wsserver.MessageTypeWBSBArticle,
		ID:   request.ID,
		Body: "seed body",
	}); err != nil {
		t.Fatalf("write article message: %v", err)
	}

	edit := readWorkflowMessage(t, conn, wsserver.MessageTypeEdit)
	if edit.Title != "" {
		t.Fatalf("edit title = %q, want blank", edit.Title)
	}
	if edit.Body != "edited body" {
		t.Fatalf("edit body = %q, want edited body", edit.Body)
	}
	if err := conn.WriteJSON(wsserver.Message{Type: wsserver.MessageTypeAck, ID: edit.ID}); err != nil {
		t.Fatalf("write ack message: %v", err)
	}

	select {
	case err := <-resultCh:
		if err != nil {
			t.Fatalf("run edit workflow: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for edit workflow")
	}
}

func TestEditCommandUsesFileFlagAsEditorInitialBody(t *testing.T) {
	addr := reserveLocalAddr(t)
	filePath := filepath.Join(t.TempDir(), "seed.md")
	if err := os.WriteFile(filePath, []byte("file seed"), 0o600); err != nil {
		t.Fatalf("write seed file: %v", err)
	}

	editor := `sh -c 'test "$(cat "$1")" = "file seed" && printf "edited file body" > "$1"' sh`
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cmd := newEditCmd(bytes.NewReader(nil), io.Discard, io.Discard)
	cmd.SetContext(ctx)
	cmd.SetArgs([]string{"--addr", addr, "--file", filePath, "--editor", editor})

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- cmd.Execute()
	}()

	conn := dialWorkflowWebSocket(t, addr)
	defer conn.Close()

	request := readWorkflowMessage(t, conn, wsserver.MessageTypeGetWBSBArticle)
	if request.ID == "" {
		t.Fatal("article request ID is blank")
	}

	if err := conn.WriteJSON(wsserver.Message{
		Type:  wsserver.MessageTypeWBSBArticle,
		ID:    request.ID,
		Title: "Draft",
		Body:  "browser seed",
	}); err != nil {
		t.Fatalf("write article message: %v", err)
	}

	edit := readWorkflowMessage(t, conn, wsserver.MessageTypeEdit)
	if edit.Title != "Draft" {
		t.Fatalf("edit title = %q, want Draft", edit.Title)
	}
	if edit.Body != "edited file body" {
		t.Fatalf("edit body = %q, want edited file body", edit.Body)
	}
	if err := conn.WriteJSON(wsserver.Message{Type: wsserver.MessageTypeAck, ID: edit.ID}); err != nil {
		t.Fatalf("write ack message: %v", err)
	}

	select {
	case err := <-resultCh:
		if err != nil {
			t.Fatalf("run edit command: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for edit command")
	}
}

func TestRunEditWorkflowSavesEditedArticle(t *testing.T) {
	addr := reserveLocalAddr(t)
	dir := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- runEditWorkflow(ctx, editWorkflowOptions{
			addr:   addr,
			path:   "/ws",
			saveTo: dir,
			stdout: io.Discard,
			loadArticle: func(ctx context.Context, server *wsserver.Server, _ string) (wsserver.Article, error) {
				return server.GetWBSBArticle(ctx)
			},
			buildBody: func(context.Context, string, wsserver.Article) (string, error) {
				return "edited body", nil
			},
		})
	}()

	conn := dialWorkflowWebSocket(t, addr)
	defer conn.Close()

	request := readWorkflowMessage(t, conn, wsserver.MessageTypeGetWBSBArticle)
	if request.ID == "" {
		t.Fatal("article request ID is blank")
	}

	if err := conn.WriteJSON(wsserver.Message{
		Type:  wsserver.MessageTypeWBSBArticle,
		ID:    request.ID,
		Title: "Draft",
		Body:  "seed body",
	}); err != nil {
		t.Fatalf("write article message: %v", err)
	}

	edit := readWorkflowMessage(t, conn, wsserver.MessageTypeEdit)
	if edit.Body != "edited body" {
		t.Fatalf("edit body = %q, want edited body", edit.Body)
	}
	if err := conn.WriteJSON(wsserver.Message{Type: wsserver.MessageTypeAck, ID: edit.ID}); err != nil {
		t.Fatalf("write ack message: %v", err)
	}

	select {
	case err := <-resultCh:
		if err != nil {
			t.Fatalf("run edit workflow: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for edit workflow")
	}

	got, err := os.ReadFile(filepath.Join(dir, "Draft.md"))
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if string(got) != "edited body" {
		t.Fatalf("saved body = %q, want edited body", got)
	}
}

func TestRunPullWorkflowWritesArticleToFile(t *testing.T) {
	addr := reserveLocalAddr(t)
	outputPath := filepath.Join(t.TempDir(), "article.md")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	resultCh := make(chan error, 1)
	go func() {
		resultCh <- runPullWorkflow(ctx, pullWorkflowOptions{
			addr:       addr,
			path:       "/ws",
			outputPath: outputPath,
			stdout:     io.Discard,
		})
	}()

	conn := dialWorkflowWebSocket(t, addr)
	defer conn.Close()

	request := readWorkflowMessage(t, conn, wsserver.MessageTypeGetWBSBArticle)
	if request.ID == "" {
		t.Fatal("article request ID is blank")
	}

	if err := conn.WriteJSON(wsserver.Message{
		Type:  wsserver.MessageTypeWBSBArticle,
		ID:    request.ID,
		Title: "Draft",
		Body:  "pulled body",
	}); err != nil {
		t.Fatalf("write article message: %v", err)
	}

	select {
	case err := <-resultCh:
		if err != nil {
			t.Fatalf("run pull workflow: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for pull workflow")
	}

	got, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read pulled file: %v", err)
	}
	if string(got) != "pulled body" {
		t.Fatalf("body = %q, want pulled body", got)
	}
}

func TestCaptureEditorBodyUsesEditorCommand(t *testing.T) {
	editor := `sh -c 'base=$(basename "$1"); case "$base" in Draft-*.md) ;; *) exit 7;; esac; test "$(cat "$1")" = "seed content" && printf "updated content" > "$1"' sh`

	got, err := captureEditorBody(
		context.Background(),
		editor,
		"Draft",
		"seed content",
		bytes.NewReader(nil),
		io.Discard,
		io.Discard,
	)
	if err != nil {
		t.Fatalf("capture editor content: %v", err)
	}
	if got != "updated content" {
		t.Fatalf("content = %q, want %q", got, "updated content")
	}
}

func reserveLocalAddr(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve local address: %v", err)
	}
	defer listener.Close()

	return listener.Addr().String()
}

func dialWorkflowWebSocket(t *testing.T, addr string) *websocket.Conn {
	t.Helper()

	wsURL := "ws://" + addr + "/ws"
	headers := map[string][]string{
		"Origin": {"chrome-extension://test-extension"},
	}
	deadline := time.Now().Add(2 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
		if err == nil {
			return conn
		}
		lastErr = err
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("dial %s: %v", wsURL, lastErr)
	return nil
}

func readWorkflowMessage(t *testing.T, conn *websocket.Conn, messageType string) wsserver.Message {
	t.Helper()

	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}

	for {
		var got wsserver.Message
		if err := conn.ReadJSON(&got); err != nil {
			t.Fatalf("read websocket message: %v", err)
		}
		if got.Type == messageType {
			return got
		}
	}
}

func TestCaptureEditorBodyRequiresEditor(t *testing.T) {
	t.Setenv("EDITOR", "")

	_, err := captureEditorBody(
		context.Background(),
		"",
		"Draft",
		"",
		bytes.NewReader(nil),
		io.Discard,
		io.Discard,
	)
	if err == nil {
		t.Fatal("expected error when no editor is configured")
	}
}

func TestEditorTempPatternUsesTitleMarkdownName(t *testing.T) {
	tests := []struct {
		title string
		want  string
	}{
		{title: "Draft", want: "Draft-*.md"},
		{title: "  Draft  ", want: "Draft-*.md"},
		{title: "a/b*c", want: "a-b-c-*.md"},
		{title: "", want: "untitled-*.md"},
	}

	for _, tt := range tests {
		t.Run(tt.title, func(t *testing.T) {
			if got := editorTempPattern(tt.title); got != tt.want {
				t.Fatalf("editorTempPattern(%q) = %q, want %q", tt.title, got, tt.want)
			}
		})
	}
}

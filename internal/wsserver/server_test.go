package wsserver

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketEdit(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, "connected")

	if err := conn.WriteJSON(Message{Type: "edit", Title: "Draft", Content: "Hello from editor"}); err != nil {
		t.Fatalf("write edit message: %v", err)
	}

	got := readUntil(t, conn, "edit")
	if got.Title != "Draft" {
		t.Fatalf("Title = %q, want %q", got.Title, "Draft")
	}
	if got.Content != "Hello from editor" {
		t.Fatalf("Content = %q, want %q", got.Content, "Hello from editor")
	}
}

func TestBroadcastEdit(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, "connected")
	server.BroadcastEdit("Release notes", "Ship it")

	got := readUntil(t, conn, "edit")
	if got.Title != "Release notes" {
		t.Fatalf("Title = %q, want %q", got.Title, "Release notes")
	}
	if got.Content != "Ship it" {
		t.Fatalf("Content = %q, want %q", got.Content, "Ship it")
	}
	if got.From != "cli" {
		t.Fatalf("From = %q, want %q", got.From, "cli")
	}
}

func TestLatestEditSentOnConnect(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	server.BroadcastEdit("Existing draft", "Already written")

	conn := dial(t, testServer.URL)
	defer conn.Close()

	got := readUntil(t, conn, "edit")
	if got.Title != "Existing draft" {
		t.Fatalf("Title = %q, want %q", got.Title, "Existing draft")
	}
	if got.Content != "Already written" {
		t.Fatalf("Content = %q, want %q", got.Content, "Already written")
	}
}

func dial(t *testing.T, httpURL string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(httpURL, "http") + "/ws"
	headers := map[string][]string{
		"Origin": {"chrome-extension://test-extension"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial %s: %v", wsURL, err)
	}

	return conn
}

func readUntil(t *testing.T, conn *websocket.Conn, messageType string) Message {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	if err := conn.SetReadDeadline(deadline); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}

	for {
		var got Message
		if err := conn.ReadJSON(&got); err != nil {
			t.Fatalf("read websocket message: %v", err)
		}
		if got.Type == messageType {
			return got
		}
	}
}

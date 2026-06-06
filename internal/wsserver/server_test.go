package wsserver

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestWebSocketGreet(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, "connected")

	if err := conn.WriteJSON(Message{Type: "greet", Name: "Ada"}); err != nil {
		t.Fatalf("write greet message: %v", err)
	}

	got := readUntil(t, conn, "greet")
	if got.Greeting != "Hello, Ada!" {
		t.Fatalf("Greeting = %q, want %q", got.Greeting, "Hello, Ada!")
	}
}

func TestBroadcastGreeting(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, "connected")
	server.BroadcastGreeting("Grace")

	got := readUntil(t, conn, "greet")
	if got.Greeting != "Hello, Grace!" {
		t.Fatalf("Greeting = %q, want %q", got.Greeting, "Hello, Grace!")
	}
	if got.From != "cli" {
		t.Fatalf("From = %q, want %q", got.From, "cli")
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

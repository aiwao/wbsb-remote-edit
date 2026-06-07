package wsserver

import (
	"context"
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

	readUntil(t, conn, MessageTypeConnected)

	if err := conn.WriteJSON(Message{Type: MessageTypeEdit, Title: "Draft", Body: "Hello from editor"}); err != nil {
		t.Fatalf("write edit message: %v", err)
	}

	got := readUntil(t, conn, MessageTypeEdit)
	if got.Title != "Draft" {
		t.Fatalf("Title = %q, want %q", got.Title, "Draft")
	}
	if got.Body != "Hello from editor" {
		t.Fatalf("Body = %q, want %q", got.Body, "Hello from editor")
	}
}

func TestBroadcastEdit(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, MessageTypeConnected)
	server.BroadcastEdit("Release notes", "Ship it")

	got := readUntil(t, conn, MessageTypeEdit)
	if got.Title != "Release notes" {
		t.Fatalf("Title = %q, want %q", got.Title, "Release notes")
	}
	if got.Body != "Ship it" {
		t.Fatalf("Body = %q, want %q", got.Body, "Ship it")
	}
	if got.From != "cli" {
		t.Fatalf("From = %q, want %q", got.From, "cli")
	}
	if got.ID == "" {
		t.Fatal("ID is blank")
	}
}

func TestLatestEditSentOnConnect(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	server.BroadcastEdit("Existing draft", "Already written")

	conn := dial(t, testServer.URL)
	defer conn.Close()

	got := readUntil(t, conn, MessageTypeEdit)
	if got.Title != "Existing draft" {
		t.Fatalf("Title = %q, want %q", got.Title, "Existing draft")
	}
	if got.Body != "Already written" {
		t.Fatalf("Body = %q, want %q", got.Body, "Already written")
	}
}

func TestBroadcastEditAndWait(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, MessageTypeConnected)

	resultCh := make(chan deliveryTestResult, 1)
	go func() {
		result, err := server.BroadcastEditAndWait(context.Background(), "Draft", "Saved")
		resultCh <- deliveryTestResult{result: result, err: err}
	}()

	got := readUntil(t, conn, MessageTypeEdit)
	if got.ID == "" {
		t.Fatal("ID is blank")
	}
	if err := conn.WriteJSON(Message{Type: MessageTypeAck, ID: got.ID}); err != nil {
		t.Fatalf("write ack message: %v", err)
	}

	result := readDeliveryResult(t, resultCh)
	if result.err != nil {
		t.Fatalf("BroadcastEditAndWait error: %v", result.err)
	}
	if result.result.Acked != 1 || result.result.Expected != 1 {
		t.Fatalf("delivery result = %+v, want 1/1", result.result)
	}
}

func TestBroadcastEditAndWaitForLateConnect(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	resultCh := make(chan deliveryTestResult, 1)
	go func() {
		result, err := server.BroadcastEditAndWait(context.Background(), "Late draft", "Saved later")
		resultCh <- deliveryTestResult{result: result, err: err}
	}()

	waitForLatestEdit(t, server)

	conn := dial(t, testServer.URL)
	defer conn.Close()

	got := readUntil(t, conn, MessageTypeEdit)
	if got.Title != "Late draft" {
		t.Fatalf("Title = %q, want %q", got.Title, "Late draft")
	}
	if err := conn.WriteJSON(Message{Type: MessageTypeAck, ID: got.ID}); err != nil {
		t.Fatalf("write ack message: %v", err)
	}

	result := readDeliveryResult(t, resultCh)
	if result.err != nil {
		t.Fatalf("BroadcastEditAndWait error: %v", result.err)
	}
	if result.result.Acked != 1 || result.result.Expected != 1 {
		t.Fatalf("delivery result = %+v, want 1/1", result.result)
	}
}

func TestBroadcastEditAndWaitDetectsDisconnectBeforeAck(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	conn := dial(t, testServer.URL)
	readUntil(t, conn, MessageTypeConnected)

	resultCh := make(chan deliveryTestResult, 1)
	go func() {
		result, err := server.BroadcastEditAndWait(context.Background(), "Draft", "Saved")
		resultCh <- deliveryTestResult{result: result, err: err}
	}()

	readUntil(t, conn, MessageTypeEdit)
	if err := conn.Close(); err != nil {
		t.Fatalf("close websocket: %v", err)
	}

	result := readDeliveryResult(t, resultCh)
	if result.err == nil {
		t.Fatal("expected disconnect error")
	}
}

func TestGetWBSBArticleWaitsForClientResponse(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	resultCh := make(chan articleTestResult, 1)
	go func() {
		article, err := server.GetWBSBArticle(context.Background())
		resultCh <- articleTestResult{article: article, err: err}
	}()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, MessageTypeConnected)
	request := readUntil(t, conn, MessageTypeGetWBSBArticle)
	if request.ID == "" {
		t.Fatal("ID is blank")
	}

	if err := conn.WriteJSON(Message{
		Type:  MessageTypeWBSBArticle,
		ID:    request.ID,
		Title: "ABCDEFG",
		Body:  "abcdefghijklmnopqrstuvwxyz\n\n\nabcdefghijklmnopqrstuvwxyz",
	}); err != nil {
		t.Fatalf("write article message: %v", err)
	}

	result := readArticleResult(t, resultCh)
	if result.err != nil {
		t.Fatalf("GetWBSBArticle error: %v", result.err)
	}
	if result.article.Title != "ABCDEFG" {
		t.Fatalf("Title = %q, want %q", result.article.Title, "ABCDEFG")
	}
	if result.article.Body != "abcdefghijklmnopqrstuvwxyz\n\n\nabcdefghijklmnopqrstuvwxyz" {
		t.Fatalf("Body = %q, want debug body", result.article.Body)
	}
}

func TestGetWBSBArticleTitleWaitsForClientResponse(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	resultCh := make(chan articleTestResult, 1)
	go func() {
		article, err := server.GetWBSBArticleTitle(context.Background())
		resultCh <- articleTestResult{article: article, err: err}
	}()

	conn := dial(t, testServer.URL)
	defer conn.Close()

	readUntil(t, conn, MessageTypeConnected)
	request := readUntil(t, conn, MessageTypeGetWBSBArticleTitle)
	if request.ID == "" {
		t.Fatal("ID is blank")
	}

	if err := conn.WriteJSON(Message{
		Type:  MessageTypeWBSBArticleTitle,
		ID:    request.ID,
		Title: "ABCDEFG",
		Body:  "ignored body",
	}); err != nil {
		t.Fatalf("write article title message: %v", err)
	}

	result := readArticleResult(t, resultCh)
	if result.err != nil {
		t.Fatalf("GetWBSBArticleTitle error: %v", result.err)
	}
	if result.article.Title != "ABCDEFG" {
		t.Fatalf("Title = %q, want %q", result.article.Title, "ABCDEFG")
	}
	if result.article.Body != "" {
		t.Fatalf("Body = %q, want blank", result.article.Body)
	}
}

func TestGetWBSBArticleDetectsDisconnectBeforeResponse(t *testing.T) {
	server := New(Config{})
	testServer := httptest.NewServer(server.Handler())
	defer testServer.Close()

	resultCh := make(chan articleTestResult, 1)
	go func() {
		article, err := server.GetWBSBArticle(context.Background())
		resultCh <- articleTestResult{article: article, err: err}
	}()

	conn := dial(t, testServer.URL)

	readUntil(t, conn, MessageTypeConnected)
	readUntil(t, conn, MessageTypeGetWBSBArticle)
	if err := conn.Close(); err != nil {
		t.Fatalf("close websocket: %v", err)
	}

	result := readArticleResult(t, resultCh)
	if result.err == nil {
		t.Fatal("expected disconnect error")
	}
}

type deliveryTestResult struct {
	result DeliveryResult
	err    error
}

type articleTestResult struct {
	article Article
	err     error
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

func readDeliveryResult(t *testing.T, resultCh <-chan deliveryTestResult) deliveryTestResult {
	t.Helper()

	select {
	case result := <-resultCh:
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for delivery result")
	}

	return deliveryTestResult{}
}

func readArticleResult(t *testing.T, resultCh <-chan articleTestResult) articleTestResult {
	t.Helper()

	select {
	case result := <-resultCh:
		return result
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for article result")
	}

	return articleTestResult{}
}

func waitForLatestEdit(t *testing.T, server *Server) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := server.lastEdit(); ok {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("timed out waiting for latest edit")
}

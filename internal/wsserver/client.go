package wsserver

import (
	"strings"

	"github.com/gorilla/websocket"
)

type client struct {
	conn *websocket.Conn
	send chan Message
}

func newClient(conn *websocket.Conn) *client {
	return &client{
		conn: conn,
		send: make(chan Message, 16),
	}
}

func (s *Server) serveClient(client *client) {
	s.hub.add(client)
	s.notifyClientConnected()

	go client.writeLoop()

	client.send <- Message{
		Type: "connected",
		From: "cli",
		At:   now(),
	}
	if latest, ok := s.lastEdit(); ok {
		client.send <- latest
	}

	s.readLoop(client)
	s.hub.remove(client)
}

func (s *Server) readLoop(client *client) {
	defer client.conn.Close()
	defer s.clientDisconnected(client)

	for {
		var message Message
		if err := client.conn.ReadJSON(&message); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				s.logger.Printf("websocket read failed: %v", err)
			}
			return
		}

		if response, ok := s.reply(client, message); ok {
			client.send <- response
		}
	}
}

func (s *Server) reply(client *client, message Message) (Message, bool) {
	switch strings.ToLower(strings.TrimSpace(message.Type)) {
	case "edit":
		s.BroadcastEdit(message.Title, message.Body)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "ack":
		s.ackDelivery(client, message.ID)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "wbsb_article", "wbsb_article_title":
		s.completeArticleRequest(client, message)
		return Message{
			Type: "ok",
			From: "cli",
			At:   now(),
		}, true
	case "ping":
		return Message{
			Type: "pong",
			From: "cli",
			At:   now(),
		}, true
	default:
		return Message{
			Type:  "error",
			Error: "unknown message type",
			From:  "cli",
			At:    now(),
		}, true
	}
}

func (s *Server) clientDisconnected(client *client) {
	s.failArticleRequestsForClient(client)
	s.failDeliveriesForClient(client)
}

func (c *client) writeLoop() {
	defer c.conn.Close()

	for message := range c.send {
		if err := c.conn.WriteJSON(message); err != nil {
			return
		}
	}
}

package wsserver

import "sync"

type hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
}

func newHub() *hub {
	return &hub{
		clients: make(map[*client]struct{}),
	}
}

func (h *hub) add(client *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = struct{}{}
}

func (h *hub) remove(client *client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
	}
}

func (h *hub) broadcast(message Message) []*client {
	h.mu.Lock()
	defer h.mu.Unlock()

	targets := make([]*client, 0, len(h.clients))
	for client := range h.clients {
		select {
		case client.send <- message:
			targets = append(targets, client)
		default:
			delete(h.clients, client)
			close(client.send)
		}
	}

	return targets
}

func (h *hub) send(client *client, message Message) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return false
	}

	select {
	case client.send <- message:
		return true
	default:
		delete(h.clients, client)
		close(client.send)
		return false
	}
}

func (h *hub) first() *client {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		return client
	}

	return nil
}

func (h *hub) count() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

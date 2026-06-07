package wsserver

import (
	"context"
	"errors"
	"strconv"
	"strings"
)

type DeliveryResult struct {
	ID       string
	Acked    int
	Expected int
}

type deliveryOutcome struct {
	result DeliveryResult
	err    error
}

type deliveryWaiter struct {
	id        string
	targets   map[*client]struct{}
	acked     map[*client]struct{}
	done      chan deliveryOutcome
	completed bool
}

func (s *Server) BroadcastEdit(title, body string) Message {
	message := s.newEditMessage(title, body)
	s.rememberEdit(message)
	s.hub.broadcast(message)
	return message
}

func (s *Server) BroadcastEditAndWait(ctx context.Context, title, body string) (DeliveryResult, error) {
	message := s.newEditMessage(title, body)
	waiter := &deliveryWaiter{
		id:      message.ID,
		targets: make(map[*client]struct{}),
		acked:   make(map[*client]struct{}),
		done:    make(chan deliveryOutcome, 1),
	}

	s.deliveryMu.Lock()
	s.deliveries[message.ID] = waiter
	s.rememberEdit(message)
	targets := s.hub.broadcast(message)
	for _, target := range targets {
		waiter.targets[target] = struct{}{}
	}
	s.deliveryMu.Unlock()

	select {
	case outcome := <-waiter.done:
		return outcome.result, outcome.err
	case <-ctx.Done():
		s.removeDelivery(message.ID)
		return DeliveryResult{}, ctx.Err()
	}
}

func (s *Server) newEditMessage(title, body string) Message {
	return Message{
		Type:  MessageTypeEdit,
		ID:    s.nextEditID(),
		Title: strings.TrimSpace(title),
		Body:  body,
		From:  "cli",
		At:    now(),
	}
}

func (s *Server) nextEditID() string {
	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	s.nextDeliveryID++
	return "edit-" + strconv.FormatUint(s.nextDeliveryID, 10)
}

func (s *Server) ackDelivery(client *client, id string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return
	}

	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	waiter, ok := s.deliveries[id]
	if !ok || waiter.completed {
		return
	}

	if len(waiter.targets) == 0 {
		waiter.acked[client] = struct{}{}
		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    1,
			Expected: 1,
		}, nil)
		return
	}

	if _, ok := waiter.targets[client]; !ok {
		return
	}
	waiter.acked[client] = struct{}{}
	if len(waiter.acked) == len(waiter.targets) {
		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    len(waiter.acked),
			Expected: len(waiter.targets),
		}, nil)
	}
}

func (s *Server) failDeliveriesForClient(client *client) {
	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	for id, waiter := range s.deliveries {
		if waiter.completed {
			continue
		}
		if _, targeted := waiter.targets[client]; !targeted {
			continue
		}
		if _, acked := waiter.acked[client]; acked {
			continue
		}

		s.completeDeliveryLocked(waiter, DeliveryResult{
			ID:       id,
			Acked:    len(waiter.acked),
			Expected: len(waiter.targets),
		}, errors.New("client disconnected before acknowledging edit"))
	}
}

func (s *Server) removeDelivery(id string) {
	s.deliveryMu.Lock()
	defer s.deliveryMu.Unlock()

	delete(s.deliveries, id)
}

func (s *Server) completeDeliveryLocked(waiter *deliveryWaiter, result DeliveryResult, err error) {
	if waiter.completed {
		return
	}

	waiter.completed = true
	delete(s.deliveries, waiter.id)
	waiter.done <- deliveryOutcome{result: result, err: err}
}

func (s *Server) rememberEdit(message Message) {
	s.latestMu.Lock()
	defer s.latestMu.Unlock()

	s.latestEdit = &message
}

func (s *Server) lastEdit() (Message, bool) {
	s.latestMu.Lock()
	defer s.latestMu.Unlock()

	if s.latestEdit == nil {
		return Message{}, false
	}
	return *s.latestEdit, true
}

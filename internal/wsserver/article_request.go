package wsserver

import (
	"context"
	"errors"
	"strconv"
	"strings"
)

type Article struct {
	Title string
	Body  string
}

type articleOutcome struct {
	article Article
	err     error
}

type articleWaiter struct {
	id        string
	target    *client
	done      chan articleOutcome
	completed bool
}

func (s *Server) GetWBSBArticle(ctx context.Context) (Article, error) {
	return s.getWBSBArticle(ctx, s.newGetWBSBArticleMessage)
}

func (s *Server) GetWBSBArticleTitle(ctx context.Context) (Article, error) {
	return s.getWBSBArticle(ctx, s.newGetWBSBArticleTitleMessage)
}

func (s *Server) getWBSBArticle(ctx context.Context, newRequest func() Message) (Article, error) {
	for {
		client, err := s.waitForClient(ctx)
		if err != nil {
			return Article{}, err
		}

		message := newRequest()
		waiter := &articleWaiter{
			id:     message.ID,
			target: client,
			done:   make(chan articleOutcome, 1),
		}

		s.articleMu.Lock()
		s.articleWaiters[message.ID] = waiter
		s.articleMu.Unlock()

		if !s.hub.send(client, message) {
			s.removeArticleWaiter(message.ID)
			continue
		}

		select {
		case outcome := <-waiter.done:
			return outcome.article, outcome.err
		case <-ctx.Done():
			s.removeArticleWaiter(message.ID)
			return Article{}, ctx.Err()
		}
	}
}

func (s *Server) newGetWBSBArticleMessage() Message {
	return Message{
		Type: MessageTypeGetWBSBArticle,
		ID:   s.nextArticleRequestID(),
		From: "cli",
		At:   now(),
	}
}

func (s *Server) newGetWBSBArticleTitleMessage() Message {
	return Message{
		Type: MessageTypeGetWBSBArticleTitle,
		ID:   s.nextArticleRequestID(),
		From: "cli",
		At:   now(),
	}
}

func (s *Server) nextArticleRequestID() string {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	s.nextArticleID++
	return "article-" + strconv.FormatUint(s.nextArticleID, 10)
}

func (s *Server) completeArticleRequest(client *client, message Message) {
	id := strings.TrimSpace(message.ID)
	if id == "" {
		return
	}

	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	waiter, ok := s.articleWaiters[id]
	if !ok || waiter.completed || waiter.target != client {
		return
	}

	body := message.Body
	if strings.EqualFold(strings.TrimSpace(message.Type), MessageTypeWBSBArticleTitle) {
		body = ""
	}

	s.completeArticleRequestLocked(waiter, Article{
		Title: message.Title,
		Body:  body,
	}, nil)
}

func (s *Server) failArticleRequestsForClient(client *client) {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	for _, waiter := range s.articleWaiters {
		if waiter.completed || waiter.target != client {
			continue
		}

		s.completeArticleRequestLocked(waiter, Article{}, errors.New("client disconnected before returning article"))
	}
}

func (s *Server) removeArticleWaiter(id string) {
	s.articleMu.Lock()
	defer s.articleMu.Unlock()

	delete(s.articleWaiters, id)
}

func (s *Server) completeArticleRequestLocked(waiter *articleWaiter, article Article, err error) {
	if waiter.completed {
		return
	}

	waiter.completed = true
	delete(s.articleWaiters, waiter.id)
	waiter.done <- articleOutcome{article: article, err: err}
}

func (s *Server) waitForClient(ctx context.Context) (*client, error) {
	for {
		s.clientMu.Lock()
		if client := s.hub.first(); client != nil {
			s.clientMu.Unlock()
			return client, nil
		}

		waiter := make(chan struct{})
		s.clientWaiters = append(s.clientWaiters, waiter)
		s.clientMu.Unlock()

		select {
		case <-waiter:
		case <-ctx.Done():
			s.removeClientWaiter(waiter)
			return nil, ctx.Err()
		}
	}
}

func (s *Server) notifyClientConnected() {
	s.clientMu.Lock()
	waiters := s.clientWaiters
	s.clientWaiters = nil
	s.clientMu.Unlock()

	for _, waiter := range waiters {
		close(waiter)
	}
}

func (s *Server) removeClientWaiter(waiter chan struct{}) {
	s.clientMu.Lock()
	defer s.clientMu.Unlock()

	for i, candidate := range s.clientWaiters {
		if candidate != waiter {
			continue
		}

		s.clientWaiters = append(s.clientWaiters[:i], s.clientWaiters[i+1:]...)
		return
	}
}

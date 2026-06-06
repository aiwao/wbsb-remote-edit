package wsserver

import "time"

type Message struct {
	Type    string `json:"type"`
	Title   string `json:"title,omitempty"`
	Content string `json:"content,omitempty"`
	Error   string `json:"error,omitempty"`
	From    string `json:"from,omitempty"`
	At      string `json:"at,omitempty"`
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

package wsserver

import "time"

type Message struct {
	Type  string `json:"type"`
	ID    string `json:"id,omitempty"`
	Title string `json:"title,omitempty"`
	Body  string `json:"body,omitempty"`
	Error string `json:"error,omitempty"`
	From  string `json:"from,omitempty"`
	At    string `json:"at,omitempty"`
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

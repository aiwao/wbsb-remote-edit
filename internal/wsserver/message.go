package wsserver

import "time"

type Message struct {
	Type     string `json:"type"`
	Name     string `json:"name,omitempty"`
	Greeting string `json:"greeting,omitempty"`
	Error    string `json:"error,omitempty"`
	From     string `json:"from,omitempty"`
	At       string `json:"at,omitempty"`
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

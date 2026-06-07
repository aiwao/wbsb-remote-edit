package wsserver

import "time"

const (
	MessageTypeAck                 = "ack"
	MessageTypeConnected           = "connected"
	MessageTypeEdit                = "edit"
	MessageTypeError               = "error"
	MessageTypeGetWBSBArticle      = "get_wbsb_article"
	MessageTypeGetWBSBArticleTitle = "get_wbsb_article_title"
	MessageTypeOK                  = "ok"
	MessageTypePing                = "ping"
	MessageTypePong                = "pong"
	MessageTypeWBSBArticle         = "wbsb_article"
	MessageTypeWBSBArticleTitle    = "wbsb_article_title"
)

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

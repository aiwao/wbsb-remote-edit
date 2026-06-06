package greet

import "strings"

func Greet(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "there"
	}

	return "Hello, " + name + "!"
}

package greet

import "testing"

func TestGreet(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{name: "Ada", want: "Hello, Ada!"},
		{name: "  Grace  ", want: "Hello, Grace!"},
		{name: "", want: "Hello, there!"},
	}

	for _, tt := range tests {
		if got := Greet(tt.name); got != tt.want {
			t.Fatalf("Greet(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}

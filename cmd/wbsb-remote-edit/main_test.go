package main

import (
	"bytes"
	"context"
	"io"
	"testing"
)

func TestRootCommandHasEditOnly(t *testing.T) {
	cmd := newRootCmd(io.Reader(bytes.NewReader(nil)), io.Discard, io.Discard)

	var hasEdit bool
	for _, child := range cmd.Commands() {
		if child.Name() == "edit" {
			hasEdit = true
			continue
		}
		if !child.Hidden {
			t.Fatalf("unexpected command %q", child.Name())
		}
	}

	if !hasEdit {
		t.Fatal("root command does not have edit")
	}
}

func TestNormalizeEndpointPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "default", path: "", want: "/ws"},
		{name: "adds slash", path: "socket", want: "/socket"},
		{name: "keeps slash", path: "/socket", want: "/socket"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeEndpointPath(tt.path); got != tt.want {
				t.Fatalf("normalizeEndpointPath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

func TestCaptureEditorContentUsesEditorCommand(t *testing.T) {
	editor := `sh -c 'printf "updated content" > "$1"' sh`

	got, err := captureEditorContent(
		context.Background(),
		editor,
		bytes.NewReader(nil),
		io.Discard,
		io.Discard,
	)
	if err != nil {
		t.Fatalf("capture editor content: %v", err)
	}
	if got != "updated content" {
		t.Fatalf("content = %q, want %q", got, "updated content")
	}
}

func TestCaptureEditorContentRequiresEditor(t *testing.T) {
	t.Setenv("EDITOR", "")

	_, err := captureEditorContent(
		context.Background(),
		"",
		bytes.NewReader(nil),
		io.Discard,
		io.Discard,
	)
	if err == nil {
		t.Fatal("expected error when no editor is configured")
	}
}

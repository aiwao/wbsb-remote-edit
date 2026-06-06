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

func TestEditCommandUsesTitleFlagAndNoPositionals(t *testing.T) {
	cmd := newEditCmd(bytes.NewReader(nil), io.Discard, io.Discard)

	if cmd.Flags().Lookup("title") == nil {
		t.Fatal("edit command does not have title flag")
	}
	if err := cmd.Args(cmd, []string{}); err != nil {
		t.Fatalf("edit command rejects empty args: %v", err)
	}
	if err := cmd.Args(cmd, []string{"Draft"}); err == nil {
		t.Fatal("edit command accepts positional title")
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

func TestCaptureEditorBodyUsesEditorCommand(t *testing.T) {
	editor := `sh -c 'base=$(basename "$1"); case "$base" in Draft-*.md) ;; *) exit 7;; esac; test "$(cat "$1")" = "seed content" && printf "updated content" > "$1"' sh`

	got, err := captureEditorBody(
		context.Background(),
		editor,
		"Draft",
		"seed content",
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

func TestCaptureEditorBodyRequiresEditor(t *testing.T) {
	t.Setenv("EDITOR", "")

	_, err := captureEditorBody(
		context.Background(),
		"",
		"Draft",
		"",
		bytes.NewReader(nil),
		io.Discard,
		io.Discard,
	)
	if err == nil {
		t.Fatal("expected error when no editor is configured")
	}
}

func TestEditorTempPatternUsesTitleMarkdownName(t *testing.T) {
	tests := []struct {
		title string
		want  string
	}{
		{title: "Draft", want: "Draft-*.md"},
		{title: "  Draft  ", want: "Draft-*.md"},
		{title: "a/b*c", want: "a-b-c-*.md"},
		{title: "", want: "untitled-*.md"},
	}

	for _, tt := range tests {
		t.Run(tt.title, func(t *testing.T) {
			if got := editorTempPattern(tt.title); got != tt.want {
				t.Fatalf("editorTempPattern(%q) = %q, want %q", tt.title, got, tt.want)
			}
		})
	}
}

package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/onelinesh/1ln/cli/internal/store"
)

func TestEdit_FetchesPatchesUsingEditor(t *testing.T) {
	var patchedContent string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/abc" && r.Method == "GET":
			w.Header().Set("content-type", "text/plain")
			_, _ = w.Write([]byte("echo before"))
		case r.URL.Path == "/api/scripts/abc" && r.Method == "PATCH":
			b, _ := io.ReadAll(r.Body)
			var body map[string]string
			_ = json.Unmarshal(b, &body)
			patchedContent = body["content"]
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"ok":true}`))
		default:
			t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &store.Store{Path: path, Token: "TKN"}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	// Editor: a script that overwrites the temp file with "echo after".
	editorPath := filepath.Join(dir, "editor.sh")
	if err := os.WriteFile(editorPath, []byte("#!/bin/sh\necho 'echo after' > \"$1\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ONELN_BASE_URL", srv.URL)
	t.Setenv("ONELN_STORE", path)
	t.Setenv("EDITOR", editorPath)

	if err := runEdit([]string{"abc"}); err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(patchedContent) != "echo after" {
		t.Errorf("patched content = %q", patchedContent)
	}
}

func TestEdit_RequiresLogin(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	t.Setenv("ONELN_BASE_URL", "http://0.0.0.0:1")
	t.Setenv("ONELN_STORE", path)
	err := runEdit([]string{"abc"})
	if err == nil || !strings.Contains(err.Error(), "login") {
		t.Errorf("err = %v, want login required", err)
	}
}

func TestRename_PatchesName(t *testing.T) {
	var seenBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/scripts/abc" && r.Method == "PATCH" {
			b, _ := io.ReadAll(r.Body)
			seenBody = string(b)
			w.WriteHeader(200)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		t.Errorf("unexpected: %s %s", r.Method, r.URL.Path)
	}))
	defer srv.Close()
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &store.Store{Path: path, Token: "TKN"}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ONELN_BASE_URL", srv.URL)
	t.Setenv("ONELN_STORE", path)
	if err := runRename([]string{"abc", "my-script"}); err != nil {
		t.Fatal(err)
	}
	var body map[string]string
	if err := json.Unmarshal([]byte(seenBody), &body); err != nil {
		t.Fatal(err)
	}
	if body["name"] != "my-script" {
		t.Errorf("body = %v", body)
	}
}

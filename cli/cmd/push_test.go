package cmd

import (
	"bytes"
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

func TestPush_ReadsFileAndPostsAndCachesToken(t *testing.T) {
	scriptDir := t.TempDir()
	scriptPath := filepath.Join(scriptDir, "deploy.sh")
	if err := os.WriteFile(scriptPath, []byte("#!/bin/sh\necho hi\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	var sentBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&sentBody)
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"abc","url":"https://1ln.sh/abc","oneliner":"curl 1ln.sh/abc | sh","delete_token":"T0K3N"}`))
	}))
	defer srv.Close()

	storePath := filepath.Join(t.TempDir(), "tokens.json")
	t.Setenv("ONELN_BASE_URL", srv.URL)
	t.Setenv("ONELN_STORE", storePath)

	out, err := captureStdout(t, func() error {
		return runPush([]string{"--name", "deploy", scriptPath})
	})
	if err != nil {
		t.Fatalf("runPush: %v", err)
	}

	if sentBody["content"] != "#!/bin/sh\necho hi\n" {
		t.Errorf("sent content = %q", sentBody["content"])
	}
	if sentBody["visibility"] != "private" {
		t.Errorf("sent visibility = %v, want private", sentBody["visibility"])
	}
	if sentBody["expires"] != "never" {
		t.Errorf("sent expires = %v, want never", sentBody["expires"])
	}

	if strings.TrimSpace(out) != "curl 1ln.sh/abc | sh" {
		t.Errorf("stdout = %q, want one-liner only", out)
	}

	s, err := store.LoadFrom(storePath)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Entries) != 1 || s.Entries[0].Slug != "abc" || s.Entries[0].DeleteToken != "T0K3N" || s.Entries[0].Name != "deploy" {
		t.Errorf("store entry = %+v", s.Entries)
	}
}

func TestPush_PublicFlagAndExpires(t *testing.T) {
	var sentBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&sentBody)
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"abc","url":"u","oneliner":"o","delete_token":"d"}`))
	}))
	defer srv.Close()
	t.Setenv("ONELN_BASE_URL", srv.URL)
	t.Setenv("ONELN_STORE", filepath.Join(t.TempDir(), "tokens.json"))

	scriptPath := filepath.Join(t.TempDir(), "s.sh")
	_ = os.WriteFile(scriptPath, []byte("x"), 0o644)

	if _, err := captureStdout(t, func() error {
		return runPush([]string{"--public", "--expires", "1run", scriptPath})
	}); err != nil {
		t.Fatal(err)
	}
	if sentBody["visibility"] != "public" || sentBody["expires"] != "1run" {
		t.Errorf("sent body = %v", sentBody)
	}
}

func TestPush_ReadsFromStdinWhenNoFile(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b map[string]any
		_ = json.NewDecoder(r.Body).Decode(&b)
		got, _ = b["content"].(string)
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"a","url":"u","oneliner":"o","delete_token":"d"}`))
	}))
	defer srv.Close()
	t.Setenv("ONELN_BASE_URL", srv.URL)
	t.Setenv("ONELN_STORE", filepath.Join(t.TempDir(), "tokens.json"))

	withStdin(t, "from stdin\n", func() {
		if _, err := captureStdout(t, func() error { return runPush(nil) }); err != nil {
			t.Fatal(err)
		}
	})
	if got != "from stdin\n" {
		t.Errorf("content = %q", got)
	}
}

func TestPush_RejectsEmptyScript(t *testing.T) {
	t.Setenv("ONELN_BASE_URL", "http://invalid.example")
	t.Setenv("ONELN_STORE", filepath.Join(t.TempDir(), "tokens.json"))
	scriptPath := filepath.Join(t.TempDir(), "empty.sh")
	_ = os.WriteFile(scriptPath, []byte(""), 0o644)

	err := runPush([]string{scriptPath})
	if err == nil || !strings.Contains(err.Error(), "empty") {
		t.Errorf("err = %v, want 'empty script'", err)
	}
}

// --- test helpers ---

func captureStdout(t *testing.T, fn func() error) (string, error) {
	t.Helper()
	r, w, _ := os.Pipe()
	old := os.Stdout
	os.Stdout = w
	fnErr := fn()
	_ = w.Close()
	os.Stdout = old
	var buf bytes.Buffer
	_, _ = io.Copy(&buf, r)
	return buf.String(), fnErr
}

func withStdin(t *testing.T, input string, fn func()) {
	t.Helper()
	r, w, _ := os.Pipe()
	old := os.Stdin
	os.Stdin = r
	_, _ = w.WriteString(input)
	_ = w.Close()
	defer func() { os.Stdin = old }()
	fn()
}

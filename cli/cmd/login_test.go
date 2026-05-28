package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/onelinesh/1ln/cli/internal/store"
)

func setupEnv(t *testing.T, baseURL, storePath string) {
	t.Helper()
	t.Setenv("ONELN_BASE_URL", baseURL)
	t.Setenv("ONELN_STORE", storePath)
}

func TestLogin_PollsAndSavesToken(t *testing.T) {
	var pollCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/cli/init":
			w.Header().Set("content-type", "application/json")
			_, _ = w.Write([]byte(`{"session_id":"S","login_url":"` + r.Host + `/login","poll_url":"` + r.Host + `/poll","poll_interval_seconds":0,"expires_in_seconds":300}`))
		case "/auth/cli/poll":
			n := atomic.AddInt32(&pollCount, 1)
			w.Header().Set("content-type", "application/json")
			if n < 2 {
				_, _ = w.Write([]byte(`{"status":"pending"}`))
			} else {
				_, _ = w.Write([]byte(`{"status":"complete","token":"TKN"}`))
			}
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	setupEnv(t, srv.URL, path)

	if err := runLogin([]string{"--no-open"}); err != nil {
		t.Fatalf("runLogin: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if f.Token != "TKN" {
		t.Errorf("stored token = %q, want TKN", f.Token)
	}
}

func TestLogin_FailsWhenAlreadyLoggedIn(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &store.Store{Path: path, Token: "EXISTING"}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	setupEnv(t, "http://0.0.0.0:1", path)
	err := runLogin([]string{"--no-open"})
	if err == nil || !strings.Contains(err.Error(), "already logged in") {
		t.Errorf("err = %v, want already logged in", err)
	}
}

func TestLogout_RevokesAndClearsLocal(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/auth/logout" {
			seenAuth = r.Header.Get("authorization")
			w.WriteHeader(204)
			return
		}
		t.Errorf("unexpected path: %s", r.URL.Path)
	}))
	defer srv.Close()
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &store.Store{Path: path, Token: "TKN"}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	setupEnv(t, srv.URL, path)

	if err := runLogout(nil); err != nil {
		t.Fatalf("runLogout: %v", err)
	}
	if seenAuth != "Bearer TKN" {
		t.Errorf("auth = %q", seenAuth)
	}
	loaded, err := store.LoadFrom(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token != "" {
		t.Errorf("token still set: %q", loaded.Token)
	}
}

func TestLogout_NoopWhenNotLoggedIn(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	setupEnv(t, "http://0.0.0.0:1", path)
	if err := runLogout(nil); err != nil {
		t.Errorf("runLogout (no token) should be a noop: %v", err)
	}
}

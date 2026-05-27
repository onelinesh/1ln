package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/YairEtzion/1ln/cli/internal/store"
)

func seedStore(t *testing.T, entries []store.Entry) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "tokens.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(entries)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ONELN_STORE", path)
	return path
}

func TestLs_EmptyStore(t *testing.T) {
	seedStore(t, nil)
	out, err := captureStdout(t, func() error { return runLs(nil) })
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "no scripts") {
		t.Errorf("out = %q, want 'no scripts'", out)
	}
}

func TestLs_ListsEntries(t *testing.T) {
	seedStore(t, []store.Entry{
		{Slug: "abc", Visibility: "public", Expires: "24h", Name: "deploy", Oneliner: "curl 1ln.sh/abc | sh", CreatedAt: time.Now()},
		{Slug: "xyz123", Visibility: "private", Expires: "never", Oneliner: "curl 1ln.sh/xyz123 | sh", CreatedAt: time.Now()},
	})
	out, err := captureStdout(t, func() error { return runLs(nil) })
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"SLUG", "abc", "xyz123", "deploy", "curl 1ln.sh/abc | sh"} {
		if !strings.Contains(out, want) {
			t.Errorf("out = %q, missing %q", out, want)
		}
	}
}

func TestRm_RequiresOneSlugArg(t *testing.T) {
	seedStore(t, nil)
	if err := runRm(nil); err == nil || !strings.Contains(err.Error(), "usage") {
		t.Errorf("nil args: err = %v", err)
	}
	if err := runRm([]string{"a", "b"}); err == nil || !strings.Contains(err.Error(), "usage") {
		t.Errorf("two args: err = %v", err)
	}
}

func TestRm_DeletesViaAPIAndRemovesFromStore(t *testing.T) {
	var gotPath, gotToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get("x-delete-token")
		w.WriteHeader(204)
	}))
	defer srv.Close()
	t.Setenv("ONELN_BASE_URL", srv.URL)

	path := seedStore(t, []store.Entry{{Slug: "abc", DeleteToken: "T0K3N", CreatedAt: time.Now()}})
	out, err := captureStdout(t, func() error { return runRm([]string{"abc"}) })
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/scripts/abc" || gotToken != "T0K3N" {
		t.Errorf("server saw path=%q token=%q", gotPath, gotToken)
	}
	if !strings.Contains(out, "deleted abc") {
		t.Errorf("stdout = %q", out)
	}
	s, _ := store.LoadFrom(path)
	if len(s.Entries) != 0 {
		t.Errorf("entries after rm = %+v", s.Entries)
	}
}

func TestRm_NoLocalTokenFailsClearly(t *testing.T) {
	seedStore(t, nil)
	err := runRm([]string{"abc"})
	if err == nil || !strings.Contains(err.Error(), "no local delete token") {
		t.Errorf("err = %v", err)
	}
}

func TestRm_APIErrorKeepsLocalEntry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(403)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
	}))
	defer srv.Close()
	t.Setenv("ONELN_BASE_URL", srv.URL)
	path := seedStore(t, []store.Entry{{Slug: "abc", DeleteToken: "wrong", CreatedAt: time.Now()}})

	err := runRm([]string{"abc"})
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Errorf("err = %v", err)
	}
	s, _ := store.LoadFrom(path)
	if len(s.Entries) != 1 {
		t.Errorf("entry should remain after API error, got %+v", s.Entries)
	}
}

package store

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func tempStore(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	return filepath.Join(dir, "tokens.json")
}

func TestLoadFrom_MissingFileReturnsEmpty(t *testing.T) {
	s, err := LoadFrom(tempStore(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Entries) != 0 {
		t.Errorf("expected empty store, got %d entries", len(s.Entries))
	}
}

func TestRoundtrip_AddSaveLoadFindRemove(t *testing.T) {
	path := tempStore(t)
	s, err := LoadFrom(path)
	if err != nil {
		t.Fatal(err)
	}
	s.Add(Entry{
		Slug:        "abc",
		URL:         "https://1ln.sh/abc",
		Oneliner:    "curl 1ln.sh/abc | sh",
		DeleteToken: "T0K3N",
		Visibility:  "private",
		Expires:     "never",
		Name:        "deploy",
		CreatedAt:   time.Date(2026, 5, 27, 12, 0, 0, 0, time.UTC),
	})
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}

	// Re-load and verify roundtrip.
	s2, err := LoadFrom(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(s2.Entries) != 1 {
		t.Fatalf("expected 1 entry after reload, got %d", len(s2.Entries))
	}
	e, ok := s2.Find("abc")
	if !ok || e.DeleteToken != "T0K3N" || e.Name != "deploy" || !e.CreatedAt.Equal(time.Date(2026, 5, 27, 12, 0, 0, 0, time.UTC)) {
		t.Errorf("entry mismatch: %+v ok=%v", e, ok)
	}

	removed, ok := s2.Remove("abc")
	if !ok || removed.Slug != "abc" {
		t.Errorf("Remove returned %+v ok=%v", removed, ok)
	}
	if len(s2.Entries) != 0 {
		t.Errorf("expected 0 entries after remove, got %d", len(s2.Entries))
	}
	_, ok = s2.Remove("does-not-exist")
	if ok {
		t.Errorf("Remove of missing slug should return ok=false")
	}
}

func TestSave_FilePermissions(t *testing.T) {
	path := tempStore(t)
	s, _ := LoadFrom(path)
	s.Add(Entry{Slug: "x", DeleteToken: "t", CreatedAt: time.Now().UTC()})
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("file perms = %v, want 0600", info.Mode().Perm())
	}
	dirInfo, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if dirInfo.Mode().Perm()&0o077 != 0 {
		t.Errorf("dir perms = %v, want no group/other access", dirInfo.Mode().Perm())
	}
}

func TestSave_AtomicViaRename(t *testing.T) {
	// Pre-populate the target file with garbage. A failed Save must not corrupt it.
	path := tempStore(t)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`[{"slug":"existing","delete_token":"old","created_at":"2026-01-01T00:00:00Z"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := LoadFrom(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Entries) != 1 || s.Entries[0].Slug != "existing" {
		t.Fatalf("preload failed: %+v", s.Entries)
	}
	s.Add(Entry{Slug: "new", DeleteToken: "n", CreatedAt: time.Now().UTC()})
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	// Verify .tmp is not lingering.
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Errorf(".tmp file should not exist after Save, got err=%v", err)
	}
	s2, _ := LoadFrom(path)
	if len(s2.Entries) != 2 {
		t.Errorf("expected 2 entries, got %d", len(s2.Entries))
	}
}

func TestLoad_ReadsLegacyArrayFormat(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	if err := os.WriteFile(path, []byte(`[{"slug":"abc","delete_token":"T","created_at":"2026-05-28T00:00:00Z"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := LoadFrom(path)
	if err != nil {
		t.Fatalf("LoadFrom: %v", err)
	}
	if s.Token != "" {
		t.Errorf("Token = %q, want empty (legacy file)", s.Token)
	}
	if len(s.Entries) != 1 || s.Entries[0].Slug != "abc" {
		t.Errorf("Entries = %+v, want one abc", s.Entries)
	}
}

func TestSaveLoad_RoundTripsTokenAndEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &Store{Path: path, Token: "TKN", Entries: []Entry{
		{Slug: "abc", DeleteToken: "X", CreatedAt: time.Date(2026, 5, 28, 0, 0, 0, 0, time.UTC)},
	}}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadFrom(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Token != "TKN" {
		t.Errorf("Token = %q, want TKN", loaded.Token)
	}
	if len(loaded.Entries) != 1 || loaded.Entries[0].Slug != "abc" {
		t.Errorf("Entries = %+v", loaded.Entries)
	}
}

func TestSetToken_UpdatesAndClears(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "tokens.json")
	s := &Store{Path: path}
	s.SetToken("TKN")
	if s.Token != "TKN" {
		t.Errorf("Token = %q", s.Token)
	}
	s.ClearToken()
	if s.Token != "" {
		t.Errorf("Token after clear = %q", s.Token)
	}
}

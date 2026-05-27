package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

type Entry struct {
	Slug        string    `json:"slug"`
	URL         string    `json:"url,omitempty"`
	Oneliner    string    `json:"oneliner,omitempty"`
	DeleteToken string    `json:"delete_token"`
	Visibility  string    `json:"visibility,omitempty"`
	Expires     string    `json:"expires,omitempty"`
	Name        string    `json:"name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type Store struct {
	Path    string
	Entries []Entry
}

func DefaultPath() (string, error) {
	if v := os.Getenv("ONELN_STORE"); v != "" {
		return v, nil
	}
	home, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("locate config dir: %w", err)
	}
	return filepath.Join(home, "1ln", "tokens.json"), nil
}

func Load() (*Store, error) {
	p, err := DefaultPath()
	if err != nil {
		return nil, err
	}
	return LoadFrom(p)
}

func LoadFrom(path string) (*Store, error) {
	s := &Store{Path: path}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	if len(data) == 0 {
		return s, nil
	}
	if err := json.Unmarshal(data, &s.Entries); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return s, nil
}

func (s *Store) Save() error {
	dir := filepath.Dir(s.Path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return fmt.Errorf("chmod %s: %w", dir, err)
	}
	data, err := json.MarshalIndent(s.Entries, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.Path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, s.Path); err != nil {
		return fmt.Errorf("rename %s -> %s: %w", tmp, s.Path, err)
	}
	return nil
}

func (s *Store) Add(e Entry) {
	s.Entries = append(s.Entries, e)
}

func (s *Store) Remove(slug string) (Entry, bool) {
	for i, e := range s.Entries {
		if e.Slug == slug {
			s.Entries = append(s.Entries[:i], s.Entries[i+1:]...)
			return e, true
		}
	}
	return Entry{}, false
}

func (s *Store) Find(slug string) (Entry, bool) {
	for _, e := range s.Entries {
		if e.Slug == slug {
			return e, true
		}
	}
	return Entry{}, false
}

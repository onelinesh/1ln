package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runRm(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: 1ln rm <slug>")
	}
	slug := args[0]

	s, err := store.Load()
	if err != nil {
		return err
	}
	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if s.Token != "" {
		if err := c.DeleteAuthed(ctx, slug, s.Token); err != nil {
			return err
		}
	} else {
		e, ok := s.Find(slug)
		if !ok {
			return fmt.Errorf("no local delete token for %s — run rm from the machine that created it, or `1ln login` first", slug)
		}
		if err := c.Delete(ctx, slug, e.DeleteToken); err != nil {
			return err
		}
	}

	s.Remove(slug)
	if err := s.Save(); err != nil {
		return err
	}
	fmt.Println("deleted", slug)
	return nil
}

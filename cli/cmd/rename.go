package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runRename(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("usage: 1ln rename <slug> <new-name>")
	}
	slug, name := args[0], args[1]
	s, err := store.Load()
	if err != nil {
		return err
	}
	if s.Token == "" {
		return fmt.Errorf("rename requires `1ln login` first")
	}
	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.Patch(ctx, slug, s.Token, api.PatchInput{Name: name}); err != nil {
		return err
	}
	fmt.Println("renamed", slug, "→", name)
	return nil
}

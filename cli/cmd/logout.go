package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runLogout(_ []string) error {
	s, err := store.Load()
	if err != nil {
		return err
	}
	if s.Token == "" {
		fmt.Println("not logged in")
		return nil
	}
	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.Logout(ctx, s.Token); err != nil {
		// Server-side revoke failed (network, 5xx). Clear locally regardless —
		// leaving the user "logged in locally to a server-revoked token" is worse.
		fmt.Println("warning: server-side logout failed:", err)
	}
	s.ClearToken()
	if err := s.Save(); err != nil {
		return err
	}
	fmt.Println("logged out")
	return nil
}

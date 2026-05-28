package cmd

import (
	"context"
	"flag"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	noOpen := fs.Bool("no-open", false, "do not launch a browser; print the URL only (useful in CI/tests)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	s, err := store.Load()
	if err != nil {
		return err
	}
	if s.Token != "" {
		return fmt.Errorf("already logged in — run `1ln logout` first")
	}

	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()

	init, err := c.InitLogin(ctx)
	if err != nil {
		return err
	}
	fmt.Println("Open this URL in a browser to authenticate with GitHub:")
	fmt.Println(" ", init.LoginURL)
	if !*noOpen {
		_ = openBrowser(init.LoginURL)
	}
	fmt.Println("Waiting for login to complete...")

	interval := time.Duration(init.PollInterval) * time.Second
	if interval <= 0 {
		interval = 50 * time.Millisecond // fast path used by tests
	}
	deadline := time.Now().Add(time.Duration(init.ExpiresIn) * time.Second)
	for time.Now().Before(deadline) {
		res, err := c.PollLogin(ctx, init.SessionID)
		if err != nil {
			return err
		}
		if res.Status == "complete" {
			s.SetToken(res.Token)
			if err := s.Save(); err != nil {
				return fmt.Errorf("save token: %w", err)
			}
			fmt.Println("logged in")
			return nil
		}
		time.Sleep(interval)
	}
	return fmt.Errorf("login timed out — try again")
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	}
	return nil
}

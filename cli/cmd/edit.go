package cmd

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runEdit(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: 1ln edit <slug>")
	}
	slug := args[0]
	s, err := store.Load()
	if err != nil {
		return err
	}
	if s.Token == "" {
		return fmt.Errorf("edit requires `1ln login` first")
	}
	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	content, err := c.Raw(ctx, slug, s.Token)
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp("", "1ln-edit-*.sh")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.WriteString(content); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	editor := os.Getenv("EDITOR")
	if editor == "" {
		editor = "vi"
	}
	cmd := exec.Command(editor, tmpPath)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("editor (%s) failed: %w", filepath.Base(editor), err)
	}

	newContent, err := os.ReadFile(tmpPath)
	if err != nil {
		return err
	}
	if string(newContent) == content {
		fmt.Println("no changes")
		return nil
	}
	if err := c.Patch(ctx, slug, s.Token, api.PatchInput{Content: string(newContent)}); err != nil {
		return err
	}
	fmt.Println("updated", slug)
	return nil
}

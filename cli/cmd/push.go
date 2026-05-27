package cmd

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/YairEtzion/1ln/cli/internal/api"
	"github.com/YairEtzion/1ln/cli/internal/config"
	"github.com/YairEtzion/1ln/cli/internal/store"
)

func runPush(args []string) error {
	fs := flag.NewFlagSet("push", flag.ContinueOnError)
	public := fs.Bool("public", false, "create a short public URL")
	expires := fs.String("expires", "never", "1h | 24h | 1run | never")
	name := fs.String("name", "", "local label, stored in tokens.json")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()

	var (
		content []byte
		err     error
	)
	if len(rest) == 0 {
		content, err = io.ReadAll(os.Stdin)
	} else {
		content, err = os.ReadFile(rest[0])
	}
	if err != nil {
		return err
	}
	if len(content) == 0 {
		return fmt.Errorf("empty script")
	}

	visibility := "private"
	if *public {
		visibility = "public"
	}

	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, err := c.Publish(ctx, api.PublishInput{
		Content:    string(content),
		Visibility: visibility,
		Expires:    *expires,
	})
	if err != nil {
		return err
	}

	if s, loadErr := store.Load(); loadErr == nil {
		s.Add(store.Entry{
			Slug:        res.Slug,
			URL:         res.URL,
			Oneliner:    res.Oneliner,
			DeleteToken: res.DeleteToken,
			Visibility:  visibility,
			Expires:     *expires,
			Name:        *name,
			CreatedAt:   time.Now().UTC(),
		})
		if saveErr := s.Save(); saveErr != nil {
			fmt.Fprintln(os.Stderr, "warning: could not save token store:", saveErr)
		}
	} else {
		fmt.Fprintln(os.Stderr, "warning: could not load token store:", loadErr)
	}

	fmt.Println(res.Oneliner)
	return nil
}

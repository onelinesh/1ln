package cmd

import (
	"context"
	"fmt"
	"os"
	"text/tabwriter"
	"time"

	"github.com/onelinesh/1ln/cli/internal/api"
	"github.com/onelinesh/1ln/cli/internal/config"
	"github.com/onelinesh/1ln/cli/internal/store"
)

func runLs(_ []string) error {
	s, err := store.Load()
	if err != nil {
		return err
	}
	if s.Token != "" {
		return lsServer(s.Token)
	}
	return lsLocal(s)
}

func lsLocal(s *store.Store) error {
	if len(s.Entries) == 0 {
		fmt.Println("no scripts (local cache empty)")
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "SLUG\tVISIBILITY\tEXPIRES\tNAME\tONELINER")
	for _, e := range s.Entries {
		name := e.Name
		if name == "" {
			name = "-"
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n", e.Slug, e.Visibility, e.Expires, name, e.Oneliner)
	}
	return w.Flush()
}

func lsServer(token string) error {
	c := api.New(config.BaseURL())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	items, err := c.List(ctx, token)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		fmt.Println("no scripts")
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "SLUG\tVISIBILITY\tSIZE\tNAME\tCREATED")
	for _, it := range items {
		name := "-"
		if it.Name != nil && *it.Name != "" {
			name = *it.Name
		}
		fmt.Fprintf(w, "%s\t%s\t%d\t%s\t%s\n",
			it.Slug, it.Visibility, it.Size, name,
			time.UnixMilli(it.CreatedAt).UTC().Format(time.RFC3339))
	}
	return w.Flush()
}

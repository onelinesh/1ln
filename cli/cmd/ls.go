package cmd

import (
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/onelinesh/1ln/cli/internal/store"
)

func runLs(_ []string) error {
	s, err := store.Load()
	if err != nil {
		return err
	}
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

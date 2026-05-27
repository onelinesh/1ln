package main

import (
	"fmt"
	"os"

	"github.com/YairEtzion/1ln/cli/cmd"
)

func main() {
	if err := cmd.Run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "1ln:", err)
		os.Exit(1)
	}
}

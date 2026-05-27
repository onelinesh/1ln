package cmd

import "fmt"

// Version is set via -ldflags "-X github.com/YairEtzion/1ln/cli/cmd.Version=vX.Y.Z" at build time.
var Version = "dev"

func runVersion() error {
	fmt.Println(Version)
	return nil
}

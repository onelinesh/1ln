package cmd

import "fmt"

// Version is set via -ldflags "-X github.com/YairEtzion/1ln/cli/cmd.Version=vX.Y.Z" at build time.
var Version = "dev"

func runVersion() error {
	fmt.Println(Version)
	return nil
}

// Stubs so the package compiles before Tasks 3-5 land. They will be replaced.
func runPush(_ []string) error { return fmt.Errorf("push: not yet implemented") }
func runLs(_ []string) error   { return fmt.Errorf("ls: not yet implemented") }
func runRm(_ []string) error   { return fmt.Errorf("rm: not yet implemented") }

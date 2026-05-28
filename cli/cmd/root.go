package cmd

import (
	"fmt"
	"os"
)

func Run(args []string) error {
	if len(args) == 0 {
		printUsage()
		return nil
	}
	name, rest := args[0], args[1:]
	switch name {
	case "push":
		return runPush(rest)
	case "ls":
		return runLs(rest)
	case "rm":
		return runRm(rest)
	case "login":
		return runLogin(rest)
	case "logout":
		return runLogout(rest)
	case "version", "--version", "-v":
		return runVersion()
	case "help", "--help", "-h":
		printUsage()
		return nil
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n", name)
		printUsage()
		os.Exit(2)
		return nil
	}
}

func printUsage() {
	fmt.Print(usage)
}

const usage = `1ln — paste a shell script, get curl 1ln.sh/<slug> | sh

Usage:
  1ln push [--public] [--expires DURATION] [--name NAME] [<file>]
  1ln ls
  1ln rm <slug>
  1ln login
  1ln logout
  1ln edit <slug>
  1ln rename <slug> <new-name>
  1ln version

Options for push:
  --public           short shareable slug (default: private 22-char)
  --expires VALUE    1h | 24h | 1run | never (default: never)
  --name NAME        local label, stored in ~/.config/1ln/tokens.json

When logged in (` + "`1ln login`" + `), push attaches scripts to your GitHub
account, removes the 7-day TTL, raises the size cap to 64KB, and lets you ls/
rm/edit/rename from any machine.

If <file> is omitted, push reads the script from stdin.

Environment:
  ONELN_BASE_URL     override the API base (default https://1ln.sh)
  ONELN_STORE        override the local token store path
`

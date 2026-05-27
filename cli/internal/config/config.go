package config

import "os"

func BaseURL() string {
	if v := os.Getenv("ONELN_BASE_URL"); v != "" {
		return v
	}
	return "https://1ln.sh"
}

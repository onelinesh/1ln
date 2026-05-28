package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
	// Token, if non-empty, is sent as Authorization: Bearer <token> on Publish.
	// Other methods take an explicit token argument; Publish reads from this so
	// the existing `runPush` flow can stay simple.
	Token string
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) do(req *http.Request) (*http.Response, error) {
	return c.HTTP.Do(req)
}

func decodeJSON(res *http.Response, into any) error {
	raw, _ := io.ReadAll(res.Body)
	return json.Unmarshal(raw, into)
}

type PublishInput struct {
	Content    string `json:"content"`
	Visibility string `json:"visibility"`
	Expires    string `json:"expires,omitempty"`
}

type PublishResult struct {
	Slug        string `json:"slug"`
	URL         string `json:"url"`
	Oneliner    string `json:"oneliner"`
	DeleteToken string `json:"delete_token,omitempty"`
}

func (c *Client) Publish(ctx context.Context, in PublishInput) (*PublishResult, error) {
	body, err := json.Marshal(in)
	if err != nil {
		return nil, fmt.Errorf("encode body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/api/scripts", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	if c.Token != "" {
		req.Header.Set("authorization", "Bearer "+c.Token)
	}
	res, err := c.do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != 201 {
		return nil, fmt.Errorf("1ln.sh POST /api/scripts returned %d: %s", res.StatusCode, string(raw))
	}
	var out PublishResult
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &out, nil
}

// Delete (anonymous) — uses x-delete-token, no bearer.
func (c *Client) Delete(ctx context.Context, slug, token string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.BaseURL+"/api/scripts/"+slug, nil)
	if err != nil {
		return err
	}
	req.Header.Set("x-delete-token", token)
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 204 {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("1ln.sh DELETE /api/scripts/%s returned %d: %s", slug, res.StatusCode, string(raw))
}

// DeleteAuthed — bearer ownership check; no delete-token required.
func (c *Client) DeleteAuthed(ctx context.Context, slug, bearer string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.BaseURL+"/api/scripts/"+slug, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+bearer)
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 204 {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("1ln.sh DELETE /api/scripts/%s returned %d: %s", slug, res.StatusCode, string(raw))
}

type InitLoginResult struct {
	SessionID    string `json:"session_id"`
	LoginURL     string `json:"login_url"`
	PollURL      string `json:"poll_url"`
	PollInterval int    `json:"poll_interval_seconds"`
	ExpiresIn    int    `json:"expires_in_seconds"`
}

func (c *Client) InitLogin(ctx context.Context) (*InitLoginResult, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/auth/cli/init", nil)
	if err != nil {
		return nil, err
	}
	res, err := c.do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("1ln.sh POST /auth/cli/init returned %d: %s", res.StatusCode, string(raw))
	}
	out := &InitLoginResult{}
	if err := decodeJSON(res, out); err != nil {
		return nil, fmt.Errorf("decode init response: %w", err)
	}
	return out, nil
}

type PollLoginResult struct {
	Status string `json:"status"`
	Token  string `json:"token,omitempty"`
}

func (c *Client) PollLogin(ctx context.Context, sessionID string) (*PollLoginResult, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/auth/cli/poll?session="+sessionID, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return nil, fmt.Errorf("login session expired or already consumed")
	}
	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("1ln.sh GET /auth/cli/poll returned %d: %s", res.StatusCode, string(raw))
	}
	out := &PollLoginResult{}
	if err := decodeJSON(res, out); err != nil {
		return nil, fmt.Errorf("decode poll response: %w", err)
	}
	return out, nil
}

func (c *Client) Logout(ctx context.Context, bearer string) error {
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/auth/logout", nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+bearer)
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 204 {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("1ln.sh POST /auth/logout returned %d: %s", res.StatusCode, string(raw))
}

type ListItem struct {
	Slug       string  `json:"slug"`
	Visibility string  `json:"visibility"`
	Name       *string `json:"name"`
	Size       int     `json:"size"`
	ExpiresAt  *int64  `json:"expires_at"`
	CreatedAt  int64   `json:"created_at"`
	UpdatedAt  int64   `json:"updated_at"`
}

type listResponse struct {
	Scripts []ListItem `json:"scripts"`
}

func (c *Client) List(ctx context.Context, bearer string) ([]ListItem, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/api/scripts", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("authorization", "Bearer "+bearer)
	res, err := c.do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("1ln.sh GET /api/scripts returned %d: %s", res.StatusCode, string(raw))
	}
	var body listResponse
	if err := decodeJSON(res, &body); err != nil {
		return nil, fmt.Errorf("decode list response: %w", err)
	}
	return body.Scripts, nil
}

type PatchInput struct {
	Name    string `json:"name,omitempty"`
	Content string `json:"content,omitempty"`
}

func (c *Client) Patch(ctx context.Context, slug, bearer string, in PatchInput) error {
	body, err := json.Marshal(in)
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, "PATCH", c.BaseURL+"/api/scripts/"+slug, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+bearer)
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 200 {
		return nil
	}
	raw, _ := io.ReadAll(res.Body)
	return fmt.Errorf("1ln.sh PATCH /api/scripts/%s returned %d: %s", slug, res.StatusCode, string(raw))
}

// Raw fetches /<slug> with an optional bearer. Used by `1ln edit` to load the
// current script content.
func (c *Client) Raw(ctx context.Context, slug, bearer string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/"+slug, nil)
	if err != nil {
		return "", err
	}
	if bearer != "" {
		req.Header.Set("authorization", "Bearer "+bearer)
	}
	res, err := c.do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		raw, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("1ln.sh GET /%s returned %d: %s", slug, res.StatusCode, string(raw))
	}
	raw, _ := io.ReadAll(res.Body)
	return string(raw), nil
}

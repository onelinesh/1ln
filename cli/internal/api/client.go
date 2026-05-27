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
}

func New(baseURL string) *Client {
	return &Client{
		BaseURL: baseURL,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
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
	DeleteToken string `json:"delete_token"`
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
	res, err := c.HTTP.Do(req)
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

func (c *Client) Delete(ctx context.Context, slug, token string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.BaseURL+"/api/scripts/"+slug, nil)
	if err != nil {
		return err
	}
	req.Header.Set("x-delete-token", token)
	res, err := c.HTTP.Do(req)
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

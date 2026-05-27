package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublish_PostsJSONAndReturnsResult(t *testing.T) {
	var gotPath, gotMethod, gotCT, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		gotCT = r.Header.Get("content-type")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"abc","url":"https://1ln.sh/abc","oneliner":"curl 1ln.sh/abc | sh","delete_token":"T0K3N"}`))
	}))
	defer srv.Close()

	c := New(srv.URL)
	res, err := c.Publish(context.Background(), PublishInput{
		Content:    "echo hi",
		Visibility: "private",
		Expires:    "24h",
	})
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if gotPath != "/api/scripts" {
		t.Errorf("path = %q, want /api/scripts", gotPath)
	}
	if gotMethod != "POST" {
		t.Errorf("method = %q, want POST", gotMethod)
	}
	if !strings.Contains(gotCT, "application/json") {
		t.Errorf("content-type = %q, want application/json", gotCT)
	}
	var sentBody map[string]string
	if err := json.Unmarshal([]byte(gotBody), &sentBody); err != nil {
		t.Fatalf("body not JSON: %v (%s)", err, gotBody)
	}
	if sentBody["content"] != "echo hi" || sentBody["visibility"] != "private" || sentBody["expires"] != "24h" {
		t.Errorf("body = %v, want content=echo hi visibility=private expires=24h", sentBody)
	}
	if res.Slug != "abc" || res.DeleteToken != "T0K3N" || res.Oneliner != "curl 1ln.sh/abc | sh" {
		t.Errorf("result = %+v", res)
	}
}

func TestPublish_OmitsEmptyExpires(t *testing.T) {
	var sent map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&sent)
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"a","url":"u","oneliner":"o","delete_token":"d"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	if _, err := c.Publish(context.Background(), PublishInput{Content: "x", Visibility: "public"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := sent["expires"]; ok {
		t.Errorf("expected expires field to be omitted when empty, got %v", sent)
	}
}

func TestPublish_ErrorIncludesStatusAndBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(429)
		_, _ = w.Write([]byte(`{"error":"rate limit exceeded"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	_, err := c.Publish(context.Background(), PublishInput{Content: "x", Visibility: "public"})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "429") || !strings.Contains(err.Error(), "rate limit") {
		t.Errorf("error = %v, want 429 + rate limit", err)
	}
}

func TestDelete_SendsTokenAnd204(t *testing.T) {
	var gotPath, gotMethod, gotToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		gotToken = r.Header.Get("x-delete-token")
		w.WriteHeader(204)
	}))
	defer srv.Close()
	c := New(srv.URL)
	if err := c.Delete(context.Background(), "abc", "T0K3N"); err != nil {
		t.Fatal(err)
	}
	if gotPath != "/api/scripts/abc" {
		t.Errorf("path = %q", gotPath)
	}
	if gotMethod != "DELETE" {
		t.Errorf("method = %q", gotMethod)
	}
	if gotToken != "T0K3N" {
		t.Errorf("token = %q", gotToken)
	}
}

func TestDelete_ErrorIncludesStatusAndBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(403)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	err := c.Delete(context.Background(), "abc", "wrong")
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("err = %v, want 403", err)
	}
}

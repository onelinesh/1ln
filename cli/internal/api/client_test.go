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

func TestInitLogin_ReturnsSessionAndUrls(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/cli/init" || r.Method != "POST" {
			t.Errorf("path = %s, method = %s", r.URL.Path, r.Method)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"session_id":"S","login_url":"http://x/login","poll_url":"http://x/poll","poll_interval_seconds":2,"expires_in_seconds":300}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	res, err := c.InitLogin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.SessionID != "S" || res.LoginURL != "http://x/login" || res.PollURL != "http://x/poll" {
		t.Errorf("res = %+v", res)
	}
	if res.PollInterval != 2 || res.ExpiresIn != 300 {
		t.Errorf("intervals = %d %d", res.PollInterval, res.ExpiresIn)
	}
}

func TestPollLogin_ReturnsPendingOrComplete(t *testing.T) {
	call := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call++
		w.Header().Set("content-type", "application/json")
		if call == 1 {
			_, _ = w.Write([]byte(`{"status":"pending"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"complete","token":"TKN"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	r1, err := c.PollLogin(context.Background(), "S")
	if err != nil || r1.Status != "pending" || r1.Token != "" {
		t.Errorf("r1 = %+v err = %v", r1, err)
	}
	r2, err := c.PollLogin(context.Background(), "S")
	if err != nil || r2.Status != "complete" || r2.Token != "TKN" {
		t.Errorf("r2 = %+v err = %v", r2, err)
	}
}

func TestList_SendsBearerAndReturnsScripts(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("authorization")
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"scripts":[{"slug":"a","visibility":"private","name":null,"size":4,"expires_at":null,"created_at":1,"updated_at":1}]}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	items, err := c.List(context.Background(), "TKN")
	if err != nil {
		t.Fatal(err)
	}
	if seenAuth != "Bearer TKN" {
		t.Errorf("auth = %q", seenAuth)
	}
	if len(items) != 1 || items[0].Slug != "a" {
		t.Errorf("items = %+v", items)
	}
}

func TestDeleteAuthed_SendsBearer(t *testing.T) {
	var seenAuth, seenPath, seenMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("authorization")
		seenPath = r.URL.Path
		seenMethod = r.Method
		w.WriteHeader(204)
	}))
	defer srv.Close()
	c := New(srv.URL)
	if err := c.DeleteAuthed(context.Background(), "abc", "TKN"); err != nil {
		t.Fatal(err)
	}
	if seenAuth != "Bearer TKN" || seenPath != "/api/scripts/abc" || seenMethod != "DELETE" {
		t.Errorf("auth=%q path=%q method=%q", seenAuth, seenPath, seenMethod)
	}
}

func TestLogout_SendsBearer(t *testing.T) {
	var seenAuth, seenPath, seenMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("authorization")
		seenPath = r.URL.Path
		seenMethod = r.Method
		w.WriteHeader(204)
	}))
	defer srv.Close()
	c := New(srv.URL)
	if err := c.Logout(context.Background(), "TKN"); err != nil {
		t.Fatal(err)
	}
	if seenAuth != "Bearer TKN" || seenPath != "/auth/logout" || seenMethod != "POST" {
		t.Errorf("auth=%q path=%q method=%q", seenAuth, seenPath, seenMethod)
	}
}

func TestPatch_SendsBearerAndBody(t *testing.T) {
	var seenAuth, seenBody, seenPath, seenMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("authorization")
		seenPath = r.URL.Path
		seenMethod = r.Method
		b, _ := io.ReadAll(r.Body)
		seenBody = string(b)
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	if err := c.Patch(context.Background(), "abc", "TKN", PatchInput{Name: "n", Content: "echo c"}); err != nil {
		t.Fatal(err)
	}
	if seenAuth != "Bearer TKN" || seenPath != "/api/scripts/abc" || seenMethod != "PATCH" {
		t.Errorf("auth=%q path=%q method=%q", seenAuth, seenPath, seenMethod)
	}
	var body map[string]string
	if err := json.Unmarshal([]byte(seenBody), &body); err != nil {
		t.Fatal(err)
	}
	if body["name"] != "n" || body["content"] != "echo c" {
		t.Errorf("body = %v", body)
	}
}

func TestPublish_SendsBearerWhenProvided(t *testing.T) {
	var seenAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenAuth = r.Header.Get("authorization")
		w.WriteHeader(201)
		_, _ = w.Write([]byte(`{"slug":"a","url":"u","oneliner":"o"}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	c.Token = "TKN"
	if _, err := c.Publish(context.Background(), PublishInput{Content: "x", Visibility: "public"}); err != nil {
		t.Fatal(err)
	}
	if seenAuth != "Bearer TKN" {
		t.Errorf("auth = %q, want Bearer TKN", seenAuth)
	}
}

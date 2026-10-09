package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAPIIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	base, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer base.Close()
	schema := "test_" + randomID()
	if _, err = base.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer base.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	t.Setenv("ADMIN_EMAIL", "admin@test.example")
	t.Setenv("ADMIN_PASSWORD", "integration-admin-password")
	a := &App{db: db, origins: map[string]bool{"http://localhost:5173": true}, limits: &limiter{entries: map[string]limitEntry{}}}
	if err = a.initialize(ctx); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.mux())
	defer server.Close()
	request := func(method, path string, body any, cookie *http.Cookie, want int) map[string]any {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			if err := json.NewEncoder(&buf).Encode(body); err != nil {
				t.Fatal(err)
			}
		}
		req, _ := http.NewRequest(method, server.URL+path, &buf)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hao123-Request", "1")
		req.Header.Set("Origin", "http://localhost:5173")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var data map[string]any
		_ = json.NewDecoder(res.Body).Decode(&data)
		if res.StatusCode != want {
			t.Fatalf("%s %s: wanted %d got %d: %v", method, path, want, res.StatusCode, data)
		}
		return data
	}
	auth := func(path, email string) *http.Cookie {
		t.Helper()
		payload := map[string]string{"email": email, "password": "integration-user-password"}
		if path == "register" {
			payload["name"] = "测试用户"
		}
		if path == "login" && email == "admin@test.example" {
			payload["password"] = "integration-admin-password"
		}
		raw, _ := json.Marshal(payload)
		req, _ := http.NewRequest("POST", server.URL+"/api/auth/"+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hao123-Request", "1")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("auth returned %d", res.StatusCode)
		}
		for _, c := range res.Cookies() {
			if c.Name == "hao123_session" {
				if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
					t.Fatal("cookie security attributes missing")
				}
				return c
			}
		}
		t.Fatal("missing session cookie")
		return nil
	}
	catalog := request("GET", "/api/catalog", nil, nil, 200)
	if len(catalog["categories"].([]any)) != 8 {
		t.Fatal("seed categories missing")
	}
	request("GET", "/api/admin/overview", nil, nil, 401)
	c1 := auth("register", "first@test.example")
	c2 := auth("register", "second@test.example")
	admin := auth("login", "admin@test.example")
	request("POST", "/api/auth/register", map[string]string{"email": "first@test.example", "password": "integration-user-password", "name": "重复"}, nil, 409)
	request("POST", "/api/auth/register", map[string]string{"email": "extra@test.example", "password": "integration-user-password", "name": "提权", "role": "admin"}, nil, 400)
	request("GET", "/api/admin/users", nil, c1, 403)
	// Enforce the custom request header and origin checks even when cookies are valid.
	for _, origin := range []string{"http://evil.example", ""} {
		req, _ := http.NewRequest("POST", server.URL+"/api/auth/logout", nil)
		req.AddCookie(c1)
		if origin != "" {
			req.Header.Set("Origin", origin)
			req.Header.Set("X-Hao123-Request", "1")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 403 {
			t.Fatal("CSRF request accepted")
		}
	}
	for _, c := range []*http.Cookie{c1, c2} {
		request("POST", "/api/clicks", map[string]string{"siteId": "deepseek"}, c, 200)
	}
	request("POST", "/api/clicks", map[string]string{"siteId": "kimi"}, c2, 200)
	rec := request("GET", "/api/recommendations", nil, c1, 200)
	found := false
	for _, item := range rec["sites"].([]any) {
		s := item.(map[string]any)
		if s["id"] == "kimi" && s["reason"] == "访问相似网站的人也常用" {
			found = true
		}
	}
	if !found {
		t.Fatal("co-visit recommendation missing")
	}
	p := request("GET", "/api/preferences", nil, c1, 200)
	p["pinned"] = []string{"taobao"}
	p["personalized"] = false
	request("PUT", "/api/preferences", p, c1, 200)
	response := request("POST", "/api/clicks", map[string]string{"siteId": "jd"}, c1, 200)
	if response["recorded"] != false {
		t.Fatal("privacy toggle not enforced server-side")
	}
	var count int
	_ = db.QueryRow(ctx, "SELECT count(*) FROM user_site_stats WHERE site_id='jd'").Scan(&count)
	if count != 0 {
		t.Fatal("privacy-disabled click persisted")
	}
	request("DELETE", "/api/history", nil, c1, 200)
	var records int
	_ = db.QueryRow(ctx, "SELECT count(*) FROM user_site_stats WHERE user_id=(SELECT id FROM users WHERE email='first@test.example')").Scan(&records)
	if records != 0 {
		t.Fatal("history not cleared")
	}
	newC1 := auth("login", "first@test.example")
	saved := request("GET", "/api/preferences", nil, newC1, 200)
	if saved["pinned"].([]any)[0] != "taobao" {
		t.Fatal("preferences not persisted across sessions")
	}
	request("POST", "/api/admin/categories", map[string]any{"id": "test-category", "name": "测试分类", "icon": "Grid2X2", "sort": 9}, admin, 201)
	site := map[string]any{"name": "测试站点", "url": "https://example.com/integration", "categoryId": "test-category", "mark": "测", "color": "#5577ba", "status": "approved", "sort": 0, "description": "测试"}
	created := request("POST", "/api/admin/sites", site, admin, 201)
	id := created["id"].(string)
	request("DELETE", "/api/admin/categories/test-category", nil, admin, 409)
	site["status"] = "disabled"
	request("PUT", "/api/admin/sites/"+id, site, admin, 200)
	request("POST", "/api/clicks", map[string]string{"siteId": id}, c2, 404)
	request("DELETE", "/api/admin/sites/"+id, nil, admin, 200)
	request("DELETE", "/api/admin/categories/test-category", nil, admin, 200)
	submitted := request("POST", "/api/submissions", map[string]string{"name": "投稿网站", "url": "https://example.org/integration", "categoryId": "tools", "description": "好网站"}, c2, 201)
	sid := submitted["id"].(string)
	request("GET", "/api/submissions", nil, c2, 200)
	request("POST", "/api/admin/submissions/"+sid+"/review", map[string]string{"status": "approved", "note": "收录"}, admin, 200)
	request("POST", "/api/admin/submissions/"+sid+"/review", map[string]string{"status": "approved", "note": "重复"}, admin, 409)
	overview := request("GET", "/api/admin/overview", nil, admin, 200)
	if overview["sites"] != float64(81) || overview["pending"] != float64(0) {
		t.Fatal("review should atomically publish one site")
	}
	request("PUT", "/api/auth/password", map[string]string{"current": "integration-user-password", "next": "new-integration-password"}, c2, 200)
	me := request("GET", "/api/auth/me", nil, c2, 200)
	if me["user"] != nil {
		t.Fatal("password change should revoke old sessions")
	}
	userList := request("GET", "/api/admin/users", nil, admin, 200)
	var target string
	for _, item := range userList["users"].([]any) {
		u := item.(map[string]any)
		if u["email"] == "first@test.example" {
			target = u["id"].(string)
		}
	}
	request("PATCH", "/api/admin/users/"+target, map[string]bool{"disabled": true}, admin, 200)
	me = request("GET", "/api/auth/me", nil, newC1, 200)
	if me["user"] != nil {
		t.Fatal("disabled user retained a valid session")
	}
	request("POST", "/api/auth/logout", nil, admin, 200)
	request("GET", "/api/admin/overview", nil, admin, 401)
	// Verify that sessions contain digests, never the raw bearer token.
	var token string
	if err = db.QueryRow(ctx, "SELECT token_hash FROM sessions LIMIT 1").Scan(&token); err == nil && (len(token) != 64 || strings.Contains(token, c1.Value)) {
		t.Fatal("session token was not hashed")
	}
	fmt.Println("PostgreSQL integration: auth, CSRF, roles, privacy, recommendations, CRUD, moderation, session revocation passed")
}

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

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
	var mailboxMu sync.Mutex
	mailbox := map[string]string{}
	a.publicURL = "https://navigation.test"
	a.sendMail = func(_ context.Context, to, subject, body string) error {
		mailboxMu.Lock()
		defer mailboxMu.Unlock()
		parts := strings.Split(body, "#token=")
		if len(parts) != 2 {
			return fmt.Errorf("email template missing token link")
		}
		mailbox[to+subject] = strings.Fields(parts[1])[0]
		return nil
	}
	mailToken := func(email, purpose string) string {
		t.Helper()
		mailboxMu.Lock()
		defer mailboxMu.Unlock()
		subject := "好123 · 验证邮箱"
		if purpose == "reset" {
			subject = "好123 · 重置密码"
		}
		token := mailbox[email+subject]
		if len(token) != 48 {
			t.Fatal("mail did not contain a usable token")
		}
		return token
	}
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
	concurrentRequests := func(path string, payloads []any, cookie *http.Cookie, want []int) {
		t.Helper()
		type outcome struct {
			status int
			err    error
		}
		results := make(chan outcome, len(payloads))
		start := make(chan struct{})
		for _, payload := range payloads {
			raw, marshalErr := json.Marshal(payload)
			if marshalErr != nil {
				t.Fatal(marshalErr)
			}
			go func() {
				<-start
				method := "POST"
				if path == "/api/preferences" {
					method = "PUT"
				}
				req, reqErr := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
				if reqErr != nil {
					results <- outcome{err: reqErr}
					return
				}
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-Hao123-Request", "1")
				if cookie != nil {
					req.AddCookie(cookie)
				}
				res, callErr := http.DefaultClient.Do(req)
				if callErr != nil {
					results <- outcome{err: callErr}
					return
				}
				res.Body.Close()
				results <- outcome{status: res.StatusCode}
			}()
		}
		close(start)
		statuses := []int{}
		for range payloads {
			result := <-results
			if result.err != nil {
				t.Fatal(result.err)
			}
			statuses = append(statuses, result.status)
		}
		sort.Ints(statuses)
		if fmt.Sprint(statuses) != fmt.Sprint(want) {
			t.Fatalf("concurrent %s: got %v want %v", path, statuses, want)
		}
	}
	auth := func(path, email string) *http.Cookie {
		t.Helper()
		payload := map[string]string{"email": email, "password": "integration-user-password"}
		authPrefix := "/api/auth/"
		cookieName, cookiePath := "hao123_session", "/"
		if path == "register" {
			payload["name"] = "测试用户"
		}
		if path == "login" && email == "admin@test.example" {
			payload["password"] = "integration-admin-password"
			authPrefix = "/api/admin/auth/"
			cookieName, cookiePath = "hao123_admin_session", "/api/admin"
		}
		raw, _ := json.Marshal(payload)
		req, _ := http.NewRequest("POST", server.URL+authPrefix+path, bytes.NewReader(raw))
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
			if c.Name == cookieName {
				if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != cookiePath {
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
	verifyToken := mailToken("first@test.example", "verify")
	var digest string
	if err = db.QueryRow(ctx, "SELECT token_hash FROM email_tokens WHERE token_hash=$1", hashToken(verifyToken)).Scan(&digest); err != nil || digest == verifyToken {
		t.Fatal("email token must be stored as a digest")
	}
	if request("GET", "/api/auth/me", nil, c1, 200)["user"].(map[string]any)["verified"] != false {
		t.Fatal("new account should be unverified")
	}
	request("GET", "/api/auth/verify?token="+verifyToken, nil, nil, 200)
	request("GET", "/api/auth/verify?token="+verifyToken, nil, nil, 400)
	if request("GET", "/api/auth/me", nil, c1, 200)["user"].(map[string]any)["verified"] != true {
		t.Fatal("verification not reflected in session")
	}
	expiredVerify := mailToken("second@test.example", "verify")
	if _, err = db.Exec(ctx, "UPDATE email_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", hashToken(expiredVerify)); err != nil {
		t.Fatal(err)
	}
	request("GET", "/api/auth/verify?token="+expiredVerify, nil, nil, 400)
	request("GET", "/api/auth/verify?token="+strings.Repeat("0", 48), nil, nil, 400)
	request("POST", "/api/auth/resend-verification", nil, c2, 200)
	request("GET", "/api/auth/verify?token="+mailToken("second@test.example", "verify"), nil, nil, 200)
	admin := auth("login", "admin@test.example")
	request("POST", "/api/auth/register", map[string]string{"email": "first@test.example", "password": "integration-user-password", "name": "重复"}, nil, 409)
	request("POST", "/api/auth/register", map[string]string{"email": "extra@test.example", "password": "integration-user-password", "name": "提权", "role": "admin"}, nil, 400)
	request("GET", "/api/admin/users", nil, c1, 401)
	request("POST", "/api/auth/login", map[string]string{"email": "admin@test.example", "password": "integration-admin-password"}, nil, 401)
	request("POST", "/api/admin/auth/login", map[string]string{"email": "first@test.example", "password": "integration-user-password"}, nil, 401)
	if request("GET", "/api/auth/me", nil, admin, 200)["user"] != nil {
		t.Fatal("administrator session leaked into homepage")
	}
	if request("GET", "/api/admin/auth/me", nil, c1, 200)["user"] != nil {
		t.Fatal("user session leaked into admin")
	}
	legacyAdmin := *admin
	legacyAdmin.Name = "hao123_session"
	if request("GET", "/api/auth/me", nil, &legacyAdmin, 200)["user"] != nil {
		t.Fatal("legacy administrator cookie became a homepage user session")
	}
	renamedUser := *c1
	renamedUser.Name = "hao123_admin_session"
	request("GET", "/api/admin/overview", nil, &renamedUser, 401)
	request("POST", "/api/auth/logout", nil, admin, 200)
	request("GET", "/api/admin/overview", nil, admin, 200)
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
	request("GET", "/api/privacy/tags", nil, nil, 401)
	request("DELETE", "/api/privacy/tags/deepseek", nil, nil, 401)
	tags := request("GET", "/api/privacy/tags", nil, c1, 200)["tags"].([]any)
	if len(tags) != 1 || tags[0].(map[string]any)["category"] == "" || tags[0].(map[string]any)["clicks"] != float64(1) {
		t.Fatal("interest tags should describe category and hit count")
	}
	request("DELETE", "/api/privacy/tags/kimi", nil, c1, 200)
	if len(request("GET", "/api/privacy/tags", nil, c2, 200)["tags"].([]any)) != 2 {
		t.Fatal("tag deletion affected another user")
	}
	request("DELETE", "/api/privacy/tags/deepseek", nil, c1, 200)
	if len(request("GET", "/api/privacy/tags", nil, c1, 200)["tags"].([]any)) != 0 {
		t.Fatal("tag not deleted")
	}
	if len(request("GET", "/api/recommendations", nil, c1, 200)["common"].([]any)) != 0 {
		t.Fatal("deleted interest still influenced recent sites")
	}
	request("POST", "/api/clicks", map[string]string{"siteId": "deepseek"}, c1, 200)
	p := request("GET", "/api/preferences", nil, c1, 200)
	if p["version"] != float64(0) {
		t.Fatal("initial preference version should be zero")
	}
	missingVersion := map[string]any{}
	for k, v := range p {
		if k != "version" {
			missingVersion[k] = v
		}
	}
	request("PUT", "/api/preferences", missingVersion, c1, 400)
	p["pinned"] = []string{"taobao"}
	p["personalized"] = false
	savedPrefs := request("PUT", "/api/preferences", p, c1, 200)
	if savedPrefs["version"] != float64(1) {
		t.Fatal("successful save must increment version")
	}
	otherDevice := auth("login", "first@test.example")
	p["pinned"] = []string{"jd"}
	request("PUT", "/api/preferences", p, otherDevice, 409)
	latest := request("GET", "/api/preferences", nil, otherDevice, 200)
	if latest["pinned"].([]any)[0] != "taobao" || latest["version"] != float64(1) {
		t.Fatal("stale save overwrote cloud configuration")
	}
	for i := 2; i <= 4; i++ {
		latest = request("PUT", "/api/preferences", latest, otherDevice, 200)
		if latest["version"] != float64(i) {
			t.Fatal("single-device version did not increase monotonically")
		}
	}
	parallelPrefs := request("GET", "/api/preferences", nil, c2, 200)
	concurrentRequests("/api/preferences", []any{parallelPrefs, parallelPrefs}, c2, []int{200, 409})
	if request("GET", "/api/preferences", nil, c2, 200)["version"] != float64(1) {
		t.Fatal("simultaneous writes both advanced the version")
	}
	if request("GET", "/api/recommendations", nil, c1, 200)["method"] != "精选与匿名热门" {
		t.Fatal("disabled personalization must use fallback")
	}
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
	independentUser := auth("register", "independent@test.example")
	// Recovery responses must not disclose whether an address belongs to an account.
	unknown := request("POST", "/api/auth/forgot-password", map[string]string{"email": "unknown@test.example"}, nil, 200)
	known := request("POST", "/api/auth/forgot-password", map[string]string{"email": "independent@test.example"}, nil, 200)
	invalid := request("POST", "/api/auth/forgot-password", map[string]string{"email": "invalid"}, nil, 200)
	if unknown["message"] != known["message"] || invalid["message"] != known["message"] {
		t.Fatal("recovery leaked account existence")
	}
	request("POST", "/api/auth/forgot-password", map[string]string{"email": "admin@test.example"}, nil, 200)
	request("POST", "/api/auth/forgot-password", map[string]string{"email": "first@test.example"}, nil, 200)
	mailboxMu.Lock()
	adminReset, disabledReset := mailbox["admin@test.example好123 · 重置密码"], mailbox["first@test.example好123 · 重置密码"]
	mailboxMu.Unlock()
	if adminReset != "" || disabledReset != "" {
		t.Fatal("public recovery sent mail for an admin or disabled user")
	}
	resetToken := mailToken("independent@test.example", "reset")
	request("GET", "/api/auth/verify?token="+resetToken, nil, nil, 400)
	request("POST", "/api/auth/reset-password", map[string]string{"token": mailToken("independent@test.example", "verify"), "password": "recovered-password"}, nil, 400)
	request("POST", "/api/auth/reset-password", map[string]string{"token": strings.Repeat("0", 48), "password": "recovered-password"}, nil, 400)
	// A failed send must not invalidate the earlier reset link.
	sender := a.sendMail
	a.sendMail = func(context.Context, string, string, string) error { return fmt.Errorf("simulated SMTP failure") }
	request("POST", "/api/auth/forgot-password", map[string]string{"email": "independent@test.example"}, nil, 200)
	a.sendMail = sender
	secondSession := auth("login", "independent@test.example")
	resetPayload := map[string]string{"token": resetToken, "password": "recovered-password"}
	concurrentRequests("/api/auth/reset-password", []any{resetPayload, resetPayload}, nil, []int{200, 400})
	request("POST", "/api/auth/reset-password", map[string]string{"token": resetToken, "password": "recovered-password"}, nil, 400)
	var used bool
	if err = db.QueryRow(ctx, "SELECT used FROM email_tokens WHERE token_hash=$1", hashToken(resetToken)).Scan(&used); err != nil || !used {
		t.Fatal("reset token not consumed")
	}
	var sessions int
	if err = db.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE user_id=(SELECT id FROM users WHERE email='independent@test.example')").Scan(&sessions); err != nil || sessions != 0 {
		t.Fatal("reset must revoke every session")
	}
	for _, c := range []*http.Cookie{independentUser, secondSession} {
		if request("GET", "/api/auth/me", nil, c, 200)["user"] != nil {
			t.Fatal("reset left an old session authenticated")
		}
	}
	request("POST", "/api/auth/login", map[string]string{"email": "independent@test.example", "password": "integration-user-password"}, nil, 401)
	request("POST", "/api/auth/login", map[string]string{"email": "independent@test.example", "password": "recovered-password"}, nil, 200)
	// An old-password login racing a reset may succeed before revocation or fail
	// after the hash changes, but it must never leave a valid session afterward.
	request("POST", "/api/auth/forgot-password", map[string]string{"email": "independent@test.example"}, nil, 200)
	raceToken := mailToken("independent@test.example", "reset")
	type raceResult struct {
		path   string
		status int
		err    error
	}
	raceResults := make(chan raceResult, 2)
	raceStart := make(chan struct{})
	for path, payload := range map[string]map[string]string{
		"/api/auth/login":          {"email": "independent@test.example", "password": "recovered-password"},
		"/api/auth/reset-password": {"token": raceToken, "password": "twice-recovered-password"},
	} {
		go func() {
			<-raceStart
			raw, _ := json.Marshal(payload)
			req, reqErr := http.NewRequest("POST", server.URL+path, bytes.NewReader(raw))
			if reqErr != nil {
				raceResults <- raceResult{path: path, err: reqErr}
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Hao123-Request", "1")
			res, callErr := http.DefaultClient.Do(req)
			if callErr != nil {
				raceResults <- raceResult{path: path, err: callErr}
				return
			}
			res.Body.Close()
			raceResults <- raceResult{path: path, status: res.StatusCode}
		}()
	}
	close(raceStart)
	for i := 0; i < 2; i++ {
		result := <-raceResults
		if result.err != nil {
			t.Fatal(result.err)
		}
		if (result.path == "/api/auth/reset-password" && result.status != 200) || (result.path == "/api/auth/login" && result.status != 200 && result.status != 401) {
			t.Fatalf("reset/login race: %v", result)
		}
	}
	if err = db.QueryRow(ctx, "SELECT count(*) FROM sessions WHERE user_id=(SELECT id FROM users WHERE email='independent@test.example')").Scan(&sessions); err != nil || sessions != 0 {
		t.Fatal("concurrent old-password login escaped reset revocation")
	}
	request("POST", "/api/auth/forgot-password", map[string]string{"email": "second@test.example"}, nil, 200)
	expiredReset := mailToken("second@test.example", "reset")
	result, err := db.Exec(ctx, "UPDATE email_tokens SET expires_at=clock_timestamp()-interval '1 day' WHERE token_hash=$1", hashToken(expiredReset))
	if err != nil || result.RowsAffected() != 1 {
		t.Fatal(err)
	}
	var tokenValid bool
	if err = db.QueryRow(ctx, "SELECT expires_at>clock_timestamp() FROM email_tokens WHERE token_hash=$1", hashToken(expiredReset)).Scan(&tokenValid); err != nil || tokenValid {
		t.Fatal("expiry fixture invalid", err)
	}
	request("POST", "/api/auth/reset-password", map[string]string{"token": expiredReset, "password": "recovered-password"}, nil, 400)
	if err = a.initialize(ctx); err != nil {
		t.Fatal("repeated migration failed", err)
	}
	var migratedVersion int64
	if err = db.QueryRow(ctx, "SELECT prefs_version FROM users WHERE email='first@test.example'").Scan(&migratedVersion); err != nil || migratedVersion != 4 {
		t.Fatal("repeated migration changed preference version")
	}
	independentActive := auth("register", "active@test.example")
	// Expiration is checked after acquiring the user lock, not at transaction start.
	var activeID string
	if err = db.QueryRow(ctx, "SELECT id FROM users WHERE email='active@test.example'").Scan(&activeID); err != nil {
		t.Fatal(err)
	}
	queuedToken := randomID()
	if _, err = db.Exec(ctx, "INSERT INTO email_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'verify',clock_timestamp()+interval '1 second')", hashToken(queuedToken), activeID); err != nil {
		t.Fatal(err)
	}
	lockTx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer lockTx.Rollback(ctx)
	if err = lockTx.QueryRow(ctx, "SELECT id FROM users WHERE id=$1 FOR UPDATE", activeID).Scan(&activeID); err != nil {
		t.Fatal(err)
	}
	queued := make(chan error, 1)
	go func() {
		queued <- a.consumeEmailToken(httptest.NewRequest("GET", "/api/auth/verify", nil), queuedToken, "verify", "")
	}()
	waiting := false
	for i := 0; i < 100; i++ {
		var locked int
		if err = db.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM users WHERE id=$1%'").Scan(&locked); err != nil {
			t.Fatal(err)
		}
		if locked > 0 {
			waiting = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !waiting {
		t.Fatal("token consumption did not wait for the held user lock")
	}
	for i := 0; i < 200; i++ {
		if err = db.QueryRow(ctx, "SELECT expires_at>clock_timestamp() FROM email_tokens WHERE token_hash=$1", hashToken(queuedToken)).Scan(&tokenValid); err != nil {
			t.Fatal(err)
		}
		if !tokenValid {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if tokenValid {
		t.Fatal("queued token did not expire")
	}
	if err = lockTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	queuedErr := <-queued
	var expiredError apiError
	if !errors.As(queuedErr, &expiredError) || expiredError.code != 400 {
		t.Fatalf("token expiring during lock wait: %v", queuedErr)
	}
	request("POST", "/api/admin/auth/logout", nil, admin, 200)
	request("GET", "/api/admin/overview", nil, admin, 401)
	if request("GET", "/api/auth/me", nil, independentActive, 200)["user"] == nil {
		t.Fatal("admin logout invalidated a user session")
	}
	// Verify that sessions contain digests, never the raw bearer token.
	var token string
	if err = db.QueryRow(ctx, "SELECT token_hash FROM sessions LIMIT 1").Scan(&token); err == nil && (len(token) != 64 || strings.Contains(token, c1.Value)) {
		t.Fatal("session token was not hashed")
	}
	fmt.Println("PostgreSQL integration: auth, CSRF, roles, privacy tags, recommendations, CRUD, moderation, version conflicts, email verification, reset/replay/expiry, concurrent reset/login revocation passed")
}

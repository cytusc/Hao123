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
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestMetricsIntegration(t *testing.T) {
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
	schema := "test_metrics_" + randomID()
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
	t.Setenv("ADMIN_EMAIL", "metrics-admin@test.example")
	t.Setenv("ADMIN_PASSWORD", "metrics-admin-password")
	a := &App{db: db, origins: map[string]bool{}, limits: &limiter{entries: map[string]limitEntry{}}}
	if err = a.initialize(ctx); err != nil {
		t.Fatal(err)
	}
	if err = a.cleanupMetrics(ctx); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(a.mux())
	defer server.Close()
	call := func(method, path string, body any, cookie *http.Cookie, want int) (map[string]any, []*http.Cookie) {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Hao123-Request", "1")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var data map[string]any
		if err = json.NewDecoder(res.Body).Decode(&data); err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != want {
			t.Fatalf("%s %s wanted %d got %d: %v", method, path, want, res.StatusCode, data)
		}
		return data, res.Cookies()
	}
	call("GET", "/api/admin/metrics", nil, nil, 401)
	_, adminCookies := call("POST", "/api/admin/auth/login", map[string]string{"email": "metrics-admin@test.example", "password": "metrics-admin-password"}, nil, 200)
	admin := adminCookies[0]
	read := func() map[string]any {
		t.Helper()
		data, _ := call("GET", "/api/admin/metrics", nil, admin, 200)
		return data
	}
	empty := read()
	for _, rate := range empty["rates"].(map[string]any) {
		if rate != nil {
			t.Fatal("empty denominator must be null", empty)
		}
	}
	if empty["events_7d"].(map[string]any)["login"] != float64(0) {
		t.Fatal("administrator login entered user metrics")
	}
	var mailboxToken string
	a.publicURL = "https://navigation.test"
	a.sendMail = func(_ context.Context, _, _, body string) error {
		mailboxToken = strings.Fields(strings.Split(body, "#token=")[1])[0]
		return nil
	}
	registered, cookies := call("POST", "/api/auth/register", map[string]string{"email": "metric@test.example", "password": "metrics-user-password", "name": "用户"}, nil, 200)
	userID := registered["user"].(map[string]any)["id"].(string)
	user := cookies[0]
	call("GET", "/api/admin/metrics", nil, user, 401)
	verifyToken := mailboxToken
	call("GET", "/api/auth/verify?token="+verifyToken, nil, nil, 200)
	call("GET", "/api/auth/verify?token="+verifyToken, nil, nil, 400)
	call("POST", "/api/auth/login", map[string]string{"email": "metric@test.example", "password": "metrics-user-password"}, nil, 200)
	prefs, _ := call("GET", "/api/preferences", nil, user, 200)
	prefs["pinned"] = []string{"deepseek"}
	saved, _ := call("PUT", "/api/preferences", prefs, user, 200)
	call("PUT", "/api/preferences", prefs, user, 409)
	missingVersion := map[string]any{}
	for k, v := range prefs {
		if k != "version" {
			missingVersion[k] = v
		}
	}
	call("PUT", "/api/preferences", missingVersion, user, 400)
	call("POST", "/api/clicks", map[string]string{"siteId": "deepseek"}, user, 200)
	call("POST", "/api/clicks", map[string]string{"siteId": "doubao"}, user, 200)
	observed := read()
	north := observed["north_star"].(map[string]any)
	if north["wau_observed"] != float64(1) || north["wau_personalized_observed"] != float64(1) {
		t.Fatal("active user counted once per website", north)
	}
	if observed["rates"].(map[string]any)["conflict_rate"] != 0.5 {
		t.Fatal("conflict denominator should include success and conflict only", observed)
	}
	saved["personalized"] = false
	call("PUT", "/api/preferences", saved, user, 200)
	call("POST", "/api/clicks", map[string]string{"siteId": "kimi"}, user, 200)
	if read()["north_star"].(map[string]any)["wau_observed"] != float64(0) {
		t.Fatal("privacy opt-out remained in observed WAU")
	}
	call("DELETE", "/api/privacy/tags/deepseek", nil, user, 200)
	call("DELETE", "/api/history", nil, user, 200)
	known, _ := call("POST", "/api/auth/forgot-password", map[string]string{"email": "metric@test.example"}, nil, 200)
	resetToken := mailboxToken
	unknown, _ := call("POST", "/api/auth/forgot-password", map[string]string{"email": "missing@test.example"}, nil, 200)
	if known["message"] != unknown["message"] {
		t.Fatal("metrics changed recovery response")
	}
	a.sendMail = func(context.Context, string, string, string) error { return fmt.Errorf("SMTP fixture failure") }
	call("POST", "/api/auth/forgot-password", map[string]string{"email": "metric@test.example"}, nil, 200)
	call("POST", "/api/auth/reset-password", map[string]string{"token": resetToken, "password": "metrics-recovered-password"}, nil, 200)
	call("POST", "/api/auth/reset-password", map[string]string{"token": resetToken, "password": "metrics-recovered-password"}, nil, 400)
	data := read()
	counts := data["events_7d"].(map[string]any)
	for kind, want := range map[string]float64{"register": 1, "login": 1, "verify_email": 1, "reset_success": 1, "prefs_save": 2, "prefs_conflict": 1, "tag_delete": 1, "tag_clear": 1, "forgot_request": 3, "forgot_request_eligible": 2, "forgot_mail_accepted": 1} {
		if counts[kind] != want {
			t.Fatalf("%s = %v wanted %v", kind, counts[kind], want)
		}
	}
	if data["rates"].(map[string]any)["recovery_event_ratio"] != 0.5 || data["rates"].(map[string]any)["verified_rate"] != float64(1) {
		t.Fatal("recovery or verified population wrong", data)
	}
	encoded, _ := json.Marshal(data)
	for _, secret := range []string{"metric@test.example", userID, resetToken, "deepseek", "password"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatal("metrics response exposed identifier", secret)
		}
	}
	var forbidden int
	if err = db.QueryRow(ctx, "SELECT count(*) FROM events WHERE kind NOT IN ('register','login','verify_email','forgot_request','reset_success','prefs_save','prefs_conflict','tag_delete','tag_clear') OR (kind<>'forgot_request' AND payload<>'{}'::jsonb)").Scan(&forbidden); err != nil || forbidden != 0 {
		t.Fatal("unexpected payload or click event", err)
	}
	// Populate exclusions without emitting events: old activity, disabled accounts,
	// and an active account with no saved custom/pinned configuration.
	for _, fixture := range []struct {
		id       string
		disabled bool
		pinned   string
		age      string
	}{
		{"old-user", false, `["deepseek"]`, "8 days"},
		{"disabled-user", true, `["deepseek"]`, "1 day"},
		{"active-no-config", false, `[]`, "1 day"},
		{"null-list-user", false, `null`, "8 days"},
	} {
		if _, err = db.Exec(ctx, `INSERT INTO users(id,email,name,password_hash,disabled,preferences) VALUES($1,$1||'@test.example','fixture','unused',$2,jsonb_set('{"personalized":true,"custom":[],"pinned":[]}'::jsonb,'{pinned}',$3::jsonb))`, fixture.id, fixture.disabled, fixture.pinned); err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(ctx, "INSERT INTO user_site_stats(user_id,site_id,last_clicked) VALUES($1,'deepseek',now()-$2::interval)", fixture.id, fixture.age); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Exec(ctx, "UPDATE users SET preferences=jsonb_set(preferences,'{custom}','null'::jsonb) WHERE id='null-list-user'"); err != nil {
		t.Fatal(err)
	}
	north = read()["north_star"].(map[string]any)
	if north["wau_observed"] != float64(1) || north["wau_personalized_observed"] != float64(0) || north["personalized_config_users"] != float64(2) {
		t.Fatal("population or recent activity exclusions failed", north)
	}
	// Old and future events must not enter the rolling window.
	for _, offset := range []string{"-91 days", "1 day"} {
		if _, err = db.Exec(ctx, "INSERT INTO events(id,kind,user_id,created_at) VALUES($1,'prefs_save',$2,now()+$3::interval)", randomID(), userID, offset); err != nil {
			t.Fatal(err)
		}
	}
	if read()["events_7d"].(map[string]any)["prefs_save"] != float64(2) {
		t.Fatal("events outside rolling window counted")
	}
	if err = a.cleanupMetrics(ctx); err != nil {
		t.Fatal(err)
	}
	if err = a.cleanupMetrics(ctx); err != nil {
		t.Fatal(err)
	}
	var archived int64
	if err = db.QueryRow(ctx, "SELECT sum(count) FROM metric_daily_totals WHERE kind='prefs_save'").Scan(&archived); err != nil || archived != 1 {
		t.Fatal("retention repeated or lost archived event", archived, err)
	}
	if err = db.QueryRow(ctx, "SELECT count(*) FROM events WHERE created_at<now()-interval '90 days'").Scan(&forbidden); err != nil || forbidden != 0 {
		t.Fatal("old events not deleted", err)
	}
	if read()["quality"].(map[string]any)["cleanup_overdue"] != false {
		t.Fatal("successful cleanup remained overdue")
	}
	if _, err = db.Exec(ctx, "UPDATE app_meta SET value=(now()-interval '27 hours')::text WHERE key='metrics_cleanup_at'"); err != nil {
		t.Fatal(err)
	}
	if read()["quality"].(map[string]any)["cleanup_overdue"] != true {
		t.Fatal("missed cleanup was not detected")
	}
	// A failed archive must roll back deletion. Repair and retry archives once.
	if _, err = db.Exec(ctx, "INSERT INTO events(id,kind,user_id,created_at) VALUES($1,'login',$2,now()-interval '92 days')", randomID(), userID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, "ALTER TABLE metric_daily_totals RENAME TO metrics_archive_unavailable"); err != nil {
		t.Fatal(err)
	}
	if err = a.cleanupMetrics(ctx); err == nil {
		t.Fatal("archive failure unexpectedly succeeded")
	}
	if err = db.QueryRow(ctx, "SELECT count(*) FROM events WHERE kind='login' AND created_at<now()-interval '90 days'").Scan(&forbidden); err != nil || forbidden != 1 {
		t.Fatal("failed archival deleted source event", err)
	}
	if _, err = db.Exec(ctx, "ALTER TABLE metrics_archive_unavailable RENAME TO metric_daily_totals"); err != nil {
		t.Fatal(err)
	}
	if err = a.cleanupMetrics(ctx); err != nil {
		t.Fatal(err)
	}
	// Force only the event sink to fail; core auth and preferences must still work.
	if _, err = db.Exec(ctx, "ALTER TABLE events RENAME TO events_unavailable"); err != nil {
		t.Fatal(err)
	}
	_, recoveryCookies := call("POST", "/api/auth/login", map[string]string{"email": "metric@test.example", "password": "metrics-recovered-password"}, nil, 200)
	current, _ := call("GET", "/api/preferences", nil, recoveryCookies[0], 200)
	call("PUT", "/api/preferences", current, recoveryCookies[0], 200)
	if a.metrics.writeFailures.Load() != 2 {
		t.Fatal("best effort failures were not counted", a.metrics.writeFailures.Load())
	}
	if _, err = db.Exec(ctx, "ALTER TABLE events_unavailable RENAME TO events"); err != nil {
		t.Fatal(err)
	}
	// A blocked event sink cannot hold a successful save hostage.
	lockTx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer lockTx.Rollback(ctx)
	if _, err = lockTx.Exec(ctx, "LOCK TABLE events IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	current, _ = call("GET", "/api/preferences", nil, recoveryCookies[0], 200)
	start := time.Now()
	call("PUT", "/api/preferences", current, recoveryCookies[0], 200)
	if time.Since(start) > time.Second || a.metrics.writeFailures.Load() != 3 {
		t.Fatal("blocked telemetry delayed or failed a business save")
	}
	if err = lockTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	// Cancelled requests still finish a bounded event write; private inputs rejected.
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	a.recordEvent(cancelled, "tag_clear", userID, eventPayload{})
	a.recordEvent(ctx, "click", userID, eventPayload{})
	a.recordEvent(ctx, "login", userID, eventPayload{Delivery: "private-data"})
	if a.metrics.writeFailures.Load() != 5 {
		t.Fatal("payload guard did not reject unapproved data")
	}
	if _, err = db.Exec(ctx, "DELETE FROM users WHERE id=$1", userID); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(ctx, "SELECT count(*) FROM events WHERE user_id=$1", userID).Scan(&forbidden); err != nil || forbidden != 0 {
		t.Fatal("deleted account retained identifiable events", err)
	}
	if err = a.initialize(ctx); err != nil {
		t.Fatal("metrics migration was not idempotent", err)
	}
	// Scheduler shutdown must not wait for its 24-hour tick.
	jobCtx, stop := context.WithCancel(ctx)
	stop()
	done := make(chan struct{})
	go func() { a.runMetricsCleanup(jobCtx); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("retention scheduler ignored shutdown")
	}
}

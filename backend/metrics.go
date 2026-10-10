package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

type metricsState struct {
	writeFailures   atomic.Uint64
	cleanupFailures atomic.Uint64
	requestFailures atomic.Uint64
	syncFailures    atomic.Uint64
}

var eventKinds = []string{"register", "login", "verify_email", "forgot_request", "reset_success", "prefs_save", "prefs_conflict", "tag_delete", "tag_clear"}

// A typed payload prevents callers from accidentally collecting credentials,
// sites, preference contents, or network identifiers.
type eventPayload struct {
	Eligible bool   `json:"eligible,omitempty"`
	Delivery string `json:"delivery,omitempty"`
}

func (a *App) recordEvent(ctx context.Context, kind, userID string, payload eventPayload) {
	valid := false
	for _, k := range eventKinds {
		valid = valid || k == kind
	}
	if kind != "forgot_request" {
		valid = valid && payload == (eventPayload{})
	} else {
		switch payload.Delivery {
		case "invalid", "limited", "not_found", "failed", "accepted", "lookup_failed":
		default:
			valid = false
		}
	}
	if !valid {
		a.metrics.writeFailures.Add(1)
		log.Print("metrics event rejected: invalid kind or payload")
		return
	}
	// Business mutations have already committed. Allow a disconnected request to
	// finish this bounded write without spawning an unbounded goroutine per event.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 250*time.Millisecond)
	defer cancel()
	raw, _ := json.Marshal(payload)
	var user any
	if userID != "" {
		user = userID
	}
	if _, err := a.db.Exec(ctx, "INSERT INTO events(id,kind,user_id,payload) VALUES($1,$2,$3,$4)", randomID(), kind, user, raw); err != nil {
		a.metrics.writeFailures.Add(1)
		log.Printf("metrics event write failed (%T)", err)
	}
}

func metricRatio(numerator, denominator int64) *float64 {
	if denominator == 0 {
		return nil
	}
	ratio := float64(numerator) / float64(denominator)
	return &ratio
}

// Deletion and archival share a transaction so retries cannot lose or double
// count events. Only the deleted rows contribute to identifier-free totals.
func (a *App) cleanupMetrics(ctx context.Context) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked bool
	if err = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(91231002)").Scan(&locked); err != nil || !locked {
		return err
	}
	_, err = tx.Exec(ctx, `WITH removed AS (
	 DELETE FROM events WHERE created_at<clock_timestamp()-interval '90 days' RETURNING created_at,kind
	) INSERT INTO metric_daily_totals(day,kind,count)
	 SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date,kind,count(*) FROM removed GROUP BY 1,2
	 ON CONFLICT(day,kind) DO UPDATE SET count=metric_daily_totals.count+excluded.count`)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO app_meta(key,value) VALUES('metrics_cleanup_at',clock_timestamp()::text) ON CONFLICT(key) DO UPDATE SET value=excluded.value"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (a *App) runMetricsCleanup(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := a.cleanupMetrics(jobCtx)
		cancel()
		if err != nil && ctx.Err() == nil {
			a.metrics.cleanupFailures.Add(1)
			log.Printf("ALERT metrics retention cleanup failed (%T)", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (a *App) adminMetrics(w http.ResponseWriter, r *http.Request, _ *User) error {
	tx, err := a.db.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var at time.Time
	if err = tx.QueryRow(r.Context(), "SELECT clock_timestamp()").Scan(&at); err != nil {
		return err
	}
	start := at.Add(-7 * 24 * time.Hour)
	var users, verified, configured, active, personalized int64
	err = tx.QueryRow(r.Context(), `WITH population AS (
	 SELECT verified,
	 (CASE WHEN jsonb_typeof(preferences->'custom')='array' THEN jsonb_array_length(preferences->'custom')>0 ELSE false END
	 OR CASE WHEN jsonb_typeof(preferences->'pinned')='array' THEN jsonb_array_length(preferences->'pinned')>0 ELSE false END) AS configured,
	 (preferences->>'personalized')::boolean AS enabled,
	 EXISTS(SELECT 1 FROM user_site_stats st WHERE st.user_id=u.id AND st.last_clicked >= $1 AND st.last_clicked <= $2) AS active
	 FROM users u WHERE role='user' AND NOT disabled
	) SELECT count(*),count(*) FILTER(WHERE verified),count(*) FILTER(WHERE configured),
	 count(*) FILTER(WHERE enabled AND active),count(*) FILTER(WHERE enabled AND active AND configured) FROM population`, start, at).Scan(&users, &verified, &configured, &active, &personalized)
	if err != nil {
		return err
	}
	counts := map[string]int64{}
	for _, kind := range eventKinds {
		counts[kind] = 0
	}
	rows, err := tx.Query(r.Context(), "SELECT kind,count(*) FROM events WHERE created_at >= $1 AND created_at <= $2 GROUP BY kind", start, at)
	if err != nil {
		return err
	}
	for rows.Next() {
		var kind string
		var count int64
		if err = rows.Scan(&kind, &count); err != nil {
			rows.Close()
			return err
		}
		counts[kind] = count
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	var eligible, accepted int64
	if err = tx.QueryRow(r.Context(), `SELECT count(*) FILTER(WHERE payload->>'eligible'='true'),count(*) FILTER(WHERE payload->>'delivery'='accepted') FROM events WHERE kind='forgot_request' AND created_at >= $1 AND created_at <= $2`, start, at).Scan(&eligible, &accepted); err != nil {
		return err
	}
	counts["forgot_request_eligible"], counts["forgot_mail_accepted"] = eligible, accepted
	var started time.Time
	var cleanup *time.Time
	if err = tx.QueryRow(r.Context(), `SELECT (SELECT value::timestamptz FROM app_meta WHERE key='metrics_started_at'),(SELECT value::timestamptz FROM app_meta WHERE key='metrics_cleanup_at')`).Scan(&started, &cleanup); err != nil {
		return err
	}
	type dailyCount struct {
		Day    string           `json:"day"`
		Events map[string]int64 `json:"events"`
	}
	daily := []dailyCount{}
	rows, err = tx.Query(r.Context(), `SELECT to_char(day,'YYYY-MM-DD'),kind,sum(n)::bigint FROM (
	 SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date AS day,kind,count(*) AS n FROM events
	 WHERE created_at <= $1 AND created_at >= (($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date-13) AT TIME ZONE 'Asia/Shanghai' GROUP BY 1,2
	 UNION ALL SELECT day,kind,count FROM metric_daily_totals WHERE day BETWEEN ($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date-13 AND ($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
	) daily GROUP BY day,kind ORDER BY day DESC,kind`, at)
	if err != nil {
		return err
	}
	for rows.Next() {
		var day, kind string
		var n int64
		if err = rows.Scan(&day, &kind, &n); err != nil {
			rows.Close()
			return err
		}
		if len(daily) == 0 || daily[len(daily)-1].Day != day {
			daily = append(daily, dailyCount{day, map[string]int64{}})
		}
		daily[len(daily)-1].Events[kind] = n
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	cleanupOverdue := cleanup == nil || at.Sub(*cleanup) > 26*time.Hour
	respond(w, 200, map[string]any{
		"window":     map[string]any{"as_of": at, "start": start, "end": at, "timezone": "Asia/Shanghai", "kind": "rolling_7_days"},
		"north_star": map[string]int64{"wau_observed": active, "wau_personalized_observed": personalized, "personalized_config_users": configured},
		"events_7d":  counts,
		"rates":      map[string]any{"conflict_rate": metricRatio(counts["prefs_conflict"], counts["prefs_save"]+counts["prefs_conflict"]), "recovery_event_ratio": metricRatio(counts["reset_success"], eligible), "verified_rate": metricRatio(verified, users)},
		"totals":     map[string]int64{"users": users, "verified_users": verified},
		"daily":      daily,
		"quality": map[string]any{
			"definition_version": "1", "collection_started_at": started, "best_effort": true, "retention_days": 90,
			"write_failures_process": a.metrics.writeFailures.Load(), "cleanup_failures_process": a.metrics.cleanupFailures.Load(),
			"request_failures_process": a.metrics.requestFailures.Load(), "sync_failures_process": a.metrics.syncFailures.Load(),
			"last_cleanup_at": cleanup, "cleanup_overdue": cleanupOverdue, "counters_scope": "current_process_since_restart",
			"activity_scope": "启用个性化的普通账号近期公共网站点击；游客、私人网址及已删除记录不计入，配置按当前状态判断；不代表全站 WAU 或次周留存。",
		},
	})
	return nil
}

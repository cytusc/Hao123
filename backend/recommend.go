package main

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const minute = time.Minute

type Preferences struct {
	Pinned       []string `json:"pinned"`
	Hidden       []string `json:"hidden"`
	Custom       []Site   `json:"custom"`
	Personalized bool     `json:"personalized"`
	LargeText    bool     `json:"largeText"`
	ShowSearch   bool     `json:"showSearch"`
	Engine       string   `json:"engine"`
	Version      int64    `json:"version"`
}

func (a *App) prefs(r *http.Request, id string) (Preferences, error) {
	var raw []byte
	var p Preferences
	var version int64
	err := a.db.QueryRow(r.Context(), "SELECT preferences,prefs_version FROM users WHERE id=$1", id).Scan(&raw, &version)
	if err != nil {
		return p, err
	}
	err = json.Unmarshal(raw, &p)
	p.Version = version
	if p.Pinned == nil {
		p.Pinned = []string{}
	}
	if p.Hidden == nil {
		p.Hidden = []string{}
	}
	if p.Custom == nil {
		p.Custom = []Site{}
	}
	return p, err
}
func (a *App) getPrefs(w http.ResponseWriter, r *http.Request, u *User) error {
	p, err := a.prefs(r, u.ID)
	if err != nil {
		return err
	}
	respond(w, 200, p)
	return nil
}
func validPreferences(p Preferences) error {
	if len(p.Pinned) > 9 || len(p.Hidden) > 200 || len(p.Custom) > 100 {
		return fail(400, "常用或自定义网站数量超过上限")
	}
	if p.Engine != "baidu" && p.Engine != "bing" && p.Engine != "google" {
		return fail(400, "搜索引擎不正确")
	}
	seen := map[string]bool{}
	for _, id := range p.Pinned {
		if !idPattern.MatchString(id) || seen[id] {
			return fail(400, "置顶网站标识不正确或重复")
		}
		seen[id] = true
	}
	for _, id := range p.Hidden {
		if !idPattern.MatchString(id) {
			return fail(400, "隐藏网站标识不正确")
		}
	}
	seen = map[string]bool{}
	for _, s := range p.Custom {
		if !strings.HasPrefix(s.ID, "custom-") || !idPattern.MatchString(s.ID) || seen[s.ID] {
			return fail(400, "自定义网站标识不正确或重复")
		}
		seen[s.ID] = true
		if len(s.Name) < 1 || len(s.Name) > 160 || !colorPattern.MatchString(s.Color) || len(s.Mark) < 1 || len(s.Mark) > 16 {
			return fail(400, "自定义网站内容不正确")
		}
		if _, err := validateURL(s.URL); err != nil {
			return err
		}
	}
	return nil
}
func (a *App) savePrefs(w http.ResponseWriter, r *http.Request, u *User) error {
	var input struct {
		Preferences
		Version *int64 `json:"version"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if input.Version == nil || *input.Version < 0 {
		return fail(400, "请携带有效的配置版本，刷新后重试")
	}
	p := input.Preferences
	if err := validPreferences(p); err != nil {
		return err
	}
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	err = a.db.QueryRow(r.Context(), "UPDATE users SET preferences=$1::jsonb-'version',prefs_version=prefs_version+1 WHERE id=$2 AND prefs_version=$3 RETURNING prefs_version", data, u.ID, *input.Version).Scan(&p.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		a.recordEvent(r.Context(), "prefs_conflict", u.ID, eventPayload{})
		return fail(409, "云端配置已被其他设备更新，请选择如何处理")
	}
	if err != nil {
		return err
	}
	a.recordEvent(r.Context(), "prefs_save", u.ID, eventPayload{})
	respond(w, 200, p)
	return nil
}

func (a *App) getProfileTags(w http.ResponseWriter, r *http.Request, u *User) error {
	// Categories explain the inferred interest; each site remains individually deletable.
	rows, err := a.db.Query(r.Context(), `SELECT s.id,s.name,c.id,c.name,st.clicks FROM user_site_stats st JOIN sites s ON s.id=st.site_id JOIN categories c ON c.id=s.category_id WHERE st.user_id=$1 ORDER BY c.sort,st.clicks DESC,s.id`, u.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type tag struct {
		SiteID     string `json:"siteId"`
		Name       string `json:"name"`
		CategoryID string `json:"categoryId"`
		Category   string `json:"category"`
		Clicks     int64  `json:"clicks"`
	}
	tags := []tag{}
	for rows.Next() {
		var t tag
		if err = rows.Scan(&t.SiteID, &t.Name, &t.CategoryID, &t.Category, &t.Clicks); err != nil {
			return err
		}
		tags = append(tags, t)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	respond(w, 200, map[string]any{"tags": tags})
	return nil
}

func (a *App) deleteProfileTag(w http.ResponseWriter, r *http.Request, u *User) error {
	if _, err := a.db.Exec(r.Context(), "DELETE FROM user_site_stats WHERE user_id=$1 AND site_id=$2", u.ID, r.PathValue("siteId")); err != nil {
		return err
	}
	a.recordEvent(r.Context(), "tag_delete", u.ID, eventPayload{})
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}
func (a *App) clearHistory(w http.ResponseWriter, r *http.Request, u *User) error {
	if _, err := a.db.Exec(r.Context(), "DELETE FROM user_site_stats WHERE user_id=$1", u.ID); err != nil {
		return err
	}
	a.recordEvent(r.Context(), "tag_clear", u.ID, eventPayload{})
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}
func (a *App) click(w http.ResponseWriter, r *http.Request, u *User) error {
	if !a.limits.allow("click:"+u.ID, 120, minute) {
		return fail(429, "点击过于频繁，请稍后再试")
	}
	var body struct {
		SiteID string `json:"siteId"`
	}
	if err := decode(w, r, &body); err != nil {
		return err
	}
	// Lock the preference row so disabling recording and recording a click have a strict order.
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var enabled bool
	if err = tx.QueryRow(r.Context(), "SELECT (preferences->>'personalized')::boolean FROM users WHERE id=$1 FOR UPDATE", u.ID).Scan(&enabled); err != nil {
		return err
	}
	if !enabled {
		respond(w, 200, map[string]bool{"recorded": false})
		return nil
	}
	result, err := tx.Exec(r.Context(), `INSERT INTO user_site_stats(user_id,site_id) SELECT $1,id FROM sites WHERE id=$2 AND status='approved' ON CONFLICT(user_id,site_id) DO UPDATE SET clicks=user_site_stats.clicks+1,score=user_site_stats.score*power(0.5,EXTRACT(EPOCH FROM(now()-user_site_stats.last_clicked))/604800.0)+1,last_clicked=now()`, u.ID, body.SiteID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "网站不存在或已下架")
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	respond(w, 200, map[string]bool{"recorded": true})
	return nil
}
func decayed(score float64, age time.Duration) float64 {
	return score * math.Pow(.5, age.Hours()/(7*24))
}

type signals struct {
	personal map[string]float64
	category map[string]float64
	co       map[string]float64
	popular  map[string]float64
}

func rankSites(sites []Site, sig signals, hidden map[string]bool, discover bool) []Site {
	out := []Site{}
	for _, s := range sites {
		if hidden[s.ID] {
			continue
		}
		recent := sig.personal[s.ID]
		if discover && recent > 0 {
			continue
		}
		score := .15/(1+float64(s.Sort)) + .3*math.Log1p(sig.popular[s.ID])
		reason := "精选网站"
		if sig.popular[s.ID] > 0 {
			reason = "大家常用"
		}
		if recent > 0 {
			score += recent * 4
			reason = "你最近常用"
		} else if sig.co[s.ID] > 0 {
			score += 2 * math.Log1p(sig.co[s.ID])
			reason = "访问相似网站的人也常用"
		} else if sig.category[s.CategoryID] > 0 {
			score += .4 * math.Log1p(sig.category[s.CategoryID])
			reason = "你常用的分类"
		}
		s.Score = score
		s.Reason = reason
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}
func (a *App) recommendations(w http.ResponseWriter, r *http.Request, u *User) error {
	sites, err := a.loadSites(r, false)
	if err != nil {
		return err
	}
	sig := signals{map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{}}
	hidden := map[string]bool{}
	method := "精选与匿名热门"
	rows, err := a.db.Query(r.Context(), `SELECT st.site_id,sum(st.score*power(0.5,EXTRACT(EPOCH FROM(now()-st.last_clicked))/604800.0)) FROM user_site_stats st JOIN users u ON u.id=st.user_id WHERE NOT u.disabled AND (u.preferences->>'personalized')::boolean GROUP BY st.site_id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		var score float64
		if err = rows.Scan(&id, &score); err != nil {
			rows.Close()
			return err
		}
		sig.popular[id] = score
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if u != nil {
		p, err := a.prefs(r, u.ID)
		if err != nil {
			return err
		}
		for _, id := range p.Hidden {
			hidden[id] = true
		}
		for _, id := range p.Pinned {
			hidden[id] = true
		}
		if p.Personalized {
			method = "近期常用 + 分类偏好 + 相似访问"
			rows, err = a.db.Query(r.Context(), `SELECT st.site_id,s.category_id,st.score,st.last_clicked FROM user_site_stats st JOIN sites s ON s.id=st.site_id WHERE st.user_id=$1 AND s.status='approved'`, u.ID)
			if err != nil {
				return err
			}
			for rows.Next() {
				var id, cat string
				var score float64
				var last time.Time
				if err = rows.Scan(&id, &cat, &score, &last); err != nil {
					rows.Close()
					return err
				}
				v := decayed(score, time.Since(last))
				sig.personal[id] = v
				sig.category[cat] += v
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return err
			}
			// User-to-item co-visits: active users sharing recent sites contribute unseen candidates.
			rows, err = a.db.Query(r.Context(), `WITH peers AS (SELECT peer.user_id,count(*)::float AS overlap FROM user_site_stats mine JOIN user_site_stats peer ON peer.site_id=mine.site_id JOIN users u ON u.id=peer.user_id WHERE mine.user_id=$1 AND peer.user_id<>$1 AND mine.last_clicked>now()-interval '30 days' AND peer.last_clicked>now()-interval '30 days' AND NOT u.disabled AND (u.preferences->>'personalized')::boolean GROUP BY peer.user_id ORDER BY overlap DESC LIMIT 100) SELECT st.site_id,sum(peers.overlap*st.score*power(0.5,EXTRACT(EPOCH FROM(now()-st.last_clicked))/604800.0)) FROM peers JOIN user_site_stats st ON st.user_id=peers.user_id GROUP BY st.site_id`, u.ID)
			if err != nil {
				return err
			}
			for rows.Next() {
				var id string
				var score float64
				if err = rows.Scan(&id, &score); err != nil {
					rows.Close()
					return err
				}
				sig.co[id] = score
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return err
			}
		}
	}
	common := rankSites(sites, sig, hidden, false)
	discovery := rankSites(sites, sig, hidden, true)
	// Common only contains actual visits; the frontend fills remaining slots from defaults.
	learned := []Site{}
	for _, s := range common {
		if sig.personal[s.ID] > 0 {
			learned = append(learned, s)
		}
	}
	if len(learned) > 9 {
		learned = learned[:9]
	}
	if len(discovery) > 6 {
		discovery = discovery[:6]
	}
	respond(w, 200, map[string]any{"common": learned, "sites": discovery, "method": method})
	return nil
}

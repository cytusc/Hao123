package main

import (
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

func (a *App) overview(w http.ResponseWriter, r *http.Request, _ *User) error {
	result := map[string]any{}
	var sites, cats, users, pending, clicks int64
	if err := a.db.QueryRow(r.Context(), `SELECT (SELECT count(*) FROM sites WHERE status='approved'),(SELECT count(*) FROM categories),(SELECT count(*) FROM users),(SELECT count(*) FROM submissions WHERE status='pending'),(SELECT COALESCE(sum(clicks),0) FROM user_site_stats)`).Scan(&sites, &cats, &users, &pending, &clicks); err != nil {
		return err
	}
	result["sites"] = sites
	result["categories"] = cats
	result["users"] = users
	result["pending"] = pending
	result["clicks"] = clicks
	rows, err := a.db.Query(r.Context(), `SELECT s.name,sum(st.clicks) FROM user_site_stats st JOIN sites s ON s.id=st.site_id JOIN users u ON u.id=st.user_id WHERE NOT u.disabled AND (u.preferences->>'personalized')::boolean GROUP BY s.id ORDER BY sum(st.clicks) DESC LIMIT 8`)
	if err != nil {
		return err
	}
	defer rows.Close()
	top := []map[string]any{}
	for rows.Next() {
		var name string
		var n int64
		if err = rows.Scan(&name, &n); err != nil {
			return err
		}
		top = append(top, map[string]any{"name": name, "clicks": n})
	}
	if err = rows.Err(); err != nil {
		return err
	}
	result["topSites"] = top
	respond(w, 200, result)
	return nil
}
func (a *App) users(w http.ResponseWriter, r *http.Request, _ *User) error {
	rows, err := a.db.Query(r.Context(), "SELECT id,email,name,role,disabled,created_at FROM users ORDER BY created_at DESC LIMIT 500")
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []User{}
	for rows.Next() {
		var u User
		if err = rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Disabled, &u.Created); err != nil {
			return err
		}
		out = append(out, u)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	respond(w, 200, map[string]any{"users": out})
	return nil
}
func (a *App) updateUser(w http.ResponseWriter, r *http.Request, u *User) error {
	var input struct {
		Disabled bool `json:"disabled"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	id := r.PathValue("id")
	if id == u.ID {
		return fail(400, "不能停用自己的管理员账号")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var role string
	err = tx.QueryRow(r.Context(), "SELECT role FROM users WHERE id=$1 FOR UPDATE", id).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(404, "用户不存在")
	}
	if err != nil {
		return err
	}
	if role == "admin" {
		return fail(400, "管理员账号不能在此停用")
	}
	if _, err = tx.Exec(r.Context(), "UPDATE users SET disabled=$1 WHERE id=$2", input.Disabled, id); err != nil {
		return err
	}
	if input.Disabled {
		if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE user_id=$1", id); err != nil {
			return err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

type Submission struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	UserName    string    `json:"userName"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	CategoryID  string    `json:"categoryId"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	Note        string    `json:"note"`
	Created     time.Time `json:"createdAt"`
}

func (a *App) listSubmissions(w http.ResponseWriter, r *http.Request, userID string) error {
	rows, err := a.db.Query(r.Context(), `SELECT s.id,s.user_id,u.name,s.name,s.url,s.category_id,s.description,s.status,s.note,s.created_at FROM submissions s JOIN users u ON u.id=s.user_id WHERE ($1='' OR s.user_id=$1) ORDER BY s.created_at DESC LIMIT 500`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Submission{}
	for rows.Next() {
		var s Submission
		if err = rows.Scan(&s.ID, &s.UserID, &s.UserName, &s.Name, &s.URL, &s.CategoryID, &s.Description, &s.Status, &s.Note, &s.Created); err != nil {
			return err
		}
		out = append(out, s)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	respond(w, 200, map[string]any{"submissions": out})
	return nil
}
func (a *App) mySubmissions(w http.ResponseWriter, r *http.Request, u *User) error {
	return a.listSubmissions(w, r, u.ID)
}
func (a *App) adminSubmissions(w http.ResponseWriter, r *http.Request, _ *User) error {
	return a.listSubmissions(w, r, "")
}
func (a *App) submit(w http.ResponseWriter, r *http.Request, u *User) error {
	if !a.limits.allow("submit:"+u.ID, 10, 15*minute) {
		return fail(429, "投稿过于频繁，请稍后再试")
	}
	var s Submission
	if err := decode(w, r, &s); err != nil {
		return err
	}
	site := Site{Name: s.Name, URL: s.URL, CategoryID: s.CategoryID, Mark: "站", Color: "#5577ba", Description: s.Description, Status: "approved"}
	if _, err := validateSite(&site); err != nil {
		return err
	}
	var exists bool
	if err := a.db.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM sites WHERE url=$1) OR EXISTS(SELECT 1 FROM submissions WHERE url=$1 AND status='pending')", s.URL).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return fail(409, "该网址已收录或正在审核")
	}
	s.ID = randomID()
	s.Status = "pending"
	if _, err := a.db.Exec(r.Context(), `INSERT INTO submissions(id,user_id,name,url,category_id,description) VALUES($1,$2,$3,$4,$5,$6)`, s.ID, u.ID, site.Name, s.URL, s.CategoryID, s.Description); err != nil {
		return err
	}
	respond(w, 201, s)
	return nil
}
func (a *App) review(w http.ResponseWriter, r *http.Request, u *User) error {
	var input struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if (input.Status != "approved" && input.Status != "rejected") || len(input.Note) > 2000 {
		return fail(400, "审核状态或说明不正确")
	}
	if input.Status == "rejected" && input.Note == "" {
		return fail(400, "请填写拒绝原因")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var s Submission
	err = tx.QueryRow(r.Context(), "SELECT name,url,category_id,description,status FROM submissions WHERE id=$1 FOR UPDATE", r.PathValue("id")).Scan(&s.Name, &s.URL, &s.CategoryID, &s.Description, &s.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(404, "投稿不存在")
	}
	if err != nil {
		return err
	}
	if s.Status != "pending" {
		return fail(409, "此投稿已审核")
	}
	if input.Status == "approved" {
		domain, err := validateURL(s.URL)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO sites(id,name,url,domain,category_id,mark,color,description) VALUES($1,$2,$3,$4,$5,$6,'#5577ba',$7)`, randomID(), s.Name, s.URL, domain, s.CategoryID, string([]rune(s.Name)[:1]), s.Description); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(r.Context(), "UPDATE submissions SET status=$1,note=$2,reviewer_id=$3,reviewed_at=now() WHERE id=$4", input.Status, input.Note, u.ID, r.PathValue("id")); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

package main

import (
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

type Site struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	URL         string  `json:"url"`
	CategoryID  string  `json:"categoryId"`
	Category    string  `json:"category,omitempty"`
	Mark        string  `json:"mark"`
	Color       string  `json:"color"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Sort        int     `json:"sort"`
	Reason      string  `json:"reason,omitempty"`
	Score       float64 `json:"score,omitempty"`
}
type Category struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Sort  int    `json:"sort"`
	Sites []Site `json:"sites"`
}

func validateURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil || len(raw) > 2048 {
		return "", fail(400, "请输入有效的 http 或 https 网站地址")
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".local") || !strings.Contains(host, ".") {
		return "", fail(400, "请使用公开网站地址")
	}
	if ip := net.ParseIP(host); ip != nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast()) {
		return "", fail(400, "请使用公开网站地址")
	}
	return host, nil
}

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
var idPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func validateSite(s *Site) (string, error) {
	s.Name = strings.TrimSpace(s.Name)
	if utf8.RuneCountInString(s.Name) < 1 || utf8.RuneCountInString(s.Name) > 40 {
		return "", fail(400, "网站名称须为 1–40 个字符")
	}
	if !idPattern.MatchString(s.CategoryID) {
		return "", fail(400, "请选择有效分类")
	}
	if !colorPattern.MatchString(s.Color) {
		return "", fail(400, "颜色须为六位十六进制格式")
	}
	if utf8.RuneCountInString(s.Mark) < 1 || utf8.RuneCountInString(s.Mark) > 4 {
		return "", fail(400, "网站标记须为 1–4 个字符")
	}
	if len(s.Description) > 2000 {
		return "", fail(400, "简介不能超过 2000 字节")
	}
	if s.Status != "approved" && s.Status != "disabled" {
		return "", fail(400, "网站状态不正确")
	}
	if s.Sort < 0 || s.Sort > 10000 {
		return "", fail(400, "排序须为 0–10000")
	}
	return validateURL(s.URL)
}
func (a *App) loadSites(r *http.Request, all bool) ([]Site, error) {
	rows, err := a.db.Query(r.Context(), `SELECT s.id,s.name,s.url,s.category_id,c.name,s.mark,s.color,s.description,s.status,s.sort FROM sites s JOIN categories c ON c.id=s.category_id WHERE ($1 OR s.status='approved') ORDER BY c.sort,c.id,s.sort,s.id`, all)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Site{}
	for rows.Next() {
		var s Site
		if err = rows.Scan(&s.ID, &s.Name, &s.URL, &s.CategoryID, &s.Category, &s.Mark, &s.Color, &s.Description, &s.Status, &s.Sort); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
func (a *App) catalog(w http.ResponseWriter, r *http.Request, _ *User) error {
	rows, err := a.db.Query(r.Context(), "SELECT id,name,icon,sort FROM categories ORDER BY sort,id")
	if err != nil {
		return err
	}
	cs := []Category{}
	for rows.Next() {
		var c Category
		c.Sites = []Site{}
		if err = rows.Scan(&c.ID, &c.Name, &c.Icon, &c.Sort); err != nil {
			rows.Close()
			return err
		}
		cs = append(cs, c)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	ss, err := a.loadSites(r, false)
	if err != nil {
		return err
	}
	for i := range cs {
		for _, s := range ss {
			if s.CategoryID == cs[i].ID {
				cs[i].Sites = append(cs[i].Sites, s)
			}
		}
	}
	respond(w, 200, map[string]any{"categories": cs})
	return nil
}
func (a *App) adminSites(w http.ResponseWriter, r *http.Request, _ *User) error {
	ss, err := a.loadSites(r, true)
	if err != nil {
		return err
	}
	respond(w, 200, map[string]any{"sites": ss})
	return nil
}
func (a *App) createSite(w http.ResponseWriter, r *http.Request, _ *User) error {
	var s Site
	if err := decode(w, r, &s); err != nil {
		return err
	}
	domain, err := validateSite(&s)
	if err != nil {
		return err
	}
	s.ID = randomID()
	if _, err = a.db.Exec(r.Context(), `INSERT INTO sites(id,name,url,domain,category_id,mark,color,description,status,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, s.ID, s.Name, s.URL, domain, s.CategoryID, s.Mark, s.Color, s.Description, s.Status, s.Sort); err != nil {
		return err
	}
	respond(w, 201, s)
	return nil
}
func (a *App) updateSite(w http.ResponseWriter, r *http.Request, _ *User) error {
	var s Site
	if err := decode(w, r, &s); err != nil {
		return err
	}
	domain, err := validateSite(&s)
	if err != nil {
		return err
	}
	result, err := a.db.Exec(r.Context(), `UPDATE sites SET name=$1,url=$2,domain=$3,category_id=$4,mark=$5,color=$6,description=$7,status=$8,sort=$9 WHERE id=$10`, s.Name, s.URL, domain, s.CategoryID, s.Mark, s.Color, s.Description, s.Status, s.Sort, r.PathValue("id"))
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "网站不存在")
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}
func (a *App) deleteSite(w http.ResponseWriter, r *http.Request, _ *User) error {
	result, err := a.db.Exec(r.Context(), "DELETE FROM sites WHERE id=$1", r.PathValue("id"))
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "网站不存在")
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

var validIcons = map[string]bool{"Grid2X2": true, "Newspaper": true, "Clapperboard": true, "ShoppingBag": true, "MessagesSquare": true, "Mail": true, "Sparkles": true, "GraduationCap": true, "Wrench": true}

func validateCategory(c Category) error {
	if !idPattern.MatchString(c.ID) || utf8.RuneCountInString(c.Name) < 1 || utf8.RuneCountInString(c.Name) > 24 || !validIcons[c.Icon] || c.Sort < 0 || c.Sort > 10000 {
		return fail(400, "请检查分类标识、名称、图标及排序")
	}
	return nil
}
func (a *App) createCategory(w http.ResponseWriter, r *http.Request, _ *User) error {
	var c Category
	if err := decode(w, r, &c); err != nil {
		return err
	}
	if err := validateCategory(c); err != nil {
		return err
	}
	if _, err := a.db.Exec(r.Context(), "INSERT INTO categories(id,name,icon,sort) VALUES($1,$2,$3,$4)", c.ID, c.Name, c.Icon, c.Sort); err != nil {
		return err
	}
	respond(w, 201, c)
	return nil
}
func (a *App) updateCategory(w http.ResponseWriter, r *http.Request, _ *User) error {
	var c Category
	if err := decode(w, r, &c); err != nil {
		return err
	}
	c.ID = r.PathValue("id")
	if err := validateCategory(c); err != nil {
		return err
	}
	result, err := a.db.Exec(r.Context(), "UPDATE categories SET name=$1,icon=$2,sort=$3 WHERE id=$4", c.Name, c.Icon, c.Sort, c.ID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "分类不存在")
	}
	respond(w, 200, c)
	return nil
}
func (a *App) deleteCategory(w http.ResponseWriter, r *http.Request, _ *User) error {
	result, err := a.db.Exec(r.Context(), "DELETE FROM categories WHERE id=$1", r.PathValue("id"))
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "分类不存在")
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

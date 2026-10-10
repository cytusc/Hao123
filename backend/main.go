package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed schema.sql seed.json
var files embed.FS

type App struct {
	db        *pgxpool.Pool
	secure    bool
	origins   map[string]bool
	limits    *limiter
	dist      string
	sendMail  func(context.Context, string, string, string) error
	publicURL string
}
type User struct {
	ID       string    `json:"id"`
	Email    string    `json:"email"`
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	Disabled bool      `json:"disabled"`
	Verified bool      `json:"verified"`
	Created  time.Time `json:"createdAt"`
}
type apiError struct {
	code    int
	message string
}

func (e apiError) Error() string { return e.message }

type handler func(http.ResponseWriter, *http.Request, *User) error

func fail(code int, message string) error { return apiError{code, message} }
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return fail(415, "请使用 JSON 格式提交")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return fail(400, "提交内容格式不正确")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return fail(400, "只能提交一份 JSON 数据")
	}
	return nil
}
func randomID() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func hashToken(s string) string { sum := sha256.Sum256([]byte(s)); return hex.EncodeToString(sum[:]) }
func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func adminRequest(r *http.Request) bool { return strings.HasPrefix(r.URL.Path, "/api/admin/") }
func sessionCookie(r *http.Request) (string, string) {
	if adminRequest(r) {
		return "hao123_admin_session", "/api/admin"
	}
	return "hao123_session", "/"
}
func (a *App) session(r *http.Request) (*User, error) {
	name, _ := sessionCookie(r)
	cookie, err := r.Cookie(name)
	if err != nil {
		return nil, nil
	}
	u := &User{}
	err = a.db.QueryRow(r.Context(), `SELECT u.id,u.email,u.name,u.role,u.disabled,u.created_at,u.verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled`, hashToken(cookie.Value)).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Disabled, &u.Created, &u.Verified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	// Keep legacy administrator cookies and renamed tokens out of user sessions.
	if err == nil && ((u.Role == "admin") != adminRequest(r)) {
		return nil, nil
	}
	return u, err
}
func (a *App) route(h handler, access string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		var err error
		if r.Method != "GET" && r.Method != "HEAD" {
			origin := r.Header.Get("Origin")
			if r.Header.Get("X-Hao123-Request") != "1" || (origin != "" && !a.origins[origin]) || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				respond(w, 403, map[string]string{"error": "请求来源不受信任，请刷新页面后重试"})
				return
			}
		}
		u, err := a.session(r)
		if err == nil && access != "" && u == nil {
			err = fail(401, "请先登录")
		}
		if err == nil && access == "admin" && u.Role != "admin" {
			err = fail(403, "仅管理员可以执行此操作")
		}
		if err == nil {
			err = h(w, r, u)
		}
		if err != nil {
			var ae apiError
			var pe *pgconn.PgError
			if errors.As(err, &ae) {
				respond(w, ae.code, map[string]string{"error": ae.message})
			} else if errors.As(err, &pe) && pe.Code == "23505" {
				respond(w, 409, map[string]string{"error": "该邮箱或网址已存在"})
			} else if errors.As(err, &pe) && pe.Code == "23503" {
				respond(w, 409, map[string]string{"error": "分类不存在或仍有网站、投稿使用，请先处理关联数据"})
			} else {
				log.Printf("request failed: %s %s (%T)", r.Method, r.URL.Path, err)
				respond(w, 500, map[string]string{"error": "服务暂时不可用，请稍后重试"})
			}
		}
	}
}
func (a *App) mux() *http.ServeMux {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", a.route(func(w http.ResponseWriter, r *http.Request, u *User) error {
		if err := a.db.Ping(r.Context()); err != nil {
			return err
		}
		respond(w, 200, map[string]string{"status": "ok"})
		return nil
	}, ""))
	m.HandleFunc("GET /api/catalog", a.route(a.catalog, ""))
	m.HandleFunc("POST /api/auth/register", a.route(a.register, ""))
	m.HandleFunc("POST /api/auth/login", a.route(a.login, ""))
	m.HandleFunc("POST /api/auth/logout", a.route(a.logout, ""))
	m.HandleFunc("GET /api/auth/me", a.route(a.me, ""))
	m.HandleFunc("PUT /api/auth/password", a.route(a.password, "user"))
	m.HandleFunc("POST /api/auth/forgot-password", a.route(a.forgotPassword, ""))
	m.HandleFunc("POST /api/auth/reset-password", a.route(a.resetPassword, ""))
	m.HandleFunc("GET /api/auth/verify", a.route(a.verifyEmail, ""))
	m.HandleFunc("POST /api/auth/resend-verification", a.route(a.resendVerification, "user"))
	m.HandleFunc("POST /api/admin/auth/login", a.route(a.login, ""))
	m.HandleFunc("POST /api/admin/auth/logout", a.route(a.logout, ""))
	m.HandleFunc("GET /api/admin/auth/me", a.route(a.me, ""))
	m.HandleFunc("PUT /api/admin/auth/password", a.route(a.password, "admin"))
	m.HandleFunc("GET /api/preferences", a.route(a.getPrefs, "user"))
	m.HandleFunc("PUT /api/preferences", a.route(a.savePrefs, "user"))
	m.HandleFunc("DELETE /api/history", a.route(a.clearHistory, "user"))
	m.HandleFunc("GET /api/privacy/tags", a.route(a.getProfileTags, "user"))
	m.HandleFunc("DELETE /api/privacy/tags/{siteId}", a.route(a.deleteProfileTag, "user"))
	m.HandleFunc("POST /api/clicks", a.route(a.click, "user"))
	m.HandleFunc("GET /api/recommendations", a.route(a.recommendations, ""))
	m.HandleFunc("GET /api/submissions", a.route(a.mySubmissions, "user"))
	m.HandleFunc("POST /api/submissions", a.route(a.submit, "user"))
	m.HandleFunc("GET /api/admin/overview", a.route(a.overview, "admin"))
	m.HandleFunc("GET /api/admin/sites", a.route(a.adminSites, "admin"))
	m.HandleFunc("POST /api/admin/sites", a.route(a.createSite, "admin"))
	m.HandleFunc("PUT /api/admin/sites/{id}", a.route(a.updateSite, "admin"))
	m.HandleFunc("DELETE /api/admin/sites/{id}", a.route(a.deleteSite, "admin"))
	m.HandleFunc("POST /api/admin/categories", a.route(a.createCategory, "admin"))
	m.HandleFunc("PUT /api/admin/categories/{id}", a.route(a.updateCategory, "admin"))
	m.HandleFunc("DELETE /api/admin/categories/{id}", a.route(a.deleteCategory, "admin"))
	m.HandleFunc("GET /api/admin/users", a.route(a.users, "admin"))
	m.HandleFunc("PATCH /api/admin/users/{id}", a.route(a.updateUser, "admin"))
	m.HandleFunc("GET /api/admin/submissions", a.route(a.adminSubmissions, "admin"))
	m.HandleFunc("POST /api/admin/submissions/{id}/review", a.route(a.review, "admin"))
	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		respond(w, 404, map[string]string{"error": "接口不存在"})
	})
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "method not allowed", 405)
			return
		}
		path := filepath.Join(a.dist, filepath.Clean("/"+r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		http.ServeFile(w, r, filepath.Join(a.dist, "index.html"))
	})
	return m
}
func (a *App) initialize(ctx context.Context) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(91231001)"); err != nil {
		return err
	}
	schema, _ := files.ReadFile("schema.sql")
	if _, err = tx.Exec(ctx, string(schema)); err != nil {
		return err
	}
	var done bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app_meta WHERE key='seed-v1')").Scan(&done); err != nil {
		return err
	}
	if !done {
		data, _ := files.ReadFile("seed.json")
		var cs []Category
		if err = json.Unmarshal(data, &cs); err != nil {
			return err
		}
		for i, c := range cs {
			if _, err = tx.Exec(ctx, "INSERT INTO categories(id,name,icon,sort) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", c.ID, c.Name, c.Icon, i); err != nil {
				return err
			}
			for j, s := range c.Sites {
				domain, err := validateURL(s.URL)
				if err != nil {
					return err
				}
				if _, err = tx.Exec(ctx, `INSERT INTO sites(id,name,url,domain,category_id,mark,color,description,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, s.ID, s.Name, s.URL, domain, c.ID, s.Mark, s.Color, s.Description, j); err != nil {
					return err
				}
			}
		}
		if _, err = tx.Exec(ctx, "INSERT INTO app_meta(key,value) VALUES('seed-v1','complete')"); err != nil {
			return err
		}
	}
	if email := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL"))); email != "" {
		password := os.Getenv("ADMIN_PASSWORD")
		if err = validateCredentials(email, password); err != nil {
			return fmt.Errorf("invalid bootstrap admin configuration")
		}
		h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,'管理员',$3,'admin') ON CONFLICT(email) DO NOTHING`, randomID(), email, string(h)); err != nil {
			return err
		}
		var role string
		if err = tx.QueryRow(ctx, "SELECT role FROM users WHERE email=$1", email).Scan(&role); err != nil {
			return err
		}
		if role != "admin" {
			return errors.New("bootstrap email already belongs to a regular user")
		}
	}
	_, err = tx.Exec(ctx, "DELETE FROM sessions WHERE expires_at<now()")
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM email_tokens WHERE expires_at<now()"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type limitEntry struct {
	count   int
	expires time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]limitEntry
}

func (l *limiter) allow(key string, max int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	for k, v := range l.entries {
		if now.After(v.expires) {
			delete(l.entries, k)
		}
	}
	v := l.entries[key]
	if v.expires.IsZero() {
		v.expires = now.Add(window)
	}
	if v.count >= max {
		return false
	}
	v.count++
	l.entries[key] = v
	return true
}
func ip(r *http.Request) string { host, _, _ := net.SplitHostPort(r.RemoteAddr); return host }
func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("database configuration invalid")
	}
	defer db.Close()
	a := &App{db: db, secure: os.Getenv("COOKIE_SECURE") == "true", origins: map[string]bool{}, limits: &limiter{entries: map[string]limitEntry{}}, dist: env("STATIC_DIR", "../dist")}
	if a.sendMail, a.publicURL, err = configureMail(); err != nil {
		log.Fatal(err)
	}
	for _, o := range strings.Split(env("APP_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"), ",") {
		a.origins[strings.TrimSpace(o)] = true
	}
	if err = a.initialize(ctx); err != nil {
		log.Fatalf("database initialization failed (%T)", err)
	}
	server := &http.Server{Addr: env("HTTP_ADDR", "127.0.0.1:8080"), Handler: a.mux(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
	go func() {
		<-ctx.Done()
		shutdown, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		_ = server.Shutdown(shutdown)
	}()
	log.Printf("Hao123 API ready at %s", server.Addr)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

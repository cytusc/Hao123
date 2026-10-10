package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

func validateCredentials(email, password string) error {
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 || !strings.Contains(email, ".") {
		return fail(400, "请输入有效的邮箱地址")
	}
	if len(password) < 8 || len(password) > 72 {
		return fail(400, "密码须为 8–72 个字节")
	}
	return nil
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type sessionWriter interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func (a *App) issueSession(r *http.Request, u *User, store sessionWriter) (*http.Cookie, error) {
	token := randomID()
	name, path := sessionCookie(r)
	if cookie, err := r.Cookie(name); err == nil {
		if _, err = store.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", hashToken(cookie.Value)); err != nil {
			return nil, err
		}
	}
	if _, err := store.Exec(r.Context(), "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", hashToken(token), u.ID); err != nil {
		return nil, err
	}
	return &http.Cookie{Name: name, Value: token, Path: path, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: 30 * 86400}, nil
}
func (a *App) register(w http.ResponseWriter, r *http.Request, _ *User) error {
	if !a.limits.allow("register:"+ip(r), 12, 15*minute) {
		return fail(429, "注册次数过多，请稍后再试")
	}
	var c credentials
	if err := decode(w, r, &c); err != nil {
		return err
	}
	c.Email = strings.ToLower(strings.TrimSpace(c.Email))
	c.Name = strings.TrimSpace(c.Name)
	if err := validateCredentials(c.Email, c.Password); err != nil {
		return err
	}
	if utf8.RuneCountInString(c.Name) < 1 || utf8.RuneCountInString(c.Name) > 24 {
		return fail(400, "昵称须为 1–24 个字符")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(c.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u := &User{ID: randomID(), Email: c.Email, Name: c.Name, Role: "user"}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if err = tx.QueryRow(r.Context(), "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING created_at", u.ID, u.Email, u.Name, string(hash)).Scan(&u.Created); err != nil {
		return err
	}
	cookie, err := a.issueSession(r, u, tx)
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	if err = a.deliverToken(r.Context(), u.ID, "verify"); err != nil {
		// The account remains usable; the account dialog offers a retry without re-registering.
		log.Printf("registration verification delivery failed (%T)", err)
	}
	a.recordEvent(r.Context(), "register", u.ID, eventPayload{})
	http.SetCookie(w, cookie)
	respond(w, 200, map[string]any{"user": u})
	return nil
}

var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("constant-time-login-comparison"), bcrypt.DefaultCost)

func (a *App) login(w http.ResponseWriter, r *http.Request, _ *User) error {
	if !a.limits.allow("login:"+ip(r), 30, 15*minute) {
		return fail(429, "登录次数过多，请 15 分钟后再试")
	}
	var c credentials
	if err := decode(w, r, &c); err != nil {
		return err
	}
	c.Email = strings.ToLower(strings.TrimSpace(c.Email))
	u := &User{}
	var hash string
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	// A reset must either revoke this login's session or change the hash before it is checked.
	err = tx.QueryRow(r.Context(), "SELECT id,email,name,role,disabled,created_at,password_hash,verified FROM users WHERE email=$1 FOR UPDATE", c.Email).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Disabled, &u.Created, &hash, &u.Verified)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(c.Password))
		return fail(401, "邮箱或密码不正确")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(c.Password)) != nil || u.Disabled || ((u.Role == "admin") != adminRequest(r)) {
		return fail(401, "邮箱或密码不正确，或账号已停用")
	}
	cookie, err := a.issueSession(r, u, tx)
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	if u.Role == "user" {
		a.recordEvent(r.Context(), "login", u.ID, eventPayload{})
	}
	http.SetCookie(w, cookie)
	respond(w, 200, map[string]any{"user": u})
	return nil
}
func (a *App) logout(w http.ResponseWriter, r *http.Request, _ *User) error {
	name, path := sessionCookie(r)
	if c, err := r.Cookie(name); err == nil {
		if _, err = a.db.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", hashToken(c.Value)); err != nil {
			return err
		}
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: path, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}
func (a *App) me(w http.ResponseWriter, r *http.Request, u *User) error {
	respond(w, 200, map[string]any{"user": u})
	return nil
}
func (a *App) password(w http.ResponseWriter, r *http.Request, u *User) error {
	if !a.limits.allow("password:"+u.ID, 10, 15*minute) {
		return fail(429, "尝试次数过多，请稍后再试")
	}
	var input struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if err := validateCredentials(u.Email, input.Next); err != nil {
		return err
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var old string
	if err = tx.QueryRow(r.Context(), "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE", u.ID).Scan(&old); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(old), []byte(input.Current)) != nil {
		return fail(400, "当前密码不正确")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Next), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "UPDATE users SET password_hash=$1 WHERE id=$2", string(hash), u.ID); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE user_id=$1", u.ID); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "UPDATE email_tokens SET used=true WHERE user_id=$1 AND purpose='reset'", u.ID); err != nil {
		return err
	}
	cookie, err := a.issueSession(r, u, tx)
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	http.SetCookie(w, cookie)
	respond(w, 200, map[string]any{"user": u})
	return nil
}

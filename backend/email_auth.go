package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func (a *App) deliverToken(ctx context.Context, userID, purpose string) error {
	if a.sendMail == nil {
		return fail(503, "邮件服务暂时不可用，请稍后重试")
	}
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var email string
	var verified bool
	if err = tx.QueryRow(ctx, "SELECT email,verified FROM users WHERE id=$1 AND NOT disabled AND role='user' FOR UPDATE", userID).Scan(&email, &verified); err != nil {
		return err
	}
	if purpose == "verify" && verified {
		return nil
	}
	token := randomID()
	ttl, action, path := 24*time.Hour, "验证邮箱", "/auth/verify"
	if purpose == "reset" {
		ttl, action, path = time.Hour, "重置密码", "/auth/reset-password"
	}
	if _, err = tx.Exec(ctx, "UPDATE email_tokens SET used=true WHERE user_id=$1 AND purpose=$2", userID, purpose); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO email_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,$3,$4)", hashToken(token), userID, purpose, time.Now().Add(ttl)); err != nil {
		return err
	}
	// Keep the user row locked until SMTP accepts the message. Failure rolls back the
	// new token and preserves any earlier usable link; no raw token is persisted.
	link := a.publicURL + path + "#token=" + token
	body := "请打开以下链接" + action + "：\n" + link + "\n\n链接将在 " + ttl.String() + " 后过期，只能使用一次。若不是你本人操作，请忽略此邮件。"
	if err = a.sendMail(ctx, email, "好123 · "+action, body); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (a *App) forgotPassword(w http.ResponseWriter, r *http.Request, _ *User) error {
	if !a.limits.allow("forgot:"+ip(r), 10, 15*minute) {
		return fail(429, "请求过于频繁，请稍后再试")
	}
	var input struct {
		Email string `json:"email"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	// Invalid, unknown, disabled and administrative addresses share the same response.
	parsed, parseErr := mail.ParseAddress(email)
	if parseErr == nil && parsed.Address == email && len(email) <= 254 && a.limits.allow("forgot-email:"+hashToken(email), 3, 15*minute) {
		var id string
		err := a.db.QueryRow(r.Context(), "SELECT id FROM users WHERE email=$1 AND NOT disabled AND role='user'", email).Scan(&id)
		if err == nil {
			err = a.deliverToken(r.Context(), id, "reset")
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("password recovery delivery failed (%T)", err)
		}
	}
	respond(w, 200, map[string]string{"message": "如果该邮箱可用于找回账号，你将收到密码重置邮件，请查看收件箱和垃圾邮件。"})
	return nil
}

func (a *App) resendVerification(w http.ResponseWriter, r *http.Request, u *User) error {
	if !a.limits.allow("verify:"+u.ID, 3, 15*minute) {
		return fail(429, "发送过于频繁，请稍后再试")
	}
	if err := a.deliverToken(r.Context(), u.ID, "verify"); err != nil {
		return err
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

func (a *App) consumeEmailToken(r *http.Request, token, purpose, passwordHash string) error {
	if len(token) != 48 {
		return fail(400, "链接无效或已过期，请重新申请")
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var id string
	if err = tx.QueryRow(r.Context(), "SELECT user_id FROM email_tokens WHERE token_hash=$1 AND purpose=$2", hashToken(token), purpose).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return fail(400, "链接无效或已过期，请重新申请")
	} else if err != nil {
		return err
	}
	// Consistent user-first locking serializes reset, change-password and token issuance.
	if err = tx.QueryRow(r.Context(), "SELECT id FROM users WHERE id=$1 AND NOT disabled AND role='user' FOR UPDATE", id).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return fail(400, "链接无效或已过期，请重新申请")
	} else if err != nil {
		return err
	}
	result, err := tx.Exec(r.Context(), "UPDATE email_tokens SET used=true WHERE token_hash=$1 AND purpose=$2 AND NOT used AND expires_at>clock_timestamp()", hashToken(token), purpose)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fail(400, "链接无效或已过期，请重新申请")
	}
	if purpose == "reset" {
		if _, err = tx.Exec(r.Context(), "UPDATE users SET password_hash=$1,verified=true WHERE id=$2", passwordHash, id); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE user_id=$1", id); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), "UPDATE email_tokens SET used=true WHERE user_id=$1", id); err != nil {
			return err
		}
	} else {
		if _, err = tx.Exec(r.Context(), "UPDATE users SET verified=true WHERE id=$1", id); err != nil {
			return err
		}
	}
	return tx.Commit(r.Context())
}

func (a *App) verifyEmail(w http.ResponseWriter, r *http.Request, _ *User) error {
	if !a.limits.allow("verify-token:"+ip(r), 30, 15*minute) {
		return fail(429, "请求过于频繁，请稍后再试")
	}
	if err := a.consumeEmailToken(r, r.URL.Query().Get("token"), "verify", ""); err != nil {
		return err
	}
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request, _ *User) error {
	if !a.limits.allow("reset:"+ip(r), 10, 15*minute) {
		return fail(429, "请求过于频繁，请稍后再试")
	}
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(w, r, &input); err != nil {
		return err
	}
	if err := validateCredentials("reset@example.com", input.Password); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err = a.consumeEmailToken(r, input.Token, "reset", string(hash)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: "hao123_session", Value: "", Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	respond(w, 200, map[string]bool{"ok": true})
	return nil
}

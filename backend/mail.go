package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"strings"
	"time"
)

// SMTP requires TLS by default. Insecure transport is only for a local test mailbox.
func configureMail() (func(context.Context, string, string, string) error, string, error) {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		return nil, "", nil
	}
	public, err := url.Parse(os.Getenv("APP_PUBLIC_URL"))
	if err != nil || public.Host == "" || (public.Scheme != "https" && public.Scheme != "http") || public.User != nil || public.RawQuery != "" || public.Fragment != "" || (public.Path != "" && public.Path != "/") {
		return nil, "", errors.New("SMTP requires APP_PUBLIC_URL with a valid HTTP(S) origin")
	}
	if os.Getenv("COOKIE_SECURE") == "true" && public.Scheme != "https" {
		return nil, "", errors.New("APP_PUBLIC_URL must use HTTPS with secure cookies")
	}
	from, err := mail.ParseAddress(os.Getenv("SMTP_FROM"))
	if err != nil || strings.ContainsAny(os.Getenv("SMTP_FROM"), "\r\n") {
		return nil, "", errors.New("SMTP_FROM must be a valid sender address")
	}
	port, username, password := env("SMTP_PORT", "587"), os.Getenv("SMTP_USERNAME"), os.Getenv("SMTP_PASSWORD")
	insecure := os.Getenv("SMTP_ALLOW_INSECURE") == "true"
	if insecure && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return nil, "", errors.New("SMTP_ALLOW_INSECURE is restricted to a local test mailbox")
	}
	send := func(ctx context.Context, to, subject, body string) error {
		conn, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(host, port))
		if err != nil {
			return err
		}
		defer conn.Close()
		deadline := time.Now().Add(8 * time.Second)
		if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
			deadline = d
		}
		if err = conn.SetDeadline(deadline); err != nil {
			return err
		}
		rawConn := conn
		stop := context.AfterFunc(ctx, func() { _ = rawConn.Close() })
		defer stop()
		tlsConfig := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
		if port == "465" {
			conn = tls.Client(conn, tlsConfig)
		}
		client, err := smtp.NewClient(conn, host)
		if err != nil {
			return err
		}
		defer client.Close()
		if port != "465" && !insecure {
			if err = client.StartTLS(tlsConfig); err != nil {
				return err
			}
		}
		if username != "" {
			if err = client.Auth(smtp.PlainAuth("", username, password, host)); err != nil {
				return err
			}
		}
		if err = client.Mail(from.Address); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		writer, err := client.Data()
		if err != nil {
			return err
		}
		_, err = fmt.Fprintf(writer, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", from.String(), to, mime.QEncoding.Encode("UTF-8", subject), strings.ReplaceAll(body, "\n", "\r\n"))
		if err != nil {
			_ = writer.Close()
			return err
		}
		if err = writer.Close(); err != nil {
			return err
		}
		return client.Quit()
	}
	return send, strings.TrimRight(public.String(), "/"), nil
}

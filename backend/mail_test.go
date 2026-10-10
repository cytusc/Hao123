package main

import "testing"

func TestMailConfiguration(t *testing.T) {
	for _, key := range []string{"SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_ALLOW_INSECURE", "APP_PUBLIC_URL", "COOKIE_SECURE"} {
		t.Setenv(key, "")
	}
	if send, _, err := configureMail(); err != nil || send != nil {
		t.Fatal("unconfigured mail should leave basic authentication available")
	}
	t.Setenv("SMTP_HOST", "smtp.example.com")
	t.Setenv("SMTP_FROM", "no-reply@example.com")
	if _, _, err := configureMail(); err == nil {
		t.Fatal("missing public URL accepted")
	}
	t.Setenv("APP_PUBLIC_URL", "https://navigation.example.com")
	if send, origin, err := configureMail(); err != nil || send == nil || origin != "https://navigation.example.com" {
		t.Fatal("valid SMTP configuration rejected", err)
	}
	t.Setenv("SMTP_FROM", "sender@example.com\r\nBcc: leaked@example.com")
	if _, _, err := configureMail(); err == nil {
		t.Fatal("header injection accepted")
	}
	t.Setenv("SMTP_FROM", "sender@example.com")
	t.Setenv("SMTP_ALLOW_INSECURE", "true")
	if _, _, err := configureMail(); err == nil {
		t.Fatal("insecure remote SMTP accepted")
	}
	t.Setenv("SMTP_HOST", "127.0.0.1")
	if _, _, err := configureMail(); err != nil {
		t.Fatal("local test mailbox rejected", err)
	}
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("APP_PUBLIC_URL", "http://navigation.example.com")
	if _, _, err := configureMail(); err == nil {
		t.Fatal("HTTP recovery link accepted in secure deployment")
	}
}

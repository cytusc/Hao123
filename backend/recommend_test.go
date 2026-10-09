package main

import (
	"math"
	"testing"
	"time"
)

func TestDecayAndRanking(t *testing.T) {
	if got := decayed(8, 7*24*time.Hour); math.Abs(got-4) > 1e-9 {
		t.Fatalf("7 day half-life: got %v", got)
	}
	sites := []Site{{ID: "cold", CategoryID: "work", Sort: 0}, {ID: "recent", CategoryID: "ai", Sort: 1}, {ID: "peer", CategoryID: "ai", Sort: 2}, {ID: "hidden", CategoryID: "ai", Sort: 0}}
	sig := signals{personal: map[string]float64{"recent": 2}, category: map[string]float64{"ai": 2}, co: map[string]float64{"peer": 3}, popular: map[string]float64{}}
	common := rankSites(sites, sig, map[string]bool{"hidden": true}, false)
	if len(common) != 3 || common[0].ID != "recent" {
		t.Fatal("recent visits should rank first and hidden sites must be excluded")
	}
	discover := rankSites(sites, sig, map[string]bool{"hidden": true}, true)
	if len(discover) != 2 || discover[0].ID != "peer" || discover[0].Reason != "访问相似网站的人也常用" {
		t.Fatal("discovery must exclude seen sites and explain co-visits")
	}
}
func TestURLValidation(t *testing.T) {
	for _, raw := range []string{"javascript:alert(1)", "file:///tmp/a", "https://user:pass@example.com", "http://127.0.0.1", "http://192.168.1.2", "http://localhost", "https://example.local"} {
		if _, err := validateURL(raw); err == nil {
			t.Errorf("unsafe URL accepted: %s", raw)
		}
	}
	if host, err := validateURL("https://example.com/path?q=1"); err != nil || host != "example.com" {
		t.Fatal("public HTTPS URL must be accepted")
	}
}

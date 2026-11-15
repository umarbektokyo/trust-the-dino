package sample

import "testing"

func TestClean(t *testing.T) {
	if Clean(" a ") != "a" {
		t.Fatal("not trimmed")
	}
}

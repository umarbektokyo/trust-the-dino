package main

import (
	"strings"
	"sync"
	"testing"
)

var (
	once   sync.Once
	cached *Graph
	err0   error
)

// build type-checks the fixture once; tests only read the graph.
func build(t *testing.T) *Graph {
	t.Helper()
	once.Do(func() { cached, err0 = Build("testdata/sample") })
	if err0 != nil {
		t.Fatal(err0)
	}
	return cached
}

func node(t *testing.T, g *Graph, id string) *Node {
	t.Helper()
	for _, n := range g.Nodes {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("no node %q", id)
	return nil
}

func hasEdge(g *Graph, from, to, kind string) *Edge {
	for i, e := range g.Edges {
		if e.From == from && e.To == to && e.Kind == kind {
			return &g.Edges[i]
		}
	}
	return nil
}

func has(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

func TestKindsAndIDs(t *testing.T) {
	g := build(t)
	for id, kind := range map[string]string{
		"sample.go:Clean":          "func",
		"sample.go:Store.Load":     "method",
		"sample.go:Config":         "type",
		"sample.go:Config.Root":    "field",
		"sample_test.go:TestClean": "test",
	} {
		if n := node(t, g, id); n.Kind != kind {
			t.Errorf("%s: kind %q, want %q", id, n.Kind, kind)
		}
	}
}

func TestLayers(t *testing.T) {
	g := build(t)
	for id, layer := range map[string]string{
		"sample.go:Clean":          "logic",
		"sample.go:List":           "logic",
		"sample.go:Store.Load":     "data", // os
		"sample.go:Handler":        "data", // net/http
		"sample_test.go:TestClean": "test",
	} {
		if n := node(t, g, id); n.Layer != layer {
			t.Errorf("%s: layer %q, want %q", id, n.Layer, layer)
		}
	}
	if io := node(t, g, "sample.go:Store.Load").IO; !has(io, "os") {
		t.Errorf("Load io = %v, want os", io)
	}
}

func TestCallsResolveThroughReceiversAndClosures(t *testing.T) {
	g := build(t)
	e := hasEdge(g, "sample.go:Handler", "sample.go:Store.Name", "calls")
	if e == nil {
		t.Fatal("Handler's closure should call Store.Name")
	}
	if !strings.Contains(e.Text, "s.Name()") || e.Line != 48 {
		t.Errorf("edge line/text = %d %q", e.Line, e.Text)
	}
	if hasEdge(g, "sample.go:Store.Name", "sample.go:Clean", "calls") == nil {
		t.Error("Store.Name should call Clean")
	}
	if hasEdge(g, "sample_test.go:TestClean", "sample.go:Clean", "calls") == nil {
		t.Error("TestClean should call Clean")
	}
}

func TestFieldReadsAndWrites(t *testing.T) {
	g := build(t)
	if hasEdge(g, "sample.go:Store.Load", "sample.go:Config.Root", "reads") == nil {
		t.Error("Load reads Config.Root")
	}
	if hasEdge(g, "sample.go:Handler", "sample.go:Config.Verbose", "writes") == nil {
		t.Error("Handler writes Config.Verbose")
	}
}

func TestSecretLabels(t *testing.T) {
	g := build(t)
	if !has(node(t, g, "sample.go:Config.RootPass").Labels, "secret") {
		t.Error("RootPass is a secret")
	}
	for _, id := range []string{"sample.go:Config.HasToken", "sample.go:Config.Root"} {
		if has(node(t, g, id).Labels, "secret") {
			t.Errorf("%s is not a secret (bool flag or plain name)", id)
		}
	}
	if hasEdge(g, "sample.go:Store.Load", "resource:.store-secrets.json", "literal") == nil {
		t.Error("Load names the secrets file")
	}
}

func TestGuardPathIncludesElse(t *testing.T) {
	g := build(t)
	var dot *Guard
	for i, gd := range node(t, g, "sample.go:List").Guards {
		if strings.Contains(gd.Cond, `HasPrefix(n, ".")`) {
			dot = &node(t, g, "sample.go:List").Guards[i]
		}
	}
	if dot == nil {
		t.Fatal("dotfile guard not found")
	}
	if dot.Exit != "continue" || dot.Path != `!(match != "") && strings.HasPrefix(n, ".")` {
		t.Errorf("guard = %+v", *dot)
	}
}

func TestGuardInsideClosure(t *testing.T) {
	g := build(t)
	gs := node(t, g, "sample.go:Handler").Guards
	if len(gs) != 1 || gs[0].Cond != `r.Method != "GET"` || gs[0].Exit != "return" {
		t.Errorf("guards = %+v", gs)
	}
}

func TestHashChangesOnlyWithBody(t *testing.T) {
	g := build(t)
	a, b := node(t, g, "sample.go:Clean"), node(t, g, "sample.go:Store.Name")
	if a.Hash == "" || a.Hash == b.Hash {
		t.Errorf("hashes %q %q", a.Hash, b.Hash)
	}
}

func TestDeterministic(t *testing.T) {
	a := build(t)
	b, err := Build("testdata/sample")
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Nodes) != len(b.Nodes) || len(a.Edges) != len(b.Edges) {
		t.Fatal("sizes differ")
	}
	for i := range a.Edges {
		if a.Edges[i] != b.Edges[i] {
			t.Fatalf("edge %d differs", i)
		}
	}
}

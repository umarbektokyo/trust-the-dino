package main

import (
	"crypto/sha256"
	"encoding/hex"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Graph struct {
	Lang  string  `json:"lang"`
	Nodes []*Node `json:"nodes"`
	Edges []Edge  `json:"edges"`
}

type Node struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`  // func | method | test | type | field | resource
	Layer     string   `json:"layer"` // data | logic | test
	File      string   `json:"file,omitempty"`
	Start     int      `json:"start,omitempty"`
	End       int      `json:"end,omitempty"`
	Signature string   `json:"signature,omitempty"`
	Hash      string   `json:"hash,omitempty"`
	IO        []string `json:"io,omitempty"`
	Labels    []string `json:"labels,omitempty"`
	Guards    []Guard  `json:"guards,omitempty"`
}

type Guard struct {
	Line int    `json:"line"`
	Exit string `json:"exit"` // continue | break | return
	Cond string `json:"cond"` // the if condition itself
	Path string `json:"path"` // every condition needed to reach it, joined with &&
}

type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"` // calls | reads | writes | literal
	Line int    `json:"line"`
	Text string `json:"text"`
}

// ioPackages put a function in the data layer when it uses them.
var ioPackages = map[string]bool{
	"net/http": true, "net": true, "os": true, "os/exec": true, "io": true,
	"io/fs": true, "database/sql": true, "bufio": true,
}

var secretName = regexp.MustCompile(`(?i)secret|passw|pass$|token|hmac|apikey|api_key|private`)

// resourceName: a literal that names a file, path or environment variable, not prose or JSON.
var resourceName = regexp.MustCompile(`^(?:[\w\-]*\.[\w.\-/]+|/[\w.\-/]+|[A-Z][A-Z0-9_]+)$`)

type pkgKey struct{ dir, name string }

// Build parses every package under root and returns its graph.
func Build(root string) (*Graph, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	fset := token.NewFileSet()
	pkgs := map[pkgKey][]*ast.File{}
	srcs := map[string][]byte{} // filename -> source
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			n := d.Name()
			if path != root && (strings.HasPrefix(n, ".") || n == "vendor" || n == "node_modules" || n == "testdata") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
		if err != nil {
			return nil // unparsable file: skip, do not fail the graph
		}
		srcs[path] = src
		k := pkgKey{filepath.Dir(path), f.Name.Name}
		pkgs[k] = append(pkgs[k], f)
		return nil
	})
	if err != nil {
		return nil, err
	}

	b := &builder{root: root, fset: fset, srcs: srcs, g: &Graph{Lang: "go"}, byObj: map[types.Object]string{}}
	keys := make([]pkgKey, 0, len(pkgs))
	for k := range pkgs {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].dir+keys[i].name < keys[j].dir+keys[j].name })
	for _, k := range keys {
		b.pkg(pkgs[k])
	}
	sort.Slice(b.g.Nodes, func(i, j int) bool { return b.g.Nodes[i].ID < b.g.Nodes[j].ID })
	sort.SliceStable(b.g.Edges, func(i, j int) bool {
		x, y := b.g.Edges[i], b.g.Edges[j]
		if x.From != y.From {
			return x.From < y.From
		}
		if x.Line != y.Line {
			return x.Line < y.Line
		}
		return x.To < y.To
	})
	return b.g, nil
}

type builder struct {
	root  string
	fset  *token.FileSet
	srcs  map[string][]byte
	g     *Graph
	byObj map[types.Object]string
	seen  map[string]bool
}

func (b *builder) pkg(files []*ast.File) {
	info := &types.Info{
		Defs:       map[*ast.Ident]types.Object{},
		Uses:       map[*ast.Ident]types.Object{},
		Selections: map[*ast.SelectorExpr]*types.Selection{},
	}
	conf := types.Config{Importer: importer.ForCompiler(b.fset, "source", nil), Error: func(error) {}}
	pkg, _ := conf.Check(files[0].Name.Name, b.fset, files, info) // partial info is fine

	// Pass 1: declare nodes so calls can resolve regardless of order.
	type fn struct {
		decl *ast.FuncDecl
		node *Node
	}
	var fns []fn
	for _, f := range files {
		file := b.rel(f)
		for _, d := range f.Decls {
			switch d := d.(type) {
			case *ast.FuncDecl:
				n := b.funcNode(file, d)
				if obj := info.Defs[d.Name]; obj != nil {
					b.byObj[obj] = n.ID
				}
				b.add(n)
				fns = append(fns, fn{d, n})
			case *ast.GenDecl:
				b.typeNodes(file, d, info)
			}
		}
	}

	// Pass 2: edges, IO and guards from each body.
	for _, x := range fns {
		if x.decl.Body == nil {
			continue
		}
		b.body(x.node, x.decl.Body, info, pkg)
		x.node.Guards = b.guards(x.decl.Body)
		if x.node.Kind != "test" && len(x.node.IO) > 0 {
			x.node.Layer = "data"
		}
	}
}

func (b *builder) add(n *Node) {
	if b.seen == nil {
		b.seen = map[string]bool{}
	}
	if b.seen[n.ID] {
		return
	}
	b.seen[n.ID] = true
	b.g.Nodes = append(b.g.Nodes, n)
}

func (b *builder) rel(f *ast.File) string {
	p, _ := filepath.Rel(b.root, b.fset.File(f.Pos()).Name())
	return filepath.ToSlash(p)
}

func (b *builder) text(from, to token.Pos) string {
	p := b.fset.Position(from)
	return string(b.srcs[p.Filename][p.Offset:b.fset.Position(to).Offset])
}

func (b *builder) line(pos token.Pos) (int, string) {
	p := b.fset.Position(pos)
	src := b.srcs[p.Filename]
	start := p.Offset - (p.Column - 1)
	end := start
	for end < len(src) && src[end] != '\n' {
		end++
	}
	return p.Line, strings.TrimSpace(string(src[start:end]))
}

func (b *builder) funcNode(file string, d *ast.FuncDecl) *Node {
	name := d.Name.Name
	kind := "func"
	if d.Recv != nil && len(d.Recv.List) > 0 {
		name = recvName(d.Recv.List[0].Type) + "." + name
		kind = "method"
	}
	layer := "logic"
	if strings.HasSuffix(file, "_test.go") {
		layer = "test"
		if strings.HasPrefix(d.Name.Name, "Test") || strings.HasPrefix(d.Name.Name, "Benchmark") {
			kind = "test"
		}
	}
	n := &Node{
		ID: file + ":" + name, Kind: kind, Layer: layer, File: file,
		Start: b.fset.Position(d.Pos()).Line, End: b.fset.Position(d.End()).Line,
	}
	if d.Body != nil {
		n.Signature = strings.TrimSpace(b.text(d.Pos(), d.Body.Lbrace))
		sum := sha256.Sum256([]byte(b.text(d.Body.Lbrace, d.Body.End())))
		n.Hash = hex.EncodeToString(sum[:6])
	}
	if name == "main" || name == "init" {
		n.Labels = append(n.Labels, "entry")
	}
	return n
}

func recvName(e ast.Expr) string {
	switch t := e.(type) {
	case *ast.StarExpr:
		return recvName(t.X)
	case *ast.IndexExpr: // generic receiver
		return recvName(t.X)
	case *ast.Ident:
		return t.Name
	}
	return "?"
}

// typeNodes adds struct types and their fields; secret-looking fields get the "secret" label.
func (b *builder) typeNodes(file string, d *ast.GenDecl, info *types.Info) {
	for _, s := range d.Specs {
		ts, ok := s.(*ast.TypeSpec)
		if !ok {
			continue
		}
		st, ok := ts.Type.(*ast.StructType)
		if !ok {
			continue
		}
		layer := "logic"
		if strings.HasSuffix(file, "_test.go") {
			layer = "test"
		}
		b.add(&Node{ID: file + ":" + ts.Name.Name, Kind: "type", Layer: layer, File: file,
			Start: b.fset.Position(ts.Pos()).Line, End: b.fset.Position(ts.End()).Line})
		for _, f := range st.Fields.List {
			for _, name := range f.Names {
				n := &Node{ID: file + ":" + ts.Name.Name + "." + name.Name, Kind: "field", Layer: layer,
					File: file, Start: b.fset.Position(name.Pos()).Line, End: b.fset.Position(name.Pos()).Line}
				isBool := false
				if obj := info.Defs[name]; obj != nil {
					isBool = types.Identical(obj.Type(), types.Typ[types.Bool])
				}
				if (secretName.MatchString(name.Name) && !isBool) || (f.Tag != nil && strings.Contains(f.Tag.Value, `trust:"secret"`)) {
					n.Labels = []string{"secret"}
				}
				if obj := info.Defs[name]; obj != nil {
					b.byObj[obj] = n.ID
				}
				b.add(n)
			}
		}
	}
}

// body records calls, field reads/writes, IO packages and secret-looking string literals.
func (b *builder) body(n *Node, body *ast.BlockStmt, info *types.Info, pkg *types.Package) {
	written := map[*ast.SelectorExpr]bool{}
	io := map[string]bool{}
	ast.Inspect(body, func(x ast.Node) bool {
		switch x := x.(type) {
		case *ast.AssignStmt:
			for _, l := range x.Lhs {
				if s, ok := l.(*ast.SelectorExpr); ok {
					written[s] = true
				}
			}
		case *ast.Ident:
			if obj := info.Uses[x]; obj != nil && obj.Pkg() != nil && obj.Pkg() != pkg && ioPackages[obj.Pkg().Path()] {
				io[obj.Pkg().Path()] = true
			}
		case *ast.CallExpr:
			if id := b.callee(x.Fun, info); id != "" && id != n.ID {
				line, text := b.line(x.Pos())
				b.g.Edges = append(b.g.Edges, Edge{From: n.ID, To: id, Kind: "calls", Line: line, Text: text})
			}
		case *ast.SelectorExpr:
			sel := info.Selections[x]
			if sel == nil || sel.Kind() != types.FieldVal {
				return true
			}
			if to, ok := b.byObj[sel.Obj()]; ok {
				kind := "reads"
				if written[x] {
					kind = "writes"
				}
				line, text := b.line(x.Pos())
				b.g.Edges = append(b.g.Edges, Edge{From: n.ID, To: to, Kind: kind, Line: line, Text: text})
			}
		case *ast.BasicLit:
			if x.Kind != token.STRING || n.Layer == "test" {
				return true
			}
			v, err := strconv.Unquote(x.Value)
			if err != nil || !secretName.MatchString(v) || !resourceName.MatchString(v) || strings.HasPrefix(v, "/api/") {
				return true
			}
			id := "resource:" + v
			if strings.Contains(v, ".") && strings.Contains(v, "/") { // a file path: one resource however it is joined
				id = "resource:" + filepath.Base(v)
			}
			b.add(&Node{ID: id, Kind: "resource", Layer: "data", Labels: []string{"secret"}})
			line, text := b.line(x.Pos())
			b.g.Edges = append(b.g.Edges, Edge{From: n.ID, To: id, Kind: "literal", Line: line, Text: text})
		}
		return true
	})
	for p := range io {
		n.IO = append(n.IO, p)
	}
	sort.Strings(n.IO)
}

func (b *builder) callee(fun ast.Expr, info *types.Info) string {
	var id *ast.Ident
	switch f := fun.(type) {
	case *ast.Ident:
		id = f
	case *ast.SelectorExpr:
		id = f.Sel
	case *ast.IndexExpr: // generic instantiation
		return b.callee(f.X, info)
	default:
		return ""
	}
	obj := info.Uses[id]
	if fn, ok := obj.(*types.Func); ok && fn.Origin() != nil {
		obj = fn.Origin()
	}
	return b.byObj[obj]
}

// guards finds early exits (if … { …; continue|break|return }) and the full condition
// needed to reach each one, so a guard that moved under another branch shows up as changed.
func (b *builder) guards(body *ast.BlockStmt) []Guard {
	var out []Guard
	var stmts func(list []ast.Stmt, path []string)
	var stmt func(s ast.Stmt, path []string)
	lits := func(x ast.Node, path []string) { // closures (e.g. returned handlers) keep the path
		ast.Inspect(x, func(y ast.Node) bool {
			if fl, ok := y.(*ast.FuncLit); ok {
				stmts(fl.Body.List, path)
				return false
			}
			return true
		})
	}
	stmt = func(s ast.Stmt, path []string) {
		switch s := s.(type) {
		case *ast.BlockStmt:
			stmts(s.List, path)
		case *ast.IfStmt:
			if s.Init != nil {
				lits(s.Init, path)
			}
			cond := b.text(s.Cond.Pos(), s.Cond.End())
			in := append(append([]string{}, path...), cond)
			if exit := exitOf(s.Body); exit != "" {
				line, _ := b.line(s.Pos())
				out = append(out, Guard{Line: line, Exit: exit, Cond: cond, Path: strings.Join(in, " && ")})
			}
			stmts(s.Body.List, in)
			if s.Else != nil {
				stmt(s.Else, append(append([]string{}, path...), "!("+cond+")"))
			}
		case *ast.ForStmt:
			stmts(s.Body.List, path)
		case *ast.RangeStmt:
			stmts(s.Body.List, path)
		case *ast.SwitchStmt:
			for _, c := range s.Body.List {
				stmts(c.(*ast.CaseClause).Body, path)
			}
		case *ast.TypeSwitchStmt:
			for _, c := range s.Body.List {
				stmts(c.(*ast.CaseClause).Body, path)
			}
		case *ast.LabeledStmt:
			stmt(s.Stmt, path)
		default:
			lits(s, path)
		}
	}
	stmts = func(list []ast.Stmt, path []string) {
		for _, s := range list {
			stmt(s, path)
		}
	}
	stmts(body.List, nil)
	return out
}

func exitOf(body *ast.BlockStmt) string {
	if len(body.List) == 0 {
		return ""
	}
	switch s := body.List[len(body.List)-1].(type) {
	case *ast.ReturnStmt:
		return "return"
	case *ast.BranchStmt:
		if s.Tok == token.CONTINUE || s.Tok == token.BREAK {
			return s.Tok.String()
		}
	}
	return ""
}

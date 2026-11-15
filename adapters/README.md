# Language adapters

An adapter is a program, written in whatever language parses its target best. Contract:

```
<adapter> <source dir>   →   graph JSON on stdout, exit 0
```

It sees one checkout (one git ref). Comparing refs is the core's job.

| Adapter | Run | Parser |
|---|---|---|
| `go/` | `go run ./adapters/go <dir>` | `go/ast` + `go/types` (calls resolve through receivers) |
| `java/` | `sh adapters/java/graph.sh <dir>` | the JDK's `javac` tree API, parse + attribute (`TRUST_JAVA_CP` adds a classpath) |

Java ids are `file:Class.method` (constructors `Class.Class`, overloads add `(ParamTypes)`); record
components are fields and a call to their accessor is a `reads` edge. Non-`@Test` methods in test
files are `func` (helpers), as in Go.

## Graph JSON

```jsonc
{
  "lang": "go",
  "nodes": [{
    "id": "backend/main.go:handleBrowse",     // file:Name, or file:Type.Method
    "kind": "func",                           // func | method | type | field | test
    "layer": "data",                          // visual | data | logic
    "file": "backend/main.go", "start": 758, "end": 825,
    "signature": "func handleBrowse(absContentRoot string, secrets *SecretsStore) http.HandlerFunc",
    "hash": "9f2c…",                          // body hash: changed or not
    "io": ["net/http", "os"],                 // why it is in the data layer
    "labels": ["secret"],                     // secret | entry | test
    "guards": [{                              // early exits: if … { continue | return }
      "line": 799, "exit": "continue",
      "cond": "strings.HasPrefix(e.Name(), \".\")",
      "path": "!(match != \"\") && strings.HasPrefix(e.Name(), \".\")"   // full condition to reach it
    }]
  }],
  "edges": [{
    "from": "backend/main.go:newMux", "to": "backend/main.go:handleBrowse",
    "kind": "calls",                          // calls | reads | writes | literal
    "line": 221, "text": "mux.HandleFunc(\"/api/browse\", handleBrowse(absContentRoot, secrets))"
  }]
}
```

`line` + `text` on an edge is what the review screen shows: the exact line in the other function.

// Java adapter: prints the function graph of a Java source tree as JSON (see ../README.md).
//
//     java Graph.java <dir>
//
// Uses the JDK's own compiler (parse + attribute), so calls resolve to the declared method.
import com.sun.source.tree.*;
import com.sun.source.util.*;

import javax.lang.model.element.*;
import javax.lang.model.util.Elements;
import javax.tools.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class Graph {
    public record Guard(int line, String exit, String cond, String path) { }

    public record Edge(String from, String to, String kind, int line, String text) { }

    public static class Node {
        public String id, kind, layer, file, signature, hash;
        public int start, end;
        public List<String> io = new ArrayList<>(), labels = new ArrayList<>();
        public List<Guard> guards = new ArrayList<>();
    }

    public final List<Node> nodes = new ArrayList<>();
    public final List<Edge> edges = new ArrayList<>();

    static final Pattern SECRET = Pattern.compile("(?i)secret|passw|pass$|token|hmac|apikey|api_key|private");
    // a literal that names a file, path or environment variable, not prose
    static final Pattern RESOURCE = Pattern.compile("^(?:[\\w\\-]*\\.[\\w.\\-/]+|/[\\w.\\-/]+|[A-Z][A-Z0-9_]+)$");
    static final List<String> IO_PACKAGES = List.of("java.io", "java.nio", "java.net", "java.sql");
    static final Set<String> TEST_ANNOTATIONS = Set.of("Test", "ParameterizedTest", "RepeatedTest", "TestFactory");

    private final Path root;
    private final Map<Element, String> byElement = new HashMap<>();
    private final Map<String, Node> byId = new HashMap<>();
    private Trees trees;
    private Elements elements;

    Graph(Path root) {
        this.root = root;
    }

    public static Graph build(String dir) throws IOException {
        Graph g = new Graph(Paths.get(dir).toAbsolutePath().normalize());
        g.run();
        return g;
    }

    private void run() throws IOException {
        List<Path> files;
        try (Stream<Path> s = Files.walk(root)) {
            files = s.filter(p -> p.toString().endsWith(".java") && !skipped(root.relativize(p))).sorted().toList();
        }
        JavaCompiler jc = ToolProvider.getSystemJavaCompiler();
        StandardJavaFileManager fm = jc.getStandardFileManager(null, null, StandardCharsets.UTF_8);
        List<String> opts = new ArrayList<>(List.of("-proc:none", "-XDshould-stop.ifError=FLOW"));
        String cp = System.getenv("TRUST_JAVA_CP"); // e.g. the JUnit jar, so test files resolve too
        if (cp != null) {
            opts.addAll(List.of("-cp", cp));
        }
        JavacTask task = (JavacTask) jc.getTask(null, fm, d -> { }, opts, null, fm.getJavaFileObjectsFromPaths(files));
        List<CompilationUnitTree> units = new ArrayList<>();
        task.parse().forEach(units::add);
        task.analyze(); // errors (missing libraries) are fine: unresolved calls just get no edge
        trees = Trees.instance(task);
        elements = task.getElements();

        List<Runnable> bodies = new ArrayList<>();
        for (CompilationUnitTree cu : units) {
            declare(cu, bodies);
        }
        bodies.forEach(Runnable::run);
        nodes.sort(Comparator.comparing(n -> n.id));
        edges.sort(Comparator.comparing(Edge::from).thenComparingInt(Edge::line).thenComparing(Edge::to));
    }

    static boolean skipped(Path rel) {
        for (Path p : rel.getParent() == null ? List.<Path>of() : rel.getParent()) {
            String n = p.toString();
            if (n.startsWith(".") || Set.of("out", "build", "target", "node_modules", "testdata").contains(n)) {
                return true;
            }
        }
        return false;
    }

    static boolean testFile(String rel) {
        List<String> parts = List.of(rel.split("/"));
        return parts.contains("test") || parts.contains("tests") || rel.endsWith("Test.java") || rel.endsWith("Tests.java");
    }

    /** Pass 1: a node per type, field and method; bodies are queued so calls resolve regardless of order. */
    private void declare(CompilationUnitTree cu, List<Runnable> bodies) throws IOException {
        String file = root.relativize(Paths.get(cu.getSourceFile().toUri())).toString().replace('\\', '/');
        String src = cu.getSourceFile().getCharContent(true).toString();
        Src s = new Src(cu, src, trees.getSourcePositions());
        boolean inTest = testFile(file);
        new TreePathScanner<Void, String>() {
            @Override
            public Void visitClass(ClassTree c, String outer) {
                if (c.getSimpleName().isEmpty()) {
                    return null; // anonymous class: its code belongs to the enclosing method
                }
                String name = outer == null ? c.getSimpleName().toString() : outer + "." + c.getSimpleName();
                Node t = node(file + ":" + name, "type", inTest ? "test" : "logic", file, s.line(c), s.endLine(c));
                byElement.put(trees.getElement(getCurrentPath()), t.id);
                Map<String, Integer> count = new HashMap<>();
                for (Tree m : c.getMembers()) {
                    if (m instanceof MethodTree mt) {
                        count.merge(mt.getName().toString(), 1, Integer::sum);
                    }
                }
                for (Tree m : c.getMembers()) {
                    TreePath p = new TreePath(getCurrentPath(), m);
                    if (m instanceof VariableTree v) {
                        field(file, name, v, p, s, inTest);
                    } else if (m instanceof MethodTree mt) {
                        method(file, name, mt, p, s, inTest, count.get(mt.getName().toString()) > 1, bodies);
                    } else if (m instanceof ClassTree) {
                        scan(p, name);
                    }
                }
                return null;
            }
        }.scan(cu, null);
    }

    private void field(String file, String cls, VariableTree v, TreePath p, Src s, boolean inTest) {
        Element e = trees.getElement(p);
        Node n = node(file + ":" + cls + "." + v.getName(), "field", inTest ? "test" : "logic", file, s.line(v), s.line(v));
        String type = v.getType() == null ? "" : v.getType().toString();
        boolean bool = type.equals("boolean") || type.equals("Boolean");
        boolean tagged = v.getModifiers().getAnnotations().stream().anyMatch(a -> a.getAnnotationType().toString().endsWith("Secret"));
        if ((SECRET.matcher(v.getName()).find() && !bool) || tagged) {
            n.labels.add("secret");
        }
        if (e != null) {
            byElement.put(e, n.id);
        }
    }

    private void method(String file, String cls, MethodTree m, TreePath p, Src s, boolean inTest, boolean overloaded,
                        List<Runnable> bodies) {
        Element e = trees.getElement(p);
        if (e == null || elements.getOrigin(e) != Elements.Origin.EXPLICIT || s.start(m) < 0) {
            return; // default constructors, implicit record members
        }
        String simple = cls.contains(".") ? cls.substring(cls.lastIndexOf('.') + 1) : cls;
        String name = m.getName().contentEquals("<init>") ? simple : m.getName().toString();
        String id = file + ":" + cls + "." + name;
        if (overloaded) {
            id += "(" + String.join(",", m.getParameters().stream().map(x -> x.getType().toString()).toList()) + ")";
        }
        boolean isTest = m.getModifiers().getAnnotations().stream()
                .anyMatch(a -> TEST_ANNOTATIONS.contains(lastName(a.getAnnotationType().toString())));
        // helpers in test files are "func", as in Go, so the core offers them to test generation
        String kind = isTest ? "test" : inTest ? "func" : "method";
        if (byId.containsKey(id)) {
            return;
        }
        Node n = node(id, kind, inTest || isTest ? "test" : "logic", file, s.line(m), s.endLine(m));
        byElement.put(e, n.id);
        if (name.equals("main")) {
            n.labels.add("entry");
        }
        if (m.getBody() == null) {
            n.signature = s.text(s.start(m), s.end(m)).replaceAll("\\s+", " ").replaceAll(";$", "").trim();
            return;
        }
        n.signature = s.text(s.start(m), s.start(m.getBody())).replaceAll("\\s+", " ").trim();
        n.hash = sha(s.text(s.start(m.getBody()), s.end(m.getBody())));
        bodies.add(() -> {
            body(n, p, s);
            new Guards(s, n.guards).block(m.getBody().getStatements(), List.of());
            if (!n.kind.equals("test") && !n.layer.equals("test") && !n.io.isEmpty()) {
                n.layer = "data";
            }
        });
    }

    private Node node(String id, String kind, String layer, String file, int start, int end) {
        if (byId.containsKey(id)) {
            return byId.get(id);
        }
        Node n = new Node();
        n.id = id;
        n.kind = kind;
        n.layer = layer;
        n.file = file;
        n.start = start;
        n.end = end;
        nodes.add(n);
        byId.put(id, n);
        return n;
    }

    /** Pass 2: calls, field reads/writes, IO use and secret-looking string literals. */
    private void body(Node n, TreePath method, Src s) {
        Set<Tree> written = new HashSet<>();
        Set<String> io = new TreeSet<>();
        new TreePathScanner<Void, Void>() {
            void call(Tree at, int pos) {
                Element e = trees.getElement(getCurrentPath());
                String to = e == null ? null : byElement.get(e);
                if (to == null && e != null && e.getKind() == ElementKind.METHOD) {
                    to = recordAccessor((ExecutableElement) e);
                    if (to != null) {
                        edge(n, to, "reads", s, pos);
                        return;
                    }
                }
                if (to != null && !to.equals(n.id)) {
                    edge(n, to, "calls", s, pos);
                }
            }

            @Override
            public Void visitMethodInvocation(MethodInvocationTree t, Void v) {
                ExpressionTree sel = t.getMethodSelect();
                int pos = sel instanceof MemberSelectTree ms ? s.after(s.end(ms.getExpression())) : s.start(t);
                call(t, pos);
                return super.visitMethodInvocation(t, v);
            }

            @Override
            public Void visitNewClass(NewClassTree t, Void v) {
                call(t, s.start(t));
                return super.visitNewClass(t, v);
            }

            @Override
            public Void visitMemberReference(MemberReferenceTree t, Void v) {
                call(t, s.start(t));
                return super.visitMemberReference(t, v);
            }

            @Override
            public Void visitAssignment(AssignmentTree t, Void v) {
                written.add(t.getVariable());
                return super.visitAssignment(t, v);
            }

            @Override
            public Void visitCompoundAssignment(CompoundAssignmentTree t, Void v) {
                written.add(t.getVariable());
                return super.visitCompoundAssignment(t, v);
            }

            @Override
            public Void visitUnary(UnaryTree t, Void v) {
                written.add(t.getExpression());
                return super.visitUnary(t, v);
            }

            @Override
            public Void visitIdentifier(IdentifierTree t, Void v) {
                ref(t);
                return super.visitIdentifier(t, v);
            }

            @Override
            public Void visitMemberSelect(MemberSelectTree t, Void v) {
                ref(t);
                return super.visitMemberSelect(t, v);
            }

            void ref(Tree t) {
                Element e = trees.getElement(getCurrentPath());
                if (e == null) {
                    return;
                }
                String pkg = elements.getPackageOf(e) == null ? "" : elements.getPackageOf(e).getQualifiedName().toString();
                for (String p : IO_PACKAGES) {
                    if (pkg.equals(p) || pkg.startsWith(p + ".")) {
                        io.add(pkg);
                    }
                }
                if (e.getKind() == ElementKind.FIELD && e.getEnclosingElement().toString().equals("java.lang.System")
                        && Set.of("in", "out", "err").contains(e.getSimpleName().toString())) {
                    io.add("System." + e.getSimpleName());
                }
                if (e.getKind() == ElementKind.FIELD && byElement.containsKey(e)) {
                    int pos = t instanceof MemberSelectTree ms ? s.after(s.end(ms.getExpression())) : s.start(t);
                    edge(n, byElement.get(e), written.contains(t) ? "writes" : "reads", s, pos);
                }
            }

            @Override
            public Void visitLiteral(LiteralTree t, Void v) {
                if (t.getValue() instanceof String str && !n.layer.equals("test")
                        && SECRET.matcher(str).find() && RESOURCE.matcher(str).matches()) {
                    String id = "resource:" + (str.contains(".") && str.contains("/") ? str.substring(str.lastIndexOf('/') + 1) : str);
                    Node r = node(id, "resource", "data", null, 0, 0);
                    if (r.labels.isEmpty()) {
                        r.labels.add("secret");
                    }
                    edge(n, id, "literal", s, s.start(t));
                }
                return super.visitLiteral(t, v);
            }
        }.scan(new TreePath(method, ((MethodTree) method.getLeaf()).getBody()), null);
        n.io.addAll(io);
    }

    /** A call to a record's implicit accessor reads the component's field. */
    private String recordAccessor(ExecutableElement m) {
        Element owner = m.getEnclosingElement();
        if (owner.getKind() != ElementKind.RECORD || !m.getParameters().isEmpty()) {
            return null;
        }
        for (Element f : owner.getEnclosedElements()) {
            if (f.getKind() == ElementKind.FIELD && f.getSimpleName().equals(m.getSimpleName())) {
                return byElement.get(f);
            }
        }
        return null;
    }

    private void edge(Node from, String to, String kind, Src s, int pos) {
        edges.add(new Edge(from.id, to, kind, s.lineAt(pos), s.lineText(pos)));
    }

    /** Early exits (if … { …; return|continue|break }) and every condition needed to reach them. */
    record Guards(Src s, List<Guard> out) {
        void block(List<? extends StatementTree> list, List<String> path) {
            for (StatementTree st : list) {
                stmt(st, path);
            }
        }

        void stmt(StatementTree st, List<String> path) {
            switch (st) {
                case null -> { }
                case BlockTree b -> block(b.getStatements(), path);
                case IfTree i -> {
                    ExpressionTree c = i.getCondition() instanceof ParenthesizedTree p ? p.getExpression() : i.getCondition();
                    lambdas(c, path);
                    String cond = s.text(s.start(c), s.end(c)).trim();
                    List<String> in = new ArrayList<>(path);
                    in.add(cond);
                    String exit = exitOf(i.getThenStatement());
                    if (exit != null) {
                        out.add(new Guard(s.line(i), exit, cond, String.join(" && ", in)));
                    }
                    stmt(i.getThenStatement(), in);
                    if (i.getElseStatement() != null) {
                        List<String> not = new ArrayList<>(path);
                        not.add("!(" + cond + ")");
                        stmt(i.getElseStatement(), not);
                    }
                }
                case ForLoopTree f -> stmt(f.getStatement(), path);
                case EnhancedForLoopTree f -> {
                    lambdas(f.getExpression(), path);
                    stmt(f.getStatement(), path);
                }
                case WhileLoopTree w -> stmt(w.getStatement(), path);
                case DoWhileLoopTree d -> stmt(d.getStatement(), path);
                case LabeledStatementTree l -> stmt(l.getStatement(), path);
                case SynchronizedTree y -> stmt(y.getBlock(), path);
                case TryTree t -> {
                    stmt(t.getBlock(), path);
                    t.getCatches().forEach(c -> stmt(c.getBlock(), path));
                    stmt(t.getFinallyBlock(), path);
                }
                case SwitchTree w -> {
                    for (CaseTree c : w.getCases()) {
                        if (c.getStatements() != null) {
                            block(c.getStatements(), path);
                        } else if (c.getBody() instanceof StatementTree b) {
                            stmt(b, path);
                        } else {
                            lambdas(c.getBody(), path);
                        }
                    }
                }
                default -> lambdas(st, path);
            }
        }

        /** Lambdas (e.g. a Runnable handed to a Thread) keep the path they were written under. */
        void lambdas(Tree t, List<String> path) {
            if (t == null) {
                return;
            }
            new TreeScanner<Void, Void>() {
                @Override
                public Void visitLambdaExpression(LambdaExpressionTree l, Void v) {
                    if (l.getBody() instanceof BlockTree b) {
                        block(b.getStatements(), path);
                    }
                    return null;
                }
            }.scan(t, null);
        }

        static String exitOf(StatementTree then) {
            StatementTree last = then;
            if (then instanceof BlockTree b) {
                if (b.getStatements().isEmpty()) {
                    return null;
                }
                last = b.getStatements().getLast();
            }
            return switch (last) {
                case ReturnTree r -> "return";
                case ContinueTree c -> "continue";
                case BreakTree b -> "break";
                default -> null;
            };
        }
    }

    /** Positions and text of one source file. */
    record Src(CompilationUnitTree cu, String src, SourcePositions sp) {
        int start(Tree t) {
            return (int) sp.getStartPosition(t);
        }

        int end(Tree t) {
            return (int) sp.getEndPosition(t);
        }

        int line(Tree t) {
            return lineAt(start(t));
        }

        int endLine(Tree t) {
            return lineAt(Math.max(start(t), end(t) - 1));
        }

        int lineAt(int pos) {
            return (int) cu.getLineMap().getLineNumber(pos);
        }

        String text(int from, int to) {
            return src.substring(from, to);
        }

        /** First position after the end of a receiver, past whitespace and the dot: where the member name is. */
        int after(int pos) {
            while (pos < src.length() && (Character.isWhitespace(src.charAt(pos)) || src.charAt(pos) == '.')) {
                pos++;
            }
            return pos;
        }

        String lineText(int pos) {
            int a = src.lastIndexOf('\n', pos - 1) + 1;
            int b = src.indexOf('\n', pos);
            return src.substring(a, b < 0 ? src.length() : b).trim();
        }
    }

    static String lastName(String s) {
        return s.substring(s.lastIndexOf('.') + 1);
    }

    static String sha(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 6);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // JSON, in the field order and with the omissions of the Go adapter

    String json() {
        StringBuilder b = new StringBuilder("{\n \"lang\": \"java\",\n \"nodes\": [");
        for (int i = 0; i < nodes.size(); i++) {
            Node n = nodes.get(i);
            List<String> f = new ArrayList<>();
            f.add(kv("id", n.id));
            f.add(kv("kind", n.kind));
            f.add(kv("layer", n.layer));
            if (n.file != null) {
                f.add(kv("file", n.file));
            }
            if (n.start > 0) {
                f.add("\"start\": " + n.start);
                f.add("\"end\": " + n.end);
            }
            if (n.signature != null) {
                f.add(kv("signature", n.signature));
            }
            if (n.hash != null) {
                f.add(kv("hash", n.hash));
            }
            if (!n.io.isEmpty()) {
                f.add("\"io\": [" + String.join(", ", n.io.stream().map(Graph::str).toList()) + "]");
            }
            if (!n.labels.isEmpty()) {
                f.add("\"labels\": [" + String.join(", ", n.labels.stream().map(Graph::str).toList()) + "]");
            }
            if (!n.guards.isEmpty()) {
                f.add("\"guards\": [" + String.join(", ", n.guards.stream().map(g -> "{\"line\": " + g.line() + ", "
                        + kv("exit", g.exit()) + ", " + kv("cond", g.cond()) + ", " + kv("path", g.path()) + "}").toList()) + "]");
            }
            b.append(i == 0 ? "\n  {" : ",\n  {").append(String.join(", ", f)).append("}");
        }
        b.append("\n ],\n \"edges\": [");
        for (int i = 0; i < edges.size(); i++) {
            Edge e = edges.get(i);
            b.append(i == 0 ? "\n  {" : ",\n  {").append(kv("from", e.from())).append(", ").append(kv("to", e.to()))
                    .append(", ").append(kv("kind", e.kind())).append(", \"line\": ").append(e.line())
                    .append(", ").append(kv("text", e.text())).append("}");
        }
        return b.append("\n ]\n}\n").toString();
    }

    static String kv(String k, String v) {
        return str(k) + ": " + str(v);
    }

    static String str(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) {
                        b.append(String.format("\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
                }
            }
        }
        return b.append('"').toString();
    }

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("usage: java Graph.java <dir>");
            System.exit(2);
        }
        System.out.print(build(args[0]).json());
    }
}

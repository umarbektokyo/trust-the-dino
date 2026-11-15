// Unit tests for the Java adapter on testdata/sample. Run: java GraphTest.java (exit 1 on failure).
import java.util.List;
import java.util.Objects;

public class GraphTest {
    static int failed = 0;

    static void check(boolean ok, String what) {
        if (!ok) {
            failed++;
            System.out.println("FAIL " + what);
        }
    }

    static Graph.Node node(Graph g, String id) {
        return g.nodes.stream().filter(n -> n.id.equals(id)).findFirst()
                .orElseThrow(() -> new AssertionError("no node " + id));
    }

    static Graph.Edge edge(Graph g, String from, String to, String kind) {
        return g.edges.stream().filter(e -> e.from().equals(from) && e.to().equals(to) && e.kind().equals(kind))
                .findFirst().orElse(null);
    }

    public static void main(String[] args) throws Exception {
        Graph g = Graph.build("testdata/sample");
        String s = "src/Sample.java:";

        // kinds and ids
        check(node(g, s + "Store.clean").kind.equals("method"), "clean is a method");
        check(node(g, s + "Config").kind.equals("type"), "Config is a type");
        check(node(g, s + "Config.root").kind.equals("field"), "Config.root is a field");
        check(node(g, "test/SampleTest.java:SampleTest.cleanTest").kind.equals("test"), "@Test is a test");
        check(node(g, "test/SampleTest.java:SampleTest.store").kind.equals("func"), "test helper is func");
        check(node(g, s + "Store.scale(int,int)").start == 64, "overloads get parameter types in the id");

        // layers and io
        check(node(g, s + "Store.clean").layer.equals("logic"), "clean is logic");
        check(node(g, s + "Store.load").layer.equals("data"), "load (java.nio) is data");
        check(node(g, s + "Store.load").io.contains("java.nio.file"), "load io names java.nio.file");
        check(node(g, s + "Store.handler").io.contains("System.out"), "handler prints: System.out");
        check(node(g, "test/SampleTest.java:SampleTest.cleanTest").layer.equals("test"), "tests are layer test");

        // calls resolve, also inside lambdas and from tests
        Graph.Edge e = edge(g, s + "Store.handler", s + "Store.name", "calls");
        check(e != null && e.line() == 52 && e.text().equals("System.out.println(name());"), "handler's lambda calls name: " + e);
        check(edge(g, s + "Store.name", s + "Store.clean", "calls") != null, "name calls clean");
        check(edge(g, "test/SampleTest.java:SampleTest.cleanTest", s + "Store.clean", "calls") != null, "test calls clean");

        // field reads and writes, record accessors read the component
        check(edge(g, s + "Store.load", s + "Config.root", "reads") != null, "load reads Config.root");
        check(edge(g, s + "Store.handler", s + "Config.verbose", "writes") != null, "handler writes Config.verbose");
        check(edge(g, s + "Store.sum", s + "Point.x", "reads") != null, "p.x() reads Point.x");

        // secrets
        check(node(g, s + "Config.rootPass").labels.contains("secret"), "rootPass is a secret");
        check(!node(g, s + "Config.hasToken").labels.contains("secret"), "boolean hasToken is not a secret");
        check(!node(g, s + "Config.root").labels.contains("secret"), "root is not a secret");
        check(edge(g, s + "Store.load", "resource:.store-secrets.json", "literal") != null, "load names the secrets file");

        // guards: the else adds !(cond) to the path; lambdas keep their guards
        List<Graph.Guard> gs = node(g, s + "Store.list").guards;
        Graph.Guard dot = gs.stream().filter(x -> x.cond().equals("n.startsWith(\".\")")).findFirst().orElse(null);
        check(dot != null && dot.exit().equals("continue") && dot.line() == 38
                && Objects.equals(dot.path(), "!(!match.isEmpty()) && n.startsWith(\".\")"), "dotfile guard: " + dot);
        List<Graph.Guard> hs = node(g, s + "Store.handler").guards;
        check(hs.size() == 1 && hs.get(0).exit().equals("return") && hs.get(0).cond().equals("!method.equals(\"GET\")"),
                "guard inside lambda: " + hs);

        // hashes differ by body; output is deterministic
        check(!node(g, s + "Store.clean").hash.equals(node(g, s + "Store.name").hash), "hashes differ");
        check(g.json().equals(Graph.build("testdata/sample").json()), "deterministic");

        System.out.println(failed == 0 ? "ok   java adapter" : failed + " failed");
        System.exit(failed == 0 ? 0 : 1);
    }
}

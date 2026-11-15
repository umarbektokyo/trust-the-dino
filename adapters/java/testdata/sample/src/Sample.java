import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

class Config {
    String root;
    String rootPass;
    boolean verbose;
    boolean hasToken;
}

record Point(int x, int y) { }

class Store {
    Config cfg = new Config();

    static String clean(String s) {
        return s.strip();
    }

    String load() throws IOException {
        return Files.readString(Path.of(cfg.root + "/.store-secrets.json"));
    }

    String name() {
        return clean(cfg.root);
    }

    static List<String> list(List<String> names, String match) {
        List<String> out = new ArrayList<>();
        for (String n : names) {
            if (!match.isEmpty()) {
                if (!n.equals(match)) {
                    continue;
                }
            } else if (n.startsWith(".")) {
                continue;
            }
            out.add(n);
        }
        return out;
    }

    Runnable handler(String method) {
        return () -> {
            if (!method.equals("GET")) {
                return;
            }
            cfg.verbose = true;
            System.out.println(name());
        };
    }

    int sum(Point p) {
        return p.x() + p.y();
    }

    int scale(int a) {
        return a * 2;
    }

    int scale(int a, int b) {
        return a * b;
    }
}

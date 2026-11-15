import org.junit.jupiter.api.Test;

class SampleTest {
    Store store() {
        return new Store();
    }

    @Test
    void cleanTest() {
        if (!Store.clean(" a ").equals("a")) {
            throw new AssertionError("not trimmed");
        }
    }
}

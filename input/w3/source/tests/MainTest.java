import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class MainTest {
    @Test
    void printMenuTest() {
        assertEquals("Please make your choice:\n" +
                "1 – Show all tickets that are in the in-memory database on screen.\n" +
                "2 – Show the tickets issued for a certain date.\n" +
                "3 – Calculate the turnover for a certain route based on all tickets for that " +
                "    route (not tied to a specific date).\n" +
                "4 – Generate passenger list.\n" +
                "5 – Stop the program.\n" +
                ">>> ", Main.printMenu());
    }
}

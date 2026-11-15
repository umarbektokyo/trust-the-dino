import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class TicketTest {
    TicketPassenger t1P;
    TicketPassenger t1P2;
    TicketBike t2B;
    TicketBike t2B2;
    TicketCar t3C;
    TicketCar t3C2;
    TicketPassenger t4P;
    Terminal terminal;

    @BeforeEach
    void setup() {
        t1P = new TicketPassenger(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, new HumanName("Ross", "Bob"));
        t1P2 = new TicketPassenger(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, new HumanName("Ross", "Bob"));
        t4P = new TicketPassenger(new InfoTravel("Athens", "10-10-2024", "10:15"),
                new InfoTravel("Athens", "10-10-2024", "10:15"), 50, new HumanName("Ross", "Bob"));
        t2B = new TicketBike(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, new HumanName("Ross", "Bob"));
        t2B2 = new TicketBike(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, new HumanName("Ross", "Bob"));
        ArrayList<HumanName> passengers = new ArrayList<>();
        passengers.add(new HumanName("Verstapen", "Max"));
        passengers.add(new HumanName("Product", "Dot"));
        t3C = new TicketCar(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, ">=4",
                new HumanName("Bakhodirjonov", "Umabrek"), passengers);
        t3C2 = new TicketCar(new InfoTravel("Athens", "23-10-2024", "10:15"),
                new InfoTravel("Athens", "23-10-2024", "10:15"), 50, ">=4",
                new HumanName("Bakhodirjonov", "Umabrek"), passengers);

        ArrayList<Ticket> ticketList = new ArrayList<>();
        ticketList.add(t1P);
        ticketList.add(t2B);
        ticketList.add(t3C);
        ticketList.add(t4P);
        terminal = new Terminal(ticketList);
    }

    @Test
    void toStringTestPassenger() {
        assertEquals("A PASSENGER TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n", t1P.toString());
    }

    @Test
    void toStringTestBike() {
        assertEquals("A BIKE TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n", t2B.toString());
    }

    @Test
    void toStringTestCar() {
        assertEquals("A CAR TICKET for passenger Umabrek Bakhodirjonov (driver) for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "Additional passengers are: [Max Verstapen, Dot Product].\n", t3C.toString());
    }

    @Test
    void toStringTestTerminal() {
        assertEquals("All Tickets:\n" +
                "A PASSENGER TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "A BIKE TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "A CAR TICKET for passenger Umabrek Bakhodirjonov (driver) for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "Additional passengers are: [Max Verstapen, Dot Product].\n" +
                "A PASSENGER TICKET for passenger Bob Ross for the route Athens -> Athens on 10-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 10-10-2024.\n", terminal.toString());
    }

    @Test
    void toStringTestTerminalDate() {
        assertEquals("A PASSENGER TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "A BIKE TICKET for passenger Bob Ross for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "A CAR TICKET for passenger Umabrek Bakhodirjonov (driver) for the route Athens -> Athens on 23-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 23-10-2024.\n" +
                "Additional passengers are: [Max Verstapen, Dot Product].\n", terminal.toStringDate("23-10-2024"));
    }

    @Test
    void toStringTestTerminalDate2() {
        assertEquals("A PASSENGER TICKET for passenger Bob Ross for the route Athens -> Athens on 10-10-2024.\n" +
                "Departure is scheduled for 10:15. Arrival is scheduled for 10-10-2024.\n", terminal.toStringDate("10-10-2024"));
    }

    @Test
    void toStringTestTerminalDate3() {
        assertEquals("", terminal.toStringDate("11-10-2024"));
    }

    @Test
    void hashCodeTestTicketPassenger() {
        assertEquals(t1P.hashCode(), t1P2.hashCode());
    }

    @Test
    void hashCodeTestTicketBike() {
        assertEquals(t2B.hashCode(), t2B2.hashCode());
    }

    @Test
    void hashCodeTestTicketCar() {
        assertEquals(t3C.hashCode(), t3C2.hashCode());
    }

    @Test
    void equalsTestTicketPassenger() {
        assertEquals(t1P, t1P2);
    }

    @Test
    void equalsTestTicketBike() {
        assertEquals(t2B, t2B2);
    }

    @Test
    void equalsTestTicketCar() {
        assertEquals(t3C, t3C2);
    }


}

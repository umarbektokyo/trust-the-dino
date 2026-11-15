import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Scanner;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class TerminalTest {
    Terminal term;
    Terminal term2;

    @BeforeEach
    void init() {
        String rawFile = """
            ^CAR TICKET
            DEPARTURE: Texel, 23-10-2024, 13:15
            ARRIVAL: Vlieland, 23-10-2024, 13:45
            PRICE: 70 euros
            LENGTH: <5meters
            PASSENGER: Swiatek, Iga
            PASSENGER: Zheng, Qinwen
            ^PASSENGER TICKET
            DEPARTURE: Texel, 23-10-2024, 15:15
            ARRIVAL: Terschelling, 23-10-2024, 15:45
            PRICE: 10 euros
            NAME: Verstappen, Max
            ^PASSENGER TICKET
            DEPARTURE: Texel, 24-10-2024, 15:15
            ARRIVAL: Terschelling, 24-10-2024, 15:45
            PRICE: 10 euros
            NAME: Pulling, Abbi
            ^CAR TICKET
            DEPARTURE: Terschelling, 25-10-2024, 13:00
            ARRIVAL: Vlieland, 25-10-2024, 14:00
            PRICE: 130 euros
            LENGTH: >=5meters
            PASSENGER: Sinner, Jannik
            PASSENGER: Alcaraz, Carlos
            PASSENGER: Djokovic, Novak
            ^BIKE TICKET
            DEPARTURE: Terschelling, 25-10-2024, 13:00
            ARRIVAL: Vlieland, 25-10-2024, 14:00
            PRICE: 25 euros
            PASSENGER: Vos, Marianne
            """;
        String outputFile = "All Tickets:\n" +
                "A CAR TICKET for passenger Iga Swiatek (driver) for the route Texel -> Vlieland on 23-10-2024.\n" +
                "Departure is scheduled for 13:15. Arrival is scheduled for 23-10-2024.\n" +
                "Additional passengers are: [Qinwen Zheng].\n" +
                "A PASSENGER TICKET for passenger Max Verstappen for the route Texel -> Terschelling on 23-10-2024.\n" +
                "Departure is scheduled for 15:15. Arrival is scheduled for 23-10-2024.\n" +
                "A PASSENGER TICKET for passenger Abbi Pulling for the route Texel -> Terschelling on 24-10-2024.\n" +
                "Departure is scheduled for 15:15. Arrival is scheduled for 24-10-2024.\n" +
                "A CAR TICKET for passenger Jannik Sinner (driver) for the route Terschelling -> Vlieland on 25-10-2024.\n" +
                "Departure is scheduled for 13:00. Arrival is scheduled for 25-10-2024.\n" +
                "Additional passengers are: [Carlos Alcaraz, Novak Djokovic].\n" +
                "A BIKE TICKET for passenger Marianne Vos for the route Terschelling -> Vlieland on 25-10-2024.\n" +
                "Departure is scheduled for 13:00. Arrival is scheduled for 25-10-2024.\n";
        term = ParseMaster.parseFile(new Scanner(rawFile));
        term2 = ParseMaster.parseFile(new Scanner(rawFile));
    }

    @Test
    void equalsTest() {
        assertEquals(term, term2);
    }

    @Test
    void hashCodeTest() {
        assertEquals(term.hashCode(), term2.hashCode());
    }

    @Test
    void toStringTest() {
        assertEquals(term.toString(), term2.toString());
    }

    @Test
    void toStringRoutePassengerListTest() {
        assertEquals("For the route Terschelling -> Vlieland the list of passengers is:\n" +
                "- Jannik Sinner\n" +
                "- Carlos Alcaraz\n" +
                "- Novak Djokovic\n" +
                "- Marianne Vos\n", term.toStringRoutePassengerList("Terschelling", "Vlieland"));
    }

    @Test
    void calculateTurnOverTest() {
        assertEquals(155, term.calculateTurnOver("Terschelling", "Vlieland"));
    }

    @Test
    void toStringTurnOverTest() {
        assertEquals("All tickets in the database for the route Terschelling -> Vlieland combined are worth 155 euros.", term.toStringTurnOver("Terschelling", "Vlieland"));
    }

}

import org.junit.jupiter.api.Test;

import java.util.Scanner;

import static org.junit.jupiter.api.Assertions.*;

public class ParseMasterTest {

    @Test
    void parseInfoTravelTest() {
        assertEquals("InfoTravel[location=Texel, date=23-10-2024, time=13:15]", ParseMaster.parseInfoTravel("DEPARTURE: Texel, 23-10-2024, 13:15").toString());
    }

    @Test
    void parsePriceTest() {
        assertEquals(70, ParseMaster.parsePrice("PRICE: 70 euros"));
    }

    @Test
    void parsePassengerTest() {
        assertEquals("Iga Swiatek", ParseMaster.parsePassenger("PASSENGER: Swiatek, Iga").toString());
    }

    @Test
    void parseLengthTest() {
        assertEquals("<5meters", ParseMaster.parseLength("LENGTH: <5meters"));
    }

    @Test
    void parseFileTest() {
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
        assertEquals(outputFile, ParseMaster.parseFile(new Scanner(rawFile)).toString());
    }
}

import java.io.File;
import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.Scanner;

public class ParseMaster {
    /**
     * Separated function to make parseFile easier to unit-test.
     * @param fileName String, path to the source file.
     * @return initialized Terminal object.
     * @throws FileNotFoundException sometimes, but exam assumes perfect input from the user.
     */
    public static Terminal readFile(String fileName) throws FileNotFoundException {
        Scanner sc = new Scanner(new File(fileName));
        return parseFile(sc);
    }

    /**
     * Main parsing function.
     * @param sc Scanner that has the entire file loaded in.
     * @return Terminal object initialized from the available data.
     */
    public static Terminal parseFile(Scanner sc) {
        ArrayList<Ticket> term = new ArrayList<>();

        String lineTicketType = sc.nextLine(); // ^CAR TICKET

        while (sc.hasNextLine()) {
            InfoTravel departure = parseInfoTravel(sc.nextLine());
            InfoTravel arrival = parseInfoTravel(sc.nextLine());
            int price = parsePrice(sc.nextLine());
            switch (lineTicketType) {
                case "^CAR TICKET" -> {
                    String carLength = parseLength(sc.nextLine());
                    HumanName driver = parsePassenger(sc.nextLine());
                    ArrayList<HumanName> passengers = new ArrayList<>();
                    while (sc.hasNextLine()) {
                        String nl = sc.nextLine();
                        if (nl.startsWith("^")) { lineTicketType = nl; break;
                        } else { passengers.add(parsePassenger(nl)); }
                    }
                    term.add(new TicketCar(departure, arrival, price,
                            carLength, driver, passengers));
                } case "^PASSENGER TICKET" -> {
                    HumanName mainPassenger = parsePassenger(sc.nextLine());
                    term.add(new TicketPassenger(departure, arrival, price, mainPassenger));
                    if (sc.hasNextLine()) { lineTicketType = sc.nextLine(); }
                } case "^BIKE TICKET" -> {
                    HumanName mainPassenger = parsePassenger(sc.nextLine());
                    term.add(new TicketBike(departure, arrival, price, mainPassenger));
                    if (sc.hasNextLine()) { lineTicketType = sc.nextLine(); }
                }
                default -> {
                    System.out.println("This should not be happening :(");
                }
            }

        }

        return new Terminal(term);
    }

    /**
     * Simplifies parsing departure and arrival lines.
     * @param line from the file.
     * @return InfoTravel object of parsed data.
     */
    public static InfoTravel parseInfoTravel(String line) {
        String[] it = line
                .replace("DEPARTURE: ", "")
                .replace("ARRIVAL: ", "")
                .split(", ");
        return new InfoTravel(it[0].strip(), it[1].strip(), it[2].strip());
    }

    /**
     * Simplifies parsing line with the price.
     * @param line from the file.
     * @return integer of the price.
     */
    public static int parsePrice(String line) {
        return Integer.parseInt(line
                .replace("PRICE: ", "")
                .split(" ")[0]);
    }

    /**
     * Simplifies parsing line with a passenger.
     * @param line from the file.
     * @return HumanName parsed (hopefully) correctly.
     */
    public static HumanName parsePassenger(String line) {
        String[] p = line
                .replace("PASSENGER: ", "")
                .replace("NAME: ", "")
                .split(", ");
        return new HumanName(p[0].strip(), p[1].strip());
    }

    /**
     * Simplifies parsing line with car length.
     * @param line from the file.
     * @return String with the car length.
     */
    public static String parseLength(String line) {
        return line
                .replace("LENGTH: ", "")
                .strip();
    }
}

import java.io.FileNotFoundException;
import java.util.Scanner;

public class Main {
    /**
     * Main singleton loop running the game.
     */
    void main() throws FileNotFoundException {
        Scanner input = new Scanner(System.in);
        System.out.print("Data file: "); String fileName = input.nextLine();
        if (fileName.isEmpty()) { fileName = "resources/waddenislands.txt"; }

        Terminal terminal = ParseMaster.readFile(fileName);

        while (true) {
            System.out.print(printMenu());
            switch (input.nextLine()) {
                case "1" -> {
                    System.out.println(terminal);
                }
                case "2" -> {
                    System.out.print("What date would you want to sort by? (ex: 23-10-2024)\n" +
                            "Date: ");
                    System.out.println(terminal.toStringDate(input.nextLine()));
                }
                case "3" -> {
                    System.out.print("Route Turn-Over Calculation:\nDeparture City: ");
                    String departureCity = input.nextLine();
                    System.out.print("Arrival City: ");
                    String arrivalCity = input.nextLine();
                    System.out.println(terminal.toStringTurnOver(departureCity, arrivalCity));
                }
                case "4" -> {
                    System.out.print("Listing All Passengers in a Route:\nDeparture City: ");
                    String departureCity = input.nextLine();
                    System.out.print("Arrival City: ");
                    String arrivalCity = input.nextLine();
                    System.out.println(
                            terminal.toStringRoutePassengerList(departureCity, arrivalCity));
                }
                case "5" -> {
                    System.out.print("Thank you for using our services :)\n" +
                            " - Wadden Islands Ferry Company\n");
                    System.exit(0);
                }
            }
        }
    }

    /**
     * Returns the main user interface menu.
     */
    static String printMenu() {
        return "Please make your choice:\n" +
                "1 – Show all tickets that are in the in-memory database on screen.\n" +
                "2 – Show the tickets issued for a certain date.\n" +
                "3 – Calculate the turnover for a certain route based on all tickets for that " +
                "    route (not tied to a specific date).\n" +
                "4 – Generate passenger list.\n" +
                "5 – Stop the program.\n" +
                ">>> ";
    }
}

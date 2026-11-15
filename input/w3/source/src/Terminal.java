import java.util.ArrayList;
import java.util.Objects;
import java.util.stream.Collectors;

public class Terminal {
    private final ArrayList<Ticket> tickets;

    /**
     * Initializes a main Terminal class that holds all the tickets together.
     * @param tickets list of Ticket objects.
     */
    public Terminal(ArrayList<Ticket> tickets) {
        this.tickets = tickets;
    }

    public ArrayList<Ticket> getTickets() {
        return tickets;
    }

    @Override
    public boolean equals(Object o) {
        if (o == null || getClass() != o.getClass()) return false;
        Terminal terminal = (Terminal) o;
        return Objects.equals(getTickets(), terminal.getTickets());
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(getTickets());
    }

    @Override
    public String toString() {
        String output = "All Tickets:\n";
        for (Ticket ticket : tickets) {
            output += ticket.toString();
        }
        return output;
    }

    /**
     * Implements the second option.
     * @param date in a string format.
     * @return correct text blob to print.
     */
    public String toStringDate(String date) {
        return getTickets()
                .stream()
                .filter(t -> t.getArrival().date().equals(date))
                .map(Ticket::toString)
                .collect(Collectors.joining());
    }

    /**
     * Outputs a string for what the output for the turnover should be.
     * @param departureCity String
     * @param arrivalCity String
     * @return String blob of the turnover message.
     */
    public String toStringTurnOver(String departureCity, String arrivalCity) {
        return String.format("All tickets in the database for the route " +
                "%s -> %s combined are worth %s euros.",
                departureCity, arrivalCity, calculateTurnOver(departureCity, arrivalCity));
    }

    /**
     * Calculates the turnover for a specific route (omnidirectional).
     * @param departureCity String
     * @param arrivalCity String
     * @return integer sum of all routes
     */
    public int calculateTurnOver(String departureCity, String arrivalCity) {
        return getTickets()
                .stream()
                .filter(t -> t.getDeparture().location().equals(departureCity))
                .filter(t -> t.getArrival().location().equals(arrivalCity))
                .mapToInt(Ticket::getPrice)
                .sum();
    }

    /**
     * Outputs a String that is a list of all the passengers taking a route.
     * @param departureCity String
     * @param arrivalCity String
     * @return String blob of the turnover message.
     */
    public String toStringRoutePassengerList(String departureCity, String arrivalCity) {
        String output = "For the route " + departureCity + " -> " + arrivalCity
                + " the list of passengers is:\n";
        for (Ticket ticket : getTickets()
                .stream()
                .filter(t -> t.getArrival().location().equals(arrivalCity))
                .filter(t -> t.getDeparture().location().equals(departureCity))
                .toList()) {
            if (ticket instanceof TicketCar) {
                TicketCar tc = (TicketCar) ticket;
                output += "- " + tc.getDriver().toString() + "\n";
                for (HumanName hn : tc.getPassengers()) {
                    output += "- " + hn.toString() + "\n";
                }

            } else if (ticket instanceof TicketBike) {
                TicketBike tb = (TicketBike) ticket;
                output += "- " + tb.getPassenger().toString() + "\n";
            } else {
                TicketPassenger tp = (TicketPassenger) ticket;
                output += "- " + tp.getPassenger().toString() + "\n";
            }
        }
        return output;
    }
}

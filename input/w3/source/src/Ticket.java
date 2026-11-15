import java.util.Objects;

abstract class Ticket {
    private final InfoTravel departure;
    private final InfoTravel arrival;
    private final int price;

    /**
     * Stores a singular ticket's information.
     * @param departure InfoTravel of the departure city, date, time.
     * @param arrival InfoTravel of the arrival city, date, time.
     * @param price of the ferry.
     */
    public Ticket(InfoTravel departure, InfoTravel arrival, int price) {
        this.departure = departure;
        this.arrival = arrival;
        this.price = price;
    }

    public InfoTravel getDeparture() {
        return departure;
    }

    public InfoTravel getArrival() {
        return arrival;
    }

    public int getPrice() {
        return price;
    }

    @Override
    public boolean equals(Object o) {
        if (o == null || getClass() != o.getClass()) return false;
        Ticket ticket = (Ticket) o;
        return getPrice() == ticket.getPrice()
                && Objects.equals(getDeparture(), ticket.getDeparture())
                && Objects.equals(getArrival(), ticket.getArrival());
    }

    @Override
    public int hashCode() {
        return Objects.hash(getDeparture(), getArrival(), getPrice());
    }

    @Override
    public String toString() {
        return "for the route " + getDeparture().location() + " -> "
                + getArrival().location() + " on " + getDeparture().date() + ".\n"
                + "Departure is scheduled for " + getDeparture().time()
                + ". Arrival is scheduled for " + getArrival().date() + ".\n";

    }
}

import java.util.Objects;

public class TicketBike extends Ticket {
    private final HumanName passenger;

    /**
     * Stores a singular ticket's information for bike type.
     * @param departure InfoTravel of the departure city, date, time.
     * @param arrival InfoTravel of the arrival city, date, time.
     * @param price of the ferry.
     */
    public TicketBike(InfoTravel departure, InfoTravel arrival, int price, HumanName passenger) {
        super(departure, arrival, price);
        this.passenger = passenger;
    }

    public HumanName getPassenger() {
        return passenger;
    }

    @Override
    public boolean equals(Object o) {
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        TicketBike that = (TicketBike) o;
        return Objects.equals(getPassenger(), that.getPassenger());
    }

    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), getPassenger());
    }

    @Override
    public String toString() {
        return "A BIKE TICKET for passenger " + getPassenger() + " " + super.toString();
    }
}
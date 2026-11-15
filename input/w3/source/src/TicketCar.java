import java.util.ArrayList;
import java.util.Objects;

public class TicketCar extends Ticket {
    private final String carLength;
    private final HumanName driver;
    private final ArrayList<HumanName> passengers;

    /**
     * Stores a singular ticket's information for bike type.
     * @param departure InfoTravel of the departure city, date, time.
     * @param arrival InfoTravel of the arrival city, date, time.
     * @param price of the ferry.
     * @param carLength distance from the front to back in meters.
     * @param driver HumanName of the driver.
     * @param passengers List of HumanName of everyone else
     */
    public TicketCar(InfoTravel departure, InfoTravel arrival, int price, String carLength,
                     HumanName driver, ArrayList<HumanName> passengers) {
        super(departure, arrival, price);
        this.carLength = carLength;
        this.driver = driver;
        this.passengers = passengers;
    }

    public String getCarLength() {
        return carLength;
    }

    public HumanName getDriver() {
        return driver;
    }

    public ArrayList<HumanName> getPassengers() {
        return passengers;
    }

    @Override
    public boolean equals(Object o) {
        if (o == null || getClass() != o.getClass()) return false;
        if (!super.equals(o)) return false;
        TicketCar ticketCar = (TicketCar) o;
        return Objects.equals(getCarLength(), ticketCar.getCarLength())
                && Objects.equals(getDriver(), ticketCar.getDriver())
                && Objects.equals(getPassengers(), ticketCar.getPassengers());
    }

    @Override
    public int hashCode() {
        return Objects.hash(super.hashCode(), getCarLength(), getDriver(), getPassengers());
    }

    @Override
    public String toString() {
        return "A CAR TICKET for passenger " + getDriver() + " (driver) " + super.toString()
                + "Additional passengers are: " + getPassengers().toString() + ".\n";
    }
}

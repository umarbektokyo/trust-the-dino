public record HumanName(String lastName, String firstName) {
    @Override
    public String toString() {
        return firstName() + " " + lastName();
    }
}

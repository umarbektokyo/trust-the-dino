# REQ-W3: Option 3 runs in a thread

Owner of the request: Team Terminal. Repo: Waddenislands (Java terminal app for a ferry company).

Option 3 of the menu asks for a departure and an arrival city and prints the total value of all
tickets on that route (routes are one-way), e.g.
`All tickets in the database for the route Terschelling -> Vlieland combined are worth 155 euros.`

The ticket database will grow during the tourist season, and tickets must stay available while
Option 3 runs. Run the Option 3 calculation in a separate thread.

Non-functional: the printed message and the other menu options are unchanged; option 5 still stops
the program.

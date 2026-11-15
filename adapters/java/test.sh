#!/bin/sh
# Java adapter unit tests, with the same java the adapter uses.
cd "$(dirname "$0")"
J=${JAVA_HOME:-/opt/homebrew/opt/openjdk}
if [ -x "$J/bin/java" ]; then JAVA="$J/bin/java"; else JAVA=java; fi
exec "$JAVA" GraphTest.java

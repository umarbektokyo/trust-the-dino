#!/bin/sh
# Java adapter launcher: java Graph.java <dir>, with $JAVA_HOME, else Homebrew's openjdk, else java on PATH.
J=${JAVA_HOME:-/opt/homebrew/opt/openjdk}
if [ -x "$J/bin/java" ]; then JAVA="$J/bin/java"; else JAVA=java; fi
exec "$JAVA" "$(dirname "$0")/Graph.java" "$@"

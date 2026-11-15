#!/bin/sh
# Every unit test: Go adapter + Python core.
set -e
cd "$(dirname "$0")"
(cd adapters/go && go test ./...)
python3 -m unittest discover -s tests -t . -q
sh adapters/java/test.sh

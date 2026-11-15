#!/bin/sh
# Rebuild the sample repositories. ./samples.sh [vault] [wadden]   (default: both)
set -e
cd "$(dirname "$0")"
want() { [ $# -eq 0 ] || case " $ARGS " in *" $1 "*) return 0;; *) return 1;; esac; }
ARGS="$*"

if [ -z "$ARGS" ] || want vault; then
# Rebuild samples/vault: upstream main + the agent branches for REQ-V7 (and its fix), REQ-V8 and REQ-V9.
[ -d samples/vault ] || git clone -q https://github.com/umarbektokyo/vault samples/vault
cd samples/vault
git checkout -q 18ffa2d -B main
git branch -q -D agent/req-v7-glob 2>/dev/null || true
git checkout -q -b agent/req-v7-glob
git -c user.name=vault-agent -c user.email=agent@example.invalid am -q --committer-date-is-author-date ../../input/v7/agent.patch
git -c user.name=vault-agent -c user.email=agent@example.invalid am -q --committer-date-is-author-date ../../input/v7b/agent.patch
git checkout -q main
git branch -q -D agent/req-v8-preview-size 2>/dev/null || true
git checkout -q -b agent/req-v8-preview-size
git -c user.name=vault-agent -c user.email=agent@example.invalid am -q --committer-date-is-author-date ../../input/v8/agent.patch
git checkout -q main
git branch -q -D agent/req-v9-sort 2>/dev/null || true
git checkout -q -b agent/req-v9-sort
git -c user.name=vault-agent -c user.email=agent@example.invalid am -q --committer-date-is-author-date ../../input/v9/agent.patch
git checkout -q main
echo "samples/vault: main + agent/req-v7-glob + agent/req-v8-preview-size + agent/req-v9-sort"
cd ../..
fi

if [ -z "$ARGS" ] || want wadden; then

# Rebuild samples/wadden: Waddenislands (human-written) on main + the agent branch for REQ-W3.
rm -rf samples/wadden
mkdir -p samples/wadden
W=input/w3/source  # the human-written code, vendored
cp -r $W/src $W/tests $W/resources $W/checkstyle.xml samples/wadden/
cd samples/wadden
export GIT_AUTHOR_DATE="2026-11-14T10:00:00Z" GIT_COMMITTER_DATE="2026-11-14T10:00:00Z"
g() { git -c user.name="Wadden Team" -c user.email=team@example.invalid "$@"; }
g init -q -b main
g add -A && g commit -qm "Waddenislands ferry ticket terminal"
g checkout -q -b agent/req-w3
git apply ../../input/w3/agent.patch
export GIT_AUTHOR_DATE="2026-11-15T09:30:00Z" GIT_COMMITTER_DATE="2026-11-15T09:30:00Z"
g add -A && g -c user.name=wadden-agent -c user.email=agent@example.invalid commit -qm "REQ-W3: run Option 3 turnover in a thread"
g checkout -q main
echo "samples/wadden: main + agent/req-w3"
fi

#!/usr/bin/env bash
# Update dependencies across every template in this repo.
#
# Usage: scripts/update-deps.sh [--minor] [--dry-run] [--only npm|bun|maven]...
#   --minor    only minor/patch bumps (same policy as dependabot groups)
#   --dry-run  show what would change, write nothing
#   --only X   limit to one ecosystem (repeatable)
#
# Docker / compose image tags are not touched; dependabot handles those.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=latest
DRY=0
ONLY=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --minor) TARGET=minor ;;
    --dry-run) DRY=1 ;;
    --only) ONLY+=("${2:?--only needs a value}"); shift ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

want() { [[ ${#ONLY[@]} -eq 0 ]] || [[ " ${ONLY[*]} " == *" $1 "* ]]; }
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "missing required tool: $1" >&2; exit 1; }; }

FAILED=()
run() { # run <label> <dir> <cmd...>; keep going on failure, report at end
  local label=$1 dir=$2; shift 2
  if ! (cd "$dir" && "$@"); then FAILED+=("$label"); fi
}

ncu_args=(--target "$TARGET")
[[ $DRY -eq 0 ]] && ncu_args+=(-u)

# express-ts: plain npm projects with package-lock.json
if want npm; then
  need npx
  for dir in "$ROOT"/express-ts/*/; do
    [[ -f "$dir/package.json" ]] || continue
    log "npm: ${dir#"$ROOT"/}"
    if [[ $DRY -eq 1 ]]; then
      run "npm:$dir" "$dir" npx --yes npm-check-updates "${ncu_args[@]}"
    else
      run "npm:$dir" "$dir" bash -c 'npx --yes npm-check-updates "$@" && npm install' _ "${ncu_args[@]}"
    fi
  done
fi

# bevd: bun workspaces (root + backend + frontend), single bun.lock at root
if want bun; then
  need bun
  for dir in "$ROOT"/bevd/*/; do
    [[ -f "$dir/bun.lock" ]] || continue
    log "bun: ${dir#"$ROOT"/}"
    if [[ $DRY -eq 1 ]]; then
      run "bun:$dir" "$dir" bunx npm-check-updates "${ncu_args[@]}" --workspaces --root
    else
      run "bun:$dir" "$dir" bash -c 'bunx npm-check-updates "$@" --workspaces --root && bun install' _ "${ncu_args[@]}"
    fi
  done
fi

# Spring Boot: maven via the wrapper (parent, properties, plain deps)
if want maven; then
  while IFS= read -r pom; do
    dir=$(dirname "$pom")
    log "maven: ${dir#"$ROOT"/}"
    mvn=(./mvnw -B); [[ -x "$dir/mvnw" ]] || { need mvn; mvn=(mvn -B); }
    allow=$([[ $TARGET == minor ]] && echo false || echo true)
    if [[ $DRY -eq 1 ]]; then
      run "maven:$dir" "$dir" "${mvn[@]}" versions:display-parent-updates \
        versions:display-property-updates versions:display-dependency-updates \
        -DallowMajorUpdates="$allow"
    else
      run "maven:$dir" "$dir" "${mvn[@]}" -q versions:update-parent versions:update-properties \
        versions:use-latest-releases -DallowMajorUpdates="$allow" -DgenerateBackupPoms=false
    fi
  done < <(find "$ROOT/java" -name pom.xml -not -path '*/target/*')
fi

echo
if [[ ${#FAILED[@]} -gt 0 ]]; then
  printf '\033[1;31mFailed:\033[0m\n'; printf '  %s\n' "${FAILED[@]}"; exit 1
fi
echo "Done. Review with: git diff --stat, then run each template's tests."

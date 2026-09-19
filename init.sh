#!/usr/bin/env bash
# Standard non-interactive local-environment setup entry point for this repository.
# It installs declared dependencies only; it does not start services, run migrations,
# modify environment files, or execute tests.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required to set up $2." >&2
    return 1
  fi
}

install_node_dependencies() {
  local directory="$1"
  local package_manager="npm"
  local install_command=(npm install)

  if [ -f "$directory/pnpm-lock.yaml" ]; then
    package_manager="pnpm"
    install_command=(pnpm install --frozen-lockfile)
  elif [ -f "$directory/yarn.lock" ]; then
    package_manager="yarn"
    install_command=(yarn install --immutable)
  elif [ -f "$directory/bun.lock" ] || [ -f "$directory/bun.lockb" ]; then
    package_manager="bun"
    install_command=(bun install --frozen-lockfile)
  elif [ -f "$directory/package-lock.json" ]; then
    install_command=(npm ci)
  fi

  require_command "$package_manager" "$directory"
  echo "==> Installing Node dependencies in $directory ($package_manager)"
  (cd "$directory" && "${install_command[@]}")
}

install_python_dependencies() {
  local directory="$1"
  local python_bin
  python_bin="$(command -v python3 || command -v python || true)"

  if [ -z "$python_bin" ]; then
    echo "Error: Python 3 is required to set up $directory." >&2
    return 1
  fi

  echo "==> Creating or reusing virtual environment in $directory/.venv"
  "$python_bin" -m venv "$directory/.venv"

  echo "==> Installing Python dependencies in $directory"
  if [ -f "$directory/requirements.txt" ]; then
    "$directory/.venv/bin/python" -m pip install -r "$directory/requirements.txt"
  fi
  if [ -f "$directory/pyproject.toml" ]; then
    "$directory/.venv/bin/python" -m pip install -e "$directory"
  fi
}

found=0
for directory in web frontend client backend api server; do
  [ -d "$directory" ] || continue

  if [ -f "$directory/package.json" ]; then
    install_node_dependencies "$directory"
    found=1
  elif [ -f "$directory/pyproject.toml" ] || [ -f "$directory/requirements.txt" ]; then
    install_python_dependencies "$directory"
    found=1
  fi
done

if [ "$found" -eq 0 ]; then
  echo "==> No application manifests found yet. Expected web/ and backend/ (or frontend/, client/, api/, server/)."
fi

echo "==> Environment setup complete"

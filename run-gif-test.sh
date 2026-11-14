#!/bin/bash
set -eu

repo_dir=$(cd -- "$(dirname -- "$0")" && pwd)
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/gif-copy-test.XXXXXX")
trap 'rm -rf -- "$build_dir"' EXIT

swiftc -parse-as-library -module-cache-path "$build_dir/cache" \
    "$repo_dir/GifCopyTest.swift" -o "$build_dir/GifCopyTest"
"$build_dir/GifCopyTest" "$repo_dir/fixtures/123.gif" "$@"

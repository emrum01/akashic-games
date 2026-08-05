#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_cname='games.escape-safari.com'
readonly expected_routes=(
  blessing-alert
  bookcafe-3d
  broken-web
  last-stitch
  notification-gale
  sic
  still-thread
  three-forward-two-back
  zoo-escape
)

artifact_arg=''
pages_arg=''
check_only=false

die() {
  printf 'publish-pages: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: pages/publish-site.sh --artifact ARTIFACT_DIR --pages-root GH_PAGES_DIR [--check-only]

Verify an additive-only legacy Pages publication and, unless --check-only is set,
copy only validated artifact files into the checked-out gh-pages worktree.
EOF
}

while (($# > 0)); do
  case "$1" in
    --artifact)
      (($# >= 2)) || die "--artifact requires a directory"
      artifact_arg="$2"
      shift 2
      ;;
    --pages-root)
      (($# >= 2)) || die "--pages-root requires a directory"
      pages_arg="$2"
      shift 2
      ;;
    --check-only)
      check_only=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ -n "$artifact_arg" ]] || die "--artifact is required"
[[ -n "$pages_arg" ]] || die "--pages-root is required"

canonical_dir() {
  local path="$1"
  [[ "$path" == /* ]] || die "paths must be absolute: $path"
  [[ -d "$path" ]] || die "directory does not exist: $path"
  (cd -- "$path" && pwd -P)
}

artifact_dir="$(canonical_dir "$artifact_arg")"
pages_dir="$(canonical_dir "$pages_arg")"
[[ "$artifact_dir" != "$pages_dir" ]] || die "artifact and gh-pages directories must differ"
case "$artifact_dir/" in
  "$pages_dir/"*) die "artifact must not be inside the gh-pages directory" ;;
esac
case "$pages_dir/" in
  "$artifact_dir/"*) die "gh-pages directory must not be inside the artifact" ;;
esac

is_safe_relative_path() {
  local path="$1"
  [[ -n "$path" ]] || return 1
  [[ "$path" != /* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || return 1
  case "/$path/" in
    */../*|*/./*|*//* ) return 1 ;;
  esac
}

reject_symlinks() {
  local root="$1"
  local symlink
  symlink="$(find -P "$root" -mindepth 1 ! -path "$root/.git" ! -path "$root/.git/*" -type l -print -quit)"
  [[ -z "$symlink" ]] || die "symlinks are not publishable: $symlink"
}

reject_symlinks "$artifact_dir"
reject_symlinks "$pages_dir"
[[ ! -e "$artifact_dir/.git" && ! -L "$artifact_dir/.git" ]] ||
  die "artifact must not contain .git"

[[ -f "$artifact_dir/CNAME" ]] || die "artifact is missing CNAME"
[[ "$(wc -c < "$artifact_dir/CNAME")" -eq "${#expected_cname}" ]] ||
  die "artifact CNAME must have no trailing newline"
cmp -s <(printf '%s' "$expected_cname") "$artifact_dir/CNAME" ||
  die "artifact CNAME must be exactly $expected_cname"
[[ -f "$artifact_dir/.nojekyll" ]] || die "artifact is missing .nojekyll"
[[ ! -s "$artifact_dir/.nojekyll" ]] || die "artifact .nojekyll must be empty"

required_files=(index.html robots.txt CNAME .nojekyll)
for route in "${expected_routes[@]}"; do
  required_files+=("$route/index.html")
done
for relative_path in "${required_files[@]}"; do
  is_safe_relative_path "$relative_path" || die "unsafe required path: $relative_path"
  [[ -f "$artifact_dir/$relative_path" ]] || die "artifact is missing required file: $relative_path"
done

compare_existing_files() {
  local current_file relative_path artifact_file
  while IFS= read -r -d '' current_file; do
    relative_path="${current_file#"$pages_dir/"}"
    is_safe_relative_path "$relative_path" || die "unsafe existing path: $relative_path"
    artifact_file="$artifact_dir/$relative_path"
    [[ -f "$artifact_file" && ! -L "$artifact_file" ]] ||
      die "existing public file was deleted from the artifact: $relative_path"
    cmp -s "$current_file" "$artifact_file" ||
      die "existing public file changed in the artifact: $relative_path"
  done < <(
    find -P "$pages_dir" -mindepth 1 \
      ! -path "$pages_dir/.git" ! -path "$pages_dir/.git/*" \
      -type f -print0
  )
}

copy_new_files() {
  local artifact_file relative_path destination destination_parent
  while IFS= read -r -d '' artifact_file; do
    relative_path="${artifact_file#"$artifact_dir/"}"
    is_safe_relative_path "$relative_path" || die "unsafe artifact path: $relative_path"
    destination="$pages_dir/$relative_path"
    if [[ -e "$destination" || -L "$destination" ]]; then
      [[ -f "$destination" && ! -L "$destination" ]] ||
        die "artifact path conflicts with an existing non-file: $relative_path"
      cmp -s "$artifact_file" "$destination" ||
        die "artifact would change an existing public file: $relative_path"
      continue
    fi
    destination_parent="${destination%/*}"
    mkdir -p -- "$destination_parent"
    cp -p -- "$artifact_file" "$destination"
  done < <(
    find -P "$artifact_dir" -mindepth 1 \
      ! -path "$artifact_dir/.git" ! -path "$artifact_dir/.git/*" \
      -type f -print0
  )
}

compare_existing_files
if [[ "$check_only" == true ]]; then
  printf 'publish-pages: additive-only verification passed for %s\n' "$pages_dir"
  exit 0
fi

copy_new_files
printf 'publish-pages: additive-only publication assembled at %s\n' "$pages_dir"

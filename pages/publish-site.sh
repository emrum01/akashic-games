#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly expected_cname='games.escape-safari.com'
readonly expected_routes=(
  blessing-alert
  bookcafe-3d
  broken-web
  kobako
  last-stitch
  notification-gale
  sic
  still-thread
  three-forward-two-back
  zoo-escape
)

artifact_arg=''
pages_arg=''
reviewed_update_arg=''
source_repo_arg=''
check_only=false

die() {
  printf 'publish-pages: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: pages/publish-site.sh --artifact ARTIFACT_DIR --pages-root GH_PAGES_DIR [--check-only]
       [--reviewed-update RECEIPT --source-repo SOURCE_REPO]

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
    --reviewed-update)
      (($# >= 2)) || die "--reviewed-update requires a receipt"
      reviewed_update_arg="$2"
      shift 2
      ;;
    --source-repo)
      (($# >= 2)) || die "--source-repo requires a repository directory"
      source_repo_arg="$2"
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
if [[ -n "$reviewed_update_arg" && -z "$source_repo_arg" ]] ||
   [[ -z "$reviewed_update_arg" && -n "$source_repo_arg" ]]; then
  die "--reviewed-update and --source-repo must be supplied together"
fi

canonical_dir() {
  local path="$1"
  [[ "$path" == /* ]] || die "paths must be absolute: $path"
  [[ -d "$path" ]] || die "directory does not exist: $path"
  (cd -- "$path" && pwd -P)
}

artifact_dir="$(canonical_dir "$artifact_arg")"
pages_dir="$(canonical_dir "$pages_arg")"
source_repo_dir=''
if [[ -n "$source_repo_arg" ]]; then
  source_repo_dir="$(canonical_dir "$source_repo_arg")"
fi
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

reject_hardlinks() {
  local root="$1"
  local hardlink
  hardlink="$(find -P "$root" -mindepth 1 ! -path "$root/.git" ! -path "$root/.git/*" \
    -type f -links +1 -print -quit)"
  [[ -z "$hardlink" ]] || die "hard-linked files are not publishable: $hardlink"
}

reject_symlinks "$artifact_dir"
reject_symlinks "$pages_dir"
reject_hardlinks "$artifact_dir"
reject_hardlinks "$pages_dir"
[[ ! -e "$artifact_dir/.git" && ! -L "$artifact_dir/.git" ]] ||
  die "artifact must not contain .git"

reviewed_paths=()
reviewed_old_sha=()
reviewed_old_bytes=()
reviewed_new_sha=()
reviewed_new_bytes=()
reviewed_artifact_mode=''
reviewed_live_mode=''

reviewed_index() {
  [[ "${#reviewed_paths[@]}" -eq 2 ]] || return 1
  case "$1" in
    last-stitch/game.js) printf '0' ;;
    last-stitch/index.html) printf '1' ;;
    *) return 1 ;;
  esac
}

file_sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

file_bytes() {
  wc -c < "$1" | tr -d '[:space:]'
}

reviewed_file_state() {
  local path="$1"
  local file="$2"
  local index="$3"
  local actual_sha actual_bytes
  actual_sha="$(file_sha256 "$file")" || return 2
  actual_bytes="$(file_bytes "$file")" || return 2
  if [[ "$actual_sha" == "${reviewed_old_sha[$index]}" &&
        "$actual_bytes" == "${reviewed_old_bytes[$index]}" ]]; then
    printf 'old'
  elif [[ "$actual_sha" == "${reviewed_new_sha[$index]}" &&
          "$actual_bytes" == "${reviewed_new_bytes[$index]}" ]]; then
    printf 'new'
  else
    printf 'unknown'
  fi
}

if [[ -n "$reviewed_update_arg" ]]; then
  reviewed_rows="$(python3 "$script_dir/reviewed_update.py" \
    --receipt "$reviewed_update_arg" --baseline-repo "$pages_dir" \
    --source-repo "$source_repo_dir" --artifact "$artifact_dir")" ||
    die "reviewed update receipt or Git objects failed validation"
  while IFS=$'\t' read -r path old_sha old_bytes new_sha new_bytes; do
    [[ -n "$path" ]] || continue
    is_safe_relative_path "$path" || die "unsafe reviewed update path: $path"
    case "$path" in
      last-stitch/game.js|last-stitch/index.html) ;;
      *) die "reviewed update path is not in the exact allowlist: $path" ;;
    esac
    reviewed_paths+=("$path")
    reviewed_old_sha+=("$old_sha")
    reviewed_old_bytes+=("$old_bytes")
    reviewed_new_sha+=("$new_sha")
    reviewed_new_bytes+=("$new_bytes")
  done <<< "$reviewed_rows"
  [[ "${#reviewed_paths[@]}" -eq 2 ]] || die "reviewed receipt did not return exactly two updates"
  [[ "${reviewed_paths[0]}" == 'last-stitch/game.js' &&
     "${reviewed_paths[1]}" == 'last-stitch/index.html' ]] ||
    die "reviewed update paths are not in the exact order"

  for index in 0 1; do
    path="${reviewed_paths[$index]}"
    artifact_file="$artifact_dir/$path"
    pages_file="$pages_dir/$path"
    [[ -f "$artifact_file" && ! -L "$artifact_file" ]] ||
      die "reviewed artifact file is missing or not regular: $path"
    [[ -f "$pages_file" && ! -L "$pages_file" ]] ||
      die "reviewed live file is missing or not regular: $path"
    artifact_state="$(reviewed_file_state "$path" "$artifact_file" "$index")" ||
      die "could not hash reviewed artifact file: $path"
    live_state="$(reviewed_file_state "$path" "$pages_file" "$index")" ||
      die "could not hash reviewed live file: $path"
    [[ "$artifact_state" != unknown ]] ||
      die "reviewed artifact bytes are neither old nor new: $path"
    [[ "$live_state" != unknown ]] ||
      die "reviewed live bytes are neither old nor new: $path"
    if [[ -z "$reviewed_artifact_mode" ]]; then
      reviewed_artifact_mode="$artifact_state"
      reviewed_live_mode="$live_state"
    else
      [[ "$reviewed_artifact_mode" == "$artifact_state" ]] ||
        die "reviewed artifact contains a mixed old/new state"
      [[ "$reviewed_live_mode" == "$live_state" ]] ||
        die "reviewed live tree contains a mixed old/new state"
    fi
  done
  if [[ "$reviewed_artifact_mode" == old && "$reviewed_live_mode" == new ]]; then
    die "reviewed update would downgrade the live public files"
  fi
fi

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
  local current_file relative_path artifact_file index artifact_state live_state
  while IFS= read -r -d '' current_file; do
    relative_path="${current_file#"$pages_dir/"}"
    is_safe_relative_path "$relative_path" || die "unsafe existing path: $relative_path"
    artifact_file="$artifact_dir/$relative_path"
    [[ -f "$artifact_file" && ! -L "$artifact_file" ]] ||
      die "existing public file was deleted from the artifact: $relative_path"
    if index="$(reviewed_index "$relative_path" 2>/dev/null)"; then
      artifact_state="$(reviewed_file_state "$relative_path" "$artifact_file" "$index")" ||
        die "could not hash reviewed artifact file: $relative_path"
      live_state="$(reviewed_file_state "$relative_path" "$current_file" "$index")" ||
        die "could not hash reviewed live file: $relative_path"
      if [[ "$artifact_state" == old && "$live_state" == new ]]; then
        die "reviewed update would downgrade the live public file: $relative_path"
      fi
      [[ "$artifact_state" != unknown && "$live_state" != unknown ]] ||
        die "reviewed public file bytes are neither old nor new: $relative_path"
      continue
    fi
    cmp -s "$current_file" "$artifact_file" ||
      die "existing public file changed in the artifact: $relative_path"
  done < <(
    find -P "$pages_dir" -mindepth 1 \
      ! -path "$pages_dir/.git" ! -path "$pages_dir/.git/*" \
      -type f -print0
  )
}

preflight_copy_files() {
  local artifact_file relative_path destination destination_parent index
  local artifact_state live_state parent
  while IFS= read -r -d '' artifact_file; do
    relative_path="${artifact_file#"$artifact_dir/"}"
    is_safe_relative_path "$relative_path" || die "unsafe artifact path: $relative_path"
    destination="$pages_dir/$relative_path"
    if [[ -e "$destination" || -L "$destination" ]]; then
      [[ -f "$destination" && ! -L "$destination" ]] ||
        die "artifact path conflicts with an existing non-file: $relative_path"
      if index="$(reviewed_index "$relative_path" 2>/dev/null)"; then
        artifact_state="$(reviewed_file_state "$relative_path" "$artifact_file" "$index")" ||
          die "could not hash reviewed artifact file: $relative_path"
        live_state="$(reviewed_file_state "$relative_path" "$destination" "$index")" ||
          die "could not hash reviewed live file: $relative_path"
        [[ "$artifact_state" != unknown && "$live_state" != unknown ]] ||
          die "reviewed public file bytes are neither old nor new: $relative_path"
        [[ "$artifact_state" != old || "$live_state" != new ]] ||
          die "reviewed update would downgrade the live public file: $relative_path"
      else
        cmp -s "$artifact_file" "$destination" ||
          die "artifact would change an existing public file: $relative_path"
      fi
      continue
    fi

    parent="${destination%/*}"
    while [[ "$parent" != "$pages_dir" ]]; do
      if [[ -e "$parent" || -L "$parent" ]]; then
        [[ -d "$parent" && ! -L "$parent" ]] ||
          die "artifact parent conflicts with an existing non-directory: $relative_path"
      fi
      [[ "$parent" == */* ]] || break
      parent="${parent%/*}"
    done
  done < <(
    find -P "$artifact_dir" -mindepth 1 \
      ! -path "$artifact_dir/.git" ! -path "$artifact_dir/.git/*" \
      -type f -print0
  )
}

copy_new_files() {
  local artifact_file relative_path destination destination_parent index artifact_state live_state
  while IFS= read -r -d '' artifact_file; do
    relative_path="${artifact_file#"$artifact_dir/"}"
    is_safe_relative_path "$relative_path" || die "unsafe artifact path: $relative_path"
    destination="$pages_dir/$relative_path"
    if [[ -e "$destination" || -L "$destination" ]]; then
      [[ -f "$destination" && ! -L "$destination" ]] ||
        die "artifact path conflicts with an existing non-file: $relative_path"
      if index="$(reviewed_index "$relative_path" 2>/dev/null)"; then
        artifact_state="$(reviewed_file_state "$relative_path" "$artifact_file" "$index")" ||
          die "could not hash reviewed artifact file: $relative_path"
        live_state="$(reviewed_file_state "$relative_path" "$destination" "$index")" ||
          die "could not hash reviewed live file: $relative_path"
        if [[ "$artifact_state" == new && "$live_state" == old ]]; then
          cp -p -- "$artifact_file" "$destination"
        elif [[ "$artifact_state" == "$live_state" ]]; then
          continue
        else
          die "reviewed public update state changed after preflight: $relative_path"
        fi
        continue
      fi
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
preflight_copy_files
if [[ "$check_only" == true ]]; then
  if [[ -n "$reviewed_update_arg" ]]; then
    printf 'publish-pages: additive-only verification passed for %s (reviewed update state %s/%s)\n' \
      "$pages_dir" "$reviewed_live_mode" "$reviewed_artifact_mode"
  else
    printf 'publish-pages: additive-only verification passed for %s\n' "$pages_dir"
  fi
  exit 0
fi

copy_new_files
if [[ -n "$reviewed_update_arg" ]]; then
  printf 'publish-pages: additive-only publication assembled at %s (reviewed update state %s/%s)\n' \
    "$pages_dir" "$reviewed_live_mode" "$reviewed_artifact_mode"
else
  printf 'publish-pages: additive-only publication assembled at %s\n' "$pages_dir"
fi

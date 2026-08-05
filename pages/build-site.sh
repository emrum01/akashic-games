#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly default_source_root="$(cd -- "$script_dir/.." && pwd)"

source_root="$default_source_root"
manifest_path="$default_source_root/pages/legacy-routes.json"
output_arg="_site"

die() {
  printf 'build-pages: error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: pages/build-site.sh [OUTPUT_DIR]
       pages/build-site.sh [--output OUTPUT_DIR] [--source-root DIR] [--manifest FILE]

Build and verify the legacy GitHub Pages artifact from pages/legacy-routes.json.
EOF
}

while (($# > 0)); do
  case "$1" in
    --output)
      (($# >= 2)) || die "--output requires a directory"
      output_arg="$2"
      shift 2
      ;;
    --source-root)
      (($# >= 2)) || die "--source-root requires a directory"
      source_root="$2"
      shift 2
      ;;
    --manifest)
      (($# >= 2)) || die "--manifest requires a file"
      manifest_path="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      [[ "$output_arg" == "_site" ]] || die "output directory was specified more than once"
      output_arg="$1"
      shift
      ;;
  esac
done

resolve_from_cwd() {
  local path="$1"
  if [[ "$path" == /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$PWD" "$path"
  fi
}

if [[ "$source_root" != /* ]]; then
  source_root="$(resolve_from_cwd "$source_root")"
fi
if [[ "$manifest_path" != /* ]]; then
  manifest_path="$(resolve_from_cwd "$manifest_path")"
fi
output_arg="$(resolve_from_cwd "$output_arg")"

[[ -d "$source_root" ]] || die "source root does not exist: $source_root"
[[ -f "$manifest_path" ]] || die "route registry does not exist: $manifest_path"
command -v jq >/dev/null 2>&1 || die "jq is required to validate legacy-routes.json"
command -v rsync >/dev/null 2>&1 || die "rsync is required to assemble the Pages artifact"

if ! jq -e '
  def safe_relative_path:
    (type == "string")
    and (length > 0)
    and (startswith("/") | not)
    and (contains("\\") | not)
    and (contains("\u0000") | not)
    and (split("/") | all(.[]; . != "" and . != "." and . != ".."));

  type == "object"
  and ((keys | sort) == ["root", "routes", "schemaVersion"])
  and (.schemaVersion == 1)
  and (.root | type == "object")
  and ((.root | keys | sort) == ["destination", "source"])
  and (.root.source == "pages/index.html")
  and (.root.destination == "index.html")
  and (.root.source | safe_relative_path)
  and (.root.destination | safe_relative_path)
  and (.routes | type == "array" and length == 9)
  and (([.routes[].id] | unique | length) == (.routes | length))
  and (([.routes[].sourceDirectory] | unique | length) == (.routes | length))
  and (([.routes[].id] | sort) == [
    "blessing-alert",
    "bookcafe-3d",
    "broken-web",
    "last-stitch",
    "notification-gale",
    "sic",
    "still-thread",
    "three-forward-two-back",
    "zoo-escape"
  ])
  and all(.routes[];
    type == "object"
    and ((keys | sort) == ["copyMode", "exclude", "id", "sourceDirectory", "sourceEntry"])
    and (.id | type == "string" and test("^[a-z0-9]+(?:-[a-z0-9]+)*$"))
    and (.sourceDirectory == .id)
    and (.sourceEntry | safe_relative_path)
    and (.exclude | type == "array" and all(.[];
      type == "string"
      and length > 0
      and (startswith("/") | not)
      and (contains("\\") | not)
      and (contains("\u0000") | not)
    ))
    and (.copyMode == "rsync" or .copyMode == "follow-symlinks")
  )
' "$manifest_path" >/dev/null; then
  die "invalid legacy route registry (schema, IDs, entries, paths, or duplicates): $manifest_path"
fi

safe_path_for_shell() {
  local value="$1"
  [[ -n "$value" ]] || return 1
  [[ "$value" != /* ]] || return 1
  [[ "$value" != *\\* ]] || return 1
  [[ "$value" != *$'\n'* && "$value" != *$'\r' ]] || return 1
  case "/$value/" in
    */../*|*/./* ) return 1 ;;
  esac
}

safe_rsync_pattern() {
  local value="$1"
  local normalized="$value"
  [[ -n "$value" ]] || return 1
  [[ "$value" != /* ]] || return 1
  [[ "$value" != *\\* ]] || return 1
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  case "$value" in
    *'//'*) return 1 ;;
  esac
  [[ "$normalized" != */ ]] || normalized="${normalized%/}"
  case "/$normalized/" in
    */../*|*/./*|*//* ) return 1 ;;
  esac
}

root_source="$(jq -er '.root.source' "$manifest_path")"
root_destination="$(jq -er '.root.destination' "$manifest_path")"
safe_path_for_shell "$root_source" || die "unsafe root source path: $root_source"
safe_path_for_shell "$root_destination" || die "unsafe root destination path: $root_destination"

root_source_path="$source_root/$root_source"
[[ -f "$root_source_path" ]] || die "root source is missing: $root_source"

for required_root_file in pages/robots.txt pages/CNAME pages/.nojekyll; do
  [[ -f "$source_root/$required_root_file" ]] || die "required root file is missing: $required_root_file"
done

readonly expected_cname='games.escape-safari.com'
[[ "$(wc -c < "$source_root/pages/CNAME")" -eq "${#expected_cname}" ]] ||
  die "pages/CNAME must contain the exact custom domain without a trailing newline"
cmp -s <(printf '%s' "$expected_cname") "$source_root/pages/CNAME" ||
  die "pages/CNAME must be exactly $expected_cname"
[[ ! -s "$source_root/pages/.nojekyll" ]] || die "pages/.nojekyll must be empty"

route_count="$(jq -er '.routes | length' "$manifest_path")"
[[ "$route_count" == "9" ]] || die "legacy route registry must contain exactly nine routes"

while IFS= read -r route_json; do
  route_id="$(jq -er '.id' <<<"$route_json")"
  route_source_directory="$(jq -er '.sourceDirectory' <<<"$route_json")"
  route_source_entry="$(jq -er '.sourceEntry' <<<"$route_json")"
  safe_path_for_shell "$route_source_directory" || die "$route_id: unsafe source directory path"
  safe_path_for_shell "$route_source_entry" || die "$route_id: unsafe source entry path"

  route_source="$source_root/$route_source_directory"
  [[ -d "$route_source" ]] || die "$route_id: source directory is missing: $route_source_directory"
  [[ -f "$route_source/$route_source_entry" ]] || die "$route_id: source entry is missing: $route_source_entry"
  if [[ "$route_source_entry" != "index.html" && -e "$route_source/index.html" ]]; then
    die "$route_id: source directory already contains index.html alongside sourceEntry $route_source_entry"
  fi

  if [[ "$output_arg" == "$route_source" || "$output_arg" == "$route_source/"* ]]; then
    die "$route_id: output directory would overwrite the source directory"
  fi
done < <(jq -c '.routes[]' "$manifest_path")

if [[ -L "$output_arg" || (-e "$output_arg" && ! -d "$output_arg") ]]; then
  die "output path must be a directory: $output_arg"
fi
mkdir -p -- "$output_arg"
find "$output_arg" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

cp -- "$root_source_path" "$output_arg/$root_destination"
cp -- "$source_root/pages/robots.txt" "$output_arg/robots.txt"
cp -- "$source_root/pages/CNAME" "$output_arg/CNAME"
cp -- "$source_root/pages/.nojekyll" "$output_arg/.nojekyll"

while IFS= read -r route_json; do
  route_id="$(jq -er '.id' <<<"$route_json")"
  route_source_directory="$(jq -er '.sourceDirectory' <<<"$route_json")"
  route_source_entry="$(jq -er '.sourceEntry' <<<"$route_json")"
  copy_mode="$(jq -er '.copyMode' <<<"$route_json")"
  route_source="$source_root/$route_source_directory"
  route_destination="$output_arg/$route_id"
  [[ ! -e "$route_destination" ]] || die "$route_id: duplicate output directory"

  excludes=()
  while IFS= read -r exclude; do
    safe_rsync_pattern "$exclude" || die "$route_id: unsafe exclude pattern: $exclude"
    excludes+=("--exclude=$exclude")
  done < <(jq -r '.exclude[]' <<<"$route_json")

  case "$copy_mode" in
    rsync)
      mkdir -p -- "$route_destination"
      rsync -a "${excludes[@]}" "$route_source/" "$route_destination/"
      ;;
    follow-symlinks)
      cp -rL -- "$route_source" "$output_arg/"
      ;;
    *)
      die "$route_id: unsupported copy mode: $copy_mode"
      ;;
  esac

  if [[ "$route_source_entry" != "index.html" ]]; then
    cp -- "$route_destination/$route_source_entry" "$route_destination/index.html"
  fi
done < <(jq -c '.routes[]' "$manifest_path")

[[ -f "$output_arg/index.html" ]] || die "generated root index.html is missing"
cmp -s "$root_source_path" "$output_arg/index.html" || die "generated root index.html differs from pages/index.html"

while IFS= read -r route_json; do
  route_id="$(jq -er '.id' <<<"$route_json")"
  route_source_entry="$(jq -er '.sourceEntry' <<<"$route_json")"
  route_destination="$output_arg/$route_id"
  [[ -d "$route_destination" ]] || die "$route_id: generated route directory is missing"
  [[ -f "$route_destination/$route_source_entry" ]] || die "$route_id: generated source entry is missing"
  [[ -f "$route_destination/index.html" ]] || die "$route_id: generated route index.html is missing"
  find "$route_destination" -type f -print -quit | grep -q . || die "$route_id: generated route has no asset"
  if [[ "$route_source_entry" != "index.html" ]]; then
    cmp -s "$route_destination/$route_source_entry" "$route_destination/index.html" ||
      die "$route_id: generated index.html is not the declared source entry"
  fi
done < <(jq -c '.routes[]' "$manifest_path")

printf 'build-pages: generated and verified %s legacy routes at %s\n' "$route_count" "$output_arg"

#!/bin/bash
# ================================================================
# deploy-hostinger.sh - Automated Thawab deployment for Hostinger
# ================================================================
# Usage:
#   One-time setup: bash deploy-hostinger.sh setup
#   Deploy:         bash deploy-hostinger.sh
#
# Prerequisites (on Hostinger):
#   - git, npm, node (v22.x)
# ================================================================
set -euo pipefail

APP_DIR="$HOME/domains/thawab.jaadpro.com/nodejs"
SOURCE_DIR="$HOME/thawab-source"
GIT_REPO="https://github.com/Techzoneksa/thawab.git"
GIT_BRANCH="nextjs-migration"

DB_PATH="$APP_DIR/data/thawab.db"
BACKUP_DIR="$APP_DIR/data/backups"
MIN_BUILD_SIZE=50000

RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m'

log()  { printf "${BLUE}[%s]${NC} %s\n" "$1" "$2"; }
ok()   { printf "  ${GREEN}[OK]${NC} %s\n" "$1"; }
warn() { printf "  ${YELLOW}[!!]${NC} %s\n" "$1"; }
fail() { printf "  ${RED}[XX]${NC} %s\n" "$1"; }

verify_build() {
    local dir="$1"
    local all_ok=true

    if [ ! -f "$dir/server/index.mjs" ]; then
        fail "server/index.mjs is MISSING"
        return 1
    fi
    local size
    size=$(stat -c%s "$dir/server/index.mjs" 2>/dev/null || echo 0)
    if [ "$size" -lt "$MIN_BUILD_SIZE" ]; then
        fail "server/index.mjs too small ($size bytes, need >= $MIN_BUILD_SIZE)"
        return 1
    fi
    ok "server/index.mjs ($size bytes)"

    if [ ! -f "$dir/server/_ssr/libsql-worker.mjs" ]; then
        fail "server/_ssr/libsql-worker.mjs is MISSING"
        all_ok=false
    else
        ok "server/_ssr/libsql-worker.mjs"
    fi

    if [ ! -d "$dir/public/assets" ]; then
        warn "public/assets/ is MISSING (static assets will 404)"
        all_ok=false
    else
        local count
        count=$(find "$dir/public/assets" -type f | wc -l)
        ok "public/assets/ ($count files)"
    fi

    $all_ok
    return $?
}

setup_source() {
    log "1/5" "Setting up source repository..."

    if command -v git &>/dev/null; then
        if [ -d "$SOURCE_DIR/.git" ]; then
            cd "$SOURCE_DIR"
            git checkout "$GIT_BRANCH" 2>/dev/null || true
            git pull origin "$GIT_BRANCH"
            ok "Updated existing source repo"
        else
            rm -rf "$SOURCE_DIR"
            git clone -b "$GIT_BRANCH" "$GIT_REPO" "$SOURCE_DIR"
            ok "Cloned source repo"
        fi
    elif command -v curl &>/dev/null; then
        warn "git not found, downloading archive instead"
        rm -rf "$SOURCE_DIR"
        mkdir -p "$SOURCE_DIR"
        local archive_url="https://github.com/Techzoneksa/thawab/archive/refs/heads/$GIT_BRANCH.tar.gz"
        curl -sL "$archive_url" | tar -xz --strip=1 -C "$SOURCE_DIR"
        ok "Downloaded source archive"
    else
        fail "Need either git or curl to get source code"
        exit 1
    fi
}

install_deps() {
    log "2/5" "Installing dependencies..."
    cd "$SOURCE_DIR"

    if ! command -v npm &>/dev/null; then
        fail "npm is not installed on this server"
        exit 1
    fi

    npm install 2>&1 | tail -5
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        warn "npm install failed (exit $exit_code), retrying..."
        npm install --prefer-offline 2>&1 | tail -5 || {
            fail "npm install failed twice"
            exit 1
        }
    fi
    ok "Dependencies installed"
}

run_build() {
    log "3/5" "Building project..."
    cd "$SOURCE_DIR"

    rm -rf .output server public

    npm run build 2>&1 | tail -20
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        fail "Build failed (exit $exit_code)"
        exit 1
    fi

    # postbuild runs automatically via npm postbuild hook
    if [ ! -f "$SOURCE_DIR/server/index.mjs" ]; then
        warn "postbuild may have failed, running manually..."
        node scripts/postbuild.mjs
    fi

    if verify_build "$SOURCE_DIR"; then
        ok "Build verified"
    else
        fail "Build verification failed"
        exit 1
    fi
}

deploy_output() {
    log "4/5" "Deploying to production..."

    # Backup database FIRST
    mkdir -p "$BACKUP_DIR"
    if [ -f "$DB_PATH" ] && [ -s "$DB_PATH" ]; then
        local backup_name="$BACKUP_DIR/thawab-$(date +%Y%m%d-%H%M%S).db"
        cp "$DB_PATH" "$backup_name"
        ok "Database backed up to $(basename "$backup_name") ($(stat -c%s "$backup_name") bytes)"
    else
        if [ -f "$DB_PATH" ] && [ ! -s "$DB_PATH" ]; then
            warn "Existing DB is 0 bytes - will reinitialize"
        else
            warn "No existing DB found - will create new one"
        fi
    fi

    # Copy build output to APP_DIR
    # Move data dir aside temporarily
    local data_backup="/tmp/thawab-data-$$"
    if [ -d "$APP_DIR/data" ]; then
        cp -r "$APP_DIR/data" "$data_backup"
    fi

    # Clear app dir (not data - we'll restore it)
    rm -rf "${APP_DIR:?}/server" "${APP_DIR:?}/public" "${APP_DIR:?}/scripts" "${APP_DIR:?}/tmp"
    mkdir -p "$APP_DIR"

    # Copy fresh build
    cp -r "$SOURCE_DIR/server" "$APP_DIR/server"
    cp -r "$SOURCE_DIR/public" "$APP_DIR/public"
    mkdir -p "$APP_DIR/data"

    # Copy nitro.json if it exists
    if [ -f "$SOURCE_DIR/.output/nitro.json" ]; then
        cp "$SOURCE_DIR/.output/nitro.json" "$APP_DIR/nitro.json"
    fi

    # Copy deploy scripts
    mkdir -p "$APP_DIR/scripts"
    if [ -f "$SOURCE_DIR/scripts/db-init-prod.mjs" ]; then
        cp "$SOURCE_DIR/scripts/db-init-prod.mjs" "$APP_DIR/scripts/"
    fi

    # Restore data directory
    if [ -d "$data_backup" ]; then
        cp -r "$data_backup/"* "$APP_DIR/data/" 2>/dev/null || true
        rm -rf "$data_backup"
    fi

    ok "Build output copied to production"
}

init_database() {
    log "5/5" "Verifying database..."
    cd "$SOURCE_DIR"

    # Helper: safe DB copy using sqlite3 if available
    safe_db_copy() {
        local src="$1" dst="$2"
        if command -v sqlite3 &>/dev/null; then
            sqlite3 "$src" ".backup '$dst'"
        else
            cp "$src" "$dst"
        fi
    }

    if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
        warn "DB is missing or empty - initializing..."
        rm -f "$SOURCE_DIR/data/thawab.db"
        node scripts/db-init-prod.mjs 2>&1
        if [ -f "$SOURCE_DIR/data/thawab.db" ] && [ -s "$SOURCE_DIR/data/thawab.db" ]; then
            safe_db_copy "$SOURCE_DIR/data/thawab.db" "$DB_PATH"
            ok "Database initialized ($(stat -c%s "$DB_PATH") bytes)"
        else
            fail "Database initialization FAILED"
            exit 1
        fi
    else
        local db_size
        db_size=$(stat -c%s "$DB_PATH")
        ok "Database exists ($db_size bytes)"
        warn "Running migrations (seed skipped automatically if data exists)..."
        safe_db_copy "$DB_PATH" "$SOURCE_DIR/data/thawab.db"
        node scripts/db-init-prod.mjs 2>&1
        safe_db_copy "$SOURCE_DIR/data/thawab.db" "$DB_PATH"
    fi
}

show_verification() {
    printf "\n"
    printf "================================================\n"
    printf "  Deploy Summary\n"
    printf "  $(date)\n"
    printf "================================================\n"
    printf "\n"

    local overall=true

    if [ -f "$APP_DIR/server/index.mjs" ]; then
        local size
        size=$(stat -c%s "$APP_DIR/server/index.mjs" 2>/dev/null || echo 0)
        ok "server/index.mjs - $size bytes"
        [ "$size" -lt "$MIN_BUILD_SIZE" ] && overall=false
    else
        fail "server/index.mjs - MISSING"
        overall=false
    fi

    if [ -f "$APP_DIR/server/_ssr/libsql-worker.mjs" ]; then
        ok "libsql-worker.mjs - present"
    else
        fail "libsql-worker.mjs - MISSING"
        overall=false
    fi

    if [ -f "$APP_DIR/nitro.json" ]; then
        ok "nitro.json - present"
    else
        warn "nitro.json - missing (app may not restart)"
    fi

    if [ -d "$APP_DIR/public/assets" ]; then
        local count
        count=$(find "$APP_DIR/public/assets" -type f | wc -l)
        ok "public/assets - $count files"
    else
        warn "public/assets - EMPTY"
    fi

    if [ -f "$DB_PATH" ]; then
        local db_size
        db_size=$(stat -c%s "$DB_PATH" 2>/dev/null || echo 0)
        ok "data/thawab.db - $db_size bytes"
        [ "$db_size" -eq 0 ] && overall=false
    else
        fail "data/thawab.db - MISSING"
        overall=false
    fi

    printf "\n"
    if $overall; then
        printf "  ${GREEN}[OK] All checks passed.${NC}\n"
    else
        printf "  ${RED}[XX] Some checks failed - review above.${NC}\n"
    fi

    # API smoke tests
    printf "\n"
    printf "--- API Smoke Tests ---\n"
    printf "\n"

    printf "  DB file:\n"
    ls -lh "$DB_PATH" 2>&1 | awk '{print "    " $0}'

    printf "\n"
    sleep 2  # brief pause for LSWS to detect new files

    local api_base="https://thawab.jaadpro.com"
    for endpoint in "/" "/api/donors" "/api/finance/accounts"; do
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${api_base}${endpoint}" 2>/dev/null || echo "FAIL")
        if [ "$http_code" = "200" ]; then
            ok "GET ${endpoint} -> ${http_code}"
        elif [ "$http_code" = "FAIL" ]; then
            fail "GET ${endpoint} -> connection failed (timeout or DNS)"
        else
            warn "GET ${endpoint} -> ${http_code}"
        fi
    done

    printf "\n"
    printf "================================================\n"
}

# ===== MAIN =====

case "${1:-deploy}" in
    setup)
        printf "================================================\n"
        printf "  Thawab - One-time Server Setup\n"
        printf "================================================\n"
        printf "\n"
        setup_source
        install_deps
        run_build
        deploy_output
        init_database
        show_verification
        printf "\n"
        printf "  Setup complete! For future deploys, just run:\n"
        printf "    bash deploy-hostinger.sh\n"
        printf "  (no arguments needed)\n"
        ;;
    deploy|"")
        printf "================================================\n"
        printf "  Thawab - Deploy\n"
        printf "  $(date)\n"
        printf "================================================\n"
        printf "\n"

        if [ ! -d "$SOURCE_DIR/.git" ] && [ ! -f "$SOURCE_DIR/package.json" ]; then
            warn "Source not found - running setup first..."
            setup_source
            install_deps
        fi

        setup_source
        install_deps
        run_build
        deploy_output
        init_database
        show_verification
        ;;
    verify)
        printf "================================================\n"
        printf "  Thawab - Verify Deployment\n"
        printf "  $(date)\n"
        printf "================================================\n"
        printf "\n"
        show_verification
        ;;
    *)
        printf "Usage: bash deploy-hostinger.sh [setup|deploy|verify]\n"
        printf "\n"
        printf "  setup   One-time: clone, install, build, deploy\n"
        printf "  deploy  Update source, rebuild, redeploy (default)\n"
        printf "  verify  Check current deployment status\n"
        exit 1
        ;;
esac

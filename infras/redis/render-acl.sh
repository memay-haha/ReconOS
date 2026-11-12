#!/bin/sh
# Writes the Redis aclfile from acl.conf and the account passwords, then starts
# Redis with it. Passwords come from the environment or *_FILE (Docker secrets)
# and only their SHA-256 reaches the file. docs/ops/deployment.md
#
#   RECONOS_REDIS_PASSWORD         core account `default`. Empty: no password,
#                                  development only, Redis listens on 127.0.0.1
#   RECONOS_REDIS_WORKER_PASSWORD  account `worker`. Empty: account disabled
set -eu

RULES=${RECONOS_REDIS_ACL_RULES:-/etc/reconos/redis/acl.conf}
ACLFILE=${RECONOS_REDIS_ACLFILE:-/run/reconos-redis/users.acl}

read_secret() {
    file_var="$1_FILE"
    eval "file=\${$file_var:-}"
    if [ -n "$file" ]; then
        tr -d '\n' < "$file"
    else
        eval "printf '%s' \"\${$1:-}\""
    fi
}

hash_of() {
    printf '%s' "$1" | sha256sum | cut -d' ' -f1
}

rules_of() {
    grep "^$1 " "$RULES" | cut -d' ' -f2-
}

core_password=$(read_secret RECONOS_REDIS_PASSWORD)
worker_password=$(read_secret RECONOS_REDIS_WORKER_PASSWORD)

mkdir -p "$(dirname "$ACLFILE")"
umask 077
{
    if [ -n "$core_password" ]; then
        echo "user default on #$(hash_of "$core_password") $(rules_of default)"
    else
        echo "user default on nopass $(rules_of default)"
    fi
    if [ -n "$worker_password" ]; then
        echo "user worker on #$(hash_of "$worker_password") $(rules_of worker)"
    else
        echo "user worker off $(rules_of worker)"
    fi
} > "$ACLFILE"
unset core_password worker_password

exec redis-server --appendonly yes --aclfile "$ACLFILE" "$@"

#!/bin/bash

set -eu -o pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." >&2
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

if [ $# -lt 3 ]; then
    echo "Usage: backup.sh <appid> <url> <key>"
    exit 1
fi

readonly DATA_DIR="${HOME}/data"

app_id="$1"
backup_url="$2"
backup_key="$3"
readonly now=$(date "+%Y-%m-%dT%H:%M:%S")
readonly app_data_dir="${DATA_DIR}/${app_id}"
readonly app_data_snapshot="${DATA_DIR}/snapshots/${app_id}-${now}"

echo "Creating and mount backup swap"
swap_file="/2048MiB.backup.swap"
[[ -f "${swap_file}" ]] && swapoff "${swap_file}"
fallocate -l 2048m "${swap_file}"
chmod 600 "${swap_file}"
mkswap "${swap_file}"
swapon "${swap_file}"

btrfs subvolume snapshot -r "${app_data_dir}" "${app_data_snapshot}"

for try in `seq 1 5`; do
    echo "Uploading backup to ${backup_url} (try ${try})"
    error_log=$(mktemp)
    if tar -cvzf - -C "${app_data_snapshot}" . \
           | openssl aes-256-cbc -e -pass "pass:${backup_key}" \
           | curl --fail -H "Content-Type:" -X PUT --data-binary @- "${backup_url}" 2>"${error_log}"; then
        break
    fi
    cat "${error_log}" && rm "${error_log}"
done

btrfs subvolume delete "${app_data_snapshot}"

echo "Unmounting backup swap"
[[ -f "${swap_file}" ]] && swapoff "${swap_file}"

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed"
    exit 1
else
    echo "Backup successful"
fi


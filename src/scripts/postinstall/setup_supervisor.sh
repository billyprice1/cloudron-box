#!/bin/bash

set -e

SRCDIR=/home/$USER/box
DATA_DIR=/home/$USER/data

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SRCDIR/supervisor/supervisord.conf /etc/supervisor/

echo "Writing nginx supervisor config..."
cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
command=/usr/sbin/nginx -c "$NGINX_CONFIG_DIR/nginx.conf" -p /var/log/nginx/
autostart=true
autorestart=true
redirect_stderr=true
EOF
echo "Done"

echo "Writing box supervisor config..."
cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=/usr/bin/node app.js
autostart=true
autorestart=true
redirect_stderr=true
directory=$SRCDIR
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*"
EOF

echo "Writing updater supervisor config..."
cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:updater]
command=/usr/bin/node server.js update-mode
autostart=true
autorestart=true
redirect_stderr=true
directory=$SRCDIR/installer
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="installer*"
EOF


#!/bin/sh
set -eu
umask 077
node /app/research-lab/deploy/save-env.mjs
exec cron -f

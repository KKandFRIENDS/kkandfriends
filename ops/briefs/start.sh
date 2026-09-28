#!/bin/sh
set -eu
umask 077
node /app/ops/briefs/save-env.mjs
exec cron -f

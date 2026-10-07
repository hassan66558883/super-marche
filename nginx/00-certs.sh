#!/bin/sh
# Uses the mounted certificate (Let's Encrypt or your own). If none is mounted yet, creates a
# temporary self-signed one so the site starts; browsers will warn until a real one is installed.
set -e
CERT_DIR=/etc/nginx/certs
if [ ! -s "$CERT_DIR/fullchain.pem" ] || [ ! -s "$CERT_DIR/privkey.pem" ]; then
  echo "No TLS certificate in $CERT_DIR: generating a temporary self-signed certificate for ${SERVER_NAME:-localhost}"
  if ! command -v openssl >/dev/null; then
    echo "ERROR: put fullchain.pem and privkey.pem in $CERT_DIR (this image cannot generate a certificate)" >&2
    exit 1
  fi
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -subj "/CN=${SERVER_NAME:-localhost}" -addext "subjectAltName=DNS:${SERVER_NAME:-localhost},DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" >/dev/null 2>&1
fi

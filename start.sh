#!/bin/sh

# Inicia o Backend em segundo plano (&)
cd /app/backend
node server.js &

# Inicia o Nginx em primeiro plano
nginx -g 'daemon off;'

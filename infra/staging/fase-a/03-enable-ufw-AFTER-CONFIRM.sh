#!/usr/bin/env bash
# Solo tras CONFIRMAR UFW — habilita firewall
set -euo pipefail
sudo ufw --force enable
sudo ufw status verbose
echo "UFW enabled OK — verificar SSH sigue accesible desde otra sesion si es posible"
#!/usr/bin/env bash
# Solo tras CONFIRMAR SSHD — recarga sshd
set -euo pipefail
sudo sshd -t
sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd
echo "sshd recargado OK"
sudo cat /etc/ssh/sshd_config.d/99-hardening.conf 2>/dev/null || true
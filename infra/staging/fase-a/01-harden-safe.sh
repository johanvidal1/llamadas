#!/usr/bin/env bash
# FASE A — hardening seguro en Ubuntu staging (servidoroptick)
# Ejecutar como adminoptick en el host (Remote SSH). NO habilita UFW ni reinicia sshd.
set -euo pipefail

echo "=== FASE A: entorno ==="
whoami
hostname
uname -a
. /etc/os-release 2>/dev/null && echo "OS=$PRETTY_NAME" || true

if [[ "$(whoami)" != "adminoptick" ]]; then
  echo "AVISO: se espera usuario adminoptick (actual: $(whoami))"
fi

if ! sudo -n true 2>/dev/null; then
  echo "Se pedira sudo..."
  sudo -v
fi

echo ""
echo "=== 1) Hostname + timezone ==="
CURRENT_HN=$(hostnamectl --static 2>/dev/null || hostname)
if [[ "$CURRENT_HN" != "servidoroptick" ]]; then
  sudo hostnamectl set-hostname servidoroptick
  echo "Hostname cambiado a servidoroptick (puede requerir re-login/reboot para session name)"
else
  echo "Hostname ya es servidoroptick"
fi
sudo timedatectl set-timezone America/Lima
timedatectl | sed -n '1,6p'

echo ""
echo "=== 2) Desktop packages check (solo reporte) ==="
dpkg -l 'ubuntu-desktop*' 'gnome-shell' 'gdm3' 2>/dev/null | grep -E '^ii' || echo "Sin paquetes desktop tipicos instalados (OK)"

echo ""
echo "=== 3) SSH keys check (adminoptick) ==="
AUTH_KEYS="${HOME}/.ssh/authorized_keys"
if [[ -s "$AUTH_KEYS" ]]; then
  echo "authorized_keys presente ($(wc -l < "$AUTH_KEYS") lineas)"
  KEYS_OK=1
else
  echo "SIN authorized_keys o vacio — NO desactivar PasswordAuthentication"
  KEYS_OK=0
fi
if [[ -n "${SSH_CONNECTION:-}" ]]; then
  echo "SSH_CONNECTION=$SSH_CONNECTION"
fi
LOGNAME_USER=$(whoami)
sshd_auth_hint=$(sudo grep -E "Accepted (publickey|password).*${LOGNAME_USER}" /var/log/auth.log 2>/dev/null | tail -3 || true)
echo "Ultimos Accepted auth (si hay log):"
echo "${sshd_auth_hint:-"(sin datos / log vacio)"}"

echo ""
echo "=== 4) Root keys? ==="
if sudo test -s /root/.ssh/authorized_keys; then
  echo "Root tiene authorized_keys -> PermitRootLogin prohibit-password"
  ROOT_LOGIN="prohibit-password"
else
  echo "Root SIN keys -> PermitRootLogin no"
  ROOT_LOGIN="no"
fi

echo ""
echo "=== 5) Escribir drop-in sshd (SIN reload) ==="
SSHD_DROPIN="/etc/ssh/sshd_config.d/99-hardening.conf"
PASS_AUTH="yes"
if [[ "$KEYS_OK" -eq 1 ]]; then
  echo "Keys detectadas: se proponara PasswordAuthentication no (verificar login key-based antes de CONFIRMAR SSHD)"
  PASS_AUTH="no"
else
  echo "PasswordAuthentication se mantiene yes"
fi

sudo tee "$SSHD_DROPIN" >/dev/null <<EOF
# Optick staging hardening — aplicado por fase-a; requiere: CONFIRMAR SSHD
# No recargar sshd hasta confirmacion del usuario.
PermitRootLogin ${ROOT_LOGIN}
PasswordAuthentication ${PASS_AUTH}
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowAgentForwarding no
EOF

echo "Escrito $SSHD_DROPIN:"
sudo cat "$SSHD_DROPIN"
echo ""
echo "Validar sintaxis (sshd -t):"
sudo sshd -t && echo "sshd -t OK" || echo "ERROR: sshd -t fallo — NO pedir reload"

echo ""
echo "=== 6) UFW reglas (SIN enable) ==="
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH comment 'Optick SSH'
sudo ufw allow 22/tcp comment 'Optick SSH alt'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "Estado UFW (no se ejecuta enable):"
sudo ufw status verbose || true
ACTIVE=$(sudo ufw status | head -1 || true)
echo "UFW_HEADER=$ACTIVE"
if echo "$ACTIVE" | grep -qi inactive; then
  echo "UFW inactivo — espera: Reply CONFIRMAR UFW to enable firewall"
else
  echo "UFW ya activo — solo se ajustaron reglas; revisar status arriba"
fi

echo ""
echo "=== 7) fail2ban ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
sudo systemctl enable --now fail2ban
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
backend = systemd
maxretry = 5
bantime = 1h
findtime = 10m
EOF
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd 2>/dev/null || sudo fail2ban-client status
systemctl is-active fail2ban

echo ""
echo "=== 8) unattended-upgrades ==="
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades apt-listchanges
sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl is-enabled unattended-upgrades 2>/dev/null || true
systemctl is-active unattended-upgrades 2>/dev/null || systemctl is-active apt-daily.timer || true
echo "unattended-upgrades instalado/configurado (security updates)"

echo ""
echo "=========================================="
echo "FASE A parcial aplicada (seguro)."
echo "NO se recargo sshd. NO se habilito ufw (salvo que ya estuviera)."
echo ""
echo "CONFIRMACIONES NECESARIAS:"
echo "  1) Reply CONFIRMAR SSHD to reload sshd"
echo "  2) Reply CONFIRMAR UFW to enable firewall"
echo "=========================================="
echo ""
echo "Resumen:"
hostnamectl --static
timedatectl | grep 'Time zone'
systemctl is-active fail2ban
sudo ufw status | head -3
# FASE A — Staging servidoroptick (Ubuntu)

## Entorno detectado en Agent (sesión Windows)
Esta sesión de Agent está en **Windows** (`SURFACE12PRO-JO`), no en el Ubuntu remoto.
Los cambios de host (hostname, UFW, sshd, fail2ban, etc.) **deben aplicarse abriendo el proyecto en Remote SSH** como `adminoptick` y ejecutando los scripts.

## Qué hace el script seguro `01-harden-safe.sh`
- hostname `servidoroptick`, timezone `America/Lima`
- drop-in `/etc/ssh/sshd_config.d/99-hardening.conf` (sin reload)
- reglas UFW 22/80/443 (sin `ufw enable` si estaba inactivo)
- fail2ban jail sshd
- unattended-upgrades básico
- **NO** instala Node/Postgres/CRM

## Confirmaciones (obligatorias)
1. Tras revisar el drop-in SSH: **Reply CONFIRMAR SSHD to reload sshd** → luego `02-reload-sshd-AFTER-CONFIRM.sh`
2. Tras revisar reglas UFW: **Reply CONFIRMAR UFW to enable firewall** → luego `03-enable-ufw-AFTER-CONFIRM.sh`

## Cómo ejecutar en el servidor
```bash
cd ~/Llamadas  # o ruta del repo clonado
chmod +x infra/staging/fase-a/*.sh
./infra/staging/fase-a/01-harden-safe.sh
```

## Config SSH propuesta (ejemplo; el script ajusta según keys)
```
PermitRootLogin no   # o prohibit-password si root tiene keys
PasswordAuthentication no  # SOLO si adminoptick ya tiene authorized_keys
# si no hay keys: PasswordAuthentication yes
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
AllowAgentForwarding no
```

## FASE B
No desplegar Caddy/apps hasta confirmar SSHD + UFW (o al menos no claim FASE B complete).

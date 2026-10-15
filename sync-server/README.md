# Operecs sync server

Stores Operecs sync data for your devices. Everything is encrypted on the devices before it is
sent (AES-256-GCM, with a key derived from the sync code that never leaves them), so this server
holds only unreadable records. It has no dependencies: one file, Node 22.5 or later.

## Run it on a VPS

1. Install Node 22 or later, and put this folder on the server, e.g. `/opt/operecs-sync`.
2. Create a user for it and the data folder:
   ```sh
   sudo useradd --system --home /opt/operecs-sync operecs-sync
   sudo mkdir -p /var/lib/operecs-sync && sudo chown operecs-sync /var/lib/operecs-sync
   ```
3. Install the service (`operecs-sync.service` here) and start it:
   ```sh
   sudo cp operecs-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now operecs-sync
   curl http://127.0.0.1:8787/v1/health   # {"ok":true}
   ```
4. Put HTTPS in front of it. With [Caddy](https://caddyserver.com) and a domain pointing at the
   VPS (e.g. `sync.example.com`), the `Caddyfile` here is all it takes; Caddy gets the
   certificate by itself.
5. In Operecs: Settings → Sync → sync server `https://sync.example.com`.

The service listens on 127.0.0.1 only; Caddy is the only way in.

## Settings (environment)

| Variable | Default | |
| --- | --- | --- |
| `PORT` | 8787 | |
| `HOST` | 127.0.0.1 | |
| `DATA` | `./data` | Folder for `sync.sqlite` |
| `MAX_CHAINS` | 1000 | How many sync chains (people) the server accepts |

Limits per chain: 500,000 records, 512 MB, 240 requests a minute. A chain deleted from a device
stays deleted (its other devices are told to stop).

## Backups

Copy `sync.sqlite` (with the service stopped, or `sqlite3 sync.sqlite ".backup backup.sqlite"`).
A backup is as unreadable as the live data.

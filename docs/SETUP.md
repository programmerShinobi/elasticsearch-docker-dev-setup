# Setup Guide

Step-by-step installation of single-node Elasticsearch for local development.

---

## 1. Prerequisites

Confirm Docker and Compose are available:

```bash
docker --version          # 24+ (29.x fine)
docker compose version    # v2.x
```

If `docker` commands need `sudo`, either prefix them or add your user to the
`docker` group (then log out/in):

```bash
sudo usermod -aG docker "$USER"
```

---

## 2. Prepare the host kernel parameter

Elasticsearch refuses to start unless `vm.max_map_count >= 262144`.

### Option A — use the helper script (recommended)

```bash
./scripts/setup-host.sh
```

It is idempotent: sets the value for the current boot **and** persists it in
`/etc/sysctl.conf` for future reboots, skipping anything already in place.

### Option B — manual

```bash
# Apply now
sudo sysctl -w vm.max_map_count=262144

# Persist across reboots
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

Verify:

```bash
sysctl vm.max_map_count   # → vm.max_map_count = 262144
```

---

## 3. Start Elasticsearch

```bash
docker compose up -d
```

First run pulls the ~600 MB image and boots the node (≈ 30–60 s).

Follow the boot logs until you see `started`:

```bash
docker compose logs -f elasticsearch
```

---

## 4. Confirm it's healthy

```bash
docker compose ps          # STATUS should show "healthy"
curl http://localhost:9200/_cluster/health?pretty
```

`status` should be `green` or `yellow`. See
[VERIFICATION.md](VERIFICATION.md) for the full acceptance checklist.

---

## 5. Point NestJS at it

In your NestJS project's `.env`:

```dotenv
ELASTICSEARCH_NODE=http://localhost:9200
```

See [../examples/nestjs/](../examples/nestjs/) for module wiring.

---

## Everyday commands

| Action | Command | Make target |
|--------|---------|-------------|
| Start | `docker compose up -d` | `make up` |
| Stop (keep data) | `docker compose down` | `make down` |
| Restart | `docker compose restart` | `make restart` |
| Logs | `docker compose logs -f elasticsearch` | `make logs` |
| Health | `curl localhost:9200/_cluster/health?pretty` | `make health` |
| Wipe data | `docker compose down -v` | `make clean` |

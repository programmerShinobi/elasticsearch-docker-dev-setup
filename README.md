<h1 align="center">elasticsearch-docker-dev-setup</h1>

<p align="center">
  <b>Single-node Elasticsearch on Docker, tuned for local development.</b><br/>
  Stable, lightweight, and instantly usable by a host-local NestJS backend at
  <code>http://localhost:9200</code> — without slowing your machine down.
</p>

<p align="center">
  <img alt="Elasticsearch" src="https://img.shields.io/badge/Elasticsearch-8.12.0-005571?logo=elasticsearch&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white">
  <img alt="Mode" src="https://img.shields.io/badge/mode-dev%20(security%20off)-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Why This Setup](#-why-this-setup)
- [Architecture](#-architecture)
- [Requirements](#-requirements)
- [Quick Start](#-quick-start)
- [Configuration Explained](#-configuration-explained)
- [Verification](#-verification)
- [NestJS Integration](#-nestjs-integration)
- [Performance & Stability](#-performance--stability)
- [Troubleshooting](#-troubleshooting)
- [Project Structure](#-project-structure)
- [FAQ](#-faq)
- [License](#-license)

---

## 🧭 Overview

This repository provides a **production-of-mind, development-grade** Elasticsearch
environment. It runs **one** Elasticsearch node in Docker and is intentionally
**not** a cluster. The goal is a database that is:

- **Reachable from a local (non-Docker) NestJS app** via `http://localhost:9200`
- **Memory-bounded** so your IDE, browser, and backend stay responsive
- **Resilient** — never enters `RED`, auto-restarts, persists data across reboots

It is designed to live next to an **already-running Dockerized Redis** without
interfering with it.

---

## 🤔 Why This Setup

Running Elasticsearch on a developer laptop usually goes wrong in two ways:

1. **It eats all the RAM** → the whole system lags.
2. **It crash-loops or goes RED** → the backend can't connect.

This setup solves both by **hard-capping memory** (1 GB heap inside a 1.5 GB
container), **locking memory to prevent swap**, **disabling unused features**
(security, ML, Kibana, clustering), and **gating health on `green`/`yellow`**.

| Goal | How it's achieved |
|------|-------------------|
| NestJS connects via `localhost` | Port `9200:9200` published to the host |
| System stays fast | `mem_limit: 1536m` + `ES_JAVA_OPTS=-Xms1g -Xmx1g` |
| No swap thrash | `bootstrap.memory_lock=true` + `memlock` ulimit |
| Never RED | Single-node, primaries always allocate; healthcheck on green/yellow |
| No restart loops | `restart: unless-stopped` + `vm.max_map_count` preset |
| Data survives restarts | Named `esdata` volume |

> [!NOTE]
> A single-node cluster with default indices reports **`yellow`**, not green.
> That is **expected and healthy** — replicas simply have nowhere to go on one
> node. `yellow` is a success state here, never a failure.

---

## 🏗 Architecture

```
┌──────────────────────────── Host (Elementary OS 8) ────────────────────────────┐
│                                                                                 │
│   ┌───────────────┐         http://localhost:9200       ┌────────────────────┐  │
│   │   NestJS app  │  ───────────────────────────────▶   │  Docker published  │  │
│   │ (local proc)  │                                      │     port 9200      │  │
│   └───────────────┘                                      └─────────┬──────────┘  │
│                                                                    │             │
│   ┌───────────────┐                                      ┌─────────▼──────────┐  │
│   │  Redis (Docker│  (independent, untouched)            │   elasticsearch    │  │
│   │  container)   │                                      │  container 8.12.0  │  │
│   └───────────────┘                                      │  heap 1g / cap 1.5g│  │
│                                                           └─────────┬──────────┘  │
│                                                                     │            │
│                                                          ┌──────────▼─────────┐  │
│                                                          │  volume: esdata    │  │
│                                                          └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Because NestJS runs **on the host**, it always uses `http://localhost:9200` —
**never** `http://elasticsearch:9200` (that hostname only resolves *inside* the
Docker network).

---

## ✅ Requirements

| Tool | Version (tested) | Notes |
|------|------------------|-------|
| Docker Engine | 24+ (29.x ok) | Must be able to run containers |
| Docker Compose | v2 (`docker compose`) | Bundled with modern Docker |
| Linux kernel | any with `vm.max_map_count` | Elementary OS 8 / Ubuntu-based |
| RAM | 16 GB recommended | Setup is tuned for this |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/programmerShinobi/elasticsearch-docker-dev-setup.git
cd elasticsearch-docker-dev-setup

# 2. Prepare the host (sets & persists vm.max_map_count=262144)
./scripts/setup-host.sh
#    └─ or do it manually:
#       sudo sysctl -w vm.max_map_count=262144
#       echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 3. Start Elasticsearch
docker compose up -d

# 4. Wait until healthy, then verify
curl http://localhost:9200/_cluster/health?pretty
```

Or with the bundled `Makefile`:

```bash
make setup   # host prep
make up      # start
make health  # check cluster health
make logs    # follow logs
make down    # stop (keeps data)
```

> Full step-by-step walkthrough: **[docs/SETUP.md](docs/SETUP.md)**

---

## ⚙️ Configuration Explained

Every line of [`docker-compose.yml`](docker-compose.yml) maps to a requirement:

| Setting | Value | Purpose |
|---------|-------|---------|
| `image` | `docker.elastic.co/elasticsearch/elasticsearch:8.12.0` | Pinned version for reproducibility |
| `discovery.type` | `single-node` | No clustering, no master election |
| `xpack.security.enabled` | `false` | Dev mode → plain HTTP, no auth/TLS |
| `xpack.ml.enabled` | `false` | Drops ML, saves memory |
| `ES_JAVA_OPTS` | `-Xms1g -Xmx1g` | Fixed 1 GB heap (min == max) |
| `bootstrap.memory_lock` | `true` | Locks heap in RAM → no swapping |
| `ulimits.memlock` | `-1 / -1` | Lets memory locking actually work |
| `mem_limit` | `1536m` | Container can never exceed 1.5 GB |
| `ports` | `9200:9200` | Exposes ES to host-local NestJS |
| `restart` | `unless-stopped` | Survives reboots / daemon restarts |
| `volumes` | `esdata:` | Indices persist across `down`/`up` |
| `healthcheck` | green/yellow | Marks container healthy only when usable |

> Deep dive on memory & responsiveness: **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)**

---

## 🔍 Verification

After `docker compose up -d`, confirm the install is valid:

```bash
# 1. Container is up and healthy
docker compose ps

# 2. Service responds with cluster info (JSON)
curl http://localhost:9200

# 3. Cluster health — "status" must be "green" or "yellow"
curl http://localhost:9200/_cluster/health?pretty

# 4. Port 9200 is open on the host
ss -tlnp | grep 9200
```

A healthy response from step 3 looks like:

```json
{
  "cluster_name" : "docker-cluster",
  "status" : "yellow",
  "number_of_nodes" : 1,
  "active_primary_shards" : 1,
  "unassigned_shards" : 0
}
```

> Complete verification checklist & pass/fail criteria: **[docs/VERIFICATION.md](docs/VERIFICATION.md)**

---

## 🔌 NestJS Integration

NestJS connects from the **host** over `localhost`. Minimal example:

```ts
// elasticsearch.module.ts
import { Module } from '@nestjs/common';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // From .env: ELASTICSEARCH_NODE=http://localhost:9200
        node: config.get<string>('ELASTICSEARCH_NODE', 'http://localhost:9200'),
        // No auth: security is disabled in dev mode.
      }),
    }),
  ],
  exports: [ElasticsearchModule],
})
export class SearchModule {}
```

> A complete, runnable module + service + health check lives in
> **[examples/nestjs/](examples/nestjs/)**.

---

## 🩺 Performance & Stability

This setup is engineered to keep an i7-1185G7 / 16 GB laptop responsive:

- **Memory ceiling**: ES can never use more than **1.5 GB** (1 GB heap + overhead).
- **No swap**: heap is locked into RAM, so the OS won't page it out.
- **Single node**: no inter-node chatter, minimal CPU at idle.
- **Bounded shards**: one default index = 1 primary shard, cheap to manage.

Leaves roughly **14 GB** for your IDE, browser, NestJS, and Redis.

> Tuning notes & what to change if you have less/more RAM:
> **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)**

---

## 🛠 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Container exits immediately | `vm.max_map_count` too low | Run `./scripts/setup-host.sh` |
| `curl: connection refused` | ES still booting (~30–60s) | Wait, watch `docker compose logs -f` |
| Status stuck `yellow` | Unassigned replicas (normal) | None needed — `yellow` is healthy here |
| Status `RED` | Disk full / corrupt data | See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| NestJS can't connect | Used `elasticsearch:9200` | Use `http://localhost:9200` |
| OOM / killed | Other heavy apps | Lower heap, see PERFORMANCE.md |

> Full guide: **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**

---

## 🗂 Project Structure

```
elasticsearch-docker-dev-setup/
├── docker-compose.yml        # The single-node ES service (the core)
├── .env.example              # ELASTICSEARCH_NODE for the NestJS side
├── Makefile                  # make setup | up | down | health | logs
├── scripts/
│   └── setup-host.sh         # Sets & persists vm.max_map_count
├── examples/
│   └── nestjs/               # Runnable NestJS integration example
├── docs/
│   ├── SETUP.md              # Step-by-step install
│   ├── VERIFICATION.md       # Pass/fail acceptance checks
│   ├── PERFORMANCE.md        # Memory & responsiveness tuning
│   └── TROUBLESHOOTING.md    # Common failures & fixes
├── LICENSE
└── README.md
```

---

## ❓ FAQ

<details>
<summary><b>Why is the status "yellow" and not "green"?</b></summary>

A single node can't hold replica shards (a replica must live on a *different*
node than its primary). Default indices request 1 replica, so it stays
unassigned and the cluster reports `yellow`. All your data is fully available.
This is the correct, healthy state for single-node dev.
</details>

<details>
<summary><b>Is it safe to use in production?</b></summary>

No. Security is disabled and there is no clustering/replication. This is a
**development** setup only.
</details>

<details>
<summary><b>Will this touch my existing Redis container?</b></summary>

No. This Compose project only defines the `elasticsearch` service and its own
`esdata` volume. Redis is untouched.
</details>

<details>
<summary><b>How do I reset all data?</b></summary>

`docker compose down -v` (or `make clean`) removes the `esdata` volume.
**Destructive** — all indices are deleted.
</details>

---

## 📄 License

[MIT](LICENSE) © 2026 [programmerShinobi](https://github.com/programmerShinobi)

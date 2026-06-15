# Performance & Stability Tuning

How this setup stays light on an i7-1185G7 / 16 GB laptop while you run an IDE,
a browser, NestJS, and Redis at the same time.

---

## The memory budget

| Layer | Limit | Why |
|-------|-------|-----|
| JVM heap | `1g` (`-Xms1g -Xmx1g`) | Min == max avoids costly heap resizing |
| Container | `1.5g` (`mem_limit`) | Heap + ~0.5 GB JVM/off-heap overhead |
| Host left over | ~14 GB | IDE + browser + NestJS + Redis |

**Rule of thumb:** heap ≈ ⅔ of the container limit; never give ES heap larger
than ~50% of total host RAM, and keep heap under 32 GB (not relevant here).

---

## Why the system stays responsive

1. **Hard memory cap** (`mem_limit: 1536m`) — the kernel will not let the
   container balloon and push other apps into swap.
2. **Locked heap** (`bootstrap.memory_lock=true` + `memlock` ulimit) — the 1 GB
   heap is pinned in RAM, so the OS never pages Elasticsearch in/out (swap
   thrash is the #1 cause of "the whole laptop froze").
3. **Single node** — no cluster gossip, no replica recovery traffic; CPU sits
   near idle when you're not querying.
4. **ML disabled** — removes background ML jobs and their memory footprint.

---

## Adjusting for different machines

Edit `docker-compose.yml`:

| Host RAM | `ES_JAVA_OPTS` | `mem_limit` |
|----------|----------------|-------------|
| 8 GB | `-Xms512m -Xmx512m` | `768m` |
| 16 GB (default) | `-Xms1g -Xmx1g` | `1536m` |
| 32 GB | `-Xms2g -Xmx2g` | `3g` |

Always keep `mem_limit` ≈ 1.5× the heap, and `-Xms` == `-Xmx`.

---

## Monitoring

```bash
# Live container resource usage
docker stats elasticsearch

# JVM heap pressure (heap.percent column)
curl 'localhost:9200/_cat/nodes?v&h=name,heap.percent,ram.percent,cpu,load_1m'

# Per-index size
curl 'localhost:9200/_cat/indices?v&h=index,docs.count,store.size,health'
```

If `heap.percent` is consistently > 85%, either index less data, add heap (and
raise `mem_limit` accordingly), or delete unused indices.

---

## Long-term safety (running for weeks/months)

These are built into `docker-compose.yml` so the box stays healthy over time:

- **Container logs are capped** (`logging: json-file, max-size 10m, max-file 3`)
  — at most ~30 MB, so logs can never quietly fill the NVMe.
- **File descriptors raised** (`ulimits.nofile=65536`) — prevents "too many open
  files" once you accumulate many indices/segments.
- **Clean shutdown** (`stop_grace_period: 60s`) — ES flushes before stopping on
  `docker compose down` or reboot, avoiding shard corruption that shows up as a
  `RED` cluster on the next start.
- **Loopback-only port** (`127.0.0.1:9200`) — with security disabled, this keeps
  the unauthenticated node off the LAN/WiFi.

What still needs **your** attention long-term:

- **Disk usage of data**: indices grow with what you index. Watch with
  `curl 'localhost:9200/_cat/indices?v'` and delete dev indices you no longer
  need. If the Docker disk passes ~90% full, ES turns indices read-only — see
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Keeping CPU under control

- **Hard CPU cap** (`cpus: 4.0`) — the container is limited to 4 of the 8 logical
  CPUs on the i7-1185G7 (4 cores / 8 threads), i.e. ≤ 50% of total. Even at full
  load ES stays well under the **no sustained CPU above 80%** target, leaving 4
  threads for your IDE, browser, and NestJS.
- **`node.processors=4`** — tells ES to size its thread pools for 4 CPUs so they
  match the cgroup cap (avoids oversized pools and a startup warning).
- Bulk-indexing large datasets is the main thing that spikes CPU — throttle with
  smaller `_bulk` batches.
- Avoid running heavy aggregations in tight loops during development.

> On a machine with more cores, raise `cpus` (and `node.processors` to match).
> Rule of thumb: cap ES at ~half your logical CPUs for a comfortable dev box.

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

## Keeping CPU under control

- This setup targets **no sustained CPU above 80%**. Bulk-indexing large datasets
  is the main thing that spikes CPU — throttle with smaller `_bulk` batches.
- Avoid running heavy aggregations in tight loops during development.

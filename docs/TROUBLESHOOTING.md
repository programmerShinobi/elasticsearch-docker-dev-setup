# Troubleshooting

Common failures and how to resolve them.

---

## Container exits right after `up`

**Symptom:** `docker compose ps` shows `Exited`; logs mention
`max virtual memory areas vm.max_map_count [65530] is too low`.

**Fix:**

```bash
./scripts/setup-host.sh          # or: sudo sysctl -w vm.max_map_count=262144
docker compose up -d
```

---

## `curl: (7) Failed to connect to localhost port 9200`

**Cause:** Elasticsearch is still booting (first start takes 30–60 s), or the
container isn't healthy yet.

**Fix:**

```bash
docker compose ps                       # wait for STATUS = healthy
docker compose logs -f elasticsearch    # watch for "started"
```

---

## NestJS cannot connect (but `curl` works)

**Cause:** NestJS is configured with the in-Docker hostname.

```diff
- node: 'http://elasticsearch:9200'   # only works INSIDE Docker network
+ node: 'http://localhost:9200'       # correct for a host-local process
```

NestJS runs on the host, so it must use `localhost`.

---

## Cluster status is `yellow`

**This is normal and healthy** on a single node — replica shards can't be
allocated because there's only one node. Your data is fully available. No action
needed.

To silence it on a specific index (optional), set replicas to 0:

```bash
curl -XPUT localhost:9200/my-index/_settings \
  -H 'Content-Type: application/json' \
  -d '{"index":{"number_of_replicas":0}}'
```

---

## Cluster status is `RED`

`red` means at least one **primary** shard is unavailable. On a single-node dev
box the usual causes are:

### Disk watermark exceeded

```bash
curl 'localhost:9200/_cat/allocation?v'   # check disk.percent
df -h                                      # free space on the Docker disk
```

Free up disk space, or release the read-only block after cleanup:

```bash
curl -XPUT 'localhost:9200/_all/_settings' \
  -H 'Content-Type: application/json' \
  -d '{"index.blocks.read_only_allow_delete": null}'
```

### Corrupted data after an unclean shutdown

```bash
curl 'localhost:9200/_cluster/allocation/explain?pretty'   # diagnose
```

If a dev index is unrecoverable and disposable, delete it:

```bash
curl -XDELETE localhost:9200/<broken-index>
```

Last resort (wipes **all** data):

```bash
docker compose down -v && docker compose up -d
```

---

## Container keeps restarting

```bash
docker inspect -f '{{.RestartCount}}' elasticsearch
docker compose logs --tail=50 elasticsearch
```

Most common causes: `vm.max_map_count` not set, or the host killed the container
under memory pressure. Verify the kernel param and that nothing else is starving
RAM (see [PERFORMANCE.md](PERFORMANCE.md)).

---

## System becomes laggy

- Run `docker stats elasticsearch` — confirm it's within ~1.5 GB.
- Ensure `bootstrap.memory_lock=true` is active (no swapping).
- Lower the heap for your machine (see the table in
  [PERFORMANCE.md](PERFORMANCE.md)).

---

## "memory locking requested but memlock not allowed"

The `memlock` ulimit didn't apply. Confirm the `ulimits` block is present in
`docker-compose.yml`:

```yaml
ulimits:
  memlock:
    soft: -1
    hard: -1
```

Then recreate: `docker compose up -d --force-recreate`.

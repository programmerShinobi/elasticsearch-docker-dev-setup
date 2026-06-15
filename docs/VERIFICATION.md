# Verification & Acceptance Criteria

Use this checklist to confirm the installation is **valid**. Every item must pass.

---

## ✅ Acceptance checklist

| # | Check | Command | Pass condition |
|---|-------|---------|----------------|
| 1 | Container running | `docker compose ps` | State `running`, health `healthy` |
| 2 | Service responds | `curl http://localhost:9200` | JSON with cluster info |
| 3 | Cluster health | `curl localhost:9200/_cluster/health?pretty` | `status` is `green` or `yellow` |
| 4 | Port open (loopback only) | `ss -tlnp \| grep 9200` | Line showing `127.0.0.1:9200` LISTEN |
| 5 | Memory bounded | `docker stats --no-stream elasticsearch` | `MEM USAGE` ≤ ~1.5 GiB |
| 6 | Not restarting | `docker inspect -f '{{.RestartCount}}' elasticsearch` | Low/stable number |

---

## 1. Service responds with cluster info

```bash
curl http://localhost:9200
```

Expected (abridged):

```json
{
  "name" : "...",
  "cluster_name" : "docker-cluster",
  "version" : { "number" : "8.12.0" },
  "tagline" : "You Know, for Search"
}
```

## 2. Cluster health is green or yellow

```bash
curl http://localhost:9200/_cluster/health?pretty
```

```json
{
  "status" : "yellow",
  "number_of_nodes" : 1,
  "unassigned_shards" : 0
}
```

> `yellow` on a single node is **healthy** — replicas have nowhere to allocate.
> Only `red` is a failure.

## 3. Functional smoke test (optional)

```bash
# Create a doc
curl -XPOST localhost:9200/dev-test/_doc/1 \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello elasticsearch"}'

# Search it
curl 'localhost:9200/dev-test/_search?q=hello&pretty'

# Clean up
curl -XDELETE localhost:9200/dev-test
```

---

## 🚨 Failure conditions

The install is **INVALID** if any of these are true:

- Cluster `status` = **`red`**
- NestJS / `curl` **cannot connect** to `localhost:9200`
- Container **keeps restarting** (`RestartCount` climbing)
- Memory usage **exceeds 1.5 GB**
- System becomes **laggy / unresponsive**

If you hit any of these, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

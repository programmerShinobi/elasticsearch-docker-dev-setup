# Beginner's Tutorial — Start Here

This guide explains the project from zero. You do **not** need to know
Elasticsearch, Docker, or NestJS beforehand. Read it top to bottom, run the
commands as you go, and by the end you will have a working search database on
your laptop.

> **Who is this for?** Anyone who can open a terminal. If you have never used
> Docker, that's fine — we explain everything.

---

## Part 1 — What are we even building?

Let's define the three words in plain language.

### What is Elasticsearch?

**Elasticsearch is a search engine you run yourself.** Think of the search box
on a big shopping website: you type "red shoes" and it instantly finds matching
products out of millions. Elasticsearch is the technology that powers that kind
of fast, full-text search. In this project, you'll run your own private copy of
it on your computer so your app can search through data.

### What is Docker?

**Docker runs software inside a sealed box called a "container".** Normally,
installing a program like Elasticsearch means downloading it, installing Java,
configuring files... and it might clash with other things on your machine.
Docker skips all that: it downloads a pre-packaged box that already contains
Elasticsearch and everything it needs. You start the box, you stop the box. When
you delete the box, nothing is left behind on your system. Clean and simple.

A **container** is one running box. An **image** is the blueprint the box is
built from.

### What is NestJS?

**NestJS is a framework for building backend apps in TypeScript/JavaScript.**
It's the program *you* write — the one that will ask Elasticsearch to search for
things. In this project, NestJS is just the example "customer" that talks to
Elasticsearch. You can ignore it until Part 6 if you only want the database
running.

### How they fit together

```
   Your NestJS app  ──asks for──▶  Elasticsearch (running inside Docker)
   (the program          a search          (the search engine)
    you write)
```

Your app sends a request like "find documents containing the word hello", and
Elasticsearch sends back the matching results.

---

## Part 2 — What this project gives you

Running Elasticsearch on a laptop usually causes two problems:

1. **It eats all your memory (RAM)** and your whole computer gets slow.
2. **It crashes or refuses connections**, so your app can't use it.

This project is a set of pre-written config files that solve both. It runs
**one** Elasticsearch container that is deliberately limited so it:

- uses **at most 1.5 GB of RAM** (leaving the rest for your editor and browser),
- uses **at most half your CPU** (so the laptop stays responsive),
- **restarts automatically** if it stops,
- **keeps your data** even after you reboot.

You don't have to write any of this yourself — it's already done. Your job is
just to run it.

---

## Part 3 — Before you start (prerequisites)

You need **Docker** installed. Check by running these two commands in a terminal:

```bash
docker --version
docker compose version
```

If both print a version number (Docker 24 or newer), you're ready. If you get
"command not found", install Docker Desktop (Mac/Windows) or Docker Engine
(Linux) first, then come back.

> **Tip:** On Linux, if Docker commands complain about permissions, you may need
> to put `sudo` in front of them, or add yourself to the `docker` group:
> `sudo usermod -aG docker "$USER"` then log out and back in.

---

## Part 4 — Run it (the happy path)

Just **four commands**. Run them from the project folder.

### Step 1 — One-time host setup

Elasticsearch needs one Linux setting turned up, or it refuses to start. This
script does it for you (it will ask for your password because it changes a
system setting):

```bash
./scripts/setup-host.sh
```

> **What did that do?** It set a kernel value called `vm.max_map_count` to
> 262144. Elasticsearch needs this to manage its memory-mapped files. The script
> also makes the setting permanent so you never have to do it again.
>
> On **Mac or Windows** you can skip this step — Docker Desktop handles it.

### Step 2 — Start Elasticsearch

```bash
docker compose up -d
```

This reads [docker-compose.yml](../docker-compose.yml), downloads the
Elasticsearch image (~600 MB, first time only), and starts the container in the
background. The `-d` means "detached" — it runs quietly without locking up your
terminal.

The **first** start takes about 30–60 seconds while Elasticsearch boots up.

### Step 3 — Check it's alive

```bash
curl http://localhost:9200/_cluster/health?pretty
```

`curl` is a tool that sends a web request from the terminal. Here it's asking
Elasticsearch "how are you?". You should see something like:

```json
{
  "cluster_name" : "docker-cluster",
  "status" : "yellow",
  "number_of_nodes" : 1
}
```

### Step 4 — Understand "yellow" (this is important!)

You'll see `"status" : "yellow"` and might panic. **Don't.** Yellow is the
correct, healthy state here. Here's why:

- Elasticsearch can make backup copies of your data called **replicas**.
- A replica must live on a *different* machine than the original, for safety.
- You're running **one** machine, so the replica has nowhere to go.
- Elasticsearch flags this as "yellow" — meaning "everything works, but I
  couldn't place a backup copy."

For a single-laptop development setup, **yellow = success**. Only `red` means
something is actually broken.

🎉 That's it. Elasticsearch is running.

---

## Part 5 — Everyday commands

You don't need to memorize the long Docker commands. This project ships a
`Makefile` with short aliases:

| You want to... | Short command | What it really runs |
|----------------|---------------|---------------------|
| Start it | `make up` | `docker compose up -d` |
| Stop it (keep data) | `make down` | `docker compose down` |
| Restart it | `make restart` | `docker compose restart` |
| Watch the logs | `make logs` | `docker compose logs -f` |
| Check health | `make health` | a `curl` to the health endpoint |
| See if it's running | `make ps` | `docker compose ps` |
| **Delete everything** | `make clean` | `docker compose down -v` ⚠️ |

Run `make help` to see this list any time.

> ⚠️ **Careful with `make clean`** — it deletes your data volume, so every index
> and document is gone forever. Use `make down` for everyday stopping; it keeps
> your data.

---

## Part 6 — Connecting your app (NestJS example)

This is optional. Do it only when you want a real app to talk to Elasticsearch.

### The one rule you must remember

Your NestJS app runs **on your computer**, not inside Docker. So it reaches
Elasticsearch through the address:

```
http://localhost:9200    ✅ correct
http://elasticsearch:9200 ❌ wrong — only works inside Docker
```

`localhost` means "this same computer". The name `elasticsearch` is an internal
Docker nickname that only programs *inside* Docker can use. This is the single
most common beginner mistake — remember it and you'll save yourself an hour.

### The three example files

The [examples/nestjs/](../examples/nestjs/) folder has ready-to-use code you can
copy into your own NestJS project:

| File | What it does (plain English) |
|------|------------------------------|
| [search.module.ts](../examples/nestjs/search.module.ts) | Sets up the connection to Elasticsearch using the address from your `.env` file. |
| [search.service.ts](../examples/nestjs/search.service.ts) | The worker. Has functions to save a document, search, delete, and check health. |
| [search.controller.ts](../examples/nestjs/search.controller.ts) | The web endpoints. Turns `POST /search/articles` into "save this document", etc. |

### Quick wiring

1. Install the libraries:
   ```bash
   npm install @nestjs/elasticsearch @elastic/elasticsearch @nestjs/config
   ```
2. In your app's `.env` file, add the line from [.env.example](../.env.example):
   ```dotenv
   ELASTICSEARCH_NODE=http://localhost:9200
   ```
3. Copy the three example files into your project and import `SearchModule` in
   your `AppModule`. See [examples/nestjs/README.md](../examples/nestjs/README.md)
   for the exact snippet.

### Try it end-to-end

```bash
# Is the app talking to Elasticsearch?
curl localhost:3000/search/health

# Save a document
curl -XPOST localhost:3000/search/articles \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","title":"Hello ES","body":"my first document"}'

# Search for it
curl 'localhost:3000/search/articles?q=hello'
```

If the last command returns your document, the whole chain works:
**NestJS → localhost:9200 → Elasticsearch → back to you.** 🎉

---

## Part 7 — Playing with Elasticsearch directly (no app needed)

You can talk to Elasticsearch yourself with `curl`, no NestJS required. This is
a great way to learn how it works.

```bash
# Save (the term is "index") a document into an index called "dev-test"
curl -XPOST localhost:9200/dev-test/_doc/1 \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello elasticsearch"}'

# Search for the word "hello"
curl 'localhost:9200/dev-test/_search?q=hello&pretty'

# Clean up — delete the whole index
curl -XDELETE localhost:9200/dev-test
```

**Vocabulary you just learned:**
- An **index** is like a table/folder that holds similar documents.
- A **document** is a single record (a JSON object).
- To **index** a document (verb) means to save it so it becomes searchable.

---

## Part 8 — When something goes wrong

| What you see | What it means | What to do |
|--------------|---------------|------------|
| Container exits right away | The Linux setting from Step 1 isn't applied | Run `./scripts/setup-host.sh`, then `make up` |
| `curl: connection refused` | It's still booting (30–60s) | Wait, then check `make ps` for "healthy" |
| Status is `yellow` | Totally normal on one node | Nothing — it's healthy |
| Status is `red` | A primary shard is broken (disk full / corruption) | See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| NestJS can't connect, but `curl` works | App used `elasticsearch:9200` | Change it to `localhost:9200` |
| Laptop feels slow | Some other heavy app, or heap too big | See [PERFORMANCE.md](PERFORMANCE.md) |

For anything deeper, the project has dedicated guides:

- **[SETUP.md](SETUP.md)** — the formal step-by-step install.
- **[VERIFICATION.md](VERIFICATION.md)** — a checklist to prove your install is valid.
- **[PERFORMANCE.md](PERFORMANCE.md)** — how to tune memory/CPU for your machine
  (e.g. settings for an 8 GB vs 32 GB laptop).
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — fixes for every common failure.

---

## Part 9 — Mental model recap

Keep these five facts in your head and you understand the whole project:

1. **Docker** runs Elasticsearch in a sealed box so you don't have to install it manually.
2. **One container, on purpose** — it's a dev setup, not a production cluster.
3. **It's capped** at 1.5 GB RAM and 4 CPUs so your laptop stays usable.
4. **`yellow` is healthy** on a single node. Only `red` is bad.
5. **Apps connect via `http://localhost:9200`**, never `http://elasticsearch:9200`.

Now go build something. 🚀

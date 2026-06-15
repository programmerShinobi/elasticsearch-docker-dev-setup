# NestJS ↔ Elasticsearch (localhost) example

A minimal, copy-pasteable integration for a **host-local** NestJS app talking to
the Dockerized Elasticsearch from this repo at `http://localhost:9200`.

> These files are a reference to drop into your existing NestJS project — this
> repo only ships the Elasticsearch infrastructure, not a full Nest app.

---

## 1. Install dependencies

```bash
npm install @nestjs/elasticsearch @elastic/elasticsearch @nestjs/config
```

> Use the `@elastic/elasticsearch` major that matches the server, e.g. `^8.12.0`.

## 2. Environment

In your NestJS project's `.env`:

```dotenv
ELASTICSEARCH_NODE=http://localhost:9200
```

Why `localhost`? NestJS runs as a normal host process, **outside** Docker, so it
reaches the published port `9200`. The hostname `elasticsearch` only resolves
inside the Docker network and must **not** be used here.

## 3. Files

| File | Role |
|------|------|
| [`search.module.ts`](search.module.ts) | Registers `ElasticsearchModule` from env config |
| [`search.service.ts`](search.service.ts) | Thin wrapper: health, index, search, delete |
| [`search.controller.ts`](search.controller.ts) | Demo REST endpoints + health check |

## 4. Wire it up

Import `SearchModule` in your `AppModule`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SearchModule,
  ],
})
export class AppModule {}
```

## 5. Try it

```bash
# App health → also pings Elasticsearch
curl localhost:3000/search/health

# Index a document
curl -XPOST localhost:3000/search/articles \
  -H 'Content-Type: application/json' \
  -d '{"id":"1","title":"Hello ES","body":"first doc"}'

# Search
curl 'localhost:3000/search/articles?q=hello'
```

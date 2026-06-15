import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

export interface Article {
  id: string;
  title: string;
  body: string;
}

/** A document that carries its own id, used as the `_id` in Elasticsearch. */
export type WithId<T> = T & { id: string };

/** Summary returned by every bulk helper. */
export interface BulkSummary {
  total: number;
  successful: number;
  failed: number;
  /** Wall-clock time of the bulk call, in milliseconds. */
  tookMs: number;
}

/** A document the bulk helper could not write, with the reason. */
export interface BulkDrop<TDoc> {
  document: TDoc;
  error?: { reason?: string };
}

/** A single search hit (minimal shape this service relies on). */
export interface Hit<T> {
  _source?: T;
  sort?: unknown[];
}

/** Options shared by write helpers. */
export interface WriteOptions {
  /**
   * Make the change immediately searchable.
   *
   * Leave this `false` (the default) for bulk writes: forcing a refresh after
   * every batch is the #1 cause of slow imports. Set `true` only on the LAST
   * batch, or call `refresh()` once when you are done.
   */
  refresh?: boolean;
}

/**
 * Thin, dependency-free wrapper around the Elasticsearch client exposing the
 * operations an app actually needs during development:
 *
 *   - connectivity / health
 *   - single-document CRUD (get, exists, index, update, delete)
 *   - BULK insert / update / delete in ONE round trip (no per-item awaits)
 *   - counting and full-text search
 *   - safe iteration over large result sets (PIT + search_after)
 *   - query-wide update / delete
 *   - index administration (create, exists, delete, refresh)
 *
 * Performance principles baked in (so it scales from 10 to 10M docs):
 *   1. Never loop `await this.es.index(...)` per document — that is N+1 over the
 *      network. Use the `bulk*` methods, which send one batched request.
 *   2. `helpers.bulk` auto-chunks, retries failed items, and applies
 *      backpressure, so a huge array won't blow up memory or overwhelm the node.
 *   3. Don't refresh on every write. Refresh once at the end (or not at all and
 *      let the 1s default refresh interval handle it).
 *   4. For reading many documents, use `iterateAll` (Point-in-Time +
 *      search_after), never deep `from`/`size` pagination.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly es: ElasticsearchService) {}

  /** Log connectivity on startup so misconfiguration surfaces immediately. */
  async onModuleInit(): Promise<void> {
    try {
      const health = await this.health();
      this.logger.log(`Elasticsearch reachable — status: ${health.status}`);
    } catch (err) {
      this.logger.error(
        'Could not reach Elasticsearch at startup. ' +
          'Is the container up and is ELASTICSEARCH_NODE=http://localhost:9200?',
        err as Error,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Health
  // ──────────────────────────────────────────────────────────────────────────

  /** Returns cluster health; `status` is green | yellow | red. */
  async health(): Promise<{ status: string; number_of_nodes: number }> {
    const res = await this.es.cluster.health();
    return { status: res.status, number_of_nodes: res.number_of_nodes };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Single-document CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /** Fetch one document by id, or `null` if it does not exist. */
  async get<T = Article>(indexName: string, id: string): Promise<T | null> {
    try {
      const res = await this.es.get<T>({ index: indexName, id });
      return (res._source as T) ?? null;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  /** Cheap existence check (no document body transferred). */
  async exists(indexName: string, id: string): Promise<boolean> {
    return this.es.exists({ index: indexName, id });
  }

  /** Index (create or fully replace) a document by id. */
  async index(
    indexName: string,
    doc: Article,
    opts: WriteOptions = {},
  ): Promise<void> {
    await this.es.index({
      index: indexName,
      id: doc.id,
      document: doc,
      refresh: opts.refresh ? 'wait_for' : false,
    });
  }

  /**
   * Partial update of a single document. By default it upserts (creates the
   * document if it is missing). Pass `upsert: false` to fail on a missing id.
   */
  async update<T = Article>(
    indexName: string,
    id: string,
    partial: Partial<T>,
    opts: WriteOptions & { upsert?: boolean } = {},
  ): Promise<void> {
    await this.es.update({
      index: indexName,
      id,
      doc: partial,
      doc_as_upsert: opts.upsert ?? true,
      refresh: opts.refresh ? 'wait_for' : false,
    });
  }

  /** Delete a single document by id. */
  async remove(
    indexName: string,
    id: string,
    opts: WriteOptions = {},
  ): Promise<void> {
    await this.es.delete({
      index: indexName,
      id,
      refresh: opts.refresh ? 'wait_for' : false,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Bulk operations — ONE request, no per-item awaits (avoids N+1)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Bulk index (create or replace) many documents in a single batched request.
   *
   * Prefer this over calling `index()` in a loop: it sends one `_bulk` request
   * (auto-chunked by the client), instead of one network round trip per
   * document. Safe for very large arrays — the client streams and applies
   * backpressure rather than buffering everything at once.
   */
  async bulkIndex<T extends WithId<object>>(
    indexName: string,
    docs: T[],
    opts: WriteOptions = {},
  ): Promise<BulkSummary> {
    if (docs.length === 0) return this.emptySummary();

    const start = Date.now();
    const result = await this.es.helpers.bulk<T>({
      datasource: docs,
      refreshOnCompletion: opts.refresh ? indexName : undefined,
      onDocument: (doc: T) => ({ index: { _index: indexName, _id: doc.id } }),
      onDrop: (drop: BulkDrop<T>) =>
        this.logger.warn(
          `bulkIndex dropped _id=${drop.document.id}: ` +
            `${drop.error?.reason ?? 'unknown error'}`,
        ),
    });
    return this.toSummary(result, docs.length, start);
  }

  /**
   * Bulk partial-update many documents in a single request. Each entry must
   * carry its `id`; the remaining fields are merged into the stored document.
   * Upserts by default (missing ids are created) — pass `upsert: false` to
   * skip-and-drop missing ids instead.
   */
  async bulkUpdate<T extends WithId<object>>(
    indexName: string,
    updates: Array<Partial<T> & WithId<object>>,
    opts: WriteOptions & { upsert?: boolean } = {},
  ): Promise<BulkSummary> {
    if (updates.length === 0) return this.emptySummary();

    const start = Date.now();
    const docAsUpsert = opts.upsert ?? true;
    const result = await this.es.helpers.bulk({
      datasource: updates,
      refreshOnCompletion: opts.refresh ? indexName : undefined,
      onDocument: (item: Partial<T> & WithId<object>) => [
        { update: { _index: indexName, _id: item.id } },
        { doc_as_upsert: docAsUpsert },
      ],
      onDrop: (drop: BulkDrop<WithId<object>>) =>
        this.logger.warn(
          `bulkUpdate dropped _id=${drop.document.id}: ` +
            `${drop.error?.reason ?? 'unknown error'}`,
        ),
    });
    return this.toSummary(result, updates.length, start);
  }

  /** Bulk delete many documents by id in a single request. */
  async bulkDelete(
    indexName: string,
    ids: string[],
    opts: WriteOptions = {},
  ): Promise<BulkSummary> {
    if (ids.length === 0) return this.emptySummary();

    const start = Date.now();
    const result = await this.es.helpers.bulk<string>({
      datasource: ids,
      refreshOnCompletion: opts.refresh ? indexName : undefined,
      onDocument: (id: string) => ({ delete: { _index: indexName, _id: id } }),
      onDrop: (drop: BulkDrop<string>) =>
        this.logger.warn(
          `bulkDelete dropped _id=${drop.document}: ` +
            `${drop.error?.reason ?? 'unknown error'}`,
        ),
    });
    return this.toSummary(result, ids.length, start);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Read / search
  // ──────────────────────────────────────────────────────────────────────────

  /** Count documents matching a query (or every document if omitted). */
  async count(indexName: string, query?: object): Promise<number> {
    const res = await this.es.count({
      index: indexName,
      query: query ?? { match_all: {} },
    });
    return res.count;
  }

  /** Full-text search over title + body, returning matching documents. */
  async search(indexName: string, query: string): Promise<Article[]> {
    const res = await this.es.search<Article>({
      index: indexName,
      query: query
        ? { multi_match: { query, fields: ['title^2', 'body'] } }
        : { match_all: {} },
    });
    return res.hits.hits.map((hit) => hit._source as Article);
  }

  /**
   * Shallow, page-based search for UI grids. Keep `from + size` small (≤ 10k by
   * default in ES): deep pagination re-sorts everything on every page and gets
   * slow fast. To walk a whole index, use `iterateAll` instead.
   */
  async paginatedSearch<T = Article>(
    indexName: string,
    opts: { query?: object; from?: number; size?: number; sort?: object[] },
  ): Promise<{ total: number; items: T[] }> {
    const res = await this.es.search<T>({
      index: indexName,
      from: opts.from ?? 0,
      size: opts.size ?? 10,
      sort: opts.sort,
      track_total_hits: true,
      query: opts.query ?? { match_all: {} },
    });
    const total =
      typeof res.hits.total === 'number'
        ? res.hits.total
        : (res.hits.total?.value ?? 0);
    const items = res.hits.hits
      .map((h: Hit<T>) => h._source)
      .filter((s: T | undefined): s is T => s !== undefined);
    return { total, items };
  }

  /**
   * Stream an entire (possibly huge) result set in batches, without deep
   * pagination. Uses a Point-in-Time + `search_after`, the approach Elastic
   * recommends for scrolling through large datasets safely.
   *
   * @example
   *   for await (const batch of search.iterateAll<Article>('articles')) {
   *     await processInChunks(batch);
   *   }
   */
  async *iterateAll<T = Article>(
    indexName: string,
    opts: { query?: object; batchSize?: number } = {},
  ): AsyncGenerator<T[]> {
    const size = opts.batchSize ?? 1000;
    const pit = await this.es.openPointInTime({
      index: indexName,
      keep_alive: '1m',
    });

    let searchAfter: unknown[] | undefined;
    try {
      while (true) {
        const res = await this.es.search<T>({
          size,
          query: opts.query ?? { match_all: {} },
          pit: { id: pit.id, keep_alive: '1m' },
          // `_shard_doc` is the cheap, stable tiebreaker available with a PIT.
          sort: [{ _shard_doc: 'asc' }] as object[],
          search_after: searchAfter as never,
          track_total_hits: false,
        });

        const hits: Hit<T>[] = res.hits.hits;
        if (hits.length === 0) break;

        yield hits
          .map((h: Hit<T>) => h._source)
          .filter((s: T | undefined): s is T => s !== undefined);

        searchAfter = hits.at(-1)?.sort;
        if (hits.length < size) break;
      }
    } finally {
      await this.es.closePointInTime({ id: pit.id });
    }
  }

  /**
   * Update every document matching a query, server-side, in one call (no fetch
   * round trip). Returns how many were updated. `script` is a painless script,
   * e.g. `{ source: "ctx._source.views++" }`.
   */
  async updateByQuery(
    indexName: string,
    query: object,
    script: { source: string; params?: Record<string, unknown> },
    opts: WriteOptions = {},
  ): Promise<number> {
    const res = await this.es.updateByQuery({
      index: indexName,
      query,
      script,
      refresh: opts.refresh ?? false,
      conflicts: 'proceed',
    });
    return res.updated ?? 0;
  }

  /** Delete every document matching a query, server-side. Returns the count. */
  async deleteByQuery(
    indexName: string,
    query: object,
    opts: WriteOptions = {},
  ): Promise<number> {
    const res = await this.es.deleteByQuery({
      index: indexName,
      query,
      refresh: opts.refresh ?? false,
      conflicts: 'proceed',
    });
    return res.deleted ?? 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Index administration
  // ──────────────────────────────────────────────────────────────────────────

  /** Whether an index exists. */
  async indexExists(indexName: string): Promise<boolean> {
    return this.es.indices.exists({ index: indexName });
  }

  /**
   * Create an index with optional settings/mappings. No-op if it already
   * exists, so it is safe to call on every boot (idempotent).
   */
  async createIndex(
    indexName: string,
    body: { settings?: object; mappings?: object } = {},
  ): Promise<void> {
    if (await this.indexExists(indexName)) return;
    await this.es.indices.create({
      index: indexName,
      settings: body.settings,
      mappings: body.mappings,
    });
    this.logger.log(`Created index "${indexName}"`);
  }

  /** Delete an index and all its data. No-op if it does not exist. */
  async deleteIndex(indexName: string): Promise<void> {
    if (!(await this.indexExists(indexName))) return;
    await this.es.indices.delete({ index: indexName });
    this.logger.log(`Deleted index "${indexName}"`);
  }

  /**
   * Force a refresh so recent writes become searchable now. Call this ONCE
   * after a batch of `refresh: false` writes — not inside a loop.
   */
  async refresh(indexName: string): Promise<void> {
    await this.es.indices.refresh({ index: indexName });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  private emptySummary(): BulkSummary {
    return { total: 0, successful: 0, failed: 0, tookMs: 0 };
  }

  private toSummary(
    result: { total?: number; successful?: number; failed?: number },
    requested: number,
    startedAt: number,
  ): BulkSummary {
    const total = result.total ?? requested;
    const failed = result.failed ?? 0;
    return {
      total,
      successful: result.successful ?? total - failed,
      failed,
      tookMs: Date.now() - startedAt,
    };
  }
}

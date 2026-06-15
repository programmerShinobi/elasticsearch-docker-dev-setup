import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';

export interface Article {
  id: string;
  title: string;
  body: string;
}

/**
 * Thin wrapper around the Elasticsearch client with the few operations a
 * typical app needs: connectivity check, index, search, delete.
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

  /** Returns cluster health; `status` is green | yellow | red. */
  async health(): Promise<{ status: string; number_of_nodes: number }> {
    const res = await this.es.cluster.health();
    return { status: res.status, number_of_nodes: res.number_of_nodes };
  }

  /** Index (create/replace) a document by id and refresh so it's searchable. */
  async index(indexName: string, doc: Article): Promise<void> {
    await this.es.index({
      index: indexName,
      id: doc.id,
      document: doc,
      refresh: 'wait_for',
    });
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

  /** Delete a document by id. */
  async remove(indexName: string, id: string): Promise<void> {
    await this.es.delete({ index: indexName, id, refresh: 'wait_for' });
  }
}

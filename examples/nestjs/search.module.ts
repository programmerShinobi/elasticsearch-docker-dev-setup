import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Registers the Elasticsearch client for a host-local NestJS app.
 *
 * The node URL comes from the ELASTICSEARCH_NODE env var and defaults to
 * http://localhost:9200 — the address the Dockerized single node is published
 * on. Do NOT use http://elasticsearch:9200 here: that hostname only resolves
 * inside the Docker network, and NestJS runs on the host.
 */
@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        node: config.get<string>(
          'ELASTICSEARCH_NODE',
          'http://localhost:9200',
        ),
        // Security is disabled in dev mode, so no auth/TLS is configured.
        maxRetries: 3,
        requestTimeout: 10_000,
      }),
    }),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

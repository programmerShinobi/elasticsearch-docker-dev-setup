import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Article, SearchService } from './search.service';

/**
 * Demo REST endpoints exercising the Elasticsearch integration.
 * Adapt or remove for your real domain — this is reference material.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** GET /search/health → proves NestJS can reach localhost:9200. */
  @Get('health')
  health() {
    return this.search.health();
  }

  /** POST /search/:index → index a document. */
  @Post(':index')
  async index(
    @Param('index') index: string,
    @Body() doc: Article,
  ): Promise<{ indexed: string }> {
    await this.search.index(index, doc);
    return { indexed: doc.id };
  }

  /** GET /search/:index?q=term → full-text search. */
  @Get(':index')
  find(
    @Param('index') index: string,
    @Query('q') q: string,
  ): Promise<Article[]> {
    return this.search.search(index, q);
  }

  /** DELETE /search/:index/:id → remove a document. */
  @Delete(':index/:id')
  async remove(
    @Param('index') index: string,
    @Param('id') id: string,
  ): Promise<{ deleted: string }> {
    await this.search.remove(index, id);
    return { deleted: id };
  }
}

// src/embedding/dto/search-job.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class SearchJobDto {
  @ApiProperty({ example: 'Full Stack Developer for SaaS Dashboard' })
  job_title: string;

  @ApiProperty({
    example: 'Looking for someone who can handle both backend (Node.js/PostgreSQL) and frontend (React, Tailwind)...',
  })
  job_posting: string;
}

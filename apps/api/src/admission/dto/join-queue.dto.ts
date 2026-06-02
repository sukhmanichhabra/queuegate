import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class JoinQueueDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  /** Optional ticket category UUID. Required if the event has ticket categories. */
  @IsUUID()
  @IsOptional()
  categoryId?: string;
}

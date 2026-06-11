import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsPositive,
  Min,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsFutureDate } from './is-future-date.decorator';

export class CreateTicketCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsInt()
  @Min(1)
  capacity: number;

  /** Hex color for visual zone display, e.g. "#e11d48" */
  @IsString()
  @IsOptional()
  color?: string;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  artist: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsDateString()
  @IsFutureDate()
  showDate: string;

  @IsNumber()
  @IsPositive()
  ticketPrice: number;

  @IsString()
  @IsOptional()
  description?: string;

  /** Public URL of the event hero image */
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsOptional()
  seriesId?: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  admissionRatePerMin?: number;

  /** Optional ticket categories — if provided, replaces single ticketPrice for zone-based pricing */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTicketCategoryDto)
  @IsOptional()
  categories?: CreateTicketCategoryDto[];
}

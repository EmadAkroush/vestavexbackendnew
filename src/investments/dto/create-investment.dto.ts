import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInvestmentDto {
   @IsOptional()
  @IsMongoId()
  user: string;
  
  @IsMongoId()
  userId: string;
  
   @IsOptional()
  @IsMongoId()
  package: string;
  
  @IsOptional()
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

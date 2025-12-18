import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  name: string;

  @IsString()
  range: string;

  @IsNumber()
  dailyRate: number;

  @IsNumber()
  minDeposit: number;

  @IsNumber()
  maxDeposit: number;

  @IsOptional()
  @IsNumber()
  upgradeRate?: number;

  @IsOptional()
  @IsString()
  referralRequirement?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

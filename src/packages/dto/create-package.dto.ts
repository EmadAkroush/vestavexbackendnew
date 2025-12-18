import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  name: string;

  @IsString()
  range: string;

  @IsNumber()
  monthRate: number;

  @IsNumber()
  maxCap: number;

  @IsNumber()
  minDeposit: number;

  @IsNumber()
  maxDeposit: number;




  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

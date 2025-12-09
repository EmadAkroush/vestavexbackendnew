import { Test, TestingModule } from '@nestjs/testing';
import { BonusesService } from './bonuses.service';

describe('BonusesService', () => {
  let service: BonusesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BonusesService],
    }).compile();

    service = module.get<BonusesService>(BonusesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

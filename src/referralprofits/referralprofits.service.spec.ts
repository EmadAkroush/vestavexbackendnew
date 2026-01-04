import { Test, TestingModule } from '@nestjs/testing';
import { ReferralProfitsService } from './referralprofits.service';

describe('ReferralProfitsService', () => {
  let service: ReferralProfitsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReferralProfitsService],
    }).compile();

    service = module.get<ReferralProfitsService>(ReferralProfitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

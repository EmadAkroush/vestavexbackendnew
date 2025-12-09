import { Test, TestingModule } from '@nestjs/testing';
import { BonusesController } from './bonuses.controller';
import { BonusesService } from './bonuses.service';

describe('BonusesController', () => {
  let controller: BonusesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BonusesController],
      providers: [BonusesService],
    }).compile();

    controller = module.get<BonusesController>(BonusesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

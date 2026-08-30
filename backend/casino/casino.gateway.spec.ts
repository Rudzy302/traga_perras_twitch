import { Test, TestingModule } from '@nestjs/testing';
import { CasinoGateway } from './casino.gateway';

describe('CasinoGateway', () => {
  let gateway: CasinoGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CasinoGateway],
    }).compile();

    gateway = module.get<CasinoGateway>(CasinoGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});

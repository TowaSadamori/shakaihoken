import { TestBed } from '@angular/core/testing';

import { RegularDecisionService } from './regular-decision.service';

describe('RegularDecisionService', () => {
  let service: RegularDecisionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RegularDecisionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

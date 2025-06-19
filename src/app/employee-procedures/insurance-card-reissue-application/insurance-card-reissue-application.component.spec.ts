import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceCardReissueApplicationComponent } from './insurance-card-reissue-application.component';

describe('InsuranceCardReissueApplicationComponent', () => {
  let component: InsuranceCardReissueApplicationComponent;
  let fixture: ComponentFixture<InsuranceCardReissueApplicationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceCardReissueApplicationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuranceCardReissueApplicationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceCalculationBonusComponent } from './insurance-calculation-bonus.component';

describe('InsuranceCalculationBonusComponent', () => {
  let component: InsuranceCalculationBonusComponent;
  let fixture: ComponentFixture<InsuranceCalculationBonusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceCalculationBonusComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuranceCalculationBonusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

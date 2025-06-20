import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceCalculationSalaryComponent } from './insurance-calculation-salary.component';

describe('InsuranceCalculationSalaryComponent', () => {
  let component: InsuranceCalculationSalaryComponent;
  let fixture: ComponentFixture<InsuranceCalculationSalaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceCalculationSalaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsuranceCalculationSalaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

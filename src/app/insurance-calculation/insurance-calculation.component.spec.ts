import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceCalculationComponent } from './insurance-calculation.component';

describe('InsuranceCalculationComponent', () => {
  let component: InsuranceCalculationComponent;
  let fixture: ComponentFixture<InsuranceCalculationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceCalculationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuranceCalculationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

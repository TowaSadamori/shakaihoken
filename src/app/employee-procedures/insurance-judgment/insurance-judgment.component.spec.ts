import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuranceJudgmentComponent } from './insurance-judgment.component';

describe('InsuranceJudgmentComponent', () => {
  let component: InsuranceJudgmentComponent;
  let fixture: ComponentFixture<InsuranceJudgmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuranceJudgmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InsuranceJudgmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

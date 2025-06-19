import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GradeJudgmentComponent } from './grade-judgment.component';

describe('GradeJudgmentComponent', () => {
  let component: GradeJudgmentComponent;
  let fixture: ComponentFixture<GradeJudgmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GradeJudgmentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GradeJudgmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

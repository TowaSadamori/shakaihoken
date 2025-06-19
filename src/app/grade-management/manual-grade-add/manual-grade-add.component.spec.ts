import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManualGradeAddComponent } from './manual-grade-add.component';

describe('ManualGradeAddComponent', () => {
  let component: ManualGradeAddComponent;
  let fixture: ComponentFixture<ManualGradeAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManualGradeAddComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualGradeAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployeeProceduresPlaceholderComponent } from './employee-procedures-placeholder.component';

describe('EmployeeProceduresPlaceholderComponent', () => {
  let component: EmployeeProceduresPlaceholderComponent;
  let fixture: ComponentFixture<EmployeeProceduresPlaceholderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeProceduresPlaceholderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeProceduresPlaceholderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

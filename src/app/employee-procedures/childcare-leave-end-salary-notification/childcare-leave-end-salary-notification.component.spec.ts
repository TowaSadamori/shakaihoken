import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChildcareLeaveEndSalaryNotificationComponent } from './childcare-leave-end-salary-notification.component';

describe('ChildcareLeaveEndSalaryNotificationComponent', () => {
  let component: ChildcareLeaveEndSalaryNotificationComponent;
  let fixture: ComponentFixture<ChildcareLeaveEndSalaryNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChildcareLeaveEndSalaryNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChildcareLeaveEndSalaryNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

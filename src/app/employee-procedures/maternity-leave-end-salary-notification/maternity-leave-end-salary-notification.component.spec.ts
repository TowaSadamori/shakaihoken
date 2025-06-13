import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaternityLeaveEndSalaryNotificationComponent } from './maternity-leave-end-salary-notification.component';

describe('MaternityLeaveEndSalaryNotificationComponent', () => {
  let component: MaternityLeaveEndSalaryNotificationComponent;
  let fixture: ComponentFixture<MaternityLeaveEndSalaryNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaternityLeaveEndSalaryNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MaternityLeaveEndSalaryNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

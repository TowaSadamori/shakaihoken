import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonthlyChangeNotificationComponent } from './monthly-change-notification.component';

describe('MonthlyChangeNotificationComponent', () => {
  let component: MonthlyChangeNotificationComponent;
  let fixture: ComponentFixture<MonthlyChangeNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthlyChangeNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MonthlyChangeNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

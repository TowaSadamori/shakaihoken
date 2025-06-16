import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BonusPaymentNotificationComponent } from './bonus-payment-notification.component';

describe('BonusPaymentNotificationComponent', () => {
  let component: BonusPaymentNotificationComponent;
  let fixture: ComponentFixture<BonusPaymentNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BonusPaymentNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BonusPaymentNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountTransferNotificationComponent } from './account-transfer-notification.component';

describe('AccountTransferNotificationComponent', () => {
  let component: AccountTransferNotificationComponent;
  let fixture: ComponentFixture<AccountTransferNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountTransferNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountTransferNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

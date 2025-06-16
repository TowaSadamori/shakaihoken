import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NameAddressChangeNotificationComponent } from './name-address-change-notification.component';

describe('NameAddressChangeNotificationComponent', () => {
  let component: NameAddressChangeNotificationComponent;
  let fixture: ComponentFixture<NameAddressChangeNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NameAddressChangeNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NameAddressChangeNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

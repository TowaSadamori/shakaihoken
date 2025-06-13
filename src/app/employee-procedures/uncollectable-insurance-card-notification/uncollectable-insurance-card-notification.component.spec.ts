import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UncollectableInsuranceCardNotificationComponent } from './uncollectable-insurance-card-notification.component';

describe('UncollectableInsuranceCardNotificationComponent', () => {
  let component: UncollectableInsuranceCardNotificationComponent;
  let fixture: ComponentFixture<UncollectableInsuranceCardNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UncollectableInsuranceCardNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UncollectableInsuranceCardNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

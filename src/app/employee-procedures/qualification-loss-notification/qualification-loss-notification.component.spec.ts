import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QualificationLossNotificationComponent } from './qualification-loss-notification.component';

describe('QualificationLossNotificationComponent', () => {
  let component: QualificationLossNotificationComponent;
  let fixture: ComponentFixture<QualificationLossNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QualificationLossNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QualificationLossNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

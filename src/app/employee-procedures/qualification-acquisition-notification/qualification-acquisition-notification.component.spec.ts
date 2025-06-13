import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QualificationAcquisitionNotificationComponent } from './qualification-acquisition-notification.component';

describe('QualificationAcquisitionNotificationComponent', () => {
  let component: QualificationAcquisitionNotificationComponent;
  let fixture: ComponentFixture<QualificationAcquisitionNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QualificationAcquisitionNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QualificationAcquisitionNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AbolitionNotificationComponent } from './abolition-notification.component';

describe('AbolitionNotificationComponent', () => {
  let component: AbolitionNotificationComponent;
  let fixture: ComponentFixture<AbolitionNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AbolitionNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AbolitionNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

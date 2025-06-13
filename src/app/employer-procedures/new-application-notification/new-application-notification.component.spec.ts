import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewApplicationNotificationComponent } from './new-application-notification.component';

describe('NewApplicationNotificationComponent', () => {
  let component: NewApplicationNotificationComponent;
  let fixture: ComponentFixture<NewApplicationNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewApplicationNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NewApplicationNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

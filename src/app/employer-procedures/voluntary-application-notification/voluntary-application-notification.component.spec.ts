import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoluntaryApplicationNotificationComponent } from './voluntary-application-notification.component';

describe('VoluntaryApplicationNotificationComponent', () => {
  let component: VoluntaryApplicationNotificationComponent;
  let fixture: ComponentFixture<VoluntaryApplicationNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoluntaryApplicationNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VoluntaryApplicationNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

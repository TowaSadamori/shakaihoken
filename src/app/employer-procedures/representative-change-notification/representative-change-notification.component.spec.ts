import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepresentativeChangeNotificationComponent } from './representative-change-notification.component';

describe('RepresentativeChangeNotificationComponent', () => {
  let component: RepresentativeChangeNotificationComponent;
  let fixture: ComponentFixture<RepresentativeChangeNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RepresentativeChangeNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RepresentativeChangeNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

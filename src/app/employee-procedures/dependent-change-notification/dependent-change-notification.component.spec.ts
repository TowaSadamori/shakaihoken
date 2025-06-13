import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DependentChangeNotificationComponent } from './dependent-change-notification.component';

describe('DependentChangeNotificationComponent', () => {
  let component: DependentChangeNotificationComponent;
  let fixture: ComponentFixture<DependentChangeNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DependentChangeNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DependentChangeNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

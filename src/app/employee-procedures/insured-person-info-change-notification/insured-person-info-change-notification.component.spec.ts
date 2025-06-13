import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuredPersonInfoChangeNotificationComponent } from './insured-person-info-change-notification.component';

describe('InsuredPersonInfoChangeNotificationComponent', () => {
  let component: InsuredPersonInfoChangeNotificationComponent;
  let fixture: ComponentFixture<InsuredPersonInfoChangeNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuredPersonInfoChangeNotificationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuredPersonInfoChangeNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

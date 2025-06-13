import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaternityLeaveApplicationComponent } from './maternity-leave-application.component';

describe('MaternityLeaveApplicationComponent', () => {
  let component: MaternityLeaveApplicationComponent;
  let fixture: ComponentFixture<MaternityLeaveApplicationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaternityLeaveApplicationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MaternityLeaveApplicationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

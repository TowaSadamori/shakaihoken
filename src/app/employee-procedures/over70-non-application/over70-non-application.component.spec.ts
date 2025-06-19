import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Over70NonApplicationComponent } from './over70-non-application.component';

describe('Over70NonApplicationComponent', () => {
  let component: Over70NonApplicationComponent;
  let fixture: ComponentFixture<Over70NonApplicationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Over70NonApplicationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(Over70NonApplicationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

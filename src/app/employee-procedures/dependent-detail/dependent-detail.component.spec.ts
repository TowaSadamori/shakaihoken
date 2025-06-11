import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DependentDetailComponent } from './dependent-detail.component';

describe('DependentDetailComponent', () => {
  let component: DependentDetailComponent;
  let fixture: ComponentFixture<DependentDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DependentDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DependentDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

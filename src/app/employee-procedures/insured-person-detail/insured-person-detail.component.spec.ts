import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuredPersonDetailComponent } from './insured-person-detail.component';

describe('InsuredPersonDetailComponent', () => {
  let component: InsuredPersonDetailComponent;
  let fixture: ComponentFixture<InsuredPersonDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuredPersonDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuredPersonDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

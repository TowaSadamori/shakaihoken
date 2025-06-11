import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InsuredPersonFormComponent } from './insured-person-form.component';

describe('InsuredPersonFormComponent', () => {
  let component: InsuredPersonFormComponent;
  let fixture: ComponentFixture<InsuredPersonFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsuredPersonFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InsuredPersonFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

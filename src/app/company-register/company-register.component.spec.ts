import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyRegisterComponent } from './company-register.component';

describe('CompanyRegisterComponent', () => {
  let component: CompanyRegisterComponent;
  let fixture: ComponentFixture<CompanyRegisterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyRegisterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyRegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

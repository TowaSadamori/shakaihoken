import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployerProceduresPlaceholderComponent } from './employer-procedures-placeholder.component';

describe('EmployerProceduresPlaceholderComponent', () => {
  let component: EmployerProceduresPlaceholderComponent;
  let fixture: ComponentFixture<EmployerProceduresPlaceholderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployerProceduresPlaceholderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployerProceduresPlaceholderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

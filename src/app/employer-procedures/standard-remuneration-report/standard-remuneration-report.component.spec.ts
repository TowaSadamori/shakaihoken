import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StandardRemunerationReportComponent } from './standard-remuneration-report.component';

describe('StandardRemunerationReportComponent', () => {
  let component: StandardRemunerationReportComponent;
  let fixture: ComponentFixture<StandardRemunerationReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StandardRemunerationReportComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StandardRemunerationReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

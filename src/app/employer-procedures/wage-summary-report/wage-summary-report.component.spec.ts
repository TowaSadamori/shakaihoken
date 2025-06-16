import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WageSummaryReportComponent } from './wage-summary-report.component';

describe('WageSummaryReportComponent', () => {
  let component: WageSummaryReportComponent;
  let fixture: ComponentFixture<WageSummaryReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WageSummaryReportComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WageSummaryReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

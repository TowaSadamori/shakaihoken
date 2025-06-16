import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoBonusReportComponent } from './no-bonus-report.component';

describe('NoBonusReportComponent', () => {
  let component: NoBonusReportComponent;
  let fixture: ComponentFixture<NoBonusReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoBonusReportComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NoBonusReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

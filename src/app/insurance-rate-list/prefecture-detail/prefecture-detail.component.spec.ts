import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrefectureDetailComponent } from './prefecture-detail.component';

describe('PrefectureDetailComponent', () => {
  let component: PrefectureDetailComponent;
  let fixture: ComponentFixture<PrefectureDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrefectureDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PrefectureDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

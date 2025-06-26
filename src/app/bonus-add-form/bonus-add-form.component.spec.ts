import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BonusAddFormComponent } from './bonus-add-form.component';

describe('BonusAddFormComponent', () => {
  let component: BonusAddFormComponent;
  let fixture: ComponentFixture<BonusAddFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BonusAddFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BonusAddFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

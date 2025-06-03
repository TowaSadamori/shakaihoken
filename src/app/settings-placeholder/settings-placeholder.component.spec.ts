import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsPlaceholderComponent } from './settings-placeholder.component';

describe('SettingsPlaceholderComponent', () => {
  let component: SettingsPlaceholderComponent;
  let fixture: ComponentFixture<SettingsPlaceholderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPlaceholderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsPlaceholderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

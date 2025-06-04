import { MatDateFormats } from '@angular/material/core';

export const MY_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'y/M/d',
  },
  display: {
    dateInput: 'y/M/d',
    monthYearLabel: 'y年M月',
    dateA11yLabel: 'y/M/d',
    monthYearA11yLabel: 'y年M月',
  },
};

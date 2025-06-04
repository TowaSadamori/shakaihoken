import { NgModule } from '@angular/core';
import { MatNativeDateModule } from '@angular/material/core';

@NgModule({
  imports: [MatNativeDateModule],
  exports: [MatNativeDateModule],
})
export class MaterialProviderModule {}

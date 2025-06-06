import { Routes } from '@angular/router';
import { MainLayoutComponent } from './main-layout/main-layout.component';
import { HomeComponent } from './home/home.component';
import { EmployeeProceduresPlaceholderComponent } from './employee-procedures-placeholder/employee-procedures-placeholder.component';
import { EmployerProceduresPlaceholderComponent } from './employer-procedures-placeholder/employer-procedures-placeholder.component';
import { SettingsPlaceholderComponent } from './settings-placeholder/settings-placeholder.component';
import { CreateAccountComponent } from './create-account/create-account.component';
import { LoginComponent } from './login/login.component';
import { authGuard } from './services/auth.guard';
import { RegisterCompanyComponent } from './register-company/register-company.component';
import { PasswordResetComponent } from '../../shakaihoken_functions/password-reset/password-reset.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register-company', component: RegisterCompanyComponent },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: HomeComponent },
      { path: 'employee-procedures', component: EmployeeProceduresPlaceholderComponent },
      { path: 'employer-procedures', component: EmployerProceduresPlaceholderComponent },
      { path: 'settings', component: SettingsPlaceholderComponent },
      { path: 'create-account', component: CreateAccountComponent },
    ],
  },
  { path: 'password-reset', component: PasswordResetComponent },
];

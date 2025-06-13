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
      {
        path: 'employee-procedures/insured-person-form',
        loadComponent: () =>
          import('./employee-procedures/insured-person-form/insured-person-form.component').then(
            (m) => m.InsuredPersonFormComponent
          ),
      },
      {
        path: 'employee-salary-bonus',
        loadComponent: () =>
          import('./employee-salary-bonus/employee-salary-bonus.component').then(
            (m) => m.EmployeeSalaryBonusComponent
          ),
      },
      { path: 'employer-procedures', component: EmployerProceduresPlaceholderComponent },
      {
        path: 'company-register',
        loadComponent: () =>
          import('./company-register/company-register.component').then(
            (m) => m.CompanyRegisterComponent
          ),
      },
      { path: 'settings', component: SettingsPlaceholderComponent },
      { path: 'create-account', component: CreateAccountComponent },
      {
        path: 'office-detail/:id',
        loadComponent: () =>
          import('./office-detail/office-detail.component').then((m) => m.OfficeDetailComponent),
      },
      {
        path: 'insurance-rate-list',
        loadComponent: () =>
          import('./insurance-rate-list/insurance-rate-list/insurance-rate-list.component').then(
            (m) => m.InsuranceRateListComponent
          ),
      },
      {
        path: 'insurance-rate-list/:year',
        loadComponent: () =>
          import(
            './insurance-rate-list/insurance-rate-pref-list/insurance-rate-pref-list.component'
          ).then((m) => m.InsuranceRatePrefListComponent),
      },
      {
        path: 'insurance-rate-list/:year/:prefecture',
        loadComponent: () =>
          import('./insurance-rate-list/prefecture-detail/prefecture-detail.component').then(
            (m) => m.PrefectureDetailComponent
          ),
      },
      {
        path: 'employee-salary-bonus/detail/:employeeId',
        loadComponent: () =>
          import(
            './employee-salary-bonus/employee-salary-bonus-detail/employee-salary-bonus-detail.component'
          ).then((m) => m.EmployeeSalaryBonusDetailComponent),
      },
      {
        path: 'employee-procedures/insured-person-detail/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/insured-person-detail/insured-person-detail.component'
          ).then((m) => m.InsuredPersonDetailComponent),
      },
      {
        path: 'employee-procedures/dependent-detail/:uid',
        loadComponent: () =>
          import('./employee-procedures/dependent-detail/dependent-detail.component').then(
            (m) => m.DependentDetailComponent
          ),
      },
      {
        path: 'employee-procedures/application-form/:uid',
        loadComponent: () =>
          import('./employee-procedures/application-form/application-form.component').then(
            (m) => m.ApplicationFormComponent
          ),
      },
      {
        path: 'employee-procedures/maternity-leave-application/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/maternity-leave-application/maternity-leave-application.component'
          ).then((m) => m.MaternityLeaveApplicationComponent),
      },
      {
        path: 'employee-procedures/childcare-leave-application/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/childcare-leave-application/childcare-leave-application.component'
          ).then((m) => m.ChildcareLeaveApplicationComponent),
      },
      {
        path: 'employee-procedures/care-insurance-exemption-application/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/care-insurance-exemption-application/care-insurance-exemption-application.component'
          ).then((m) => m.CareInsuranceExemptionApplicationComponent),
      },
      {
        path: 'employee-procedures/over70-application/:uid',
        loadComponent: () =>
          import('./employee-procedures/over70-application/over70-application.component').then(
            (m) => m.Over70ApplicationComponent
          ),
      },
    ],
  },
  { path: 'password-reset', component: PasswordResetComponent },
];

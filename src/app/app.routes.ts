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
      {
        path: 'employee-procedures/childcare-period-exemption-application/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/childcare-period-exemption-application/childcare-period-exemption-application.component'
          ).then((m) => m.ChildcarePeriodExemptionApplicationComponent),
      },
      {
        path: 'employee-procedures/qualification-acquisition-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/qualification-acquisition-notification/qualification-acquisition-notification.component'
          ).then((m) => m.QualificationAcquisitionNotificationComponent),
      },
      {
        path: 'employee-procedures/qualification-loss-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/qualification-loss-notification/qualification-loss-notification.component'
          ).then((m) => m.QualificationLossNotificationComponent),
      },
      {
        path: 'employee-procedures/uncollectable-insurance-card-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/uncollectable-insurance-card-notification/uncollectable-insurance-card-notification.component'
          ).then((m) => m.UncollectableInsuranceCardNotificationComponent),
      },
      {
        path: 'employee-procedures/insurance-card-reissue-application/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/insurance-card-reissue-application/insurance-card-reissue-application.component'
          ).then((m) => m.InsuranceCardReissueApplicationComponent),
      },
      {
        path: 'employee-procedures/insured-person-info-change-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/insured-person-info-change-notification/insured-person-info-change-notification.component'
          ).then((m) => m.InsuredPersonInfoChangeNotificationComponent),
      },
      {
        path: 'employee-procedures/dependent-change-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/dependent-change-notification/dependent-change-notification.component'
          ).then((m) => m.DependentChangeNotificationComponent),
      },
      {
        path: 'employee-procedures/childcare-leave-end-salary-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/childcare-leave-end-salary-notification/childcare-leave-end-salary-notification.component'
          ).then((m) => m.ChildcareLeaveEndSalaryNotificationComponent),
      },
      {
        path: 'employee-procedures/maternity-leave-end-salary-notification/:uid',
        loadComponent: () =>
          import(
            './employee-procedures/maternity-leave-end-salary-notification/maternity-leave-end-salary-notification.component'
          ).then((m) => m.MaternityLeaveEndSalaryNotificationComponent),
      },
      {
        path: 'employer-procedures/new-application-notification/:uid',
        loadComponent: () =>
          import(
            './employer-procedures/new-application-notification/new-application-notification.component'
          ).then((m) => m.NewApplicationNotificationComponent),
      },
      {
        path: 'employer-procedures/abolition-notification/:uid',
        loadComponent: () =>
          import(
            './employer-procedures/abolition-notification/abolition-notification.component'
          ).then((m) => m.AbolitionNotificationComponent),
      },
      {
        path: 'employer-procedures/voluntary-application-notification/:uid',
        loadComponent: () =>
          import(
            './employer-procedures/voluntary-application-notification/voluntary-application-notification.component'
          ).then((m) => m.VoluntaryApplicationNotificationComponent),
      },
      {
        path: 'employer-procedures/name-address-change-notification/:uid',
        loadComponent: () =>
          import(
            './employer-procedures/name-address-change-notification/name-address-change-notification.component'
          ).then((m) => m.NameAddressChangeNotificationComponent),
      },
      {
        path: 'employer-procedures/representative-change-notification/:uid',
        loadComponent: () =>
          import(
            './employer-procedures/representative-change-notification/representative-change-notification.component'
          ).then((m) => m.RepresentativeChangeNotificationComponent),
      },
    ],
  },
  { path: 'password-reset', component: PasswordResetComponent },
];

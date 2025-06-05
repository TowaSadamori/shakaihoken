import { CanActivateFn } from '@angular/router';
import { getAuth } from 'firebase/auth';

export const authGuard: CanActivateFn = () => {
  const auth = getAuth();
  if (auth.currentUser) {
    return true;
  } else {
    return new Promise<boolean>((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe();
        if (user) {
          resolve(true);
        } else {
          resolve(false);
          window.location.href = '/login';
        }
      });
    });
  }
};

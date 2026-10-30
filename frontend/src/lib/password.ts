// Password rules shared by the sign-up form and its live checklist.
// ``label`` values are i18n keys.

export interface PasswordRequirement {
  key: string;
  label: string;
  test: (password: string) => boolean;
}

export const passwordRequirements: PasswordRequirement[] = [
  {
    key: 'minLength',
    label: 'password.requirements.minLength',
    test: (pw) => pw.length >= 8,
  },
  {
    key: 'uppercase',
    label: 'password.requirements.uppercase',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    key: 'lowercase',
    label: 'password.requirements.lowercase',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    key: 'number',
    label: 'password.requirements.number',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    key: 'special',
    label: 'password.requirements.special',
    test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw),
  },
];

export function validatePassword(password: string): boolean {
  return passwordRequirements.every((req) => req.test(password));
}

export function getPasswordStrength(password: string): number {
  const passed = passwordRequirements.filter((req) => req.test(password)).length;
  return Math.round((passed / passwordRequirements.length) * 100);
}

// lib/validation.ts - Validation helpers

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 6;
};

export const isValidUsername = (username: string): boolean => {
  return username.trim().length >= 3 && username.length <= 20;
};

export const isValidChannelName = (name: string): boolean => {
  return name.trim().length >= 1 && name.length <= 100;
};

export const isValidServerName = (name: string): boolean => {
  return name.trim().length >= 3 && name.length <= 50;
};

// lib/errors.ts

import { ApiError } from './types';

export class ApiException extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiException';
    this.code = error.code;
    this.details = error.details;
  }
}

export const handleApiError = (error: unknown): ApiException => {
  if (error instanceof ApiException) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiException({
      code: 'UNKNOWN_ERROR',
      message: error.message,
    });
  }

  return new ApiException({
    code: 'UNKNOWN_ERROR',
    message: 'Une erreur inconnue est survenue',
  });
};

export const getErrorMessage = (error: unknown): string => {
  const apiError = handleApiError(error);
  
  // Messages d'erreur en français
  const errorMessages: Record<string, string> = {
    'INVALID_CREDENTIALS': 'Email ou mot de passe incorrect',
    'USER_ALREADY_EXISTS': 'Cet email est déjà utilisé',
    'INVALID_TOKEN': 'Session expirée, veuillez vous reconnecter',
    'UNAUTHORIZED': 'Accès non autorisé',
    'FORBIDDEN': 'Vous n\'avez pas les permissions nécessaires',
    'NOT_FOUND': 'Ressource introuvable',
    'SERVER_ERROR': 'Erreur serveur, veuillez réessayer',
    'NETWORK_ERROR': 'Erreur de connexion, vérifiez votre internet',
  };

  return errorMessages[apiError.code] || apiError.message;
};
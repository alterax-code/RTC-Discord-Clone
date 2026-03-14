'use client';

export default function ErrorMessage({ code }: { code: number }) {
  const errors: Record<number, string> = {
    403: "⛔️ Accès refusé : vous n'avez pas la permission.",
    404: "🔍 Ressource introuvable.",
    500: "💥 Erreur serveur. Réessayez plus tard.",
  };

  return (
    <div className="bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-md text-sm">
      {errors[code] ?? 'Erreur inconnue.'}
    </div>
  );
}

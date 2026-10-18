const LARGO_UUID_CORTO = 8

/** Cómo se llama un usuario en el historial: "Sistema" (sin `usuario_id`), su email, o el uuid corto si no se conoce el email. */
export function nombreDeUsuario(id: string | null, emails: ReadonlyMap<string, string>): string {
  if (id === null) return 'Sistema'
  return emails.get(id) ?? id.slice(0, LARGO_UUID_CORTO)
}

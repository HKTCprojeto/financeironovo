/**
 * Admin do sistema.
 *
 * Mesmo e-mail usado pela Edge Function admin-invite (ADMIN_EMAIL) e pela
 * função is_admin() do banco, que é quem de fato barra as operações. A
 * checagem no front serve só para esconder botões — nunca como segurança.
 */
export const ADMIN_EMAIL = "rodrigo.coelho@hktc.com.br";

export function ehAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

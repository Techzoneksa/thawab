const API = "/api/users";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface AppRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string;
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "تعذّر تنفيذ العملية");
  return data;
}

export async function getUsers(
  filters: { search?: string; status?: string; role?: string } = {},
): Promise<{
  items: AppUser[];
  total: number;
  roles: AppRole[];
}> {
  const p = new URLSearchParams();
  if (filters.search) p.set("search", filters.search);
  if (filters.status) p.set("status", filters.status);
  if (filters.role) p.set("role", filters.role);
  return handle(await fetch(`${API}?${p.toString()}`));
}

export async function createUser(input: {
  name: string;
  email: string;
  role: string;
  phone?: string;
  password?: string;
  mustChangePassword?: boolean;
}): Promise<{
  item: AppUser;
  emailSent?: boolean;
  setupUrl?: string;
  tempPassword?: string | null;
}> {
  return handle(
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateUser(input: {
  id: string;
  name?: string;
  role?: string;
  phone?: string;
  status?: string;
  password?: string;
  mustChangePassword?: boolean;
}): Promise<{ item: AppUser }> {
  return handle(
    await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function disableUser(id: string): Promise<void> {
  await handle(await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

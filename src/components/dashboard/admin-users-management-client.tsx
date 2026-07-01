"use client";

import { useEffect, useState } from "react";
import { RiDeleteBinLine } from "@remixicon/react";
import { toast } from "sonner";

import { useDashboardQueryControls } from "@/components/dashboard/dashboard-query-provider";
import { DataTableSwitch } from "@/components/dashboard/data-table-switch";
import { TableActionButton } from "@/components/dashboard/table-action-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AutoTransition } from "@/components/ui/auto-transition";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { shortDateTime } from "@/lib/dashboard/format";
import type { AccountUserData } from "@/lib/edge-client";
import type { Locale } from "@/lib/i18n/config";
import type { AppMessages } from "@/lib/i18n/messages";

interface AdminUsersManagementClientProps {
  locale: Locale;
  messages: AppMessages;
  currentUserId?: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function getUsers(): Promise<AccountUserData[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
    const { handleDemoRequest } = await import("@/lib/realtime/mock");
    const result = handleDemoRequest({
      path: "/api/private/admin/users",
    }) as ApiResponse<AccountUserData[]>;
    return Array.isArray(result.data) ? result.data : [];
  }
  const response = await fetch("/api/private/admin/users", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiResponse<AccountUserData[]>;
  if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
    throw new Error(payload.message || payload.error || "load_users_failed");
  }
  return payload.data;
}

function formatDefaultTeamName(template: string, name: string) {
  return template.replace("{name}", name);
}

export function AdminUsersManagementClient({
  locale,
  messages,
  currentUserId,
}: AdminUsersManagementClientProps) {
  const { timeZone } = useDashboardQueryControls();
  const t = messages.adminUsers;
  const defaultTeamNameTemplate = t.defaultTeamName;
  const [users, setUsers] = useState<AccountUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [systemRole, setSystemRole] = useState<"admin" | "user">("user");
  const [teamName, setTeamName] = useState("");
  const [teamNameTouched, setTeamNameTouched] = useState(false);
  const [teamSlug, setTeamSlug] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(
    null,
  );
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getUsers()
      .then((data) => {
        if (!active) return;
        setUsers(data);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : t.loadFailed;
        toast.error(message || t.loadFailed);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t.loadFailed]);

  useEffect(() => {
    if (teamNameTouched) return;
    const base = (name.trim() || username.trim()).trim();
    setTeamName(
      base ? formatDefaultTeamName(defaultTeamNameTemplate, base) : "",
    );
  }, [defaultTeamNameTemplate, name, teamNameTouched, username]);

  async function refreshUsers() {
    const data = await getUsers();
    setUsers(data);
  }

  async function handleCreateUser() {
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim();
    const normalizedTeamName =
      teamName.trim() ||
      formatDefaultTeamName(
        defaultTeamNameTemplate,
        (name.trim() || normalizedUsername || "User").trim(),
      );
    if (
      normalizedUsername.length < 2 ||
      normalizedEmail.length < 3 ||
      !normalizedEmail.includes("@") ||
      password.length < 8 ||
      normalizedTeamName.length < 2
    ) {
      toast.error(t.invalidInput);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/private/admin/users", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          name: name.trim() || undefined,
          password,
          systemRole,
          teamName: normalizedTeamName,
          teamSlug: teamSlug.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as ApiResponse<AccountUserData>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || t.createFailed);
      }
      setUsername("");
      setEmail("");
      setName("");
      setPassword("");
      setSystemRole("user");
      setTeamName("");
      setTeamNameTouched(false);
      setTeamSlug("");
      await refreshUsers();
      toast.success(t.createSuccess);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.createFailed;
      toast.error(message || t.createFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    setDeletingUserId(userId);
    try {
      const response = await fetch("/api/private/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          intent: "remove",
          userId,
        }),
      });
      const payload = (await response.json()) as ApiResponse<{
        userId: string;
        removed: boolean;
      }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || t.deleteFailed);
      }
      await refreshUsers();
      toast.success(t.deleteSuccess);
      setDeleteUserDialogOpen(false);
      setPendingDeleteUserId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.deleteFailed;
      toast.error(message || t.deleteFailed);
    } finally {
      setDeletingUserId(null);
    }
  }

  const noDataText = t.noData;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t.createTitle}</CardTitle>
          <CardDescription>{t.createSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {t.createTeamNotice}
          </p>
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateUser();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-username">{t.username}</Label>
              <Input
                id="admin-user-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-email">{t.email}</Label>
              <Input
                id="admin-user-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-name">{t.name}</Label>
              <Input
                id="admin-user-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-password">{t.password}</Label>
              <Input
                id="admin-user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="admin-user-role">{t.role}</Label>
              <Select
                value={systemRole}
                onValueChange={(value) => {
                  setSystemRole(value === "admin" ? "admin" : "user");
                }}
              >
                <SelectTrigger id="admin-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{messages.common.user}</SelectItem>
                  <SelectItem value="admin">{messages.common.admin}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-team-name">{t.teamName}</Label>
              <Input
                id="admin-user-team-name"
                value={teamName}
                onChange={(event) => {
                  setTeamNameTouched(true);
                  setTeamName(event.target.value);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-user-team-slug">{t.teamSlug}</Label>
              <Input
                id="admin-user-team-slug"
                value={teamSlug}
                onChange={(event) => setTeamSlug(event.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={submitting}>
                <AutoTransition className="inline-flex items-center gap-2">
                  {submitting ? (
                    <span
                      key="creating"
                      className="inline-flex items-center gap-2"
                    >
                      <Spinner className="size-4" />
                      {t.creating}
                    </span>
                  ) : (
                    <span key="create">{t.create}</span>
                  )}
                </AutoTransition>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.listTitle}</CardTitle>
          <CardDescription>{t.listSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableSwitch
            loading={loading}
            hasContent={users.length > 0}
            loadingLabel={messages.common.loading}
            emptyLabel={noDataText}
            colSpan={7}
            header={
              <TableRow>
                <TableHead>{t.columns.name}</TableHead>
                <TableHead>{t.columns.username}</TableHead>
                <TableHead>{t.columns.email}</TableHead>
                <TableHead>{t.columns.role}</TableHead>
                <TableHead className="text-right">{t.columns.teams}</TableHead>
                <TableHead>{t.columns.created}</TableHead>
                <TableHead className="text-right">{t.columns.action}</TableHead>
              </TableRow>
            }
            rows={users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name || user.username}
                </TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.systemRole === "admin"
                    ? messages.common.admin
                    : messages.common.user}
                </TableCell>
                <TableCell className="text-right">
                  {typeof user.teamCount === "number" ? (
                    user.teamCount
                  ) : (
                    <span className="inline-flex justify-end">
                      <Spinner className="size-4" />
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {shortDateTime(locale, user.createdAt, timeZone)}
                </TableCell>
                <TableCell className="text-right">
                  <TableActionButton
                    onClick={() => {
                      setPendingDeleteUserId(user.id);
                      setDeleteUserDialogOpen(true);
                    }}
                    disabled={
                      deletingUserId !== null || user.id === currentUserId
                    }
                    label={t.delete}
                    tone="destructive"
                    transitionKey={
                      deletingUserId === user.id ? "deleting" : "delete"
                    }
                  >
                    {deletingUserId === user.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <RiDeleteBinLine className="size-4" />
                    )}
                  </TableActionButton>
                </TableCell>
              </TableRow>
            ))}
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteUserDialogOpen}
        onOpenChange={(open) => {
          if (deletingUserId) return;
          setDeleteUserDialogOpen(open);
          if (!open) {
            setPendingDeleteUserId(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delete}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUserId !== null}>
              {messages.teamSelect.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingUserId !== null || !pendingDeleteUserId}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingDeleteUserId) return;
                void handleDeleteUser(pendingDeleteUserId);
              }}
            >
              <AutoTransition className="inline-flex items-center gap-2">
                {deletingUserId !== null ? (
                  <span
                    key="deleting-confirm"
                    className="inline-flex items-center gap-2"
                  >
                    <Spinner className="size-4" />
                    {t.deleting}
                  </span>
                ) : (
                  <span key="delete-confirm">{t.delete}</span>
                )}
              </AutoTransition>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

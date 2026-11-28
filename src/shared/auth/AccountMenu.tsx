import { Menu, MenuContent, MenuItem, MenuTrigger } from "@ui-sdk/solid/menu";
import { createSignal, Show } from "solid-js";
import { AppLink } from "../ui/AppLink";
import { DisclosureChevron } from "../ui/DisclosureChevron";
import { Icon } from "../ui/Icon";
import { isStaffRole, ROLE_LABELS, useAuth } from "./AuthProvider";
import "./account-menu.css";

export function AccountMenu() {
  const auth = useAuth();
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={auth.session}>
      {(session) => (
        <div class="account-menu">
          <Menu open={open()} onOpenChange={setOpen}>
            <MenuTrigger class="account-menu-trigger" type="button">
              <span aria-hidden="true" class="account-menu-avatar">
                <Icon name="user" size={20} />
              </span>
              <span class="account-menu-name">{session().user.name}</span>
              <DisclosureChevron class="account-menu-chevron" open={open()} size={13} />
            </MenuTrigger>
            <MenuContent
              align="end"
              aria-label="账户菜单"
              aria-labelledby=""
              class="account-menu-popover"
              side="bottom"
              sideOffset={8}
            >
              <div class="account-menu-summary">
                <strong>{session().user.name}</strong>
                <span>
                  {session().user.studentNo} · {ROLE_LABELS[session().user.role]}
                </span>
              </div>
              <Show when={isStaffRole(session().user.role) && auth.primaryMembership?.classId}>
                {(classId) => (
                  <MenuItem
                    class="account-menu-item"
                    render={(itemProps) => (
                      <AppLink {...itemProps} href={`/classes/${classId()}/dashboard`} />
                    )}
                    value="dashboard"
                  >
                    班级看板
                  </MenuItem>
                )}
              </Show>
              <Show when={session().user.role === "teacher" && auth.primaryMembership?.classId}>
                {(classId) => (
                  <MenuItem
                    class="account-menu-item"
                    render={(itemProps) => (
                      <AppLink {...itemProps} href={`/classes/${classId()}/members`} />
                    )}
                    value="members"
                  >
                    班级成员
                  </MenuItem>
                )}
              </Show>
              <Show when={isStaffRole(session().user.role)}>
                <MenuItem
                  class="account-menu-item"
                  render={(itemProps) => <AppLink {...itemProps} href="/tasks" />}
                  value="tasks"
                >
                  任务单
                </MenuItem>
              </Show>
              <Show when={session().user.role === "teacher"}>
                <MenuItem
                  class="account-menu-item"
                  render={(itemProps) => <AppLink {...itemProps} href="/teacher/labs" />}
                  value="teacher-labs"
                >
                  实验管理
                </MenuItem>
              </Show>
              <Show when={session().user.role === "admin"}>
                <MenuItem
                  class="account-menu-item"
                  render={(itemProps) => <AppLink {...itemProps} href="/admin" />}
                  value="admin"
                >
                  账号管理
                </MenuItem>
                <MenuItem
                  class="account-menu-item"
                  render={(itemProps) => <AppLink {...itemProps} href="/admin/classes" />}
                  value="admin-classes"
                >
                  班级管理
                </MenuItem>
                <MenuItem
                  class="account-menu-item"
                  render={(itemProps) => <AppLink {...itemProps} href="/admin/labs" />}
                  value="admin-labs"
                >
                  实验管理
                </MenuItem>
              </Show>
              <MenuItem
                class="account-menu-item"
                render={(itemProps) => <AppLink {...itemProps} href="/profile" />}
                value="profile"
              >
                个人资料
              </MenuItem>
              <MenuItem
                class="account-menu-item account-menu-logout"
                destructive
                onSelect={() => {
                  void auth.logout().then(() => setOpen(false));
                }}
                value="logout"
              >
                退出登录
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      )}
    </Show>
  );
}

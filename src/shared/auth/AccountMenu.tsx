import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { isStaffRole, ROLE_LABELS, useAuth } from "./AuthProvider";
import "./account-menu.css";

export function AccountMenu() {
  const { session, logout, primaryMembership } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!session) return null;

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true" className="account-menu-avatar">
          <Icon name="user" size={20} />
        </span>
        <span className="account-menu-name">{session.user.name}</span>
        <span aria-hidden="true" className="account-menu-chevron" data-open={open}>
          <Icon name="chevron-down" size={13} />
        </span>
      </button>
      {open ? (
        <div aria-label="账户菜单" className="account-menu-popover" role="menu">
          <div className="account-menu-summary">
            <strong>{session.user.name}</strong>
            <span>
              {session.user.studentNo} · {ROLE_LABELS[session.user.role]}
            </span>
          </div>
          {isStaffRole(session.user.role) && primaryMembership?.classId ? (
            <Link
              className="account-menu-item"
              onClick={() => setOpen(false)}
              params={{ classId: primaryMembership.classId }}
              role="menuitem"
              to="/classes/$classId/dashboard"
            >
              班级看板
            </Link>
          ) : null}
          {session.user.role === "teacher" && primaryMembership?.classId ? (
            <Link
              className="account-menu-item"
              onClick={() => setOpen(false)}
              params={{ classId: primaryMembership.classId }}
              role="menuitem"
              to="/classes/$classId/members"
            >
              班级成员
            </Link>
          ) : null}
          {isStaffRole(session.user.role) ? (
            <Link
              className="account-menu-item"
              onClick={() => setOpen(false)}
              role="menuitem"
              to="/tasks"
            >
              任务单
            </Link>
          ) : null}
          {session.user.role === "teacher" ? (
            <Link
              className="account-menu-item"
              onClick={() => setOpen(false)}
              role="menuitem"
              to="/teacher/labs"
            >
              实验管理
            </Link>
          ) : null}
          {session.user.role === "admin" ? (
            <>
              <Link
                className="account-menu-item"
                onClick={() => setOpen(false)}
                role="menuitem"
                to="/admin"
              >
                账号管理
              </Link>
              <Link
                className="account-menu-item"
                onClick={() => setOpen(false)}
                role="menuitem"
                to="/admin/classes"
              >
                班级管理
              </Link>
              <Link
                className="account-menu-item"
                onClick={() => setOpen(false)}
                role="menuitem"
                to="/admin/labs"
              >
                实验管理
              </Link>
            </>
          ) : null}
          <Link
            className="account-menu-item"
            onClick={() => setOpen(false)}
            role="menuitem"
            to="/profile"
          >
            个人资料
          </Link>
          <button
            className="account-menu-item account-menu-logout"
            onClick={() => void logout().then(() => setOpen(false))}
            role="menuitem"
            type="button"
          >
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}

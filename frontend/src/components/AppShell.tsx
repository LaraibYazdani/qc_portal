import React, { Fragment, useEffect, useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowRightOnRectangleIcon, ArrowUpTrayIcon, Bars3Icon, ClipboardDocumentCheckIcon, DocumentDuplicateIcon,
  DocumentMagnifyingGlassIcon, FolderOpenIcon, MagnifyingGlassIcon, Squares2X2Icon, UsersIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext.tsx';
import { ROLE_LABELS } from '../types/User';
import { CHECKER_ROLES, REVIEWER_ROLES } from '../types/Check';
import { api, initials } from '../utils/api';
import { Avatar, cx } from './ui';

/** PackVision's mark: a carton inside a viewfinder. Each copy gets its own gradient id (a hidden copy would blank the others). */
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'h-8 w-8' }) => {
  const id = `qc-mark-${useId().replace(/:/g, '')}`;
  return (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5F7DFA" /><stop offset="1" stopColor="#2737AD" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
    <path d="M7 11V8.5A1.5 1.5 0 0 1 8.5 7H11M21 7h2.5A1.5 1.5 0 0 1 25 8.5V11M25 21v2.5a1.5 1.5 0 0 1-1.5 1.5H21M11 25H8.5A1.5 1.5 0 0 1 7 23.5V21"
      fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M11 13.5 16 11l5 2.5v5L16 21l-5-2.5z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M11 13.5 16 16l5-2.5M16 16v5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
  );
};

export const Brand: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <span className="flex items-center gap-2.5">
    <BrandMark />
    <span className="leading-tight">
      <span className={cx('block text-[16px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink-950')}>
        Pack<span className={dark ? 'text-brand-300' : 'text-brand-600'}>Vision</span>
      </span>
      <span className={cx('block text-[11px] font-medium uppercase tracking-[0.14em]', dark ? 'text-ink-400' : 'text-ink-500')}>Packages group</span>
    </span>
  </span>
);

interface NavItem { to: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }

function useNav(): { section: string; items: NavItem[] }[] {
  const { user } = useAuth();
  const [pending, setPending] = useState(0);
  const [toReview, setToReview] = useState(0);
  const isManager = !!user && ['admin', 'company_admin'].includes(user.role);
  const isReviewer = !!user && REVIEWER_ROLES.includes(user.role);
  const location = useLocation();

  useEffect(() => {
    if (isManager) api('/api/users?status=pending').then(r => r.ok && setPending(r.data.data.length));
    if (isReviewer) api('/api/references?status=needs_review').then(r => r.ok && setToReview(r.data.counts?.needs_review ?? 0));
  }, [isManager, isReviewer, location.pathname]);

  if (!user) return [];
  const quality: NavItem[] = [{ to: '/operator-view', label: 'Design lookup', icon: MagnifyingGlassIcon }];
  if (CHECKER_ROLES.includes(user.role)) quality.push({ to: '/checks', label: 'Print checks', icon: ClipboardDocumentCheckIcon });
  if (isReviewer) quality.push({ to: '/references', label: 'Reference review', icon: DocumentMagnifyingGlassIcon, badge: toReview || undefined });
  const sections: { section: string; items: NavItem[] }[] = [{ section: 'Quality', items: quality }];
  if (['admin', 'company_admin', 'sales'].includes(user.role)) {
    sections.push({ section: 'Designs', items: [
      { to: '/upload', label: 'Upload design', icon: ArrowUpTrayIcon },
      { to: '/bulk-upload', label: 'Bulk upload', icon: DocumentDuplicateIcon },
      { to: '/my-jobs', label: isManager ? 'Recent uploads' : 'My uploads', icon: FolderOpenIcon },
    ] });
  }
  if (isManager) {
    sections.push({ section: 'Administration', items: [
      { to: '/admin', label: 'Overview', icon: Squares2X2Icon },
      { to: '/admin/users', label: 'Users', icon: UsersIcon, badge: pending || undefined },
    ] });
  }
  return sections;
}

const Sidebar: React.FC<{ onNavigate?: () => void }> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = useNav();

  return (
    <div className="flex h-full flex-col bg-ink-950 px-4 py-5">
      <Link to="/" onClick={onNavigate} className="mb-8 px-2"><Brand dark /></Link>

      <nav className="flex-1 space-y-7 overflow-y-auto scroll-thin">
        {nav.map(group => (
          <div key={group.section}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.to}>
                  <NavLink to={item.to} end onClick={onNavigate}
                    className={({ isActive }) => cx('group flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                      isActive ? 'bg-white/[0.08] text-white' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white')}>
                    {({ isActive }) => (
                      <>
                        <item.icon className={cx('h-[18px] w-[18px]', isActive ? 'text-brand-300' : 'text-ink-500 group-hover:text-ink-300')} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="tabular rounded-full bg-amber-400/90 px-1.5 text-[11px] font-semibold text-ink-950">{item.badge}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="mt-6 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
          <div className="flex items-center gap-3">
            <Avatar text={initials(user.name)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-ink-400">
                {ROLE_LABELS[user.role] ?? user.role}{user.company_name ? ` · ${user.company_name}` : ''}
              </p>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }} title="Sign out"
              className="rounded-lg p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-white">
              <ArrowRightOnRectangleIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Signed-in layout: sidebar on desktop, drawer on phones and tablets. */
export const AppShell: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>

      <Transition show={open} as={Fragment}>
        <Dialog onClose={setOpen} className="relative z-50 lg:hidden">
          <Transition.Child as={Fragment} enter="duration-150" enterFrom="opacity-0" enterTo="opacity-100" leave="duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-ink-950/50" />
          </Transition.Child>
          <Transition.Child as={Fragment} enter="transition duration-200 ease-out" enterFrom="-translate-x-full" enterTo="translate-x-0"
            leave="transition duration-150 ease-in" leaveFrom="translate-x-0" leaveTo="-translate-x-full">
            <Dialog.Panel className="fixed inset-y-0 left-0 w-72">
              <button onClick={() => setOpen(false)} className="absolute -right-11 top-4 rounded-lg p-1.5 text-white/80 hover:text-white" aria-label="Close menu">
                <XMarkIcon className="h-6 w-6" />
              </button>
              <Sidebar onNavigate={() => setOpen(false)} />
            </Dialog.Panel>
          </Transition.Child>
        </Dialog>
      </Transition>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/80 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-100" aria-label="Open menu">
            <Bars3Icon className="h-6 w-6" />
          </button>
          <Brand />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

/** Public pages (operator lookup without signing in). */
export const PublicLayout: React.FC = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <Link to={user ? '/' : '/login'} className="text-sm font-medium text-brand-700 hover:text-brand-800">
            {user ? 'Open portal' : 'Sign in'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12 animate-fade-in"><Outlet /></main>
    </div>
  );
};

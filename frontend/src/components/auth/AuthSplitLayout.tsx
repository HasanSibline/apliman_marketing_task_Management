import React from 'react';
import { AuraLogo, AuraMark } from '@/components/brand/AuraMark';

/**
 * Split sign-in layout: a showcase of the product on the left, the form on the right.
 *
 * The left panel is assembled from the same primitives the app uses — a task card,
 * phase pills, a stat row, an assistant reply — rather than a screenshot. It stays
 * sharp on any display, follows the company's brand colour, costs no image weight,
 * and cannot drift out of date the way a captured screenshot does.
 *
 * It is decorative, so it is hidden from assistive tech and from small screens,
 * where the form is the only thing that matters.
 */

interface Props {
  children: React.ReactNode;
  /** Sits above the form, e.g. "Sign in to Apliman". */
  title: string;
  subtitle?: string;
  /** Shown in the left panel's header — a company name, or the portal name. */
  contextLabel?: string;
  /** Replaces the Aura mark in the form column, e.g. a company logo. */
  brandSlot?: React.ReactNode;
  /** Distinguishes the internal admin portal from customer-facing sign-in. */
  variant?: 'default' | 'admin';
}

const PHASES = [
  { name: 'Planning', done: true },
  { name: 'In progress', done: true },
  { name: 'Review', done: false },
  { name: 'Done', done: false },
];

const ShowcasePanel: React.FC<{ contextLabel?: string; variant: 'default' | 'admin' }> = ({
  contextLabel,
  variant,
}) => (
  <div
    aria-hidden="true"
    className="relative hidden overflow-hidden bg-gray-950 lg:flex lg:w-[52%] lg:flex-col lg:justify-between"
  >
    {/* Depth without imagery: one soft brand wash, one grid. Kept subtle so the
        foreground cards stay the thing you look at. */}
    <div
      className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
      style={{ background: 'rgb(var(--color-primary-600))' }}
    />
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
        backgroundSize: '44px 44px',
      }}
    />

    <div className="relative z-10 p-10 xl:p-14">
      <AuraLogo monochrome className="text-white [&_span]:text-white" size="md" subtitle="Operations" />

      <h2 className="mt-12 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
        {variant === 'admin' ? 'Every company, one console.' : 'Work moves. You can see it move.'}
      </h2>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-400">
        {variant === 'admin'
          ? 'Provision companies, set plans and limits, and manage the shared AI key from one place.'
          : 'Tasks, tickets, objectives and quarters in one place — with an assistant that already knows your workspace.'}
      </p>
    </div>

    {/* Product surface, built from the real thing */}
    <div className="relative z-10 space-y-4 px-10 pb-10 xl:px-14 xl:pb-14">
      <div className="max-w-md rounded-xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400">TSK-2481</p>
            <p className="mt-1 truncate text-sm font-medium text-white">Q3 campaign launch assets</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            High
          </span>
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          {PHASES.map((phase) => (
            <div key={phase.name} className="flex-1">
              <div
                className="h-1 rounded-full"
                style={{
                  background: phase.done ? 'rgb(var(--color-primary-500))' : 'rgba(255,255,255,0.14)',
                }}
              />
              <p className="mt-1.5 truncate text-[9px] text-gray-500">{phase.name}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex max-w-md gap-3">
        {[
          { label: 'Active', value: '24' },
          { label: 'Due this week', value: '6' },
          { label: 'On track', value: '92%' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur"
          >
            <p className="text-lg font-semibold text-white">{stat.value}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex max-w-md items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <AuraMark className="h-4 w-4 text-white" monochrome />
        </span>
        <div className="rounded-xl rounded-tl-sm border border-white/10 bg-white/[0.07] px-3.5 py-2.5 backdrop-blur">
          <p className="text-xs leading-relaxed text-gray-300">
            Six tasks are due this week. Two are unassigned — want me to list them?
          </p>
        </div>
      </div>
    </div>

    {contextLabel && (
      <p className="relative z-10 border-t border-white/10 px-10 py-4 text-[11px] text-gray-500 xl:px-14">
        {contextLabel}
      </p>
    )}
  </div>
);

const AuthSplitLayout: React.FC<Props> = ({
  children,
  title,
  subtitle,
  contextLabel,
  brandSlot,
  variant = 'default',
}) => (
  <div className="flex min-h-screen bg-white dark:bg-gray-950">
    <ShowcasePanel contextLabel={contextLabel} variant={variant} />

    <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          {brandSlot ?? <AuraLogo size="lg" subtitle={variant === 'admin' ? 'Admin console' : 'Operations'} />}

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
          )}
        </div>

        {children}
      </div>
    </main>
  </div>
);

export default AuthSplitLayout;

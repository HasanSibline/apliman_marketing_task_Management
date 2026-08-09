import React from 'react';
import type { ComponentType, SVGProps } from 'react';

interface Props {
  /** Heroicon component, rendered muted so it frames the message rather than competing with it. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** What is not here, in the user's words. "No tasks yet", not "Empty result set". */
  title: string;
  /** One sentence on why it is empty, or what to do about it. */
  description?: string;
  /** The single action that resolves the emptiness. Omit when there isn't one. */
  action?: React.ReactNode;
  /** Sits inside a surface already, so skip the border. */
  bare?: boolean;
}

/**
 * An empty screen is an invitation to act, not a dead end.
 *
 * Two distinct cases share this component and should read differently: nothing
 * exists yet (offer the action that creates the first one), and nothing matched a
 * filter (say so, and point at clearing the filter). Pass copy accordingly.
 */
const EmptyState: React.FC<Props> = ({ icon: Icon, title, description, action, bare = false }) => (
  <div
    className={
      bare
        ? 'textured flex flex-col items-center justify-center px-6 py-12 text-center'
        : 'surface textured flex flex-col items-center justify-center px-6 py-16 text-center'
    }
  >
    {Icon && (
      <span
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700/50"
      >
        <Icon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
      </span>
    )}

    <p className="text-base font-medium text-gray-900 dark:text-white">{title}</p>

    {description && (
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {description}
      </p>
    )}

    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
